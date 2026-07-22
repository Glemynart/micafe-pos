import {
  collection,
  doc,
  runTransaction,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { aplicarMovimientoEnTransaccion } from "@/lib/inventario-ledger";
import { getCurrentUserInfo } from "@/lib/auth-service";
import { getEmpresaId, tenantQuery, withEmpresaId } from "@/lib/tenant";

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
  insumoNombre: string;
  cantidad: number;
  unidadMedida: string;
  motivo: string;
  costo: number;
  notas?: string;
  espacioId: string;
}

export async function registrarMerma(params: RegistrarMermaParams): Promise<string> {
  const { uid, nombre } = await getCurrentUserInfo("Debe iniciar sesión para registrar una merma");
  // MT-U3 Capa 2: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId();
  const mermasRef = collection(db, "mermas");
  const nuevaMermaDoc = doc(mermasRef);

  await runTransaction(db, async (transaction) => {
    // Ledger: emitir movimiento merma y actualizar stock co-atómicamente (I5).
    // El helper hace lecturas (idempotencia + artículo) antes de cualquier escritura.
    await aplicarMovimientoEnTransaccion(transaction, {
      empresaId,
      articuloTipo:        "insumo",
      articuloId:          params.insumoId,
      articuloNombre:      params.insumoNombre,
      unidad:              params.unidadMedida,
      tipo:                "merma",
      cantidad:            -params.cantidad,   // salida → negativo (I13)
      // params.costo es el costo TOTAL de la merma (cantidad × costo unitario del
      // insumo, calculado en waste-module). El ledger espera costo POR UNIDAD y
      // recalcula costoTotal = |cantidad| × costoUnitario. Derivar el unitario.
      costoUnitario:       params.cantidad > 0 ? params.costo / params.cantidad : 0,
      espacioId:           params.espacioId,
      usuarioId:           uid,
      usuarioNombre:       nombre,
      claveIdempotencia:   `merma:${nuevaMermaDoc.id}:insumo:${params.insumoId}:0`,
      referenciaColeccion: "mermas",
      referenciaId:        nuevaMermaDoc.id,
      motivo:              params.motivo,
    });

    transaction.set(nuevaMermaDoc, withEmpresaId(empresaId, {
      insumoId: params.insumoId,
      insumoNombre: params.insumoNombre,
      cantidad: params.cantidad,
      unidadMedida: params.unidadMedida,
      motivo: params.motivo,
      costo: params.costo,
      notas: params.notas,
      espacioId: params.espacioId,
      registradoPor: uid,
      registradoPorNombre: nombre,
      fecha: serverTimestamp(),
    }));
  });

  return nuevaMermaDoc.id;
}

export function suscribirMermas(
  espacioId: string,
  callback: (mermas: Merma[]) => void
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;

  tenantQuery(
    collection(db, "mermas"),
    where("espacioId", "==", espacioId),
    orderBy("fecha", "desc")
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
