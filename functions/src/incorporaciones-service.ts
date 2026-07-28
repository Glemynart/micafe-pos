import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  type CredencialOperativa,
  idCredencialOperativa,
  normalizarCodigo,
  normalizarEmail,
  normalizarNombre,
  esPinValido,
  esRolTenant,
} from "./contracts";
import { hashearPin, verificarPin } from "./pin-security";
import {
  actualizarClaimsTenant,
  estaBloqueada,
  emitirSesionTenant,
  normalizarPermisosEfectivos,
  permisosPredeterminados,
  registrarFallo,
  validarSnapshotEmpresaEscribible,
} from "./operational-auth";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./platform/audit";
import { esCredencialTemporalPlataformaVencidaOInvalida } from "./platform/vigencia-credencial-temporal";
import { CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO, reservarCodigoOperativoEnTransaccion } from "./platform/reserva-codigo-operativo";
import { derivarSlugParaCodigo, generarCodigoOperativo, generarPinTemporal, MAX_INTENTOS_UNICIDAD } from "./platform/credencial-inicial";

export const INCORPORACIONES_COLLECTION = "incorporaciones";

/**
 * La incorporación DIRECTA más reciente para (empresaId, uid) — el único
 * registro que gobierna la credencial inicial de ese usuario en ese tenant.
 * ADR-SAAS-013 §4.4 conserva el historial de reemisiones (las incorporaciones
 * superadas quedan `EXPIRED`, nunca se borran ni se sobrescriben), así que
 * "cuántas incorporaciones DIRECTA existen para este par" no es una señal de
 * corrupción — solo la más reciente es vigente. `orderBy("creadaEn","desc")`
 * hace esa noción explícita en la propia consulta, en vez de dejar que cada
 * consumidor infiera "la última" filtrando por estado (una politica que
 * divergiría con el tiempo).
 *
 * Único punto que define "cuál incorporación DIRECTA importa" — compartido
 * por `emitir-credencial-inicial.ts` (crear/reemplazar), por
 * `provisionar-credencial-inicial-tenant.ts` (decidir EMITIR/REEMITIR/
 * RECHAZAR) y por la proyección de la ficha en `platform/queries.ts`
 * (qué mostrar). Los tres deben ver siempre el mismo registro — divergir
 * aquí es exactamente el defecto que esta función existe para prevenir.
 */
export function consultarIncorporacionDirectaMasReciente(
  db: Firestore,
  empresaId: string,
  uid: string,
): Query {
  return db.collection(INCORPORACIONES_COLLECTION)
    .where("empresaId", "==", empresaId)
    .where("mecanismo", "==", "DIRECTA")
    .where("uid", "==", uid)
    .orderBy("creadaEn", "desc")
    .limit(1);
}

export interface SolicitudIncorporacionDirecta {
  nombre?: unknown;
  codigo?: unknown;
  pinTemporal?: unknown;
  rol?: unknown;
  /** Se rechaza hasta que exista una prueba de posesion aprobada. */
  uid?: unknown;
}

export interface SolicitudIncorporacionEmail {
  email?: unknown;
  rol?: unknown;
}

export interface SolicitudAceptacionEmail {
  incorporacionId?: unknown;
  token?: unknown;
  password?: unknown;
}

export interface SolicitudReenvioEmail {
  incorporacionId?: unknown;
}

export interface SolicitudCancelacionEmail {
  incorporacionId?: unknown;
}

export const EMAIL_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EMAIL_INVITATION_MAX_RESENDS = 3;
export const EMAIL_INVITATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export interface IncorporacionCreada {
  incorporacionId: string;
  estado: "TEMP_CREDENTIAL" | "INVITED";
}

export interface SolicitudActivacionDirecta {
  pinActual?: unknown;
  pinNuevo?: unknown;
  pinTemporal?: unknown;
  pinDefinitivo?: unknown;
}

export interface ActivacionDirectaCompletada {
  incorporacionId: string;
  estado: "ACTIVE";
  customToken: string;
  idempotente: boolean;
}

export interface IncorporacionEmailEmitida extends IncorporacionCreada {
  entrega: { email: string; token: string; tokenVersion: number; expiraEn: Date } | null;
}

export interface ActivacionEmailCompletada {
  incorporacionId: string;
  estado: "ACTIVE";
  customToken: string;
  idempotente: boolean;
}

export type PlanActivacionDirecta = {
  empresaId: string;
  uid: string;
  rol: string;
  permisosEfectivos: string[];
  tipo: "ACTIVAR" | "REINTENTO";
};

export function prepararIncorporacionDirecta(data: SolicitudIncorporacionDirecta | undefined) {
  const nombre = normalizarNombre(data?.nombre);
  const codigo = data?.codigo !== undefined && data.codigo !== null ? normalizarCodigo(data?.codigo) : null;
  const pinTemporal = data?.pinTemporal !== undefined && data.pinTemporal !== null ? data.pinTemporal : null;
  if (!nombre || !esRolTenant(data?.rol) || data?.uid !== undefined) {
    throw new HttpsError("invalid-argument", "Datos de incorporacion directa invalidos.");
  }
  if (codigo !== null && !codigo) {
    throw new HttpsError("invalid-argument", "El codigo operativo es invalido.");
  }
  if (pinTemporal !== null && !esPinValido(pinTemporal)) {
    throw new HttpsError("invalid-argument", "El PIN temporal es invalido.");
  }
  return { nombre, codigo, pinTemporal, rol: data.rol };
}

export function prepararIncorporacionEmail(data: SolicitudIncorporacionEmail | undefined) {
  const email = normalizarEmail(data?.email);
  if (!email || !esRolTenant(data?.rol)) {
    throw new HttpsError("invalid-argument", "Datos de incorporacion por email invalidos.");
  }
  return { email, rol: data.rol };
}

export async function crearIncorporacionDirecta({
  empresaId,
  emisorUid,
  data,
  pepper,
}: {
  empresaId: string;
  emisorUid: string;
  data: SolicitudIncorporacionDirecta | undefined;
  pepper: string;
}): Promise<IncorporacionCreada & { uid: string; codigo: string; pinTemporal?: string }> {
  const preparado = prepararIncorporacionDirecta(data);
  const { nombre, rol } = preparado;
  let { codigo, pinTemporal } = preparado;
  const codigoFueProvisto = codigo !== null;
  const pinTemporalGenerada = pinTemporal === null;

  const db = getFirestore();
  const auth = getAuth();

  if (pinTemporal === null) {
    pinTemporal = generarPinTemporal();
  }

  let intento = 0;
  while (true) {
    if (codigo === null) {
      const empresaSnap = await db.collection("empresas").doc(empresaId).get();
      const nombreComercial = empresaSnap.data()?.nombreComercial ?? empresaSnap.data()?.nombre ?? empresaId;
      codigo = generarCodigoOperativo(derivarSlugParaCodigo(nombreComercial));
    }
    const codigoResuelto: string = codigo;

    const incorporacionRef = db.collection(INCORPORACIONES_COLLECTION).doc(idIncorporacionDirecta(empresaId, codigoResuelto));
    const credencialRef = db.collection("credenciales_operativas").doc(idCredencialOperativa(empresaId, codigoResuelto));

    const incorporacionExistente = await incorporacionRef.get();
    if (incorporacionExistente.exists) {
      const credencialExistente = await credencialRef.get();
      return validarIncorporacionDirectaExistente(
        incorporacionExistente.data(),
        credencialExistente.data(),
        codigoResuelto,
        rol,
        incorporacionRef.id,
      );
    }
    if ((await credencialRef.get()).exists) {
      throw new HttpsError("already-exists", "El codigo operativo ya esta asignado.");
    }

    const permisosEfectivos = await permisosPredeterminados(rol);
    const { principal, creadaAhora } = await obtenerPrincipalDirecto(auth, incorporacionRef.id, nombre);
    const usuarioRef = db.collection("usuarios").doc(principal.uid);
    let resultadoExistente: (IncorporacionCreada & { uid: string; codigo: string }) | undefined;

    try {
      const pinHash = await hashearPin(pinTemporal, pepper);
      await db.runTransaction(async (transaction) => {
        const [incorporacionSnap, usuarioSnap, credencialSnap, credencialesUidSnap] = await Promise.all([
          transaction.get(incorporacionRef),
          transaction.get(usuarioRef),
          transaction.get(credencialRef),
          transaction.get(db.collection("credenciales_operativas")
            .where("empresaId", "==", empresaId)
            .where("uid", "==", principal.uid)
            .limit(2)),
        ]);
        if (incorporacionSnap.exists) {
          resultadoExistente = validarIncorporacionDirectaExistente(
            incorporacionSnap.data(),
            credencialSnap.data(),
            codigoResuelto,
            rol,
            incorporacionRef.id,
          );
          return;
        }
        if (usuarioSnap.exists) {
          throw new HttpsError("already-exists", "La identidad ya tiene perfil global.");
        }
        if (credencialSnap.exists) {
          throw new HttpsError("already-exists", "El codigo operativo ya esta asignado.");
        }
        if (credencialesUidSnap.size > 0) {
          throw new HttpsError("already-exists", "La identidad ya tiene credencial operativa en esta empresa.");
        }

        await reservarCodigoOperativoEnTransaccion(db, transaction, codigoResuelto);

        transaction.create(usuarioRef, {
          uid: principal.uid,
          nombre,
          creadoEn: FieldValue.serverTimestamp(),
        });
        transaction.create(credencialRef, {
          empresaId,
          uid: principal.uid,
          codigo: codigoResuelto,
          incorporacionId: incorporacionRef.id,
          pinHash,
          activo: true,
          requiereCambio: true,
          fallosConsecutivos: 0,
          bloqueadoHasta: null,
          creadaEn: FieldValue.serverTimestamp(),
          actualizadaEn: FieldValue.serverTimestamp(),
          pinActualizadoEn: FieldValue.serverTimestamp(),
        });
        transaction.create(incorporacionRef, {
          empresaId,
          mecanismo: "DIRECTA",
          estado: "TEMP_CREDENTIAL",
          rol,
          permisosEfectivos,
          emitidaPorUid: emisorUid,
          uid: principal.uid,
          nombre,
          codigo: codigoResuelto,
          creadaEn: FieldValue.serverTimestamp(),
          actualizadaEn: FieldValue.serverTimestamp(),
        });
      });

      if (resultadoExistente) return resultadoExistente;
    } catch (error) {
      if (error instanceof HttpsError
        && error.message === CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO
        && !codigoFueProvisto
        && intento < MAX_INTENTOS_UNICIDAD) {
        if (creadaAhora) {
          try {
            await auth.deleteUser(principal.uid);
          } catch {
            logger.error("incorporacion_directa_auth_cleanup_failed", { empresaId, uid: principal.uid });
            throw error;
          }
        }
        intento++;
        codigo = null;
        continue;
      }

      const incorporacionConfirmada = await incorporacionRef.get().catch(() => null);
      if (incorporacionConfirmada === null) {
        logger.error("incorporacion_directa_outcome_unknown", { empresaId, uid: principal.uid });
        throw error;
      }
      if (incorporacionConfirmada?.exists) {
        const credencialConfirmada = await credencialRef.get().catch(() => null);
        if (credencialConfirmada === null) {
          logger.error("incorporacion_directa_credential_outcome_unknown", { empresaId, uid: principal.uid });
          throw error;
        }
        try {
          return validarIncorporacionDirectaExistente(
            incorporacionConfirmada.data(),
            credencialConfirmada.data(),
            codigoResuelto,
            rol,
            incorporacionRef.id,
          );
        } catch {
        }
        throw error;
      }
      if (creadaAhora) await auth.deleteUser(principal.uid).catch(() => {
        logger.error("incorporacion_directa_auth_cleanup_failed", { empresaId, uid: principal.uid });
      });
      throw error;
    }

    logger.info("incorporacion_directa_created", { empresaId, incorporacionId: incorporacionRef.id, uid: principal.uid, rol });
    const result: IncorporacionCreada & { uid: string; codigo: string; pinTemporal?: string } = {
      incorporacionId: incorporacionRef.id,
      estado: "TEMP_CREDENTIAL",
      uid: principal.uid,
      codigo: codigoResuelto,
    };
    if (pinTemporalGenerada) {
      result.pinTemporal = pinTemporal;
    }
    return result;
  }
}

export function planificarActivacionDirecta({
  incorporacion,
  credencial,
  membresia,
  uid,
  empresaId,
}: {
  incorporacion: FirebaseFirestore.DocumentData | undefined;
  credencial: FirebaseFirestore.DocumentData | undefined;
  membresia?: FirebaseFirestore.DocumentData;
  uid: string;
  empresaId?: string;
}): PlanActivacionDirecta {
  if (incorporacion?.mecanismo !== "DIRECTA"
    || typeof incorporacion.uid !== "string"
    || incorporacion.uid !== uid
    || (empresaId !== undefined && incorporacion.empresaId !== empresaId)
    || !esRolTenant(incorporacion.rol)) {
    throw new HttpsError("not-found", "La incorporacion directa no esta disponible.");
  }
  if (incorporacion.estado === "CANCELLED" || incorporacion.estado === "EXPIRED") {
    throw new HttpsError("failed-precondition", "La incorporacion directa ya no esta disponible.");
  }
  if (incorporacion.estado !== "TEMP_CREDENTIAL" && incorporacion.estado !== "ACTIVE") {
    throw new HttpsError("failed-precondition", "La incorporacion directa no esta lista para activarse.");
  }

  if (incorporacion.estado === "TEMP_CREDENTIAL"
    && esCredencialTemporalPlataformaVencidaOInvalida(incorporacion, credencial)) {
    throw new HttpsError("failed-precondition", "La credencial temporal ya no esta disponible.");
  }

  const permisosEfectivos = normalizarPermisosEfectivos(incorporacion.permisosEfectivos);
  if (!permisosEfectivos) {
    throw new HttpsError("failed-precondition", "Los permisos de la incorporacion son invalidos.");
  }

  if (incorporacion.estado === "ACTIVE") {
    if (membresia !== undefined && !esMembresiaFinal(membresia, incorporacion, uid, permisosEfectivos)) {
      throw new HttpsError("failed-precondition", "La membresia de la incorporacion es inconsistente.");
    }
    return {
      empresaId: incorporacion.empresaId,
      uid,
      rol: incorporacion.rol,
      permisosEfectivos,
      tipo: "REINTENTO",
    };
  }

  if (!credencial || credencial.empresaId !== incorporacion.empresaId
    || credencial.uid !== uid
    || credencial.codigo !== incorporacion.codigo
    || credencial.activo !== true
    || credencial.requiereCambio !== true) {
    throw new HttpsError("failed-precondition", "La credencial temporal no esta disponible.");
  }
  if (membresia !== undefined && !esMembresiaFinal(membresia, incorporacion, uid, permisosEfectivos)) {
    throw new HttpsError("already-exists", "La identidad ya tiene una membresia incompatible.");
  }

  return {
    empresaId: incorporacion.empresaId,
    uid,
    rol: incorporacion.rol,
    permisosEfectivos,
    tipo: "ACTIVAR",
  };
}

function esMembresiaFinal(
  membresia: FirebaseFirestore.DocumentData,
  incorporacion: FirebaseFirestore.DocumentData,
  uid: string,
  permisosEfectivos: string[],
): boolean {
  const permisos = normalizarPermisosEfectivos(membresia.permisos);
  return membresia.empresaId === incorporacion.empresaId
    && membresia.uid === uid
    && membresia.rol === incorporacion.rol
    && membresia.estado === "activa"
    && membresia.activo === true
    && JSON.stringify(permisos) === JSON.stringify(permisosEfectivos);
}

export function prepararActivacionDirecta(data: SolicitudActivacionDirecta | undefined): {
  pinActual: string;
  pinNuevo: string;
} {
  const pinActual = data?.pinActual ?? data?.pinTemporal;
  const pinNuevo = data?.pinNuevo ?? data?.pinDefinitivo;
  if (!esPinValido(pinActual) || !esPinValido(pinNuevo) || pinActual === pinNuevo) {
    throw new HttpsError("invalid-argument", "El PIN definitivo debe ser valido y distinto al temporal.");
  }
  return { pinActual, pinNuevo };
}

export async function activarIncorporacionDirecta({
  incorporacionId,
  uid,
  data,
  pepper,
}: {
  incorporacionId: string;
  uid: string;
  data: SolicitudActivacionDirecta | undefined;
  pepper: string;
}): Promise<ActivacionDirectaCompletada> {
  const db = getFirestore();
  const incorporacionRef = db.collection(INCORPORACIONES_COLLECTION).doc(incorporacionId);
  const initialIncorporacion = await incorporacionRef.get();
  const initialData = initialIncorporacion.data();
  if (!initialIncorporacion.exists || typeof initialData?.empresaId !== "string"
    || typeof initialData.codigo !== "string") {
    throw new HttpsError("not-found", "La incorporacion directa no esta disponible.");
  }

  const credencialRef = db.collection("credenciales_operativas")
    .doc(idCredencialOperativa(initialData.empresaId, initialData.codigo));
  const empresaRef = db.collection("empresas").doc(initialData.empresaId);
  const membresiaRef = db.collection("membresias").doc(`${initialData.empresaId}_${uid}`);
  const auditoriaRef = db.collection("auditoria_logs").doc(idAuditoriaActivacion(incorporacionId));
  const [credencialSnap, membresiaSnap] = await Promise.all([credencialRef.get(), membresiaRef.get()]);
  const credencial = credencialSnap.data() as Partial<CredencialOperativa> | undefined;
  const planInicial = planificarActivacionDirecta({
    incorporacion: initialData,
    credencial,
    membresia: membresiaSnap.exists ? membresiaSnap.data() : undefined,
    uid,
    empresaId: initialData.empresaId,
  });

  let pinNuevoHash: string | undefined;
  if (planInicial.tipo === "ACTIVAR") {
    const { pinActual, pinNuevo } = prepararActivacionDirecta(data);
    if (await estaBloqueada(credencialRef)) {
      throw new HttpsError("unauthenticated", "Credenciales operativas invalidas.");
    }
    if (!credencial?.pinHash || !await verificarPin(pinActual, credencial.pinHash, pepper)) {
      await registrarFallo(credencialRef);
      throw new HttpsError("unauthenticated", "Credenciales operativas invalidas.");
    }
    pinNuevoHash = await hashearPin(pinNuevo, pepper);
  } else {
    const pinDefinitivo = data?.pinDefinitivo ?? data?.pinNuevo;
    if (!esPinValido(pinDefinitivo) || !credencial?.pinHash
      || !await verificarPin(pinDefinitivo, credencial.pinHash, pepper)) {
      throw new HttpsError("unauthenticated", "Credenciales operativas invalidas.");
    }
  }

  let idempotente = planInicial.tipo === "REINTENTO";
  let obligacionActivacionId: string | null = null;
  await db.runTransaction(async (transaction) => {
    const [incorporacionSnap, credencialActualSnap, empresaSnap, membresiaActualSnap, auditoriaSnap] = await Promise.all([
      transaction.get(incorporacionRef),
      transaction.get(credencialRef),
      transaction.get(empresaRef),
      transaction.get(membresiaRef),
      transaction.get(auditoriaRef),
    ]);
    const incorporacion = incorporacionSnap.data();
    const credencialActual = credencialActualSnap.data();
    const plan = planificarActivacionDirecta({
      incorporacion,
      credencial: credencialActual,
      membresia: membresiaActualSnap.exists ? membresiaActualSnap.data() : undefined,
      uid,
      empresaId: initialData.empresaId,
    });
    idempotente = plan.tipo === "REINTENTO";
    validarSnapshotEmpresaEscribible(empresaSnap);

    if (plan.tipo === "REINTENTO" && (!credencialActualSnap.exists
      || credencialActual?.empresaId !== plan.empresaId
      || credencialActual?.uid !== uid
      || credencialActual?.activo !== true
      || credencialActual?.requiereCambio === true)) {
      throw new HttpsError("failed-precondition", "La incorporacion ACTIVE no tiene una credencial definitiva consistente.");
    }

    if (plan.tipo === "ACTIVAR") {
      if (credencialActual?.pinHash !== credencial?.pinHash) {
        throw new HttpsError("failed-precondition", "La credencial temporal cambio durante la activacion.");
      }
      transaction.update(credencialRef, {
        pinHash: pinNuevoHash,
        requiereCambio: false,
        fallosConsecutivos: 0,
        bloqueadoHasta: null,
        actualizadaEn: FieldValue.serverTimestamp(),
        pinActualizadoEn: FieldValue.serverTimestamp(),
      });
    } else if (credencialActualSnap.exists && credencialActual?.requiereCambio === true) {
      throw new HttpsError("failed-precondition", "La incorporacion ACTIVE conserva una credencial temporal.");
    }

    if (!membresiaActualSnap.exists) {
      transaction.create(membresiaRef, {
        empresaId: plan.empresaId,
        uid: plan.uid,
        rol: plan.rol,
        permisos: plan.permisosEfectivos,
        estado: "activa",
        activo: true,
        creadaEn: FieldValue.serverTimestamp(),
        actualizadaEn: FieldValue.serverTimestamp(),
      });
    }
    if (!auditoriaSnap.exists) {
      transaction.create(auditoriaRef, {
        empresaId: plan.empresaId,
        uid: plan.uid,
        actorUid: plan.uid,
        incorporacionId,
        accion: "incorporacion_directa_activada",
        mecanismo: "DIRECTA",
        rol: plan.rol,
        creadoEn: FieldValue.serverTimestamp(),
      });
      // ADR-SAAS-013 §4.6 — obligación de auditoría de plataforma (ADR-SAAS-012),
      // creada en la misma transacción que el hecho durable. Actor "ADMIN_TENANT":
      // a diferencia de EMITIDA/REEMITIDA, este evento no lo produce un operador de
      // plataforma sino el propio admin del tenant fijando su PIN definitivo.
      crearObligacionAuditoria(db, transaction, {
        tipo: "CREDENCIAL_INICIAL_ACTIVADA",
        resultado: "CONFIRMADO",
        actor: { tipo: "ADMIN_TENANT", uid: plan.uid },
        facultad: null,
        comando: null,
        agregado: { tipo: "EMPRESA", id: plan.empresaId },
        empresaObjetivoId: plan.empresaId,
        revision: { esperada: null, resultante: null },
        correlacionId: incorporacionId,
        causacionId: null,
        motivo: { codigo: "TENANT_ADMIN_ACTIVACION_CREDENCIAL_INICIAL", resumen: null },
      }, {
        obligacionId: idObligacionAuditoriaActivacion(incorporacionId),
        evidenciaId: idEvidenciaAuditoriaActivacion(incorporacionId),
      });
      obligacionActivacionId = idObligacionAuditoriaActivacion(incorporacionId);
    }
    if (incorporacion?.estado !== "ACTIVE") {
      transaction.update(incorporacionRef, {
        estado: "ACTIVE",
        actualizadaEn: FieldValue.serverTimestamp(),
        activadaEn: FieldValue.serverTimestamp(),
      });
    }
  });

  // La obligación se creó en la misma transacción que el hecho durable; su
  // emisión (append-only, ADR-SAAS-012) puede intentarse fuera de ella. Si
  // falla aquí, `reconciliarObligacionesAuditoria` la recoge más tarde.
  if (obligacionActivacionId) await emitirObligacionAuditoria(db, obligacionActivacionId);

  const membresiaFinalSnap = await membresiaRef.get();
  const credencialFinalSnap = await credencialRef.get();
  const planFinal = planificarActivacionDirecta({
    incorporacion: { ...initialData, estado: "ACTIVE" },
    credencial: credencialFinalSnap.data(),
    membresia: membresiaFinalSnap.data(),
    uid,
    empresaId: initialData.empresaId,
  });
  const customToken = await emitirSesionTenant(uid, planFinal.empresaId, planFinal.rol);
  const membresiaTrasClaims = await membresiaRef.get();
  const membresiaTrasClaimsData = membresiaTrasClaims.data();
  if (!membresiaTrasClaims.exists
    || !membresiaTrasClaimsData
    || !esMembresiaFinal(membresiaTrasClaimsData, { ...initialData, estado: "ACTIVE" }, uid, planFinal.permisosEfectivos)) {
    await actualizarClaimsTenant(uid, planFinal.empresaId, null);
    throw new HttpsError("aborted", "La membresia cambio durante la activacion.");
  }
  logger.info("incorporacion_directa_activated", {
    empresaId: planFinal.empresaId,
    incorporacionId,
    uid,
    idempotente,
  });
  return { incorporacionId, estado: "ACTIVE", customToken, idempotente };
}

export function idAuditoriaActivacion(incorporacionId: string): string {
  return createHash("sha256").update(`incorporacion-directa:activada:${incorporacionId}`).digest("hex");
}

/** ADR-SAAS-013 §4.6 — ids deterministas para que la obligación de plataforma de CREDENCIAL_INICIAL_ACTIVADA sea idempotente, igual que `idAuditoriaActivacion` lo es para el registro tenant. */
export function idObligacionAuditoriaActivacion(incorporacionId: string): string {
  return createHash("sha256").update(`obligacion:incorporacion-directa:activada:${incorporacionId}`).digest("hex");
}

export function idEvidenciaAuditoriaActivacion(incorporacionId: string): string {
  return createHash("sha256").update(`evidencia:incorporacion-directa:activada:${incorporacionId}`).digest("hex");
}

export function idIncorporacionDirecta(empresaId: string, codigo: string): string {
  return createHash("sha256").update(`${empresaId}:DIRECTA:${codigo}`).digest("hex");
}

async function obtenerPrincipalDirecto(
  auth: Auth,
  uid: string,
  nombre: string,
): Promise<{ principal: UserRecord; creadaAhora: boolean }> {
  try {
    const existente = await auth.getUser(uid);
    if (existente.disabled) {
      throw new HttpsError("failed-precondition", "La identidad Firebase esta deshabilitada.");
    }
    return { principal: existente, creadaAhora: false };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "auth/user-not-found")) {
      if (error instanceof HttpsError) throw error;
      throw error;
    }
  }

  try {
    const creada = await auth.createUser({ uid, displayName: nombre });
    return { principal: creada, creadaAhora: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "auth/uid-already-exists") {
      const existente = await auth.getUser(uid);
      if (existente.disabled) {
        throw new HttpsError("failed-precondition", "La identidad Firebase esta deshabilitada.");
      }
      return { principal: existente, creadaAhora: false };
    }
    throw error;
  }
}

function validarIncorporacionDirectaExistente(
  data: FirebaseFirestore.DocumentData | undefined,
  credencial: FirebaseFirestore.DocumentData | undefined,
  codigo: string,
  rol: string,
  incorporacionId: string,
): IncorporacionCreada & { uid: string; codigo: string } {
  if (data?.mecanismo !== "DIRECTA" || data.estado !== "TEMP_CREDENTIAL" || data.codigo !== codigo
    || typeof data.uid !== "string" || data.rol !== rol
    || credencial?.uid !== data.uid || credencial.codigo !== codigo || credencial.activo !== true) {
    throw new HttpsError("already-exists", "Ya existe una incorporacion para ese codigo operativo.");
  }
  return { incorporacionId, estado: "TEMP_CREDENTIAL", uid: data.uid, codigo };
}

export async function crearIncorporacionEmail({
  empresaId,
  emisorUid,
  data,
  tokenSecret,
}: {
  empresaId: string;
  emisorUid: string;
  data: SolicitudIncorporacionEmail | undefined;
  tokenSecret: string;
}): Promise<IncorporacionEmailEmitida> {
  const { email, rol } = prepararIncorporacionEmail(data);
  const db = getFirestore();
  const permisosEfectivos = await permisosPredeterminados(rol);
  const ahora = new Date();
  const emision = crearTokenEmail(tokenSecret, ahora);
  let resultado: IncorporacionEmailEmitida | undefined;

  await db.runTransaction(async (transaction) => {
    const existentes = await transaction.get(db.collection(INCORPORACIONES_COLLECTION)
      .where("empresaId", "==", empresaId)
      .where("mecanismo", "==", "EMAIL")
      .where("email", "==", email));
    const ahoraTransaccion = new Date();
    const pendientes = existentes.docs.filter((snap) => snap.data().estado === "INVITED");
    for (const pendienteVencida of pendientes.filter((snap) => estaIncorporacionEmailVencida(snap.data(), ahoraTransaccion))) {
      materializarExpiracionEmail(transaction, pendienteVencida.ref, pendienteVencida.data());
    }
    const pendiente = pendientes.find((snap) => !estaIncorporacionEmailVencida(snap.data(), ahoraTransaccion));
    if (pendiente) {
      validarIncorporacionEmailExistente(pendiente.data(), email, rol);
      resultado = { incorporacionId: pendiente.id, estado: "INVITED", entrega: null };
      return;
    }
    const generacion = Math.max(0, ...existentes.docs.map((snap) => Number(snap.data().generacion) || 1)) + 1;
    const ref = db.collection(INCORPORACIONES_COLLECTION).doc(idIncorporacionEmail(empresaId, email, generacion));
    const auditoriaRef = db.collection("auditoria_logs").doc(idAuditoriaEmail("emitida", ref.id, 1));
    transaction.create(ref, {
      empresaId,
      mecanismo: "EMAIL",
      estado: "INVITED",
      rol,
      permisosEfectivos,
      emitidaPorUid: emisorUid,
      email,
      generacion,
      tokenDigest: emision.digest,
      tokenVersion: 1,
      expiraEn: Timestamp.fromDate(emision.expiraEn),
      reenvios: 0,
      enviadaEn: FieldValue.serverTimestamp(),
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    transaction.create(auditoriaRef, auditoriaEmail({ empresaId, incorporacionId: ref.id, actorUid: emisorUid, accion: "incorporacion_email_emitida", tokenVersion: 1 }));
    resultado = {
      incorporacionId: ref.id,
      estado: "INVITED",
      entrega: { email, token: emision.token, tokenVersion: 1, expiraEn: emision.expiraEn },
    };
  });
  if (!resultado) throw new HttpsError("internal", "No fue posible crear la incorporacion por email.");
  logger.info(resultado.entrega ? "incorporacion_email_created" : "incorporacion_email_reused", { empresaId, incorporacionId: resultado.incorporacionId, rol });
  return resultado;
}

export async function reenviarIncorporacionEmail({ incorporacionId, empresaId, emisorUid, tokenSecret }: {
  incorporacionId: string; empresaId: string; emisorUid: string; tokenSecret: string;
}): Promise<{ entrega: { email: string; token: string; tokenVersion: number; expiraEn: Date } }> {
  const db = getFirestore();
  const ref = db.collection(INCORPORACIONES_COLLECTION).doc(incorporacionId);
  const ahora = new Date();
  const emision = crearTokenEmail(tokenSecret, ahora);
  let entrega: { email: string; token: string; tokenVersion: number; expiraEn: Date } | undefined;
  let expirada = false;
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data();
    validarIncorporacionEmailPendiente(data, empresaId);
    if (estaIncorporacionEmailVencida(data!, ahora)) {
      materializarExpiracionEmail(transaction, ref, data!);
      expirada = true;
      return;
    }
    const plan = planificarReenvioEmail(data!, ahora);
    transaction.update(ref, { tokenDigest: emision.digest, tokenVersion: plan.tokenVersion, reenvios: plan.reenvios, ultimoReenvioEn: FieldValue.serverTimestamp(), expiraEn: Timestamp.fromDate(emision.expiraEn), actualizadaEn: FieldValue.serverTimestamp() });
    transaction.create(db.collection("auditoria_logs").doc(idAuditoriaEmail("reenviada", incorporacionId, plan.tokenVersion)), auditoriaEmail({ empresaId, incorporacionId, actorUid: emisorUid, accion: "incorporacion_email_reenviada", tokenVersion: plan.tokenVersion }));
    entrega = { email: data!.email, token: emision.token, tokenVersion: plan.tokenVersion, expiraEn: emision.expiraEn };
  });
  if (expirada) throw new HttpsError("failed-precondition", "La incorporacion por email expiro.");
  if (!entrega) throw new HttpsError("internal", "No fue posible reenviar la incorporacion.");
  return { entrega };
}

export async function cancelarIncorporacionEmail({ incorporacionId, empresaId, emisorUid }: { incorporacionId: string; empresaId: string; emisorUid: string }): Promise<{ estado: "CANCELLED"; idempotente: boolean }> {
  const db = getFirestore(); const ref = db.collection(INCORPORACIONES_COLLECTION).doc(incorporacionId); let idempotente = false; let expirada = false;
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref); const data = snap.data();
    if (data?.mecanismo !== "EMAIL" || data.empresaId !== empresaId) throw new HttpsError("not-found", "La incorporacion no esta disponible.");
    if (data.estado === "CANCELLED") { idempotente = true; return; }
    if (data.estado === "INVITED" && estaIncorporacionEmailVencida(data, new Date())) {
      materializarExpiracionEmail(transaction, ref, data);
      expirada = true;
      return;
    }
    if (data.estado !== "INVITED") throw new HttpsError("failed-precondition", "La incorporacion no puede cancelarse.");
    transaction.update(ref, { estado: "CANCELLED", tokenDigest: null, canceladaPorUid: emisorUid, canceladaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
    transaction.create(db.collection("auditoria_logs").doc(idAuditoriaEmail("cancelada", incorporacionId, 0)), auditoriaEmail({ empresaId, incorporacionId, actorUid: emisorUid, accion: "incorporacion_email_cancelada", tokenVersion: Number(data.tokenVersion ?? 1) }));
  });
  if (expirada) throw new HttpsError("failed-precondition", "La incorporacion por email expiro.");
  return { estado: "CANCELLED", idempotente };
}

export async function aceptarIncorporacionEmail({ incorporacionId, token, password, uid, emailSesion, tokenSecret }: {
  incorporacionId: string; token: string; password: unknown; uid?: string; emailSesion?: unknown; tokenSecret: string;
}): Promise<ActivacionEmailCompletada> {
  const db = getFirestore(); const auth = getAuth(); const ref = db.collection(INCORPORACIONES_COLLECTION).doc(incorporacionId);
  const inicial = await ref.get(); const invitacion = inicial.data();
  if (!inicial.exists || invitacion?.mecanismo !== "EMAIL") throw new HttpsError("not-found", "La incorporacion no esta disponible.");
  if (invitacion.estado === "ACTIVE") return reintentarActivacionEmail(invitacion, incorporacionId, uid);
  if (invitacion.estado === "INVITED" && estaIncorporacionEmailVencida(invitacion, new Date())) {
    await expirarIncorporacionEmail(incorporacionId);
    throw new HttpsError("failed-precondition", "La incorporacion por email expiro.");
  }
  validarTokenEmail(invitacion, token, tokenSecret, new Date());
  let principal: UserRecord; let creadaAhora = false; let idempotente = false; let expiradaDuranteActivacion = false;
  try {
    if (uid) {
      principal = await auth.getUser(uid);
      if (principal.disabled || normalizarEmail(emailSesion) !== invitacion.email || normalizarEmail(principal.email) !== invitacion.email) throw new HttpsError("permission-denied", "Acceso denegado.");
    } else {
      if (!esPasswordEmailValido(password)) throw new HttpsError("invalid-argument", "Contrasena invalida.");
      try { principal = await auth.getUserByEmail(invitacion.email); throw new HttpsError("failed-precondition", "Debe iniciar sesion con el email invitado."); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "auth/user-not-found")) throw error; }
      principal = await auth.createUser({ email: invitacion.email, password: password as string }); creadaAhora = true;
    }
    const membresiaRef = db.collection("membresias").doc(`${invitacion.empresaId}_${principal.uid}`);
    const empresaRef = db.collection("empresas").doc(invitacion.empresaId);
    const usuarioRef = db.collection("usuarios").doc(principal.uid);
    const auditoriaRef = db.collection("auditoria_logs").doc(idAuditoriaEmail("activada", incorporacionId, 0));
    await db.runTransaction(async (transaction) => {
      const [actualSnap, empresaSnap, membresiaSnap, usuarioSnap, auditoriaSnap] = await Promise.all([transaction.get(ref), transaction.get(empresaRef), transaction.get(membresiaRef), transaction.get(usuarioRef), transaction.get(auditoriaRef)]);
      const actual = actualSnap.data();
      if (actual?.estado === "ACTIVE") {
        validarSnapshotEmpresaEscribible(empresaSnap);
        validarActivacionEmailExistente(actual, membresiaSnap.data(), principal.uid); idempotente = true; return;
      }
      if (!actual) throw new HttpsError("not-found", "La incorporacion no esta disponible.");
      if (estaIncorporacionEmailVencida(actual, new Date())) {
        materializarExpiracionEmail(transaction, ref, actual);
        expiradaDuranteActivacion = true;
        return;
      }
      validarTokenEmail(actual, token, tokenSecret, new Date());
      validarSnapshotEmpresaEscribible(empresaSnap);
      const permisos = normalizarPermisosEfectivos(actual.permisosEfectivos);
      if (!permisos || !esRolTenant(actual.rol)) throw new HttpsError("failed-precondition", "La incorporacion es invalida.");
      if (!usuarioSnap.exists) transaction.create(usuarioRef, { uid: principal.uid, email: actual.email, creadoEn: FieldValue.serverTimestamp() });
      if (!membresiaSnap.exists) transaction.create(membresiaRef, { empresaId: actual.empresaId, uid: principal.uid, rol: actual.rol, permisos, estado: "activa", activo: true, creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
      else validarMembresiaEmail(membresiaSnap.data(), actual, principal.uid, permisos);
      if (!auditoriaSnap.exists) transaction.create(auditoriaRef, auditoriaEmail({ empresaId: actual.empresaId, incorporacionId, actorUid: principal.uid, uid: principal.uid, accion: "incorporacion_email_activada", tokenVersion: Number(actual.tokenVersion ?? 1) }));
      transaction.update(ref, { estado: "ACTIVE", tokenDigest: null, aceptadaPorUid: principal.uid, aceptadaEn: FieldValue.serverTimestamp(), activadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
    });
    if (expiradaDuranteActivacion) throw new HttpsError("failed-precondition", "La incorporacion por email expiro.");
    const final = await ref.get(); const datosFinales = final.data();
    if (!datosFinales || datosFinales.estado !== "ACTIVE") throw new HttpsError("aborted", "La activacion no pudo confirmarse.");
    const customToken = await emitirSesionTenant(principal.uid, datosFinales.empresaId, datosFinales.rol);
    return { incorporacionId, estado: "ACTIVE", customToken, idempotente };
  } catch (error) {
    if (creadaAhora) await compensarPrincipalEmail(auth, db, principal!.uid);
    throw error;
  }
}

export function idIncorporacionEmail(empresaId: string, email: string, generacion = 1): string {
  return createHash("sha256").update(`${empresaId}:EMAIL:${email}:${generacion}`).digest("hex");
}

export function esIncorporacionEmailReutilizable(
  data: FirebaseFirestore.DocumentData | undefined,
  email: string,
  rol: string,
): boolean {
  return data?.mecanismo === "EMAIL" && data.email === email && data.estado === "INVITED" && data.rol === rol;
}

function validarIncorporacionEmailExistente(data: FirebaseFirestore.DocumentData | undefined, email: string, rol: string): void {
  if (!esIncorporacionEmailReutilizable(data, email, rol)) {
    throw new HttpsError("already-exists", "Ya existe una incorporacion pendiente para ese email.");
  }
}

function crearTokenEmail(secret: string, ahora: Date): { token: string; digest: string; expiraEn: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: digestTokenEmail(token, secret), expiraEn: new Date(ahora.getTime() + EMAIL_INVITATION_TTL_MS) };
}

export function digestTokenEmail(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function planificarReenvioEmail(data: FirebaseFirestore.DocumentData, ahora: Date): { tokenVersion: number; reenvios: number } {
  if (data.estado !== "INVITED" || !data.expiraEn?.toDate || data.expiraEn.toDate() <= ahora) {
    throw new HttpsError("failed-precondition", "La incorporacion por email expiro.");
  }
  const reenvios = Number(data.reenvios ?? 0);
  const ultimo = data.ultimoReenvioEn?.toDate?.();
  if (reenvios >= EMAIL_INVITATION_MAX_RESENDS || (ultimo && ahora.getTime() - ultimo.getTime() < EMAIL_INVITATION_RESEND_COOLDOWN_MS)) {
    throw new HttpsError("resource-exhausted", "El reenvio no esta disponible todavia.");
  }
  return { tokenVersion: Number(data.tokenVersion ?? 1) + 1, reenvios: reenvios + 1 };
}

function validarTokenEmail(data: FirebaseFirestore.DocumentData | undefined, token: string, secret: string, ahora: Date): void {
  if (data?.mecanismo !== "EMAIL" || data.estado !== "INVITED" || typeof data.tokenDigest !== "string") {
    throw new HttpsError("failed-precondition", "La incorporacion no esta disponible.");
  }
  if (!data.expiraEn?.toDate || data.expiraEn.toDate() <= ahora) throw new HttpsError("failed-precondition", "La incorporacion por email expiro.");
  const esperado = Buffer.from(data.tokenDigest, "hex");
  const recibido = Buffer.from(digestTokenEmail(token, secret), "hex");
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
    throw new HttpsError("permission-denied", "La incorporacion no esta disponible.");
  }
}

function validarIncorporacionEmailPendiente(data: FirebaseFirestore.DocumentData | undefined, empresaId: string): void {
  if (data?.mecanismo !== "EMAIL" || data.empresaId !== empresaId || data.estado !== "INVITED"
    || typeof data.email !== "string") {
    throw new HttpsError("not-found", "La incorporacion no esta disponible.");
  }
}

async function expirarIncorporacionEmail(incorporacionId: string): Promise<void> {
  const db = getFirestore(); const ref = db.collection(INCORPORACIONES_COLLECTION).doc(incorporacionId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref); const data = snap.data();
    if (data?.mecanismo !== "EMAIL" || data.estado !== "INVITED" || !estaIncorporacionEmailVencida(data, new Date())) return;
    materializarExpiracionEmail(transaction, ref, data);
  });
}

function estaIncorporacionEmailVencida(data: FirebaseFirestore.DocumentData, ahora: Date): boolean {
  return !data.expiraEn?.toDate || data.expiraEn.toDate() <= ahora;
}

function materializarExpiracionEmail(transaction: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData): void {
  transaction.update(ref, { estado: "EXPIRED", tokenDigest: null, expiradaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
  transaction.create(getFirestore().collection("auditoria_logs").doc(idAuditoriaEmail("expirada", ref.id, 0)), auditoriaEmail({ empresaId: data.empresaId, incorporacionId: ref.id, actorUid: "system", accion: "incorporacion_email_expirada", tokenVersion: Number(data.tokenVersion ?? 1) }));
}

function validarMembresiaEmail(membresia: FirebaseFirestore.DocumentData | undefined, incorporacion: FirebaseFirestore.DocumentData, uid: string, permisos: string[]): void {
  if (!membresia || membresia.empresaId !== incorporacion.empresaId || membresia.uid !== uid
    || membresia.rol !== incorporacion.rol || membresia.estado !== "activa" || membresia.activo !== true
    || JSON.stringify(normalizarPermisosEfectivos(membresia.permisos)) !== JSON.stringify(permisos)) {
    throw new HttpsError("already-exists", "La identidad ya tiene una membresia incompatible.");
  }
}

function validarActivacionEmailExistente(invitacion: FirebaseFirestore.DocumentData, membresia: FirebaseFirestore.DocumentData | undefined, uid: string): void {
  if (invitacion.aceptadaPorUid !== uid) throw new HttpsError("permission-denied", "Acceso denegado.");
  const permisos = normalizarPermisosEfectivos(invitacion.permisosEfectivos);
  if (!permisos) throw new HttpsError("failed-precondition", "La incorporacion es invalida.");
  validarMembresiaEmail(membresia, invitacion, uid, permisos);
}

async function reintentarActivacionEmail(invitacion: FirebaseFirestore.DocumentData, incorporacionId: string, uid?: string): Promise<ActivacionEmailCompletada> {
  if (!uid) throw new HttpsError("permission-denied", "Acceso denegado.");
  const db = getFirestore();
  const [empresa, membresia] = await Promise.all([
    db.collection("empresas").doc(invitacion.empresaId).get(),
    db.collection("membresias").doc(`${invitacion.empresaId}_${uid}`).get(),
  ]);
  validarSnapshotEmpresaEscribible(empresa);
  validarActivacionEmailExistente(invitacion, membresia.data(), uid);
  return { incorporacionId, estado: "ACTIVE", customToken: await emitirSesionTenant(uid, invitacion.empresaId, invitacion.rol), idempotente: true };
}

function esPasswordEmailValido(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 1024;
}

async function compensarPrincipalEmail(auth: Auth, db: FirebaseFirestore.Firestore, uid: string): Promise<void> {
  const [usuario, membresias] = await Promise.all([
    db.collection("usuarios").doc(uid).get().catch(() => null),
    db.collection("membresias").where("uid", "==", uid).limit(1).get().catch(() => null),
  ]);
  if (usuario?.exists || (membresias && !membresias.empty)) return;
  await auth.deleteUser(uid).catch(() => logger.error("incorporacion_email_auth_cleanup_failed", { uid }));
}

function idAuditoriaEmail(accion: string, incorporacionId: string, version: number): string {
  return createHash("sha256").update(`incorporacion-email:${accion}:${incorporacionId}:${version}`).digest("hex");
}

function auditoriaEmail({ empresaId, incorporacionId, actorUid, accion, tokenVersion, uid }: { empresaId: string; incorporacionId: string; actorUid: string; accion: string; tokenVersion: number; uid?: string }) {
  return { empresaId, incorporacionId, actorUid, ...(uid ? { uid } : {}), accion, mecanismo: "EMAIL", tokenVersion, creadoEn: FieldValue.serverTimestamp() };
}

export function validarEstadoInicial(mecanismo: unknown, estado: unknown): boolean {
  return (mecanismo === "DIRECTA" && estado === "TEMP_CREDENTIAL")
    || (mecanismo === "EMAIL" && estado === "INVITED");
}
