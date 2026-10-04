import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { actualizarClaimsTenant } from "../credential-core/emitir-sesion-tenant";
import { leerConfiguracionEmpresa } from "../configuracion/reader";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "../platform/audit";
import { exigirTenantActivo } from "../tenant-configuration/authority";

type Request = { auth?: { uid: string; token: Record<string, unknown> }; data?: unknown };
type Estado = "activa" | "inactiva";
type AuthReader = { getUser(uid: string): Promise<{ customClaims?: Record<string, unknown> }> };
type Dependencies = {
  db?: any;
  auth?: AuthReader;
  exigirTenant?: typeof exigirTenantActivo;
  leerConfiguracion?: typeof leerConfiguracionEmpresa;
  actualizarClaims?: typeof actualizarClaimsTenant;
  crearObligacion?: typeof crearObligacionAuditoria;
  emitirObligacion?: typeof emitirObligacionAuditoria;
};

type Comando = {
  objetivoUid: string;
  estado: Estado;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  motivoCodigo: "TENANT_ADMIN_ACTUALIZAR_MEMBRESIA_BODEGA";
};

function fail(code: HttpsError["code"], message: string): never { throw new HttpsError(code, message); }

function identificador(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : null;
}

function leerComando(data: unknown): Comando {
  if (!data || typeof data !== "object" || Array.isArray(data)) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const record = data as Record<string, unknown>;
  const permitidos = new Set(["objetivoUid", "estado", "commandId", "idempotencyKey", "correlationId", "causationId", "motivoCodigo"]);
  if (Object.keys(record).some((key) => !permitidos.has(key))) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const objetivoUid = identificador(record.objetivoUid);
  const commandId = identificador(record.commandId);
  const idempotencyKey = identificador(record.idempotencyKey);
  const correlationId = identificador(record.correlationId);
  const causationId = record.causationId === null ? null : identificador(record.causationId);
  if (!objetivoUid || !commandId || !idempotencyKey || !correlationId || record.causationId !== null && !causationId) fail("invalid-argument", "COMANDO_INVALIDO");
  if (record.estado !== "activa" && record.estado !== "inactiva") fail("invalid-argument", "ESTADO_MEMBRESIA_INVALIDO");
  if (record.motivoCodigo !== "TENANT_ADMIN_ACTUALIZAR_MEMBRESIA_BODEGA") fail("invalid-argument", "MOTIVO_INVALIDO");
  return { objetivoUid, estado: record.estado, commandId, idempotencyKey, correlationId, causationId, motivoCodigo: record.motivoCodigo };
}

function idsAuditoria(empresaId: string, commandId: string) {
  const base = createHash("sha256").update(`membresia-bodega:${empresaId}:${commandId}`).digest("hex");
  return { obligacionId: `membresia-bodega-${base}`, evidenciaId: createHash("sha256").update(`evidencia:${base}`).digest("hex") };
}

function esReplayCompatible(evidencia: Record<string, any> | undefined, comando: Comando, empresaId: string): boolean {
  return evidencia?.tipo === "MEMBRESIA_BODEGA_ESTADO_ACTUALIZADO"
    && evidencia?.empresaObjetivoId === empresaId
    && evidencia?.comando?.id === comando.commandId
    && evidencia?.comando?.tipo === "ActualizarMembresiaBodegaV1"
    && evidencia?.detalle?.objetivoUid === comando.objetivoUid
    && evidencia?.detalle?.estadoSolicitado === comando.estado
    && evidencia?.detalle?.idempotencyKey === comando.idempotencyKey
    && evidencia?.correlacionId === comando.correlationId
    && evidencia?.causacionId === comando.causationId
    && evidencia?.motivo?.codigo === comando.motivoCodigo;
}

/** Actualiza de forma auditable únicamente el estado de otro vendedor Bodega. */
export async function ejecutarActualizarMembresiaBodegaV1(request: Request, dependencies: Dependencies = {}): Promise<void> {
  if (!request.auth) fail("unauthenticated", "Autenticación requerida.");
  const comando = leerComando(request.data);
  if (comando.objetivoUid === request.auth.uid) fail("invalid-argument", "AUTO_MODIFICACION_NO_PERMITIDA");
  const db = dependencies.db ?? getFirestore();
  const exigirTenant = dependencies.exigirTenant ?? exigirTenantActivo;
  const tenant = await exigirTenant(request, db);
  if (tenant.rol !== "admin") fail("permission-denied", "Acceso denegado.");
  const leerConfiguracion = dependencies.leerConfiguracion ?? leerConfiguracionEmpresa;
  const configuracion = await leerConfiguracion(db, tenant.id);
  if (configuracion.vertical !== "BODEGA_MVP1") fail("permission-denied", "Acceso denegado.");

  const auditoriaIds = idsAuditoria(tenant.id, comando.commandId);
  const membresiaRef = db.collection("membresias").doc(`${tenant.id}_${comando.objetivoUid}`);
  const obligacionRef = db.collection("saas_auditoria_obligaciones").doc(auditoriaIds.obligacionId);
  const crearObligacion = dependencies.crearObligacion ?? crearObligacionAuditoria;
  const resultado = await db.runTransaction(async (transaction: any) => {
    const [membresiaSnap, obligacionSnap] = await Promise.all([transaction.get(membresiaRef), transaction.get(obligacionRef)]);
    const actual = membresiaSnap.data() as Record<string, unknown> | undefined;
    if (!membresiaSnap.exists || !actual || actual.empresaId !== tenant.id || actual.uid !== comando.objetivoUid) fail("not-found", "MEMBRESIA_NO_ENCONTRADA");
    if (actual.rol !== "vendedor") fail("permission-denied", "OBJETIVO_VENDEDOR_REQUERIDO");
    if (obligacionSnap.exists) {
      if (!esReplayCompatible(obligacionSnap.data()?.evidencia, comando, tenant.id)) fail("already-exists", "CONFLICTO_IDEMPOTENCIA");
      return { estadoFinal: actual.estado === "activa" ? "activa" as const : "inactiva" as const };
    }
    const estadoAnterior = actual.estado === "activa" ? "activa" : "inactiva";
    transaction.update(membresiaRef, { estado: comando.estado, activo: comando.estado === "activa", actualizadaEn: FieldValue.serverTimestamp() });
    crearObligacion(db, transaction, {
      tipo: "MEMBRESIA_BODEGA_ESTADO_ACTUALIZADO",
      resultado: "CONFIRMADO",
      actor: { tipo: "ADMIN_TENANT", uid: request.auth!.uid },
      facultad: null,
      comando: { id: comando.commandId, tipo: "ActualizarMembresiaBodegaV1" },
      agregado: { tipo: "MEMBRESIA_BODEGA", id: `${tenant.id}_${comando.objetivoUid}` },
      empresaObjetivoId: tenant.id,
      revision: { esperada: null, resultante: null },
      correlacionId: comando.correlationId,
      causacionId: comando.causationId,
      motivo: { codigo: comando.motivoCodigo, resumen: null },
      detalle: { objetivoUid: comando.objetivoUid, estadoAnterior, estadoSolicitado: comando.estado, idempotencyKey: comando.idempotencyKey },
    }, auditoriaIds);
    return { estadoFinal: comando.estado };
  });

  const auth = dependencies.auth ?? getAuth();
  const claims = (await auth.getUser(comando.objetivoUid)).customClaims ?? {};
  const actualizarClaims = dependencies.actualizarClaims ?? actualizarClaimsTenant;
  if (claims.empresaId === tenant.id) await actualizarClaims(comando.objetivoUid, tenant.id, resultado.estadoFinal === "activa" ? "vendedor" : null, claims);
  const emitirObligacion = dependencies.emitirObligacion ?? emitirObligacionAuditoria;
  await emitirObligacion(db, auditoriaIds.obligacionId);
}
