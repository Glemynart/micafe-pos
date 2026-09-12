import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";

const REGION = "us-central1";
const fail = (code: HttpsError["code"], message: string): never => { throw new HttpsError(code, message); };
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** DTO fijo: nunca devuelve el documento de producto ni permite seleccionar campos. */
export function proyectarCatalogoVendedor(producto: Record<string, unknown>) {
  return {
    id: String(producto.id ?? ""),
    nombre: text(producto.nombre) ? producto.nombre : "",
    categoriaId: text(producto.categoriaId) ? producto.categoriaId : null,
    activo: producto.activo === true,
    unidad: text(producto.unidadMedida) ? producto.unidadMedida : text(producto.unidad) ? producto.unidad : null,
    disponibilidad: number(producto.stock) ? producto.stock : null,
  };
}

/** DTO fijo de venta propia; los snapshots de costo nunca atraviesan esta frontera. */
export function proyectarVentaVendedor(venta: Record<string, any>) {
  const items = Array.isArray(venta.items) ? venta.items.map((item: Record<string, unknown>) => ({
    productoId: String(item.id ?? item.articuloId ?? ""), nombre: text(item.nombre) ? item.nombre : text(item.articuloNombre) ? item.articuloNombre : "",
    cantidad: number(item.cantidad) ? item.cantidad : 0,
    precioUnitario: number(item.precioUnitario) ? item.precioUnitario : null,
    subtotal: number(item.subtotal) ? item.subtotal : null,
  })) : [];
  return { id: String(venta.id ?? ""), fecha: venta.fecha ?? venta.creadaEn ?? null, clienteId: text(venta.clienteId) ? venta.clienteId : null, cliente: text(venta.clienteNombre) ? venta.clienteNombre : null, items, total: number(venta.totales?.total) ? venta.totales.total : null, metodoPago: text(venta.metodoPago) ? venta.metodoPago : null, estado: text(venta.estado) ? venta.estado : null };
}

function exigirVendedor(rol: string) { if (rol !== "vendedor") fail("permission-denied", "ROL_NO_AUTORIZADO"); }

export async function ejecutarConsultarCatalogoVendedor(db: any, contexto: { empresaId: string; rol: string }, data: unknown) {
  exigirVendedor(contexto.rol);
  if (data !== undefined && (data === null || typeof data !== "object" || Array.isArray(data) || Object.keys(data as object).length !== 0)) fail("invalid-argument", "PAYLOAD_INVALID");
  const snap = await db.collection("productos").where("empresaId", "==", contexto.empresaId).get();
  return { productos: snap.docs.map((doc: any) => proyectarCatalogoVendedor({ id: doc.id, ...doc.data() })).filter((producto: any) => producto.activo) };
}

export async function ejecutarConsultarMisVentasVendedor(db: any, contexto: { empresaId: string; actorUid: string; rol: string }, data: unknown) {
  exigirVendedor(contexto.rol);
  if (data !== undefined && (data === null || typeof data !== "object" || Array.isArray(data) || Object.keys(data as object).length !== 0)) fail("invalid-argument", "PAYLOAD_INVALID");
  const snap = await db.collection("ventas").where("empresaId", "==", contexto.empresaId).where("cajeroId", "==", contexto.actorUid).get();
  return { ventas: snap.docs.map((doc: any) => proyectarVentaVendedor({ id: doc.id, ...doc.data() })) };
}

export const consultarCatalogoVendedorV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore(); const tenant = await exigirTenantActivo(request, db);
  return ejecutarConsultarCatalogoVendedor(db, { empresaId: tenant.id, rol: tenant.rol }, request.data);
});
export const consultarMisVentasVendedorV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore(); const tenant = await exigirTenantActivo(request, db);
  return ejecutarConsultarMisVentasVendedor(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});
