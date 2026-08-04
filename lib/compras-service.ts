import {
  collection,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, getFirebaseFunctions } from "@/lib/firebase";
import { tenantQuery } from "@/lib/tenant";

export interface CompraItem {
  tipo?: "insumo" | "producto";
  insumoId?: string;
  insumoNombre?: string;
  itemId?: string;
  itemNombre?: string;
  cantidad: number;
  unidadMedida: string;
  costoUnitario: number;
  costoTotal: number;
}

export interface ProveedorSnapshot {
  id: string;
  nombre: string;
  estado: "ACTIVO";
  nit?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

export interface Compra {
  id: string;
  fecha: unknown;
  proveedor: string;
  proveedorId?: string;
  proveedorSnapshot?: ProveedorSnapshot;
  items: CompraItem[];
  total: number;
  espacioId: string;
  registradoPor: string;
  registradoPorNombre: string;
  /** Snapshot histórico del documento financiero, cuando la compra tuvo cuenta. */
  cuentaId?: string;
  cuentaDocumentoId?: string;
  cuentaClaveOperativa?: string;
  cuentaNombre?: string;
}

export interface RegistrarCompraParams {
  proveedor: string;
  proveedorId?: string;
  items: CompraItem[];
  espacioId: string;
  cuentaClaveOperativa?: string;
  fechaCompra?: string;
}

/** La callable es la única autoridad sobre compra, inventario y finanzas. */
export async function registrarCompra(params: RegistrarCompraParams): Promise<string> {
  const commandId = `compra:${crypto.randomUUID()}`;
  const result = await httpsCallable<unknown, { compraId: string }>(getFirebaseFunctions(), "registrarCompraOperativaV1")({
    commandId,
    idempotencyKey: commandId,
    correlationId: `corr-${commandId}`,
    causationId: null,
    motivo: "compra_proveedor",
    payload: {
      proveedor: params.proveedor,
      ...(params.proveedorId ? { proveedorId: params.proveedorId } : {}),
      espacioId: params.espacioId,
      fechaCompra: params.fechaCompra ?? null,
      ...(params.cuentaClaveOperativa ? { cuentaClaveOperativa: params.cuentaClaveOperativa } : {}),
      items: params.items.map(item => ({
        tipo: item.tipo ?? "insumo",
        articuloId: item.itemId ?? item.insumoId,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
      })),
    },
  });
  return result.data.compraId;
}

export function suscribirCompras(
  espacioId: string,
  callback: (compras: Compra[]) => void,
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;
  tenantQuery(
    collection(db, "compras"), where("espacioId", "==", espacioId), orderBy("fecha", "desc"),
  ).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const compras: Compra[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Compra, "id">),
      }));
      callback(compras);
    });
  });
  return () => {
    cancelado = true;
    unsubscribe();
  };
}

/**
 * Las compras confirmadas no se borran desde el cliente. La reversión deberá
 * llegar mediante un comando compensatorio server-side en un PR posterior.
 */
export async function eliminarCompra(_compraId: string): Promise<void> {
  throw new Error("La reversión de compras requiere un comando server-side pendiente.");
}
