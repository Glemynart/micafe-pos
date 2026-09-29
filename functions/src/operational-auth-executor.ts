import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  type CredencialOperativa,
  type RolTenant,
  esPinValido,
  esRolTenant,
  normalizarCodigo,
} from "./contracts";
import { verificarPin } from "./pin-security";
import { validarRestablecimientoParaAutenticacion } from "./credential-recovery-service";
import { esCredencialTemporalPlataformaVencidaOInvalida } from "./platform/vigencia-credencial-temporal";

const INCORPORACIONES_COLLECTION = "incorporaciones";
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const ERROR_CREDENCIALES = "Credenciales operativas inválidas.";

export interface SolicitudAutenticacionOperativa {
  codigo?: unknown;
  pin?: unknown;
}

export interface DependenciasAutenticacionOperativa {
  db: any;
  auth: any;
  pepper: string;
  diagnosticLogger?: DiagnosticLogger;
}

export interface ResultadoAutenticacionOperativa {
  customToken: string;
  requiereCambio?: boolean;
  incorporacionId?: string;
  restablecimientoId?: string;
}

interface MembresiaCanonica {
  empresaId?: unknown;
  uid?: unknown;
  rol?: unknown;
  permisos?: unknown;
  estado?: unknown;
  activo?: unknown;
}

interface CredencialOperativaResuelta {
  empresa: { id: string; estado: string };
  ref: any;
  credencial: CredencialOperativa;
}

type OperacionAuth = "auth.getUser" | "auth.setCustomUserClaims" | "auth.createCustomToken";
interface DiagnosticLogger {
  error(message: string, data?: Record<string, unknown>): void;
}

function mensajeErrorSeguro(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  return mensaje
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[REDACTED]")
    .replace(/\b(authorization|token|secret|password|pin|hash)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 256);
}

function registrarFalloPasoAuth(
  operation: OperacionAuth,
  error: unknown,
  diagnosticLogger: DiagnosticLogger,
): void {
  const errorRecord = error as { code?: unknown } | null;
  diagnosticLogger.error("operational_auth_step_failed", {
    operation,
    errorName: error instanceof Error ? error.name : "unknown",
    errorCode: typeof errorRecord?.code === "string" ? errorRecord.code : "unknown",
    errorMessage: mensajeErrorSeguro(error),
  });
}

async function ejecutarPasoAuth<T>(
  operation: OperacionAuth,
  action: () => Promise<T>,
  diagnosticLogger: DiagnosticLogger,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    registrarFalloPasoAuth(operation, error, diagnosticLogger);
    throw error;
  }
}

function errorCredenciales(): HttpsError {
  return new HttpsError("unauthenticated", ERROR_CREDENCIALES);
}

function validarEmpresaOperativa(snap: any): { id: string; estado: string } {
  const estado = snap.data()?.estado;
  if (!snap.exists || (estado !== "activa" && estado !== "trial")) throw errorCredenciales();
  return { id: snap.id, estado };
}

function esMembresiaActivaYValida(data: MembresiaCanonica | undefined, empresaId: string, uid: string): data is MembresiaCanonica & { rol: RolTenant; permisos: string[] } {
  return !!data
    && data.empresaId === empresaId
    && data.uid === uid
    && data.estado === "activa"
    && data.activo === true
    && esRolTenant(data.rol)
    && Array.isArray(data.permisos)
    && data.permisos.every((permiso) => typeof permiso === "string" && permiso.length > 0);
}

async function estaBloqueada(ref: any): Promise<boolean> {
  const snap = await ref.get();
  const bloqueadoHasta = (snap.data() as CredencialOperativa | undefined)?.bloqueadoHasta;
  return !!bloqueadoHasta && bloqueadoHasta.toMillis() > Date.now();
}

async function registrarFallo(db: any, ref: any): Promise<void> {
  await db.runTransaction(async (transaction: any) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const actual = snap.data() as CredencialOperativa;
    const fallos = (actual.fallosConsecutivos ?? 0) + 1;
    const bloqueadoHasta = fallos >= MAX_FALLOS
      ? Timestamp.fromMillis(Date.now() + BLOQUEO_MS)
      : null;
    transaction.update(ref, {
      fallosConsecutivos: fallos >= MAX_FALLOS ? 0 : fallos,
      bloqueadoHasta,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
  });
}

async function limpiarFallos(ref: any): Promise<void> {
  await ref.update({
    fallosConsecutivos: 0,
    bloqueadoHasta: null,
    actualizadaEn: FieldValue.serverTimestamp(),
  });
}

async function resolverCredencialOperativa(
  codigo: string,
  pin: string,
  dependencies: DependenciasAutenticacionOperativa,
): Promise<CredencialOperativaResuelta> {
  const { db, pepper } = dependencies;
  const credencialesConCodigo = await db.collection("credenciales_operativas").where("codigo", "==", codigo).get();
  const candidatas = credencialesConCodigo.docs;
  const coincidencias = (await Promise.all(candidatas.map(async (snap: any) => {
    const credencial = snap.data() as CredencialOperativa;
    if (credencial.activo !== true || await estaBloqueada(snap.ref) || !credencial.pinHash) return null;
    return await verificarPin(pin, credencial.pinHash, pepper)
      ? { ref: snap.ref, credencial }
      : null;
  }))).filter((candidate): candidate is { ref: any; credencial: CredencialOperativa } => candidate !== null);

  if (coincidencias.length !== 1) {
    if (candidatas.length === 1) await registrarFallo(db, candidatas[0].ref);
    throw errorCredenciales();
  }

  const { ref, credencial } = coincidencias[0];
  if (typeof credencial.empresaId !== "string" || credencial.empresaId.trim().length === 0) throw errorCredenciales();
  const empresaSnap = await db.collection("empresas").doc(credencial.empresaId).get();
  return { empresa: validarEmpresaOperativa(empresaSnap), ref, credencial };
}

async function validarMembresiaActiva(
  empresaId: string,
  uid: string,
  dependencies: DependenciasAutenticacionOperativa,
): Promise<{ rol: RolTenant; permisos: string[] }> {
  const { db, auth } = dependencies;
  let membresiaSnap: any;
  try {
    const res = await Promise.all([
      db.collection("membresias").doc(`${empresaId}_${uid}`).get(),
      auth.getUser(uid).catch(() => null),
    ]);
    membresiaSnap = res[0];
  } catch {
    membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${uid}`).get();
  }
  const membresia = membresiaSnap.data() as MembresiaCanonica | undefined;
  if (!membresiaSnap.exists || !esMembresiaActivaYValida(membresia, empresaId, uid)) throw errorCredenciales();
  return { rol: membresia.rol, permisos: membresia.permisos };
}

async function obtenerIncorporacionDirectaTemporal(
  empresaId: string,
  credencial: CredencialOperativa,
  db: any,
): Promise<any | null> {
  if (credencial.incorporacionId) {
    const snap = await db.collection(INCORPORACIONES_COLLECTION).doc(credencial.incorporacionId).get();
    return snap.exists ? snap : null;
  }
  const snap = await db.collection(INCORPORACIONES_COLLECTION)
    .where("empresaId", "==", empresaId)
    .where("mecanismo", "==", "DIRECTA")
    .where("uid", "==", credencial.uid)
    .limit(2)
    .get();
  if (snap.size > 1) {
    logger.error("operational_auth_duplicate_direct_incorporations", { empresaId, uid: credencial.uid });
    throw new HttpsError("internal", "No se pudo procesar la autenticacion.");
  }
  return snap.docs[0] ?? null;
}

async function acuñarSesionTenant(
  uid: string,
  empresaId: string,
  rol: RolTenant,
  auth: any,
  diagnosticLogger: DiagnosticLogger,
): Promise<string> {
  const authUser = await ejecutarPasoAuth<{ customClaims?: Record<string, unknown> }>(
    "auth.getUser",
    () => auth.getUser(uid),
    diagnosticLogger,
  );
  const existente = authUser.customClaims ?? {};
  const platformClaims = {
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };
  await ejecutarPasoAuth(
    "auth.setCustomUserClaims",
    () => auth.setCustomUserClaims(uid, { ...platformClaims, empresaId, rol }),
    diagnosticLogger,
  );
  return ejecutarPasoAuth("auth.createCustomToken", () => auth.createCustomToken(uid), diagnosticLogger);
}

async function emitirSesionActivacionDirecta(
  uid: string,
  incorporacionId: string,
  auth: any,
  diagnosticLogger: DiagnosticLogger,
): Promise<string> {
  const authUser = await ejecutarPasoAuth<{ customClaims?: Record<string, unknown> }>(
    "auth.getUser",
    () => auth.getUser(uid),
    diagnosticLogger,
  );
  const existente = authUser.customClaims ?? {};
  const platformClaims = {
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };
  await ejecutarPasoAuth(
    "auth.setCustomUserClaims",
    () => auth.setCustomUserClaims(uid, platformClaims),
    diagnosticLogger,
  );
  return ejecutarPasoAuth(
    "auth.createCustomToken",
    () => auth.createCustomToken(uid, { authStage: "DIRECTA_TEMP", incorporacionId }),
    diagnosticLogger,
  );
}

async function emitirSesionActivacionRestablecimiento(
  uid: string,
  restablecimientoId: string,
  auth: any,
  diagnosticLogger: DiagnosticLogger,
): Promise<string> {
  const authUser = await ejecutarPasoAuth<{ customClaims?: Record<string, unknown> }>(
    "auth.getUser",
    () => auth.getUser(uid),
    diagnosticLogger,
  );
  const existente = authUser.customClaims ?? {};
  const platformClaims = {
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };
  await ejecutarPasoAuth(
    "auth.setCustomUserClaims",
    () => auth.setCustomUserClaims(uid, platformClaims),
    diagnosticLogger,
  );
  return ejecutarPasoAuth(
    "auth.createCustomToken",
    () => auth.createCustomToken(uid, { authStage: "RESTABLECIMIENTO_TEMP", restablecimientoId }),
    diagnosticLogger,
  );
}

export async function ejecutarAutenticacionOperativa(
  data: SolicitudAutenticacionOperativa | undefined,
  dependencies: DependenciasAutenticacionOperativa,
): Promise<ResultadoAutenticacionOperativa> {
  const diagnosticLogger = dependencies.diagnosticLogger ?? logger;
  const codigo = normalizarCodigo(data?.codigo);
  const pin = data?.pin;
  if (!codigo || !esPinValido(pin)) throw errorCredenciales();

  try {
    const { empresa, ref, credencial } = await resolverCredencialOperativa(codigo, pin, dependencies);
    if (credencial.requiereCambio === true) {
      if (typeof credencial.restablecimientoId === "string" && credencial.restablecimientoId.trim()) {
        await validarRestablecimientoParaAutenticacion(dependencies.db, empresa.id, credencial.uid, credencial.restablecimientoId, ref.id);
        await limpiarFallos(ref);
        const customToken = await emitirSesionActivacionRestablecimiento(
          credencial.uid,
          credencial.restablecimientoId,
          dependencies.auth,
          diagnosticLogger,
        );
        logger.info("operational_auth_recovery_activation_required", { empresaId: empresa.id, uid: credencial.uid, restablecimientoId: credencial.restablecimientoId });
        return { customToken, requiereCambio: true, restablecimientoId: credencial.restablecimientoId };
      }
      const incorporacion = await obtenerIncorporacionDirectaTemporal(empresa.id, credencial, dependencies.db);
      const incorporacionData = incorporacion?.data();
      if (!incorporacion || incorporacionData?.mecanismo !== "DIRECTA"
        || incorporacionData.empresaId !== empresa.id
        || incorporacionData.estado !== "TEMP_CREDENTIAL"
        || incorporacionData.uid !== credencial.uid
        || incorporacionData.codigo !== credencial.codigo
        || esCredencialTemporalPlataformaVencidaOInvalida(incorporacionData, credencial)) {
        throw errorCredenciales();
      }
      await limpiarFallos(ref);
      const customToken = await emitirSesionActivacionDirecta(
        credencial.uid,
        incorporacion.id,
        dependencies.auth,
        diagnosticLogger,
      );
      logger.info("operational_auth_direct_activation_required", { empresaId: empresa.id, uid: credencial.uid, incorporacionId: incorporacion.id });
      return { customToken, requiereCambio: true, incorporacionId: incorporacion.id };
    }

    const membresia = await validarMembresiaActiva(empresa.id, credencial.uid, dependencies);
    await limpiarFallos(ref);
    const customToken = await acuñarSesionTenant(
      credencial.uid,
      empresa.id,
      membresia.rol,
      dependencies.auth,
      diagnosticLogger,
    );
    logger.info("operational_auth_succeeded", { empresaId: empresa.id, uid: credencial.uid });
    return { customToken };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    diagnosticLogger.error("operational_auth_failed", { error: error instanceof Error ? error.name : "unknown" });
    throw errorCredenciales();
  }
}
