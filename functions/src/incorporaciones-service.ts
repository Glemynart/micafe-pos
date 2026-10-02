import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  type CredencialOperativa,
  normalizarEmail,
  esRolTenant,
} from "./contracts";
import { verificarPin } from "./pin-security";
import {
  emitirSesionTenant,
  normalizarPermisosEfectivos,
  validarSnapshotEmpresaEscribible,
} from "./operational/tenant-context";
import { permisosPredeterminados } from "./tenant-permissions";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./platform/audit";
import { INCORPORACIONES_COLLECTION, idIncorporacionDirecta } from "./incorporaciones-query";
export { idIncorporacionDirecta } from "./incorporaciones-query";
export {
  activarIncorporacionDirecta,
  idAuditoriaActivacion,
  idEvidenciaAuditoriaActivacion,
  idObligacionAuditoriaActivacion,
  planificarActivacionDirecta,
  prepararActivacionDirecta,
  type ActivacionDirectaCompletada,
  type PlanActivacionDirecta,
  type SolicitudActivacionDirecta,
} from "./operational-activation/shared";

export { INCORPORACIONES_COLLECTION, consultarIncorporacionDirectaMasReciente } from "./incorporaciones-query";

export { crearIncorporacionDirecta, prepararIncorporacionDirecta, type SolicitudIncorporacionDirecta } from "./operational-onboarding/direct";

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

export interface IncorporacionEmailEmitida extends IncorporacionCreada {
  entrega: { email: string; token: string; tokenVersion: number; expiraEn: Date } | null;
}

export interface ActivacionEmailCompletada {
  incorporacionId: string;
  estado: "ACTIVE";
  customToken: string;
  idempotente: boolean;
}

export function prepararIncorporacionEmail(data: SolicitudIncorporacionEmail | undefined) {
  const email = normalizarEmail(data?.email);
  if (!email || !esRolTenant(data?.rol)) {
    throw new HttpsError("invalid-argument", "Datos de incorporacion por email invalidos.");
  }
  return { email, rol: data.rol };
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
