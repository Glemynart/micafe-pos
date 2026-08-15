import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { type RolTenant, esPinValido, esRolTenant, idCredencialOperativa } from "./contracts";
import { hashearPin, verificarPin } from "./pin-security";
import { generarCodigoOperativo, generarPinTemporal, MAX_INTENTOS_UNICIDAD } from "./platform/credencial-inicial";
import { CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO, reservarCodigoOperativoEnTransaccion } from "./platform/reserva-codigo-operativo";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./platform/audit";

export const RESTABLECIMIENTOS_COLLECTION = "restablecimientos_credencial";
export const TTL_RESTABLECIMIENTO_MS = 72 * 60 * 60 * 1000;

export type AutoridadRestablecimiento = "ADMIN_TENANT" | "OPERADOR_SAAS";
export type ObjetivoRestablecimiento = "OPERADOR" | "ADMINISTRADOR";
export type EstadoRestablecimiento = "PENDIENTE_ACTIVACION" | "ACTIVADO" | "EXPIRADO" | "CANCELADO";

export interface ComandoRestablecimiento {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  motivoCodigo: string;
}

export interface EvidenciaFueraDeBanda {
  metodo: "CONFIRMACION_PROPIETARIO" | "TICKET_SOPORTE" | "VERIFICACION_PRESENCIAL";
  referencia: string;
}

export interface ResultadoRestablecimiento {
  restablecimientoId: string;
  empresaId: string;
  uid: string;
  estado: EstadoRestablecimiento;
  codigo: string | null;
  pinTemporal: string | null;
  idempotente: boolean;
}

export interface ResultadoActivacionRestablecimiento {
  restablecimientoId: string;
  empresaId: string;
  uid: string;
  rol: RolTenant;
  idempotente: boolean;
}

interface SnapshotLike {
  exists: boolean;
  id: string;
  data(): Record<string, any> | undefined;
  get?(field: string): any;
}

interface AutoridadSolicitante {
  tipo: AutoridadRestablecimiento;
  uid: string;
  facultad: "ACCESO_RESTABLECER" | null;
}

function error(codigo: "invalid-argument" | "failed-precondition" | "not-found" | "already-exists" | "unauthenticated" | "permission-denied" | "internal", mensaje: string): never {
  throw new HttpsError(codigo, mensaje);
}

function fingerprint(input: unknown): string {
  const normalizar = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalizar);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalizar(child)]));
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(normalizar(input))).digest("hex");
}

export function idRestablecimientoCredencial(empresaId: string, uid: string, idempotencyKey: string): string {
  return createHash("sha256")
    .update(`restablecimiento-credencial:v1:${empresaId}:${uid}:${idempotencyKey}`)
    .digest("hex");
}

export function idAuditoriaRestablecimiento(restablecimientoId: string, evento: "SOLICITADO" | "ACTIVADO" | "CANCELADO"): string {
  return createHash("sha256").update(`restablecimiento-credencial:${evento}:${restablecimientoId}`).digest("hex");
}

export interface OpcionesSolicitudRestablecimiento {
  reemitirPendiente?: boolean;
}

export function validarComandoRestablecimiento(data: Record<string, unknown> | undefined): ComandoRestablecimiento {
  const commandId = typeof data?.commandId === "string" ? data.commandId.trim() : "";
  const idempotencyKey = typeof data?.idempotencyKey === "string" ? data.idempotencyKey.trim() : "";
  const correlationId = typeof data?.correlationId === "string" ? data.correlationId.trim() : "";
  const causationId = data?.causationId === null || data?.causationId === undefined
    ? null
    : typeof data.causationId === "string" ? data.causationId.trim() : "";
  const motivoCodigo = typeof data?.motivoCodigo === "string" ? data.motivoCodigo.trim() : "";
  if (!commandId || !idempotencyKey || !correlationId || causationId === "" || !motivoCodigo) {
    error("invalid-argument", "ENVELOPE_RESTABLECIMIENTO_INVALIDO");
  }
  return { commandId, idempotencyKey, correlationId, causationId, motivoCodigo };
}

function validarEvidencia(evidencia: unknown): EvidenciaFueraDeBanda {
  const data = evidencia as Record<string, unknown> | undefined;
  const metodo = data?.metodo;
  const referencia = typeof data?.referencia === "string" ? data.referencia.trim() : "";
  if ((metodo !== "CONFIRMACION_PROPIETARIO" && metodo !== "TICKET_SOPORTE" && metodo !== "VERIFICACION_PRESENCIAL")
    || referencia.length < 4 || referencia.length > 160) {
    error("invalid-argument", "EVIDENCIA_FUERA_DE_BANDA_INVALIDA");
  }
  return { metodo, referencia };
}

function validarTenantObjetivo(
  empresa: Record<string, any> | undefined,
  empresaId: string,
  permitirSuspendida: boolean,
): void {
  if (!empresa) error("not-found", "EMPRESA_NOT_FOUND");
  const permitidos = permitirSuspendida ? ["trial", "activa", "suspendida"] : ["trial", "activa"];
  if (!permitidos.includes(empresa.estado)) error("failed-precondition", "EMPRESA_NO_ADMINISTRABLE");
  if (empresaId.trim().length === 0) error("invalid-argument", "EMPRESA_ID_INVALIDO");
}

function membresiaActiva(data: Record<string, any> | undefined): boolean {
  return !!data && data.estado === "activa" && data.activo === true && esRolTenant(data.rol)
    && Array.isArray(data.permisos);
}

function timestampToMillis(value: unknown): number | null {
  const candidate = value as { toMillis?: () => number } | undefined;
  return typeof candidate?.toMillis === "function" ? candidate.toMillis() : null;
}

function planificarAuditoria(
  db: Firestore,
  tx: Transaction,
  comando: ComandoRestablecimiento,
  actor: AutoridadSolicitante,
  empresaId: string,
  uid: string,
  restablecimientoId: string,
  tipo: "CREDENCIAL_RESTABLECIMIENTO_SOLICITADO" | "CREDENCIAL_RESTABLECIMIENTO_ACTIVADO" | "CREDENCIAL_RESTABLECIMIENTO_CANCELADO",
  detalle: Record<string, unknown>,
): string {
  const evento = tipo.endsWith("SOLICITADO") ? "SOLICITADO" : tipo.endsWith("ACTIVADO") ? "ACTIVADO" : "CANCELADO";
  const obligacionId = idAuditoriaRestablecimiento(restablecimientoId, evento);
  crearObligacionAuditoria(db, tx, {
    tipo,
    resultado: "CONFIRMADO",
    actor: { tipo: actor.tipo === "ADMIN_TENANT" ? "ADMIN_TENANT" : "OPERADOR", uid: actor.uid },
    facultad: actor.facultad,
    comando: { id: comando.commandId, tipo: "RestablecerCredencialOperativa" },
    agregado: { tipo: "RECUPERACION_CREDENCIAL", id: restablecimientoId },
    empresaObjetivoId: empresaId,
    revision: { esperada: null, resultante: null },
    correlacionId: comando.correlationId,
    causacionId: comando.causationId,
    motivo: { codigo: comando.motivoCodigo, resumen: null },
    detalle,
  }, { obligacionId, evidenciaId: createHash("sha256").update(`evidencia:${obligacionId}`).digest("hex") });
  return obligacionId;
}

function obtenerNombreOperativo(userSnap: SnapshotLike, rol: unknown): string {
  const user = userSnap.data();
  if (rol === "admin") return "admin";
  if (typeof user?.nombre === "string" && user.nombre.trim()) return user.nombre;
  if (typeof user?.username === "string" && user.username.trim()) return user.username;
  return typeof rol === "string" && esRolTenant(rol) ? rol : "usuario";
}

/**
 * Crea una recuperación sin reutilizar incorporaciones ni la provisión inicial.
 * El agregado de recuperación no guarda código, PIN, hash ni token: esos
 * secretos solo existen en la credencial operativa rotada y el PIN se devuelve
 * una vez al solicitante autorizado.
 */
export async function solicitarRestablecimientoCredencial(
  db: Firestore,
  actor: AutoridadSolicitante,
  comando: ComandoRestablecimiento,
  empresaId: string,
  objetivoUid: string,
  pepper: string,
  evidencia?: EvidenciaFueraDeBanda,
  opciones: OpcionesSolicitudRestablecimiento = {},
): Promise<ResultadoRestablecimiento> {
  if (!empresaId.trim() || !objetivoUid.trim()) error("invalid-argument", "OBJETIVO_RESTABLECIMIENTO_INVALIDO");
  if (actor.tipo === "ADMIN_TENANT" && actor.facultad !== null) error("internal", "AUTORIDAD_RESTABLECIMIENTO_INVALIDA");
  if (actor.tipo === "OPERADOR_SAAS" && actor.facultad !== "ACCESO_RESTABLECER") error("internal", "AUTORIDAD_RESTABLECIMIENTO_INVALIDA");
  const evidenciaValidada = actor.tipo === "OPERADOR_SAAS" ? validarEvidencia(evidencia) : undefined;
  const resetId = idRestablecimientoCredencial(empresaId, objetivoUid, comando.idempotencyKey);
  const resetRef = db.collection(RESTABLECIMIENTOS_COLLECTION).doc(resetId);
  const reemitirPendiente = opciones.reemitirPendiente === true;
  const fingerprintActual = fingerprint({ actor, empresaId, objetivoUid, evidencia: evidenciaValidada ?? null, reemitirPendiente });

  for (let intento = 0; intento < MAX_INTENTOS_UNICIDAD; intento++) {
    const pinTemporal = generarPinTemporal();
    const pinHash = await hashearPin(pinTemporal, pepper);
    const expiraEn = Timestamp.fromMillis(Date.now() + TTL_RESTABLECIMIENTO_MS);
    try {
      const resultado = await db.runTransaction(async (tx) => {
        const [resetSnap, empresaSnap, targetMemberSnap, actorMemberSnap, userSnap, credencialesSnap] = await Promise.all([
          tx.get(resetRef),
          tx.get(db.collection("empresas").doc(empresaId)),
          tx.get(db.collection("membresias").doc(`${empresaId}_${objetivoUid}`)),
          tx.get(db.collection("membresias").doc(`${empresaId}_${actor.uid}`)),
          tx.get(db.collection("usuarios").doc(objetivoUid)),
          tx.get(db.collection("credenciales_operativas").where("empresaId", "==", empresaId).where("uid", "==", objetivoUid).limit(3)),
        ]);
        if (resetSnap.exists) {
          const existing = resetSnap.data() ?? {};
          if (existing.fingerprint !== fingerprintActual) error("already-exists", "IDEMPOTENCIA_RESTABLECIMIENTO_CONFLICTIVA");
          return {
            restablecimientoId: resetId,
            empresaId,
            uid: objetivoUid,
            estado: existing.estado as EstadoRestablecimiento,
            codigo: null,
            pinTemporal: null,
            idempotente: true,
          };
        }

        // La sesión operativa solo puede emitirse para un tenant que también
        // admite operación; una recuperación no convierte suspendida en una
        // excepción de acceso.
        validarTenantObjetivo(empresaSnap.data(), empresaId, false);
        const targetMembership = targetMemberSnap.data();
        if (!targetMemberSnap.exists || !membresiaActiva(targetMembership)) error("failed-precondition", "OBJETIVO_SIN_MEMBRESIA_ACTIVA");
        if (actor.tipo === "ADMIN_TENANT") {
          if (actor.uid === objetivoUid || !membresiaActiva(actorMemberSnap.data()) || actorMemberSnap.get?.("rol") !== "admin") {
            error("permission-denied", "RECUPERACION_OPERADOR_NO_AUTORIZADA");
          }
          if (targetMembership?.rol === "admin") error("permission-denied", "EL_ADMINISTRADOR_REQUIERE_VERIFICACION_SAAS");
        } else {
          const empresa = empresaSnap.data();
          if (empresa?.ownerUid !== objetivoUid || targetMembership?.rol !== "admin" || !evidenciaValidada) {
            error("failed-precondition", "RECUPERACION_ADMINISTRADOR_NO_VERIFICADA");
          }
        }

        const empresa = empresaSnap.data();
        const nombreComercial = typeof empresa?.nombreComercial === "string" && empresa.nombreComercial.trim()
          ? empresa.nombreComercial
          : typeof empresa?.nombre === "string" && empresa.nombre.trim()
            ? empresa.nombre
            : "empresa";
        const codigo = generarCodigoOperativo(
          nombreComercial,
          obtenerNombreOperativo(userSnap, targetMembership?.rol),
          intento,
        );

        const activas = credencialesSnap.docs.filter((snap: SnapshotLike) => snap.get?.("activo") === true);
        if (activas.length !== 1) error("failed-precondition", "CREDENCIAL_ACTIVA_NO_UNICA");
        const anterior = activas[0];
        const restablecimientoAnteriorId = typeof anterior.get?.("restablecimientoId") === "string"
          ? anterior.get?.("restablecimientoId")
          : null;
        const requiereCambio = anterior.get?.("requiereCambio") === true;
        if (restablecimientoAnteriorId && !requiereCambio) {
          error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_INCONSISTENTE");
        }
        let restablecimientoAnteriorSnap: SnapshotLike | null = null;
        if (restablecimientoAnteriorId) {
          restablecimientoAnteriorSnap = await tx.get(db.collection(RESTABLECIMIENTOS_COLLECTION).doc(restablecimientoAnteriorId));
          const anteriorData = restablecimientoAnteriorSnap.data();
          if (!restablecimientoAnteriorSnap.exists
            || anteriorData?.empresaId !== empresaId
            || anteriorData?.objetivoUid !== objetivoUid
            || anteriorData?.credencialNuevaId !== anterior.id
            || anteriorData?.estado !== "PENDIENTE_ACTIVACION") {
            error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_INCONSISTENTE");
          }
        }
        if (restablecimientoAnteriorId && !reemitirPendiente) {
          error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_PENDIENTE");
        }
        if (reemitirPendiente && !restablecimientoAnteriorId) {
          error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_NO_PENDIENTE");
        }
        const nuevaCredencialRef = db.collection("credenciales_operativas").doc(idCredencialOperativa(empresaId, codigo));
        await reservarCodigoOperativoEnTransaccion(db, tx, codigo);
        if (restablecimientoAnteriorId && restablecimientoAnteriorSnap) {
          planificarAuditoria(db, tx, comando, actor, empresaId, objetivoUid, restablecimientoAnteriorId, "CREDENCIAL_RESTABLECIMIENTO_CANCELADO", {
            credencialCanceladaId: anterior.id,
            reemplazadoPorRestablecimientoId: resetId,
            motivo: comando.motivoCodigo,
          });
          tx.update(db.collection(RESTABLECIMIENTOS_COLLECTION).doc(restablecimientoAnteriorId), {
            estado: "CANCELADO",
            canceladoPor: { tipo: actor.tipo, uid: actor.uid },
            reemplazadoPorRestablecimientoId: resetId,
            canceladaEn: FieldValue.serverTimestamp(),
            actualizadaEn: FieldValue.serverTimestamp(),
          });
        }
        const obligacionId = planificarAuditoria(db, tx, comando, actor, empresaId, objetivoUid, resetId, "CREDENCIAL_RESTABLECIMIENTO_SOLICITADO", {
          autoridad: actor.tipo,
          objetivo: actor.tipo === "ADMIN_TENANT" ? "OPERADOR" : "ADMINISTRADOR",
          credencialAnteriorId: anterior.id,
          credencialNuevaId: nuevaCredencialRef.id,
          ...(restablecimientoAnteriorId ? { reemisionDeRestablecimientoId: restablecimientoAnteriorId } : {}),
          ...(evidenciaValidada ? { verificacionFueraDeBanda: evidenciaValidada } : {}),
        });
        tx.update(db.collection("credenciales_operativas").doc(anterior.id), {
          activo: false,
          actualizadaEn: FieldValue.serverTimestamp(),
        });
        tx.create(nuevaCredencialRef, {
          empresaId,
          uid: objetivoUid,
          codigo,
          pinHash,
          activo: true,
          requiereCambio: true,
          restablecimientoId: resetId,
          origen: actor.tipo === "ADMIN_TENANT" ? "TENANT" : "PLATAFORMA",
          expiraEn,
          fallosConsecutivos: 0,
          bloqueadoHasta: null,
          creadaEn: FieldValue.serverTimestamp(),
          actualizadaEn: FieldValue.serverTimestamp(),
          pinActualizadoEn: FieldValue.serverTimestamp(),
        });
        tx.create(resetRef, {
          schemaVersion: 1,
          restablecimientoId: resetId,
          empresaId,
          objetivoUid,
          objetivo: actor.tipo === "ADMIN_TENANT" ? "OPERADOR" : "ADMINISTRADOR",
          solicitadoPor: { tipo: actor.tipo, uid: actor.uid },
          facultad: actor.facultad,
          credencialAnteriorId: anterior.id,
          credencialNuevaId: nuevaCredencialRef.id,
          estado: "PENDIENTE_ACTIVACION",
          fingerprint: fingerprintActual,
          expiraEn,
          auditoriaSolicitudId: obligacionId,
          creadaEn: FieldValue.serverTimestamp(),
          actualizadaEn: FieldValue.serverTimestamp(),
          activadaEn: null,
        });
        return { restablecimientoId: resetId, empresaId, uid: objetivoUid, estado: "PENDIENTE_ACTIVACION" as const, codigo, pinTemporal, idempotente: false };
      });
      if (!resultado.idempotente) {
        const obligacion = await db.collection("saas_auditoria_obligaciones").where("evidencia.agregado.id", "==", resetId).where("evidencia.tipo", "==", "CREDENCIAL_RESTABLECIMIENTO_SOLICITADO").limit(1).get();
        if (!obligacion.empty) await emitirObligacionAuditoria(db, obligacion.docs[0].id);
      }
      return resultado;
    } catch (cause) {
      if (cause instanceof HttpsError && cause.code === "already-exists" && cause.message === CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO) continue;
      throw cause;
    }
  }
  error("failed-precondition", "CODIGO_OPERATIVO_NO_DISPONIBLE");
}

export async function validarRestablecimientoParaAutenticacion(
  db: Firestore,
  empresaId: string,
  uid: string,
  restablecimientoId: string,
  credencialId?: string,
): Promise<{ reset: Record<string, any>; credencialId: string }> {
  const resetSnap = await db.collection(RESTABLECIMIENTOS_COLLECTION).doc(restablecimientoId).get();
  const reset = resetSnap.data();
  if (!resetSnap.exists || !reset || reset.empresaId !== empresaId || reset.objetivoUid !== uid
    || (credencialId !== undefined && reset.credencialNuevaId !== credencialId)
    || reset.estado !== "PENDIENTE_ACTIVACION" || timestampToMillis(reset.expiraEn) === null
    || timestampToMillis(reset.expiraEn)! <= Date.now()) {
    error("unauthenticated", "Credenciales operativas inválidas.");
  }
  return { reset, credencialId: reset.credencialNuevaId };
}

export async function activarRestablecimientoCredencial(
  db: Firestore,
  uid: string,
  restablecimientoId: string,
  pinActual: string,
  pinNuevo: string,
  pepper: string,
): Promise<ResultadoActivacionRestablecimiento> {
  if (!esPinValido(pinActual) || !esPinValido(pinNuevo) || pinActual === pinNuevo) error("invalid-argument", "PIN_DEFINITIVO_INVALIDO");
  const resetRef = db.collection(RESTABLECIMIENTOS_COLLECTION).doc(restablecimientoId);
  const inicial = await resetRef.get();
  if (!inicial.exists) error("not-found", "RESTABLECIMIENTO_NOT_FOUND");
  const inicialData = inicial.data()!;
  if (inicialData.objetivoUid !== uid) error("permission-denied", "RESTABLECIMIENTO_NO_AUTORIZADO");
  const credencialRef = db.collection("credenciales_operativas").doc(inicialData.credencialNuevaId);
  const credencialInicial = await credencialRef.get();
  if (!credencialInicial.exists) error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_INCONSISTENTE");
  if (inicialData.estado === "PENDIENTE_ACTIVACION") {
    if (timestampToMillis(inicialData.expiraEn) === null || timestampToMillis(inicialData.expiraEn)! <= Date.now()) error("failed-precondition", "RESTABLECIMIENTO_EXPIRADO");
    if (!await verificarPin(pinActual, credencialInicial.data()!.pinHash, pepper)) error("unauthenticated", "Credenciales operativas inválidas.");
  } else if (inicialData.estado !== "ACTIVADO") {
    error("failed-precondition", "RESTABLECIMIENTO_NO_DISPONIBLE");
  }
  const pinNuevoHash = await hashearPin(pinNuevo, pepper);
  let obligacionActivacionId: string | null = null;
  const resultado = await db.runTransaction(async (tx) => {
    const [resetSnap, credencialSnap, empresaSnap, membresiaSnap] = await Promise.all([
      tx.get(resetRef),
      tx.get(credencialRef),
      tx.get(db.collection("empresas").doc(inicialData.empresaId)),
      tx.get(db.collection("membresias").doc(`${inicialData.empresaId}_${uid}`)),
    ]);
    const reset = resetSnap.data();
    const credencial = credencialSnap.data();
    if (!resetSnap.exists || !reset || reset.empresaId !== inicialData.empresaId || reset.objetivoUid !== uid) error("failed-precondition", "RESTABLECIMIENTO_INCONSISTENTE");
    if (reset.estado === "ACTIVADO") return { empresaId: reset.empresaId, uid, rol: membresiaSnap.get?.("rol") as RolTenant, idempotente: true };
    validarTenantObjetivo(empresaSnap.data(), reset.empresaId, false);
    if (reset.estado !== "PENDIENTE_ACTIVACION" || timestampToMillis(reset.expiraEn) === null || timestampToMillis(reset.expiraEn)! <= Date.now()) error("failed-precondition", "RESTABLECIMIENTO_EXPIRADO");
    if (!credencialSnap.exists || credencial?.uid !== uid || credencial?.activo !== true || credencial?.requiereCambio !== true || credencial?.restablecimientoId !== restablecimientoId) error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_INCONSISTENTE");
    if (credencial.pinHash !== credencialInicial.data()!.pinHash) error("failed-precondition", "CREDENCIAL_RESTABLECIMIENTO_CAMBIO");
    if (!membresiaActiva(membresiaSnap.data())) error("failed-precondition", "MEMBRESIA_NO_ACTIVA");
    const rol = membresiaSnap.get?.("rol");
    if (!esRolTenant(rol)) error("failed-precondition", "ROL_TENANT_INVALIDO");
    obligacionActivacionId = idAuditoriaRestablecimiento(restablecimientoId, "ACTIVADO");
    planificarAuditoria(db, tx, {
      commandId: `activar:${restablecimientoId}`,
      idempotencyKey: restablecimientoId,
      correlationId: restablecimientoId,
      causationId: restablecimientoId,
      motivoCodigo: "TENANT_OPERADOR_ACTIVAR_RESTABLECIMIENTO",
    }, { tipo: "ADMIN_TENANT", uid, facultad: null }, reset.empresaId, uid, restablecimientoId, "CREDENCIAL_RESTABLECIMIENTO_ACTIVADO", {
      credencialNuevaId: credencialSnap.id,
    });
    tx.update(credencialRef, {
      pinHash: pinNuevoHash,
      requiereCambio: false,
      restablecimientoId: null,
      fallosConsecutivos: 0,
      bloqueadoHasta: null,
      actualizadaEn: FieldValue.serverTimestamp(),
      pinActualizadoEn: FieldValue.serverTimestamp(),
    });
    tx.update(resetRef, {
      estado: "ACTIVADO",
      activadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    return { empresaId: reset.empresaId, uid, rol, idempotente: false };
  });
  if (obligacionActivacionId) await emitirObligacionAuditoria(db, obligacionActivacionId);
  return { restablecimientoId, ...resultado };
}
