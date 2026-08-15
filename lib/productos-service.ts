/** Servicio tenant-aware de catálogo de productos. */

import {
  collection,
  where,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { IMPUESTO_TIPO_DEFAULT, type ImpuestoTipo } from "@/lib/impuestos-service";
import { tenantQuery } from "@/lib/tenant";
import { crearEnvelopeInventario, ejecutarComandoInventario } from "@/lib/inventario-command";

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  stockMinimo: number;
  imagenUrl: string | null;
  categoriaId: string;
  espacioId: string;
  activo: boolean;
  descripcion: string;
  unidad: string;
  icono?: string;
  impuestoTipo?: ImpuestoTipo;
  consignadorId?: string;
  stockInicial?: number;
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type ProductoInput = Omit<Producto, "id" | "creadoEn" | "actualizadoEn">;

export function suscribirProductos(
  espacioId: string,
  callback: (productos: Producto[]) => void,
  categoriaId?: string,
): Unsubscribe {
  const filtros = [
    where("espacioId", "==", espacioId),
    where("activo", "==", true),
  ];
  if (categoriaId) filtros.push(where("categoriaId", "==", categoriaId));

  let unsubscribe = () => {};
  let cancelado = false;
  tenantQuery(collection(db, "productos"), ...filtros).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const productos: Producto[] = snap.docs.map((d) => {
        const data = d.data() as Omit<Producto, "id">;
        return { id: d.id, ...data, impuestoTipo: data.impuestoTipo ?? IMPUESTO_TIPO_DEFAULT };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre));
      callback(productos);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

export async function crearProducto(data: ProductoInput): Promise<string> {
  const result = await ejecutarComandoInventario<{ articuloId: string }>(
    "crearArticuloInventarioV1",
    crearEnvelopeInventario({ articuloTipo: "producto", data: { ...data } }),
  );
  return result.articuloId;
}

export async function editarProducto(id: string, data: Partial<ProductoInput>): Promise<void> {
  await ejecutarComandoInventario(
    "actualizarArticuloInventarioV1",
    crearEnvelopeInventario(
      { articuloTipo: "producto", articuloId: id, data: { ...data } },
      data.stock === undefined ? null : "ajuste_administrativo",
    ),
  );
}

export async function desactivarProducto(id: string): Promise<void> {
  await editarProducto(id, { activo: false });
}

/** Compatibilidad histórica: el inventario solo admite desactivación. */
export async function eliminarProducto(id: string): Promise<void> {
  await desactivarProducto(id);
}
