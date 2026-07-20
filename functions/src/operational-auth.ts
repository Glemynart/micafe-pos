import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
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

initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const ERROR_CREDENCIALES = "Credenciales operativas inválidas.";

interface UsuarioLegacy {
  activo?: boolean;
  rol?: unknown;
}

interface EmpresaFundacional {
  estado?: unknown;
}

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

async function obtenerEmpresaFundacional(): Promise<{ id: string; estado: string }> {
  const snap = await getFirestore()
    .collection("empresas")
    .where("esFundacional", "==", true)
    .limit(2)
    .get();

  if (snap.size !== 1) {
    logger.error("operational_auth_fundational_tenant_invalid", { count: snap.size });
    throw new HttpsError("internal", "No se pudo procesar la autenticación.");
  }

  const empresa = snap.docs[0];
  const data = empresa.data() as EmpresaFundacional;
  if (data.estado !== "activa" && data.estado !== "trial") {
    throw errorCredenciales();
  }

  return { id: empresa.id, estado: data.estado as string };
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

async function validarUsuarioYMembership(empresaId: string, uid: string): Promise<RolTenant> {
  const db = getFirestore();
  const [usuarioSnap, membresiaSnap] = await Promise.all([
    db.collection("usuarios").doc(uid).get(),
    db.collection("membresias").doc(`${empresaId}_${uid}`).get(),
    getAuth().getUser(uid),
  ]);

  if (!usuarioSnap.exists || !membresiaSnap.exists || membresiaSnap.data()?.activo !== true) {
    throw errorCredenciales();
  }

  const usuario = usuarioSnap.data() as UsuarioLegacy;
  if (usuario.activo !== true || !esRolTenant(usuario.rol)) {
    logger.warn("operational_auth_legacy_user_invalid", { empresaId, uid });
    throw errorCredenciales();
  }

  return usuario.rol;
}

async function registrarFallo(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  await getFirestore().runTransaction(async (transaction) => {
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

async function estaBloqueada(ref: FirebaseFirestore.DocumentReference): Promise<boolean> {
  const snap = await ref.get();
  const bloqueadoHasta = (snap.data() as CredencialOperativa | undefined)?.bloqueadoHasta;
  return !!bloqueadoHasta && bloqueadoHasta.toMillis() > Date.now();
}

async function limpiarFallos(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  await ref.update({
    fallosConsecutivos: 0,
    bloqueadoHasta: null,
    actualizadaEn: FieldValue.serverTimestamp(),
  });
}

async function acuñarSesionTenant(uid: string, empresaId: string, rol: RolTenant): Promise<string> {
  const auth = getAuth();
  const existente = (await auth.getUser(uid)).customClaims ?? {};
  const platformClaims = {
    ...(existente.superadmin === true ? { superadmin: true } : {}),
    ...(existente.soporte === true ? { soporte: true } : {}),
  };

  await auth.setCustomUserClaims(uid, { ...platformClaims, empresaId, rol });
  return auth.createCustomToken(uid);
}

async function exigirAdminFundacional(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth || request.auth.token.rol !== "admin") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }

  const empresa = await obtenerEmpresaFundacional();
  if (request.auth.token.empresaId !== empresa.id) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }

  const rolActual = await validarUsuarioYMembership(empresa.id, request.auth.uid);
  if (rolActual !== "admin") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }

  return empresa;
}

export const autenticarOperativo = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request): Promise<{ customToken: string }> => {
    const codigo = normalizarCodigo((request.data as SolicitudAutenticacion | undefined)?.codigo);
    const pin = (request.data as SolicitudAutenticacion | undefined)?.pin;
    if (!codigo || !esPinValido(pin)) throw errorCredenciales();

    try {
      const empresa = await obtenerEmpresaFundacional();
      const ref = referenciaCredencial(empresa.id, codigo);
      const snap = await ref.get();
      if (!snap.exists || await estaBloqueada(ref)) throw errorCredenciales();

      const credencial = snap.data() as CredencialOperativa;
      if (credencial.activo !== true || !await verificarPin(pin, credencial.pinHash, obtenerPepper())) {
        await registrarFallo(ref);
        throw errorCredenciales();
      }

      const rol = await validarUsuarioYMembership(empresa.id, credencial.uid);
      await limpiarFallos(ref);
      const customToken = await acuñarSesionTenant(credencial.uid, empresa.id, rol);
      logger.info("operational_auth_succeeded", { empresaId: empresa.id, uid: credencial.uid });
      return { customToken };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("operational_auth_failed", { error: error instanceof Error ? error.name : "unknown" });
      throw errorCredenciales();
    }
  }
);

export const provisionarCredencialOperativa = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request): Promise<{ codigo: string }> => {
    const empresa = await exigirAdminFundacional(request);
    const data = request.data as SolicitudProvisionamiento | undefined;
    const codigo = normalizarCodigo(data?.codigo);
    const pin = data?.pin;
    const uid = typeof data?.uid === "string" ? data.uid : null;
    if (!codigo || !esPinValido(pin) || !uid) {
      throw new HttpsError("invalid-argument", "Datos de credencial inválidos.");
    }

    await validarUsuarioYMembership(empresa.id, uid);
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

    const empresa = await obtenerEmpresaFundacional();
    if (request.auth.token.empresaId !== empresa.id) throw new HttpsError("permission-denied", "Acceso denegado.");
    await validarUsuarioYMembership(empresa.id, request.auth.uid);
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
