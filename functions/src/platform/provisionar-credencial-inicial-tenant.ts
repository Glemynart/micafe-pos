import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial } from "../../../lib/suscripciones/contrato";
import { consultarIncorporacionDirectaMasReciente } from "../incorporaciones-service";
import { idCredencialOperativa } from "../contracts";

/**
 * provisionar-credencial-inicial-tenant.ts — ADR-SAAS-013 §4.
 *
 * Resuelve, sin escribir nada, si `ProvisionarCredencialInicialTenant` puede
 * proceder para una empresa y con qué plan de emisión. Separado de
 * `operations.ts` (que añade envelope/idempotencia/auditoría de plataforma,
 * igual que hace con el resto de comandos) y de `emitir-credencial-inicial.ts`
 * (que hace la escritura en sí — el único punto que crea/reemplaza
 * documentos, sin cambios respecto a Capa 2).
 *
 * Las precondiciones de esta capa (§4.1–§4.4) son deliberadamente MÁS
 * estrechas que las de `emitirCredencialInicial`: esta función es la única
 * responsable de decidir EMITIR vs REEMITIR vs RECHAZAR; el servicio de
 * emisión no conoce esta distinción, solo ejecuta lo que se le pide.
 */

export interface PlanEmisionCredencialInicial {
  ownerUid: string;
  nombreComercial: string;
  /** Presente únicamente en el caso de reemisión (§4.4). */
  reemplazarIncorporacionId?: string;
  tipoEvento: "CREDENCIAL_INICIAL_EMITIDA" | "CREDENCIAL_INICIAL_REEMITIDA";
}

export interface PlanReemisionCredencialInicialTemporal {
  ownerUid: string;
  nombreComercial: string;
  incorporacionId: string;
  codigoAnterior: string;
  /** La incorporación esperada ya fue sustituida: converger sin revelar PIN. */
  idempotente?: true;
}

function fail(code: "not-found" | "failed-precondition" | "already-exists" | "invalid-argument" | "internal", mensaje: string): never {
  throw new HttpsError(code, mensaje);
}

type EmpresaProvisionable = {
  ownerUid: string;
  nombreComercial?: unknown;
  nombre?: unknown;
};

type SnapLectura = {
  exists: boolean;
  data(): unknown;
};

function validarEmpresaProvisionable(empresaSnap: SnapLectura): EmpresaProvisionable {
  if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
  const empresa = empresaSnap.data() as { estado?: unknown; ownerUid?: unknown; nombreComercial?: unknown; nombre?: unknown };
  if (empresa.estado !== "trial" && empresa.estado !== "activa") {
    fail("failed-precondition", "EMPRESA_NO_PROVISIONABLE");
  }
  if (typeof empresa.ownerUid !== "string" || !empresa.ownerUid.trim()) {
    fail("failed-precondition", "EMPRESA_SIN_OWNER");
  }
  return empresa as EmpresaProvisionable;
}

function validarMembresiaAdminActiva(membresiaSnap: SnapLectura): void {
  const membresia = membresiaSnap.data() as { rol?: unknown; estado?: unknown; activo?: unknown } | undefined;
  if (!membresiaSnap.exists || membresia?.rol !== "admin" || membresia.estado !== "activa" || membresia.activo !== true) {
    fail("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA");
  }
}

export async function revalidarDestinoProvisionableEnTransaccion(
  db: Firestore,
  tx: Transaction,
  empresaId: string,
  ownerUidEsperado: string,
): Promise<void> {
  const [empresaSnap, membresiaSnap] = await Promise.all([
    tx.get(db.collection("empresas").doc(empresaId)),
    tx.get(db.collection("membresias").doc(`${empresaId}_${ownerUidEsperado}`)),
  ]);
  const empresa = validarEmpresaProvisionable(empresaSnap);
  if (empresa.ownerUid !== ownerUidEsperado) {
    fail("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA");
  }
  validarMembresiaAdminActiva(membresiaSnap);
}

/** Corrección administrativa de plataforma: conserva acceso en suspendida/cancelada,
 * pero nunca interviene agregados de conservación. */
export async function revalidarDestinoAdministrableEnTransaccion(
  db: Firestore,
  tx: Transaction,
  empresaId: string,
  ownerUidEsperado: string,
): Promise<void> {
  const [empresaSnap, membresiaSnap] = await Promise.all([
    tx.get(db.collection("empresas").doc(empresaId)),
    tx.get(db.collection("membresias").doc(`${empresaId}_${ownerUidEsperado}`)),
  ]);
  if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
  const empresa = empresaSnap.data() as EmpresaProvisionable & { estado?: unknown };
  if (empresa.estado === "archivada" || empresa.estado === "eliminada") {
    fail("failed-precondition", "EMPRESA_NO_ADMINISTRABLE");
  }
  if (typeof empresa.ownerUid !== "string" || empresa.ownerUid !== ownerUidEsperado) {
    fail("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA");
  }
  validarMembresiaAdminActiva(membresiaSnap);
}

export async function resolverPlanEmisionCredencialInicial(
  db: Firestore,
  empresaId: unknown,
): Promise<PlanEmisionCredencialInicial> {
  if (!esIdComercial(empresaId)) fail("invalid-argument", "EMPRESA_ID_INVALIDO");

  // §4.1.1 — la empresa debe existir y estar en un estado que admita operar.
  const empresaSnap = await db.collection("empresas").doc(empresaId).get();
  const empresa = validarEmpresaProvisionable(empresaSnap);

  // §4.1.2 — el destino es EXACTAMENTE empresa.ownerUid. Esta función no
  // acepta ningún uid del llamador: estructuralmente no puede apuntar a
  // otro miembro del tenant.
  const ownerUid = empresa.ownerUid;

  // §4.1.3 — el owner debe tener ya una membresía admin activa.
  const membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${ownerUid}`).get();
  validarMembresiaAdminActiva(membresiaSnap);

  const nombreComercial = typeof empresa.nombreComercial === "string" && empresa.nombreComercial.trim()
    ? empresa.nombreComercial
    : (typeof empresa.nombre === "string" && empresa.nombre.trim() ? empresa.nombre : empresaId);

  // §4.3/§4.4 — ¿ya existe una incorporación DIRECTA para este owner? La
  // consulta compartida (`consultarIncorporacionDirectaMasReciente`) siempre
  // devuelve la más reciente, así que el historial de reemisiones anteriores
  // (EXPIRED) nunca vuelve a intervenir en esta decisión.
  const incorporacionesSnap = await consultarIncorporacionDirectaMasReciente(db, empresaId, ownerUid).get();

  if (incorporacionesSnap.size === 0) {
    // Primera emisión — el caso normal para cualquier tenant recién creado
    // por una vía que no pasó por el paso H del bootstrap (p. ej. la
    // empresa fundacional).
    return { ownerUid, nombreComercial, tipoEvento: "CREDENCIAL_INICIAL_EMITIDA" };
  }

  const existente = incorporacionesSnap.docs[0];
  const estado = existente.get("estado");

  // §4.3 — activada: ya se usó para operar. No se reemplaza bajo ninguna
  // circunstancia por esta vía; es la puerta que el ADR se niega a abrir.
  if (estado === "ACTIVE") {
    fail("already-exists", "PRIMERA_CREDENCIAL_YA_EXISTE");
  }

  if (estado !== "TEMP_CREDENTIAL" && estado !== "EXPIRED") {
    fail("internal", "CREDENCIAL_INICIAL_ESTADO_INCONSISTENTE");
  }

  const expiraEn = existente.get("expiraEn") as { toMillis?: () => number } | undefined;
  const vencidaPorTtl = typeof expiraEn?.toMillis === "function" && expiraEn.toMillis() <= Date.now();

  if (estado === "TEMP_CREDENTIAL" && !vencidaPorTtl) {
    // §4.1.4, camino idempotente: hay una credencial temporal vigente, sin
    // activar. No es un fallo ni tampoco algo que reprovisionar — se
    // reintenta la MISMA emisión; `emitirCredencialInicial` la encontrará y
    // devolverá YA_EXISTENTE sin generar un PIN nuevo ni reemplazar nada.
    return { ownerUid, nombreComercial, tipoEvento: "CREDENCIAL_INICIAL_EMITIDA" };
  }

  // §4.4 — único caso de reemisión admitido: TEMP_CREDENTIAL vencida por
  // TTL, o EXPIRED. Nunca se activó.
  return {
    ownerUid,
    nombreComercial,
    reemplazarIncorporacionId: existente.id,
    tipoEvento: "CREDENCIAL_INICIAL_REEMITIDA",
  };
}

/**
 * ADR-SAAS-013 §4.4.1. Esta vía es deliberadamente distinta del planificador
 * ordinario: una temporal vigente permanece idempotente para Provisionar, y
 * solo una confirmación administrativa dirigida puede solicitar su rotación.
 */
export async function resolverPlanReemisionCredencialInicialTemporal(
  db: Firestore,
  empresaId: unknown,
  incorporacionId: unknown,
): Promise<PlanReemisionCredencialInicialTemporal> {
  if (!esIdComercial(empresaId)) fail("invalid-argument", "EMPRESA_ID_INVALIDO");
  if (typeof incorporacionId !== "string" || !incorporacionId.trim()) {
    fail("invalid-argument", "INCORPORACION_ID_INVALIDO");
  }
  const empresaSnap = await db.collection("empresas").doc(empresaId).get();
  const empresa = validarEmpresaProvisionable(empresaSnap);
  const ownerUid = empresa.ownerUid;
  const membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${ownerUid}`).get();
  validarMembresiaAdminActiva(membresiaSnap);
  const incorporaciones = await consultarIncorporacionDirectaMasReciente(db, empresaId, ownerUid).get();
  if (incorporaciones.size !== 1) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
  const actual = incorporaciones.docs[0];
  const data = actual.data() as Record<string, unknown>;
  const nombreComercial = typeof empresa.nombreComercial === "string" && empresa.nombreComercial.trim()
    ? empresa.nombreComercial
    : (typeof empresa.nombre === "string" && empresa.nombre.trim() ? empresa.nombre : empresaId);
  if (actual.id !== incorporacionId) {
    if (typeof data.codigo !== "string") fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
    return { ownerUid, nombreComercial, incorporacionId: actual.id, codigoAnterior: data.codigo, idempotente: true };
  }
  const expiraEn = data.expiraEn as { toMillis?: () => number } | undefined;
  if (data.mecanismo !== "DIRECTA" || data.origen !== "PLATAFORMA"
    || data.estado !== "TEMP_CREDENTIAL" || typeof data.codigo !== "string"
    || typeof expiraEn?.toMillis !== "function" || expiraEn.toMillis() <= Date.now()) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
  return { ownerUid, nombreComercial, incorporacionId: actual.id, codigoAnterior: data.codigo };
}

/** Revalida dentro de la transacción todas las invariantes propias de §4.4.1. */
export async function revalidarReemisionTemporalEnTransaccion(
  db: Firestore,
  tx: Transaction,
  empresaId: string,
  plan: PlanReemisionCredencialInicialTemporal,
): Promise<void> {
  await revalidarDestinoProvisionableEnTransaccion(db, tx, empresaId, plan.ownerUid);
  const directas = await tx.get(consultarIncorporacionDirectaMasReciente(db, empresaId, plan.ownerUid));
  if (directas.size !== 1 || directas.docs[0].id !== plan.incorporacionId) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
  const incorporacion = directas.docs[0];
  const data = incorporacion.data() as Record<string, unknown>;
  const expiraEn = data.expiraEn as { toMillis?: () => number } | undefined;
  if (data.mecanismo !== "DIRECTA" || data.origen !== "PLATAFORMA"
    || data.estado !== "TEMP_CREDENTIAL" || data.uid !== plan.ownerUid
    || data.codigo !== plan.codigoAnterior
    || typeof expiraEn?.toMillis !== "function" || expiraEn.toMillis() <= Date.now()) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
  const [credencialSnap, activas, historialDirecta] = await Promise.all([
    tx.get(db.collection("credenciales_operativas").doc(idCredencialOperativa(empresaId, plan.codigoAnterior))),
    tx.get(db.collection("credenciales_operativas").where("empresaId", "==", empresaId)),
    tx.get(db.collection("incorporaciones").where("empresaId", "==", empresaId)),
  ]);
  const credencial = credencialSnap.data() as Record<string, unknown> | undefined;
  if (!credencialSnap.exists || credencial?.empresaId !== empresaId || credencial.uid !== plan.ownerUid
    || credencial.codigo !== plan.codigoAnterior || credencial.incorporacionId !== plan.incorporacionId
    || credencial.origen !== "PLATAFORMA" || credencial.activo !== true || credencial.requiereCambio !== true) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
  if (activas.docs.some((snap) => snap.id !== credencialSnap.id && snap.get("activo") === true)) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
  const directasOwner = historialDirecta.docs.filter((snap) => snap.get("mecanismo") === "DIRECTA" && snap.get("uid") === plan.ownerUid);
  if (directasOwner.filter((snap) => snap.get("estado") === "TEMP_CREDENTIAL").length !== 1
    || directasOwner.some((snap) => snap.id !== plan.incorporacionId && snap.get("estado") === "ACTIVE")) {
    fail("failed-precondition", "CREDENCIAL_INICIAL_REEMISION_NO_DISPONIBLE");
  }
}
