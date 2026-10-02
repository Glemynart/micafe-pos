import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  executeConContexto,
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
  type Envelope,
} from "./operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";

type Data = Record<string, unknown>;

const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible crear la categoría Bodega.", { code: domain });
};

const object = (value: unknown): value is Data => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function requiredText(value: unknown, code: string, max = 120): string {
  if (!text(value)) fail("invalid-argument", code);
  const normalized = value.trim();
  if (normalized.length > max) fail("invalid-argument", code);
  return normalized;
}

function normalize(payload: unknown) {
  if (!object(payload)) fail("invalid-argument", "PAYLOAD_CATEGORIA_INVALIDO");
  const allowed = new Set(["espacioId", "nombre", "icono"]);
  if (Object.keys(payload).some(key => !allowed.has(key))) fail("invalid-argument", "PAYLOAD_CATEGORIA_INVALIDO");
  const icono = payload.icono === undefined || payload.icono === null || payload.icono === ""
    ? null
    : requiredText(payload.icono, "ICONO_CATEGORIA_INVALIDO", 80);
  return {
    espacioId: requiredText(payload.espacioId, "ESPACIO_INVALIDO", 160),
    nombre: requiredText(payload.nombre, "NOMBRE_CATEGORIA_INVALIDO"),
    icono,
  };
}

async function exigirAutoridadCatalogoBodega(tx: any, db: any, contexto: ContextoFinancieroOperativo) {
  if (contexto.rol !== "admin") fail("permission-denied", "ROL_NO_AUTORIZADO");
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "inventory");
  const configSnap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
  const config = configSnap.data() as Data | undefined;
  const modules = config?.modulos as Data | undefined;
  if (!configSnap.exists || config?.empresaId !== contexto.empresaId || config.vertical !== "BODEGA_MVP1" || !Array.isArray(modules?.habilitados) || !modules.habilitados.includes("inventory")) {
    fail("permission-denied", "CATALOGO_BODEGA_NO_AUTORIZADO");
  }
}

async function crearCategoria(tx: any, db: any, empresaId: string, actorUid: string, _rol: string, contexto: ContextoFinancieroOperativo, input: Envelope) {
  await exigirAutoridadCatalogoBodega(tx, db, contexto);
  const value = normalize(input.payload);
  const espacioRef = db.collection("espacios").doc(value.espacioId);
  const espacio = await tx.get(espacioRef);
  if (!espacio.exists || espacio.data()?.empresaId !== empresaId || espacio.data()?.activo !== true) fail("permission-denied", "ESPACIO_INVALIDO");

  const categoriaId = crearIdentificadorInterno(empresaId, `categoria:${input.commandId}`);
  const categoriaRef = db.collection("categorias").doc(categoriaId);
  if ((await tx.get(categoriaRef)).exists) fail("already-exists", "COMMAND_ID_CONFLICT");
  tx.create(categoriaRef, {
    id: categoriaId,
    empresaId,
    espacioId: value.espacioId,
    nombre: value.nombre,
    icono: value.icono,
    activo: true,
    orden: categoriaId,
    creadoPor: actorUid,
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  return { commandId: input.commandId, categoriaId, idempotente: false };
}

/** ADR-052: creación de categoría Bodega con autoridad, aislamiento y recibo canónicos. */
export async function ejecutarCrearCategoriaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, data: unknown) {
  if (!object(data) || !text(data.commandId)) fail("invalid-argument", "PAYLOAD_INVALID");
  const receipt = db.collection("operaciones_comandos").doc(crearIdentificadorInterno(contexto.empresaId, data.commandId));
  const alreadyConfirmed = (await receipt.get()).exists;
  const result = await executeConContexto(db, contexto, data, "crearCategoriaBodegaV1", (tx, firestore, empresaId, actorUid, rol, input) =>
    crearCategoria(tx, firestore, empresaId, actorUid, rol, contexto, input));
  return { ...result, idempotente: alreadyConfirmed };
}
