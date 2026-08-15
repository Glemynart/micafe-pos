import {
  collection,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tenantQuery } from "@/lib/tenant";
import { crearEnvelopeInventario, ejecutarComandoInventario } from "@/lib/inventario-command";

export interface Merma {
  id: string;
  fecha: unknown;
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  unidadMedida: string;
  motivo: string;
  costo: number;
  notas?: string;
  espacioId: string;
  registradoPor: string;
  registradoPorNombre: string;
}

export interface RegistrarMermaParams {
  insumoId: string;
  /** Estos campos se conservan para la compatibilidad de la UI; el backend los deriva. */
  insumoNombre?: string;
  cantidad: number;
  unidadMedida?: string;
  motivo: string;
  costo?: number;
  notas?: string;
  espacioId?: string;
}

export async function registrarMerma(params: RegistrarMermaParams): Promise<string> {
  const result = await ejecutarComandoInventario<{ mermaId: string }>(
    "registrarMermaOperativaV1",
    crearEnvelopeInventario(
      {
        insumoId: params.insumoId,
        cantidad: params.cantidad,
        motivo: params.motivo,
        ...(params.notas ? { notas: params.notas } : {}),
      },
      params.motivo,
    ),
  );
  return result.mermaId;
}

export function suscribirMermas(
  espacioId: string,
  callback: (mermas: Merma[]) => void,
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;
  tenantQuery(
    collection(db, "mermas"),
    where("espacioId", "==", espacioId),
    orderBy("fecha", "desc"),
  ).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const mermas: Merma[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Merma, "id">),
      }));
      callback(mermas);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}
