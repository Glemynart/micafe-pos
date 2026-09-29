import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  type CredencialOperativa,
  esPinValido,
  esRolTenant,
  idCredencialOperativa,
} from "../contracts";
import { hashearPin, verificarPin } from "../pin-security";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "../platform/audit";
import { esCredencialTemporalPlataformaVencidaOInvalida } from "../platform/vigencia-credencial-temporal";
import { INCORPORACIONES_COLLECTION } from "../incorporaciones-query";
import {
  actualizarClaimsTenant,
  estaBloqueada,
  emitirSesionTenant,
  normalizarPermisosEfectivos,
  registrarFallo,
  validarSnapshotEmpresaEscribible,
} from "../operational/tenant-context";

export interface SolicitudActivacionDirecta {
  pinActual?: unknown;
  pinNuevo?: unknown;
  // Alias legacy, preservados únicamente para el reintento canónico existente.
  pinTemporal?: unknown;
  pinDefinitivo?: unknown;
}

export interface ActivacionDirectaCompletada {
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
    return { empresaId: incorporacion.empresaId, uid, rol: incorporacion.rol, permisosEfectivos, tipo: "REINTENTO" };
  }
  if (!credencial || credencial.empresaId !== incorporacion.empresaId
    || credencial.uid !== uid || credencial.codigo !== incorporacion.codigo
    || credencial.activo !== true || credencial.requiereCambio !== true) {
    throw new HttpsError("failed-precondition", "La credencial temporal no esta disponible.");
  }
  if (membresia !== undefined && !esMembresiaFinal(membresia, incorporacion, uid, permisosEfectivos)) {
    throw new HttpsError("already-exists", "La identidad ya tiene una membresia incompatible.");
  }
  return { empresaId: incorporacion.empresaId, uid, rol: incorporacion.rol, permisosEfectivos, tipo: "ACTIVAR" };
}

function esMembresiaFinal(
  membresia: FirebaseFirestore.DocumentData,
  incorporacion: FirebaseFirestore.DocumentData,
  uid: string,
  permisosEfectivos: string[],
): boolean {
  const permisos = normalizarPermisosEfectivos(membresia.permisos);
  return membresia.empresaId === incorporacion.empresaId
    && membresia.uid === uid && membresia.rol === incorporacion.rol
    && membresia.estado === "activa" && membresia.activo === true
    && JSON.stringify(permisos) === JSON.stringify(permisosEfectivos);
}

export function prepararActivacionDirecta(data: SolicitudActivacionDirecta | undefined): { pinActual: string; pinNuevo: string } {
  const pinActual = data?.pinActual ?? data?.pinTemporal;
  const pinNuevo = data?.pinNuevo ?? data?.pinDefinitivo;
  if (!esPinValido(pinActual) || !esPinValido(pinNuevo) || pinActual === pinNuevo) {
    throw new HttpsError("invalid-argument", "El PIN definitivo debe ser valido y distinto al temporal.");
  }
  return { pinActual, pinNuevo };
}

export async function activarIncorporacionDirecta({ incorporacionId, uid, data, pepper }: {
  incorporacionId: string;
  uid: string;
  data: SolicitudActivacionDirecta | undefined;
  pepper: string;
}): Promise<ActivacionDirectaCompletada> {
  const db = getFirestore();
  const incorporacionRef = db.collection(INCORPORACIONES_COLLECTION).doc(incorporacionId);
  const initialIncorporacion = await incorporacionRef.get();
  const initialData = initialIncorporacion.data();
  if (!initialIncorporacion.exists || typeof initialData?.empresaId !== "string" || typeof initialData.codigo !== "string") {
    throw new HttpsError("not-found", "La incorporacion directa no esta disponible.");
  }
  const credencialRef = db.collection("credenciales_operativas").doc(idCredencialOperativa(initialData.empresaId, initialData.codigo));
  const empresaRef = db.collection("empresas").doc(initialData.empresaId);
  const membresiaRef = db.collection("membresias").doc(`${initialData.empresaId}_${uid}`);
  const auditoriaRef = db.collection("auditoria_logs").doc(idAuditoriaActivacion(incorporacionId));
  const [credencialSnap, membresiaSnap] = await Promise.all([credencialRef.get(), membresiaRef.get()]);
  const credencial = credencialSnap.data() as Partial<CredencialOperativa> | undefined;
  const planInicial = planificarActivacionDirecta({ incorporacion: initialData, credencial, membresia: membresiaSnap.exists ? membresiaSnap.data() : undefined, uid, empresaId: initialData.empresaId });
  let pinNuevoHash: string | undefined;
  if (planInicial.tipo === "ACTIVAR") {
    const { pinActual, pinNuevo } = prepararActivacionDirecta(data);
    if (await estaBloqueada(credencialRef)) throw new HttpsError("unauthenticated", "Credenciales operativas invalidas.");
    if (!credencial?.pinHash || !await verificarPin(pinActual, credencial.pinHash, pepper)) {
      await registrarFallo(credencialRef);
      throw new HttpsError("unauthenticated", "Credenciales operativas invalidas.");
    }
    pinNuevoHash = await hashearPin(pinNuevo, pepper);
  } else {
    const pinDefinitivo = data?.pinDefinitivo ?? data?.pinNuevo;
    if (!esPinValido(pinDefinitivo) || !credencial?.pinHash || !await verificarPin(pinDefinitivo, credencial.pinHash, pepper)) {
      throw new HttpsError("unauthenticated", "Credenciales operativas invalidas.");
    }
  }

  let idempotente = planInicial.tipo === "REINTENTO";
  let obligacionActivacionId: string | null = null;
  await db.runTransaction(async (transaction) => {
    const [incorporacionSnap, credencialActualSnap, empresaSnap, membresiaActualSnap, auditoriaSnap] = await Promise.all([
      transaction.get(incorporacionRef), transaction.get(credencialRef), transaction.get(empresaRef), transaction.get(membresiaRef), transaction.get(auditoriaRef),
    ]);
    const incorporacion = incorporacionSnap.data();
    const credencialActual = credencialActualSnap.data();
    const plan = planificarActivacionDirecta({ incorporacion, credencial: credencialActual, membresia: membresiaActualSnap.exists ? membresiaActualSnap.data() : undefined, uid, empresaId: initialData.empresaId });
    idempotente = plan.tipo === "REINTENTO";
    validarSnapshotEmpresaEscribible(empresaSnap);
    if (plan.tipo === "REINTENTO" && (!credencialActualSnap.exists || credencialActual?.empresaId !== plan.empresaId || credencialActual?.uid !== uid || credencialActual?.activo !== true || credencialActual?.requiereCambio === true)) {
      throw new HttpsError("failed-precondition", "La incorporacion ACTIVE no tiene una credencial definitiva consistente.");
    }
    if (plan.tipo === "ACTIVAR") {
      if (credencialActual?.pinHash !== credencial?.pinHash) throw new HttpsError("failed-precondition", "La credencial temporal cambio durante la activacion.");
      transaction.update(credencialRef, { pinHash: pinNuevoHash, requiereCambio: false, fallosConsecutivos: 0, bloqueadoHasta: null, actualizadaEn: FieldValue.serverTimestamp(), pinActualizadoEn: FieldValue.serverTimestamp() });
    } else if (credencialActualSnap.exists && credencialActual?.requiereCambio === true) {
      throw new HttpsError("failed-precondition", "La incorporacion ACTIVE conserva una credencial temporal.");
    }
    if (!membresiaActualSnap.exists) {
      transaction.create(membresiaRef, { empresaId: plan.empresaId, uid: plan.uid, rol: plan.rol, permisos: plan.permisosEfectivos, estado: "activa", activo: true, creadaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
    }
    if (!auditoriaSnap.exists) {
      transaction.create(auditoriaRef, { empresaId: plan.empresaId, uid: plan.uid, actorUid: plan.uid, incorporacionId, accion: "incorporacion_directa_activada", mecanismo: "DIRECTA", rol: plan.rol, creadoEn: FieldValue.serverTimestamp() });
      crearObligacionAuditoria(db, transaction, {
        tipo: "CREDENCIAL_INICIAL_ACTIVADA", resultado: "CONFIRMADO", actor: { tipo: "ADMIN_TENANT", uid: plan.uid }, facultad: null, comando: null,
        agregado: { tipo: "EMPRESA", id: plan.empresaId }, empresaObjetivoId: plan.empresaId, revision: { esperada: null, resultante: null }, correlacionId: incorporacionId, causacionId: null,
        motivo: { codigo: "TENANT_ADMIN_ACTIVACION_CREDENCIAL_INICIAL", resumen: null },
      }, { obligacionId: idObligacionAuditoriaActivacion(incorporacionId), evidenciaId: idEvidenciaAuditoriaActivacion(incorporacionId) });
      obligacionActivacionId = idObligacionAuditoriaActivacion(incorporacionId);
    }
    if (incorporacion?.estado !== "ACTIVE") transaction.update(incorporacionRef, { estado: "ACTIVE", actualizadaEn: FieldValue.serverTimestamp(), activadaEn: FieldValue.serverTimestamp() });
  });
  if (obligacionActivacionId) await emitirObligacionAuditoria(db, obligacionActivacionId);
  const membresiaFinalSnap = await membresiaRef.get();
  const credencialFinalSnap = await credencialRef.get();
  const planFinal = planificarActivacionDirecta({ incorporacion: { ...initialData, estado: "ACTIVE" }, credencial: credencialFinalSnap.data(), membresia: membresiaFinalSnap.data(), uid, empresaId: initialData.empresaId });
  const customToken = await emitirSesionTenant(uid, planFinal.empresaId, planFinal.rol);
  const membresiaTrasClaims = await membresiaRef.get();
  const membresiaTrasClaimsData = membresiaTrasClaims.data();
  if (!membresiaTrasClaims.exists || !membresiaTrasClaimsData || !esMembresiaFinal(membresiaTrasClaimsData, { ...initialData, estado: "ACTIVE" }, uid, planFinal.permisosEfectivos)) {
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
export function idObligacionAuditoriaActivacion(incorporacionId: string): string {
  return createHash("sha256").update(`obligacion:incorporacion-directa:activada:${incorporacionId}`).digest("hex");
}
export function idEvidenciaAuditoriaActivacion(incorporacionId: string): string {
  return createHash("sha256").update(`evidencia:incorporacion-directa:activada:${incorporacionId}`).digest("hex");
}
