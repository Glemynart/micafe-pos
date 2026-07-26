import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial } from "../../../lib/suscripciones/contrato";
import { consultarIncorporacionDirectaMasReciente } from "../incorporaciones-service";

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

function fail(code: "not-found" | "failed-precondition" | "already-exists" | "invalid-argument" | "internal", mensaje: string): never {
  throw new HttpsError(code, mensaje);
}

export async function resolverPlanEmisionCredencialInicial(
  db: Firestore,
  empresaId: unknown,
): Promise<PlanEmisionCredencialInicial> {
  if (!esIdComercial(empresaId)) fail("invalid-argument", "EMPRESA_ID_INVALIDO");

  // §4.1.1 — la empresa debe existir y estar en un estado que admita operar.
  const empresaSnap = await db.collection("empresas").doc(empresaId).get();
  if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
  const empresa = empresaSnap.data() as { estado?: unknown; ownerUid?: unknown; nombreComercial?: unknown; nombre?: unknown };
  if (empresa.estado !== "trial" && empresa.estado !== "activa") {
    fail("failed-precondition", "EMPRESA_NO_PROVISIONABLE");
  }

  // §4.1.2 — el destino es EXACTAMENTE empresa.ownerUid. Esta función no
  // acepta ningún uid del llamador: estructuralmente no puede apuntar a
  // otro miembro del tenant.
  const ownerUid = empresa.ownerUid;
  if (typeof ownerUid !== "string" || !ownerUid.trim()) {
    fail("failed-precondition", "EMPRESA_SIN_OWNER");
  }

  // §4.1.3 — el owner debe tener ya una membresía admin activa.
  const membresiaSnap = await db.collection("membresias").doc(`${empresaId}_${ownerUid}`).get();
  const membresia = membresiaSnap.data() as { rol?: unknown; estado?: unknown; activo?: unknown } | undefined;
  if (!membresiaSnap.exists || membresia?.rol !== "admin" || membresia.estado !== "activa" || membresia.activo !== true) {
    fail("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA");
  }

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
