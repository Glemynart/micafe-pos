/** Servicio tenant-aware de catálogo de insumos. */

import {
  collection,
  where,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tenantQuery } from "@/lib/tenant";
import { crearEnvelopeInventario, ejecutarComandoInventario } from "@/lib/inventario-command";

export interface Insumo {
  id: string;
  nombre: string;
  costo: number;
  stock: number;
  unidadMedida: string;
  stockMinimo: number;
  espacioId: string;
  activo: boolean;
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type InsumoInput = Omit<Insumo, "id" | "creadoEn" | "actualizadoEn">;

export function suscribirInsumos(
  espacioId: string,
  callback: (insumos: Insumo[]) => void,
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;
  tenantQuery(
    collection(db, "insumos"),
    where("espacioId", "==", espacioId),
    where("activo", "==", true),
  ).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const insumos: Insumo[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Insumo, "id">),
      })).sort((a, b) => a.nombre.localeCompare(b.nombre));
      callback(insumos);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

export async function crearInsumo(data: InsumoInput): Promise<string> {
  const result = await ejecutarComandoInventario<{ articuloId: string }>(
    "crearArticuloInventarioV1",
    crearEnvelopeInventario({ articuloTipo: "insumo", data: { ...data } }),
  );
  return result.articuloId;
}

export async function editarInsumo(id: string, data: Partial<InsumoInput>): Promise<void> {
  await ejecutarComandoInventario(
    "actualizarArticuloInventarioV1",
    crearEnvelopeInventario(
      { articuloTipo: "insumo", articuloId: id, data: { ...data } },
      data.stock === undefined ? null : "ajuste_administrativo",
    ),
  );
}

export async function desactivarInsumo(id: string): Promise<void> {
  await editarInsumo(id, { activo: false });
}
