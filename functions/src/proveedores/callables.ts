import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirAdminTenant } from "../operational-auth";

const REGION = "us-central1";
export const ESTADOS_PROVEEDOR = ["ACTIVO", "INACTIVO"] as const;
export type EstadoProveedor = typeof ESTADOS_PROVEEDOR[number];

export interface ContextoProveedor {
  empresaId: string;
  actorUid: string;
}

interface ProveedorInput {
  nombre: string;
  nit?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

const fail = (code: HttpsError["code"], dominio: string): never => {
  throw new HttpsError(code, "No fue posible administrar el proveedor.", { code: dominio });
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function payload(value: unknown): Record<string, unknown> {
  if (!object(value)) fail("invalid-argument", "PAYLOAD_INVALID");
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, campo: string, max = 160): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!text(value) || value.trim().length > max) fail("invalid-argument", `${campo.toUpperCase()}_INVALIDO`);
  return (value as string).trim();
}

function providerId(value: unknown): string {
  if (!text(value) || value.trim().length > 160) fail("invalid-argument", "PROVEEDOR_INVALIDO");
  return (value as string).trim();
}

function requiredName(value: unknown): string {
  if (!text(value) || value.trim().length > 160) fail("invalid-argument", "NOMBRE_PROVEEDOR_INVALIDO");
  return (value as string).trim();
}

function rejectAuthorityFields(data: Record<string, unknown>, fields: string[]) {
  if (fields.some(field => Object.prototype.hasOwnProperty.call(data, field))) {
    fail("invalid-argument", "PAYLOAD_INVALID");
  }
}

function readMetadata(data: Record<string, unknown>): ProveedorInput {
  return {
    nombre: requiredName(data.nombre),
    ...(optionalText(data.nit, "nit") ? { nit: optionalText(data.nit, "nit") } : {}),
    ...(optionalText(data.telefono, "telefono") ? { telefono: optionalText(data.telefono, "telefono") } : {}),
    ...(optionalText(data.correo, "correo") ? { correo: optionalText(data.correo, "correo") } : {}),
    ...(optionalText(data.direccion, "direccion") ? { direccion: optionalText(data.direccion, "direccion") } : {}),
  };
}

async function assertTenantWritable(tx: any, db: any, empresaId: string) {
  const empresa = await tx.get(db.collection("empresas").doc(empresaId));
  if (!empresa.exists || !["trial", "activa"].includes(empresa.data()?.estado)) {
    fail("failed-precondition", "EMPRESA_NO_OPERATIVA");
  }
}

async function getProvider(tx: any, db: any, empresaId: string, id: string) {
  const ref = db.collection("proveedores").doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()?.empresaId !== empresaId) fail("not-found", "PROVEEDOR_NO_ENCONTRADO");
  const estado = snap.data()?.estado;
  if (!ESTADOS_PROVEEDOR.includes(estado)) fail("failed-precondition", "PROVEEDOR_INVALIDO");
  return { ref, snap, data: snap.data() as Record<string, unknown>, estado: estado as EstadoProveedor };
}

/**
 * En el MVP las compras confirmadas son hechos cerrados. Se leen las compras
 * del tenant dentro de la transacción para impedir que una operación marcada
 * ABIERTA/PENDIENTE se cuele concurrentemente mientras se desactiva el
 * proveedor. No se consulta el nombre visible ni se toca ninguna compra.
 */
async function assertNoOpenOperations(tx: any, db: any, empresaId: string, proveedorIdValue: string) {
  const compras = await tx.get(db.collection("compras").where("empresaId", "==", empresaId));
  const estadosAbiertos = new Set(["ABIERTA", "PENDIENTE"]);
  const abierta = (compras.docs ?? []).some((compra: any) => {
    const data = compra.data() as Record<string, unknown>;
    return data.proveedorId === proveedorIdValue && estadosAbiertos.has(data.estado as string);
  });
  if (abierta) fail("failed-precondition", "PROVEEDOR_CON_OPERACIONES_ABIERTAS");
}

export async function ejecutarCrearProveedorOperativoV1(db: any, contexto: ContextoProveedor, data: unknown) {
  const input = payload(data);
  rejectAuthorityFields(input, ["empresaId", "proveedorId", "estado", "creadoEn", "actualizadoEn"]);
  const metadata = readMetadata(input);
  return db.runTransaction(async (tx: any) => {
    await assertTenantWritable(tx, db, contexto.empresaId);
    const ref = db.collection("proveedores").doc();
    tx.create(ref, {
      empresaId: contexto.empresaId,
      ...metadata,
      estado: "ACTIVO" as const,
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return { proveedorId: ref.id, estado: "ACTIVO" as const };
  });
}

export async function ejecutarActualizarProveedorOperativoV1(db: any, contexto: ContextoProveedor, data: unknown) {
  const input = payload(data);
  rejectAuthorityFields(input, ["empresaId", "estado", "creadoEn", "actualizadoEn"]);
  const id = providerId(input.proveedorId);
  const metadata = readMetadata(input);
  return db.runTransaction(async (tx: any) => {
    await assertTenantWritable(tx, db, contexto.empresaId);
    const proveedor = await getProvider(tx, db, contexto.empresaId, id);
    tx.update(proveedor.ref, { ...metadata, actualizadoEn: FieldValue.serverTimestamp() });
    return { proveedorId: id, estado: proveedor.estado };
  });
}

export async function ejecutarDesactivarProveedorOperativoV1(db: any, contexto: ContextoProveedor, data: unknown) {
  const input = payload(data);
  rejectAuthorityFields(input, ["empresaId", "estado", "nombre", "nit", "telefono", "correo", "direccion", "creadoEn", "actualizadoEn"]);
  const id = providerId(input.proveedorId);
  return db.runTransaction(async (tx: any) => {
    await assertTenantWritable(tx, db, contexto.empresaId);
    const proveedor = await getProvider(tx, db, contexto.empresaId, id);
    if (proveedor.estado === "INACTIVO") return { proveedorId: id, estado: "INACTIVO" as const };
    await assertNoOpenOperations(tx, db, contexto.empresaId, id);
    tx.update(proveedor.ref, { estado: "INACTIVO" as const, actualizadoEn: FieldValue.serverTimestamp() });
    return { proveedorId: id, estado: "INACTIVO" as const };
  });
}

export const crearProveedorOperativoV1 = onCall({ region: REGION }, async request => {
  const tenant = await exigirAdminTenant(request);
  return ejecutarCrearProveedorOperativoV1(getFirestore(), { empresaId: tenant.id, actorUid: request.auth!.uid }, request.data);
});

export const actualizarProveedorOperativoV1 = onCall({ region: REGION }, async request => {
  const tenant = await exigirAdminTenant(request);
  return ejecutarActualizarProveedorOperativoV1(getFirestore(), { empresaId: tenant.id, actorUid: request.auth!.uid }, request.data);
});

export const desactivarProveedorOperativoV1 = onCall({ region: REGION }, async request => {
  const tenant = await exigirAdminTenant(request);
  return ejecutarDesactivarProveedorOperativoV1(getFirestore(), { empresaId: tenant.id, actorUid: request.auth!.uid }, request.data);
});
