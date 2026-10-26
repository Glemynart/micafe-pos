import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  executeConContexto,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import {
  exigirAutoridadCatalogoBodega,
  normalizarReferenciaPresentacionComercial,
  resolverPrecioCanalBodega,
  resolverPresentacionComercialEnTransaccion,
  type CanalPrecioBodega,
} from "./presentaciones";

const COLLECTION = "ofertas_bodega";
const MAX_LINES = 200;
const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible gestionar la oferta Bodega.", { code: domain });
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

type LineaOferta = { presentacionId: string; canal: CanalPrecioBodega; precioFinalCOP: number };
function only(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("invalid-argument", "PAYLOAD_OFERTA_INVALIDO");
}

function requiredText(value: unknown, code: string, max = 120) {
  if (typeof value !== "string") fail("invalid-argument", code);
  const normalized = (value as string).trim();
  if (normalized.length === 0 || normalized.length > max) fail("invalid-argument", code);
  return normalized;
}

/** Colombia has a fixed UTC-05:00 civil offset; the API never trusts a browser timezone. */
function parseFechaBogota(value: unknown, code: string): Timestamp {
  if (typeof value !== "string") fail("invalid-argument", code);
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((value as string).trim());
  if (matched === null) fail("invalid-argument", code);
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = matched as RegExpExecArray;
  const year = Number(yearRaw); const month = Number(monthRaw); const day = Number(dayRaw);
  const hour = Number(hourRaw); const minute = Number(minuteRaw);
  const utcMillis = Date.UTC(year, month - 1, day, hour + 5, minute);
  const check = new Date(utcMillis - 5 * 60 * 60 * 1_000);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) fail("invalid-argument", code);
  return Timestamp.fromMillis(utcMillis);
}

function millis(value: unknown): number | null {
  return value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis(): number }).toMillis()
    : null;
}

function parseLineas(value: unknown): LineaOferta[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES) fail("invalid-argument", "LINEAS_OFERTA_INVALIDAS");
  const seen = new Set<string>();
  return (value as unknown[]).map((raw: unknown): LineaOferta => {
    if (!object(raw)) fail("invalid-argument", "LINEA_OFERTA_INVALIDA");
    const data = raw as Record<string, unknown>;
    only(data, ["presentacionId", "canal", "precioFinalCOP"]);
    const presentacionId = requiredText(data.presentacionId, "PRESENTACION_OFERTA_INVALIDA", 1024);
    if (data.canal !== "tienda" && data.canal !== "consumidor_final") fail("invalid-argument", "CANAL_OFERTA_INVALIDO");
    if (!positiveInteger(data.precioFinalCOP)) fail("invalid-argument", "PRECIO_OFERTA_INVALIDO");
    const key = `${presentacionId}:${data.canal}`;
    if (seen.has(key)) fail("invalid-argument", "LINEA_OFERTA_DUPLICADA");
    seen.add(key);
    return { presentacionId, canal: data.canal as CanalPrecioBodega, precioFinalCOP: data.precioFinalCOP as number };
  });
}

function normalizeCreate(payload: unknown) {
  if (!object(payload)) fail("invalid-argument", "PAYLOAD_OFERTA_INVALIDO");
  const data = payload as Record<string, unknown>;
  only(data, ["nombre", "inicioLocalBogota", "finLocalBogota", "lineas"]);
  const inicioEn = parseFechaBogota(data.inicioLocalBogota, "INICIO_OFERTA_INVALIDO");
  const finEn = data.finLocalBogota === undefined || data.finLocalBogota === null || data.finLocalBogota === ""
    ? null
    : parseFechaBogota(data.finLocalBogota, "FIN_OFERTA_INVALIDO");
  if (finEn !== null && finEn.toMillis() <= inicioEn.toMillis()) fail("invalid-argument", "VENTANA_OFERTA_INVALIDA");
  return {
    nombre: requiredText(data.nombre, "NOMBRE_OFERTA_INVALIDO"),
    inicioEn,
    finEn,
    lineas: parseLineas(data.lineas),
  };
}

function normalizeClose(payload: unknown) {
  if (!object(payload)) fail("invalid-argument", "PAYLOAD_OFERTA_INVALIDO");
  const data = payload as Record<string, unknown>;
  only(data, ["ofertaId"]);
  return { ofertaId: requiredText(data.ofertaId, "OFERTA_ID_INVALIDO", 1024) };
}

function isOpen(value: Record<string, unknown>) {
  return value.estado === "ACTIVA" && value.cerradaEn === undefined;
}

function intervalsOverlap(startA: number, endA: number | null, startB: number, endB: number | null) {
  return startA < (endB ?? Number.POSITIVE_INFINITY) && startB < (endA ?? Number.POSITIVE_INFINITY);
}

function lineasDeOferta(value: Record<string, unknown>): LineaOferta[] {
  try { return parseLineas(value.lineas); }
  catch { return fail("failed-precondition", "OFERTA_PERSISTIDA_INVALIDA"); }
}

async function validarSinSolapes(tx: any, db: any, empresaId: string, entrada: ReturnType<typeof normalizeCreate>) {
  const offers = await tx.get(db.collection(COLLECTION).where("empresaId", "==", empresaId));
  for (const snapshot of offers.docs) {
    const actual = snapshot.data() as Record<string, unknown>;
    if (!isOpen(actual)) continue;
    const inicio = millis(actual.inicioEn); const fin = actual.finEn === null ? null : millis(actual.finEn);
    if (inicio === null) fail("failed-precondition", "OFERTA_PERSISTIDA_INVALIDA");
    if (actual.finEn !== null && fin === null) fail("failed-precondition", "OFERTA_PERSISTIDA_INVALIDA");
    const existingLines = lineasDeOferta(actual);
    for (const line of entrada.lineas) {
      if (existingLines.some(other => other.presentacionId === line.presentacionId && other.canal === line.canal)
        && intervalsOverlap(inicio as number, fin as number | null, entrada.inicioEn.toMillis(), entrada.finEn?.toMillis() ?? null)) {
        fail("already-exists", "OFERTA_SUPERPUESTA");
      }
    }
  }
}

async function resolverPrecioBaseOfertaEnTransaccion(tx: any, db: any, empresaId: string, line: LineaOferta) {
  const presentacionSnap = await tx.get(db.collection("presentaciones_producto").doc(line.presentacionId));
  const productoId = presentacionSnap.data()?.productoId;
  if (!presentacionSnap.exists || presentacionSnap.data()?.empresaId !== empresaId || !text(productoId)) {
    fail("not-found", "PRESENTACION_OFERTA_NO_ENCONTRADA");
  }
  const presentacion = await resolverPresentacionComercialEnTransaccion(
    tx,
    db,
    empresaId,
    normalizarReferenciaPresentacionComercial({ productoId, presentacionId: line.presentacionId }),
  );
  return resolverPrecioCanalBodega(presentacion, line.canal);
}

async function crearOferta(tx: any, db: any, empresaId: string, actorUid: string, contexto: ContextoFinancieroOperativo, input: Envelope) {
  await exigirAutoridadCatalogoBodega(tx, db, contexto);
  const entrada = normalizeCreate(input.payload);
  for (const line of entrada.lineas) {
    const precioBaseCOP = await resolverPrecioBaseOfertaEnTransaccion(tx, db, empresaId, line);
    if (line.precioFinalCOP > precioBaseCOP) fail("invalid-argument", "PRECIO_OFERTA_SUPERA_BASE");
  }
  await validarSinSolapes(tx, db, empresaId, entrada);
  const ofertaId = crearIdentificadorInterno(empresaId, `oferta-bodega:${input.commandId}`);
  const ref = db.collection(COLLECTION).doc(ofertaId);
  if ((await tx.get(ref)).exists) fail("already-exists", "COMMAND_ID_CONFLICT");
  tx.create(ref, {
    id: ofertaId, empresaId, nombre: entrada.nombre, estado: "ACTIVA", inicioEn: entrada.inicioEn, finEn: entrada.finEn,
    lineas: entrada.lineas, creadoPor: actorUid, creadoEn: FieldValue.serverTimestamp(), actualizadoEn: FieldValue.serverTimestamp(),
  });
  return { commandId: input.commandId, ofertaId, estado: "ACTIVA" };
}

async function cerrarOferta(tx: any, db: any, empresaId: string, actorUid: string, contexto: ContextoFinancieroOperativo, input: Envelope) {
  await exigirAutoridadCatalogoBodega(tx, db, contexto);
  const { ofertaId } = normalizeClose(input.payload);
  const ref = db.collection(COLLECTION).doc(ofertaId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("not-found", "OFERTA_NO_ENCONTRADA");
  if (snap.data()?.estado === "CERRADA") return { commandId: input.commandId, ofertaId, estado: "CERRADA", idempotente: true };
  if (snap.data()?.estado !== "ACTIVA") fail("failed-precondition", "OFERTA_PERSISTIDA_INVALIDA");
  tx.update(ref, { estado: "CERRADA", cerradaPor: actorUid, cerradaEn: FieldValue.serverTimestamp(), actualizadoEn: FieldValue.serverTimestamp() });
  return { commandId: input.commandId, ofertaId, estado: "CERRADA", idempotente: false };
}

export async function ejecutarCrearOfertaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "crearOfertaBodegaV1", (tx, firestore, empresaId, actorUid, _rol, input) => crearOferta(tx, firestore, empresaId, actorUid, contexto, input));
}

export async function ejecutarCerrarOfertaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  return executeConContexto(db, contexto, data, "cerrarOfertaBodegaV1", (tx, firestore, empresaId, actorUid, _rol, input) => cerrarOferta(tx, firestore, empresaId, actorUid, contexto, input));
}

/** Returns only a current effective price. It deliberately never mutates an expired offer. */
export async function resolverOfertaPrecioBodegaEnTransaccion(
  tx: any,
  db: any,
  empresaId: string,
  input: { presentacionId: string; canal: CanalPrecioBodega; precioBaseCOP: number },
  nowMillis = Date.now(),
): Promise<{ ofertaId: string | null; precioAplicadoCOP: number }> {
  const offers = await tx.get(db.collection(COLLECTION).where("empresaId", "==", empresaId));
  const found: Array<{ ofertaId: string; precioFinalCOP: number }> = [];
  for (const snapshot of offers.docs) {
    const offer = snapshot.data() as Record<string, unknown>;
    if (!isOpen(offer)) continue;
    const start = millis(offer.inicioEn); const end = offer.finEn === null ? null : millis(offer.finEn);
    if (start === null) fail("failed-precondition", "OFERTA_PERSISTIDA_INVALIDA");
    if (offer.finEn !== null && end === null) fail("failed-precondition", "OFERTA_PERSISTIDA_INVALIDA");
    if (nowMillis < (start as number) || (end !== null && nowMillis >= end)) continue;
    const line = lineasDeOferta(offer).find(candidate => candidate.presentacionId === input.presentacionId && candidate.canal === input.canal);
    if (line) found.push({ ofertaId: snapshot.id, precioFinalCOP: line.precioFinalCOP });
  }
  if (found.length > 1) fail("failed-precondition", "OFERTAS_SUPERPUESTAS_PERSISTIDAS");
  if (found.length === 0) return { ofertaId: null, precioAplicadoCOP: input.precioBaseCOP };
  return { ofertaId: found[0]!.ofertaId, precioAplicadoCOP: found[0]!.precioFinalCOP };
}
