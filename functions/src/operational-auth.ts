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
import { esCredencialTemporalPlataformaVencidaOInvalida } from "./platform/vigencia-credencial-temporal";

initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const INCORPORACIONES_COLLECTION = "incorporaciones";
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const ERROR_CREDENCIALES = "Credenciales operativas inválidas.";

interface MembresiaCanonica {
  empresaId?: unknown;
  uid?: unknown;
  rol?: unknown;
  permisos?: unknown;
  estado?: unknown;
  activo?: unknown;
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

interface CredencialOperativaResuelta {
  empresa: { id: string; estado: string };
  ref: FirebaseFirestore.DocumentReference;
  credencial: CredencialOperativa;
}

/**
 * La credencial temporal no recibe empresaId del cliente. El backend identifica
 * su tenant comparando el PIN contra las incorporaciones DIRECTA temporales que
 * comparten el código y rechaza cualquier resultado ambiguo.
 */
async function resolverCredencialOperativa(
  codigo: string,
  pin: string,
): Promise<CredencialOperativaResuelta> {
  const db = getFirestore();
  const empresaFundacional = await obtenerEmpresaFundacional();
  const refFundacional = referenciaCredencial(empresaFundacional.id, codigo);
  const [fundacionalSnap, credencialesConCodigo] = await Promise.all([
    refFundacional.get(),
    db.collection("credenciales_operativas").where("codigo", "==", codigo).get(),
  ]);

  const candidatas = [
    ...(fundacionalSnap.exists ? [fundacionalSnap] : []),
    ...credencialesConCodigo.docs.filter((snap) => snap.ref.path !== refFundacional.path),
  ];
  const coincidencias = (await Promise.all(candidatas.map(async (snap) => {
    const credencial = snap.data() as CredencialOperativa;
    if (credencial.activo !== true || await estaBloqueada(snap.ref) || !credencial.pinHash) return null;
    return await verificarPin(pin, credencial.pinHash, obtenerPepper())
      ? { ref: snap.ref, credencial }
      : null;
  }))).filter((candidata): candidata is { ref: FirebaseFirestore.DocumentReference; credencial: CredencialOperativa } => candidata !== null);

  if (coincidencias.length !== 1) {
    if (candidatas.length === 1) await registrarFallo(candidatas[0].ref);
    throw errorCredenciales();
  }

  const { ref, credencial } = coincidencias[0];
  if (typeof credencial.empresaId !== "string" || credencial.empresaId.trim().length === 0) {
    throw errorCredenciales();
  }
  const empresaSnap = await db.collection("empresas").doc(credencial.empresaId).get();
  const estado = empresaSnap.data()?.estado;
  if (!empresaSnap.exists || (estado !== "activa" && estado !== "trial")) throw errorCredenciales();
  return { empresa: { id: empresaSnap.id, estado: estado as string }, ref, credencial };
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

/** La membresía, no `usuarios`, decide rol, permisos y estado. */
async function validarMembresiaActiva(empresaId: string, uid: string, dbParam?: any): Promise<RolTenant> {
  const db = dbParam ?? getFirestore();
  let membresiaSnap;
  try {
    const res = await Promise.all([
      db.collection("membresias").doc(`${empresaId}_${uid}`).get(),
      getAuth().getUser(uid).catch(() => null),
    ]);
    membresiaSnap = res[0];
  } catch {
    membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${uid}`).get();
  }

  const membresia = membresiaSnap.data() as MembresiaCanonica | undefined;
  if (!membresiaSnap.exists || !esMembresiaActivaYValida(membresia, empresaId, uid)) {
    throw errorCredenciales();
  }
  return membresia.rol;
}

async function obtenerIncorporacionDirectaTemporal(
  empresaId: string,
  credencial: CredencialOperativa,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const db = getFirestore();
  if (credencial.incorporacionId) {
    const snap = await db.collection(INCORPORACIONES_COLLECTION).doc(credencial.incorporacionId).get();
    return snap.exists ? snap as FirebaseFirestore.QueryDocumentSnapshot : null;
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

/** Revalida claim, Empresa y membresía para lecturas tenant de backend. */
export async function exigirTenantActivo(request: { auth?: { uid: string; token: Record<string, unknown> } }, dbParam?: any) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const empresaId = request.auth.token.empresaId;
  if (typeof empresaId !== "string" || !empresaId.trim()) throw new HttpsError("permission-denied", "Acceso denegado.");
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("empresas").doc(empresaId).get();
  const estado = snap.data()?.estado;
  const paisFiscal = snap.data()?.paisFiscal;
  if (!snap.exists || (estado !== "activa" && estado !== "trial")) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const rolActual = await validarMembresiaActiva(empresaId, request.auth!.uid, db);
  if (request.auth.token.rol !== rolActual) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  return {
    id: empresaId,
    estado: estado as string,
    rol: rolActual,
    paisFiscal: typeof paisFiscal === "string" ? paisFiscal : undefined,
  };
}

/** Revalida claim, Empresa y membresía para lecturas administrativas (admite 'suspendida' solo para admin). */
export async function exigirTenantLecturaAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } }, dbParam?: any) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const empresaId = request.auth.token.empresaId;
  if (typeof empresaId !== "string" || !empresaId.trim()) throw new HttpsError("permission-denied", "Acceso denegado.");
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("empresas").doc(empresaId).get();
  const estado = snap.data()?.estado;
  const rolActual = await validarMembresiaActiva(empresaId, request.auth!.uid, db);
  if (request.auth.token.rol !== rolActual) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  const esAdmin = rolActual === "admin";
  const estadoValido = estado === "activa" || estado === "trial" || (estado === "suspendida" && esAdmin);
  if (!snap.exists || !estadoValido) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }
  return { id: empresaId, estado: estado as string, rol: rolActual };
}

/** Revalida que la empresa permita operaciones de escritura en su estado actual (trial o activa). */
export async function validarEmpresaEscribible(empresaId: string, dbParam?: any): Promise<{ id: string; estado: string }> {
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("empresas").doc(empresaId).get();
  const estado = snap.data()?.estado;
  if (!snap.exists || (estado !== "activa" && estado !== "trial")) {
    throw new HttpsError("failed-precondition", "La empresa no permite operaciones de escritura en su estado actual.");
  }
  return { id: empresaId, estado: estado as string };
}

export async function registrarFallo(ref: FirebaseFirestore.DocumentReference): Promise<void> {
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

export async function estaBloqueada(ref: FirebaseFirestore.DocumentReference): Promise<boolean> {
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
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };

  await auth.setCustomUserClaims(uid, { ...platformClaims, empresaId, rol });
  return auth.createCustomToken(uid);
}

/**
 * Emite una sesión de bootstrap sin dejar claims tenant persistentes.
 *
 * CORRECCIÓN ARQUITECTÓNICA (Capa 5, derivada del E2E): antes revocaba los
 * refresh tokens del uid antes de emitir el customToken, para invalidar una
 * sesión previa en caso de que una reparación reutilizara el principal. Se
 * eliminó tras auditar que ninguna invariante depende de ella: el uid llega
 * aquí recién creado (sin sesión previa) en el camino normal, y el único
 * caso real de invalidación —una credencial reemitida— ya se protege por su
 * cuenta en `emitirCredencialInicial` (incorporación anterior a `EXPIRED` en
 * la misma transacción), verificado por `activarIncorporacionDirecta` contra
 * el estado de Firestore, no contra la validez del token. Mantenerla creaba
 * una carrera real: `revokeRefreshTokens` fija `validSince` con resolución
 * de segundo, y el customToken emitido a continuación podía nacer con un
 * `iat` dentro del mismo segundo, autoinvalidando la sesión `DIRECTA_TEMP`
 * recién creada antes de que el cliente pudiera usarla.
 */
export async function emitirSesionActivacionDirecta(uid: string, incorporacionId: string): Promise<string> {
  const auth = getAuth();
  const existente = (await auth.getUser(uid)).customClaims ?? {};
  const platformClaims = {
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };
  await auth.setCustomUserClaims(uid, platformClaims);
  return auth.createCustomToken(uid, { authStage: "DIRECTA_TEMP", incorporacionId });
}

export async function actualizarClaimsTenant(
  uid: string,
  empresaId: string,
  rol: RolTenant | null,
  claimsActuales?: Record<string, unknown>,
): Promise<void> {
  const auth = getAuth();
  const existente = claimsActuales ?? (await auth.getUser(uid)).customClaims ?? {};
  const platformClaims = {
    ...(existente.saas && typeof existente.saas === "object" ? { saas: existente.saas } : {}),
  };
  await auth.setCustomUserClaims(uid, rol ? { ...platformClaims, empresaId, rol } : platformClaims);
  await auth.revokeRefreshTokens(uid);
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

export function normalizarPermisosEfectivos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || valor.some((permiso) => typeof permiso !== "string" || !permiso)) return null;
  return [...new Set(valor)].sort();
}

/** Sincroniza la proyección tenant y emite una sesión posterior a una activación. */
export async function emitirSesionTenant(uid: string, empresaId: string, rol: string): Promise<string> {
  if (!esRolTenant(rol)) throw new HttpsError("failed-precondition", "Rol de membresia invalido.");
  await actualizarClaimsTenant(uid, empresaId, rol);
  return getAuth().createCustomToken(uid);
}

export async function permisosPredeterminados(rol: RolTenant, dbParam?: any): Promise<string[]> {
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("permisos_roles").doc(rol).get();
  const permisos = normalizarPermisosEfectivos(snap.data()?.permisos);
  if (!snap.exists || !permisos) {
    logger.error("membership_default_template_invalid", { rol });
    throw new HttpsError("failed-precondition", "La plantilla de permisos no está disponible.");
  }
  return permisos;
}

export async function exigirAdminFundacional(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth || request.auth.token.rol !== "admin") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }

  const empresa = await obtenerEmpresaFundacional();
  if (request.auth.token.empresaId !== empresa.id) {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }

  const rolActual = await validarMembresiaActiva(empresa.id, request.auth.uid);
  if (rolActual !== "admin") {
    throw new HttpsError("permission-denied", "Acceso denegado.");
  }

  return empresa;
}

export const autenticarOperativo = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request): Promise<{ customToken: string; requiereCambio?: boolean; incorporacionId?: string }> => {
    const codigo = normalizarCodigo((request.data as SolicitudAutenticacion | undefined)?.codigo);
    const pin = (request.data as SolicitudAutenticacion | undefined)?.pin;
    if (!codigo || !esPinValido(pin)) throw errorCredenciales();

    try {
      const { empresa, ref, credencial } = await resolverCredencialOperativa(codigo, pin);

      if (credencial.requiereCambio === true) {
        const incorporacion = await obtenerIncorporacionDirectaTemporal(empresa.id, credencial);
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
        const customToken = await emitirSesionActivacionDirecta(credencial.uid, incorporacion.id);
        logger.info("operational_auth_direct_activation_required", {
          empresaId: empresa.id,
          uid: credencial.uid,
          incorporacionId: incorporacion.id,
        });
        return { customToken, requiereCambio: true, incorporacionId: incorporacion.id };
      }

      const rol = await validarMembresiaActiva(empresa.id, credencial.uid);
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
    const actual = snap.data() as MembresiaCanonica | undefined;
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
