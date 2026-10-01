import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  type CredencialOperativa,
  type RolTenant,
  esPinValido,
  esRolTenant,
  idCredencialOperativa,
  normalizarCodigo,
} from "./contracts";
import { hashearPin, verificarPin } from "./pin-security";
import { ejecutarAutenticacionOperativa } from "./operational-auth-executor";
import {
  actualizarClaimsTenant,
  estaBloqueada,
  emitirSesionTenant,
  normalizarPermisosEfectivos,
  registrarFallo,
  validarSnapshotEmpresaEscribible,
} from "./operational/tenant-context";
import { exigirTenantActivo, validarMembresiaActiva } from "./tenant-configuration/authority";
import { PERMISOS_VENDEDOR, permisosPredeterminados } from "./tenant-permissions";

export { PERMISOS_VENDEDOR, permisosPredeterminados } from "./tenant-permissions";

export {
  actualizarClaimsTenant,
  estaBloqueada,
  emitirSesionTenant,
  normalizarPermisosEfectivos,
  registrarFallo,
  validarSnapshotEmpresaEscribible,
} from "./operational/tenant-context";

export { exigirTenantActivo } from "./tenant-configuration/authority";

initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const ERROR_CREDENCIALES = "Credenciales operativas inválidas.";

interface SolicitudAutenticacion {
  codigo?: unknown;
  pin?: unknown;
}

interface SolicitudProvisionamiento extends SolicitudAutenticacion {
  uid?: unknown;
}

interface SolicitudRotacion {
  pinActual?: unknown;
  pinNuevo?: unknown;
}

interface SolicitudCrearUsuario {
  uid?: unknown;
  nombre?: unknown;
  username?: unknown;
  email?: unknown;
  rol?: unknown;
}

interface SolicitudActualizarMembresia {
  uid?: unknown;
  rol?: unknown;
  permisos?: unknown;
  estado?: unknown;
}

function errorCredenciales(): HttpsError {
  return new HttpsError("unauthenticated", ERROR_CREDENCIALES);
}

function obtenerPepper(): string {
  const pepper = PIN_PEPPER.value();
  if (!pepper) {
    logger.error("operational_auth_secret_unavailable");
    throw new HttpsError("internal", "No se pudo procesar la autenticación.");
  }
  return pepper;
}

function referenciaCredencial(empresaId: string, codigo: string) {
  return getFirestore().collection("credenciales_operativas").doc(idCredencialOperativa(empresaId, codigo));
}

async function obtenerCredencialDelUid(empresaId: string, uid: string) {
  const snap = await getFirestore()
    .collection("credenciales_operativas")
    .where("empresaId", "==", empresaId)
    .where("uid", "==", uid)
    .limit(2)
    .get();

  if (snap.size > 1) {
    logger.error("operational_auth_duplicate_uid_credentials", { empresaId, uid });
    throw new HttpsError("internal", "No se pudo procesar la autenticación.");
  }

  return snap.docs[0] ?? null;
}

export function extraerEmpresaIdTenant(request: { auth?: { token: Record<string, unknown> } }): string {
  if (!request.auth || request.auth.token.rol !== "admin") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const empresaId = request.auth.token.empresaId;
  if (typeof empresaId !== "string" || empresaId.trim().length === 0) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  return empresaId;
}

export async function exigirAdminTenant(request: { auth?: { uid: string; token: Record<string, unknown> } }, dbParam?: any) {
  const tenant = await exigirTenantActivo(request, dbParam);
  if (tenant.rol !== "admin") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  return { id: tenant.id, estado: tenant.estado, paisFiscal: tenant.paisFiscal };
}

/** Revalida claim, Empresa y membresía para lecturas administrativas (admite 'suspendida' solo para admin). */
export async function exigirTenantLecturaAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } }, dbParam?: any) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const empresaId = request.auth.token.empresaId;
  if (typeof empresaId !== "string" || !empresaId.trim()) throw new HttpsError("permission-denied", "Acceso denegado.");
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("empresas").doc(empresaId).get();
  const estado = snap.data()?.estado;
  const membresiaActual = await validarMembresiaActiva(empresaId, request.auth!.uid, db);
  if (request.auth.token.rol !== membresiaActual.rol) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const esAdmin = membresiaActual.rol === "admin";
  const estadoValido = estado === "activa" || estado === "trial" || (estado === "suspendida" && esAdmin);
  if (!snap.exists || !estadoValido) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  return { id: empresaId, estado: estado as string, rol: membresiaActual.rol, permisos: membresiaActual.permisos };
}

/** Revalida que la empresa permita operaciones de escritura en su estado actual (trial o activa). */
export async function validarEmpresaEscribible(empresaId: string, dbParam?: any): Promise<{ id: string; estado: string }> {
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("empresas").doc(empresaId).get();
  return validarSnapshotEmpresaEscribible(snap);
}

/**
 * Una edición de membresía solo puede proyectar o revocar el contexto que el
 * usuario ya tiene activo. A diferencia de bootstrap e incorporaciones, esta
 * operación no selecciona tenant para el usuario objetivo.
 */
async function actualizarClaimsMembresiaSiTenantActivo(
  uid: string,
  empresaId: string,
  rol: RolTenant | null,
): Promise<void> {
  const auth = getAuth();
  const claimsActuales = (await auth.getUser(uid)).customClaims ?? {};
  if (claimsActuales.empresaId !== empresaId) return;
  await actualizarClaimsTenant(uid, empresaId, rol, claimsActuales);
}

export const autenticarOperativo = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request) => ejecutarAutenticacionOperativa(request.data as SolicitudAutenticacion | undefined, {
    db: getFirestore(),
    auth: getAuth(),
    pepper: obtenerPepper(),
  }),
);

export const provisionarCredencialOperativa = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request): Promise<{ codigo: string }> => {
    const empresa = await exigirAdminTenant(request);
    const data = request.data as SolicitudProvisionamiento | undefined;
    const codigo = normalizarCodigo(data?.codigo);
    const pin = data?.pin;
    const uid = typeof data?.uid === "string" ? data.uid : null;
    if (!codigo || !esPinValido(pin) || !uid) {
      throw new HttpsError("invalid-argument", "Datos de credencial inválidos.");
    }

    await validarMembresiaActiva(empresa.id, uid);
    const hash = await hashearPin(pin, obtenerPepper());
    const db = getFirestore();
    const destino = referenciaCredencial(empresa.id, codigo);
    await db.runTransaction(async (transaction) => {
      const existentes = await transaction.get(
        db.collection("credenciales_operativas")
          .where("empresaId", "==", empresa.id)
          .where("uid", "==", uid)
          .limit(2)
      );
      if (existentes.size > 1) {
        logger.error("operational_auth_duplicate_uid_credentials", { empresaId: empresa.id, uid });
        throw new HttpsError("internal", "No se pudo procesar la credencial.");
      }
      const existente = existentes.docs[0] ?? null;
      const destinoSnap = await transaction.get(destino);
      if (destinoSnap.exists && destinoSnap.data()?.uid !== uid) {
        throw new HttpsError("already-exists", "El código operativo ya está asignado.");
      }

      if (existente && existente.id !== destino.id) transaction.delete(existente.ref);
      transaction.set(destino, {
        empresaId: empresa.id,
        uid,
        codigo,
        pinHash: hash,
        activo: true,
        fallosConsecutivos: 0,
        bloqueadoHasta: null,
        creadaEn: existente?.data().creadaEn ?? FieldValue.serverTimestamp(),
        actualizadaEn: FieldValue.serverTimestamp(),
        pinActualizadoEn: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    await getAuth().revokeRefreshTokens(uid);
    logger.info("operational_credential_provisioned", { empresaId: empresa.id, uid });
    return { codigo };
  }
);

export const rotarPinOperativo = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request): Promise<void> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    const data = request.data as SolicitudRotacion | undefined;
    if (!esPinValido(data?.pinActual) || !esPinValido(data?.pinNuevo)) {
      throw new HttpsError("invalid-argument", "PIN inválido.");
    }

    const empresa = await exigirTenantActivo(request);
    const credencial = await obtenerCredencialDelUid(empresa.id, request.auth.uid);
    if (!credencial || await estaBloqueada(credencial.ref)) throw errorCredenciales();

    const actual = credencial.data() as CredencialOperativa;
    if (!await verificarPin(data.pinActual, actual.pinHash, obtenerPepper())) {
      await registrarFallo(credencial.ref);
      throw errorCredenciales();
    }

    await credencial.ref.update({
      pinHash: await hashearPin(data.pinNuevo, obtenerPepper()),
      fallosConsecutivos: 0,
      bloqueadoHasta: null,
      actualizadaEn: FieldValue.serverTimestamp(),
      pinActualizadoEn: FieldValue.serverTimestamp(),
    });
    await getAuth().revokeRefreshTokens(request.auth.uid);
    logger.info("operational_pin_rotated", { empresaId: empresa.id, uid: request.auth.uid });
  }
);

/**
 * Crea el perfil global y la membresía inicial en una sola transacción. La
 * plantilla solo se consulta como base de alta: el resultado guardado en la
 * membresía es el conjunto efectivo de autoridad.
 */
export const crearUsuarioConMembresia = onCall(
  { region: REGION },
  async (request): Promise<void> => {
    const empresa = await exigirAdminTenant(request);
    const data = request.data as SolicitudCrearUsuario | undefined;
    const uid = typeof data?.uid === "string" ? data.uid : null;
    const nombre = typeof data?.nombre === "string" ? data.nombre.trim() : "";
    const username = typeof data?.username === "string" ? data.username.trim().toLowerCase() : "";
    const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!uid || !nombre || !username || !email || !esRolTenant(data?.rol)) {
      throw new HttpsError("invalid-argument", "Datos de usuario inválidos.");
    }

    await getAuth().getUser(uid);
    const permisos = await permisosPredeterminados(data.rol);
    const db = getFirestore();
    const miembroRef = db.collection("membresias").doc(`${empresa.id}_${uid}`);
    const usuarioRef = db.collection("usuarios").doc(uid);
    await db.runTransaction(async (transaction) => {
      const [existente, usuarioExistente] = await Promise.all([
        transaction.get(miembroRef),
        transaction.get(usuarioRef),
      ]);
      if (existente.exists || usuarioExistente.exists) {
        throw new HttpsError("already-exists", "El usuario ya existe.");
      }
      transaction.create(usuarioRef, {
        uid,
        nombre,
        username,
        email,
        creadoEn: FieldValue.serverTimestamp(),
      });
      transaction.create(miembroRef, {
        empresaId: empresa.id,
        uid,
        rol: data.rol,
        permisos,
        estado: "activa",
        activo: true,
        creadaEn: FieldValue.serverTimestamp(),
        actualizadaEn: FieldValue.serverTimestamp(),
      });
    });
    await actualizarClaimsTenant(uid, empresa.id, data.rol);
    logger.info("membership_user_created", { empresaId: empresa.id, uid, rol: data.rol });
  }
);

/** Actualiza la autoridad efectiva y reemite/revoca la sesión afectada. */
export const actualizarMembresia = onCall(
  { region: REGION },
  async (request): Promise<void> => {
    const empresa = await exigirAdminTenant(request);
    const data = request.data as SolicitudActualizarMembresia | undefined;
    const uid = typeof data?.uid === "string" ? data.uid : null;
    if (!uid || uid === request.auth!.uid) {
      throw new HttpsError("invalid-argument", "No se puede modificar la membresía propia.");
    }
    const estado = data?.estado;
    if (estado !== undefined && estado !== "activa" && estado !== "inactiva") {
      throw new HttpsError("invalid-argument", "Estado de membresía inválido.");
    }
    if (data?.rol !== undefined && !esRolTenant(data.rol)) {
      throw new HttpsError("invalid-argument", "Rol de membresía inválido.");
    }
    const permisosSolicitados = data?.permisos === undefined ? undefined : normalizarPermisosEfectivos(data.permisos);
    if (data?.permisos !== undefined && !permisosSolicitados) {
      throw new HttpsError("invalid-argument", "Permisos de membresía inválidos.");
    }

    const ref = getFirestore().collection("membresias").doc(`${empresa.id}_${uid}`);
    const snap = await ref.get();
    const actual = snap.data() as { rol?: unknown; permisos?: unknown; estado?: unknown } | undefined;
    if (!snap.exists || !actual || !esRolTenant(actual.rol) || !Array.isArray(actual.permisos)) {
      throw new HttpsError("not-found", "Membresía no encontrada.");
    }
    const rol = data?.rol === undefined ? actual.rol : data.rol;
    const permisos = permisosSolicitados ?? (data?.rol === undefined
      ? normalizarPermisosEfectivos(actual.permisos)
      : await permisosPredeterminados(rol));
    if (!permisos) throw new HttpsError("failed-precondition", "Permisos de membresía inválidos.");
    const estadoFinal = estado ?? actual.estado;
    await ref.update({
      rol,
      permisos,
      estado: estadoFinal,
      activo: estadoFinal === "activa",
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    await actualizarClaimsMembresiaSiTenantActivo(uid, empresa.id, estadoFinal === "activa" ? rol : null);
    logger.info("membership_updated", { empresaId: empresa.id, uid, rol, estado: estadoFinal });
  }
);
