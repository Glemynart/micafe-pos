/**
 * insumos-service.ts
 *
 * Funciones Firestore para leer / crear / editar / eliminar Insumos (materia prima).
 */

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { aplicarMovimientoEnTransaccion } from "@/lib/inventario-ledger";

export interface Insumo {
  id: string;
  nombre: string;
  costo: number;
  stock: number;
  unidadMedida: string; // ej. "gr", "ml", "und"
  stockMinimo: number;
  espacioId: string;
  activo: boolean;
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type InsumoInput = Omit<Insumo, "id" | "creadoEn" | "actualizadoEn">;

export function suscribirInsumos(
  espacioId: string,
  callback: (insumos: Insumo[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "insumos"),
    where("espacioId", "==", espacioId),
    where("activo", "==", true)
  );

  return onSnapshot(q, (snap) => {
    const insumos: Insumo[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Insumo, "id">),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    callback(insumos);
  });
}

export async function crearInsumo(data: InsumoInput): Promise<string> {
  const ref = await addDoc(collection(db, "insumos"), {
    ...data,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
}

export async function editarInsumo(id: string, data: Partial<InsumoInput>): Promise<void> {
  const { stock: nuevoStock, ...dataSinStock } = data;

  // Sin cambio de stock: actualización simple de metadatos.
  if (nuevoStock === undefined) {
    await updateDoc(doc(db, "insumos", id), {
      ...dataSinStock,
      actualizadoEn: serverTimestamp(),
    });
    return;
  }

  // Stock cambió: transacción atómica + Ledger (I11).
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Debe iniciar sesión para ajustar el stock");

  const userSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
  const usuarioNombre = userSnap.exists()
    ? (userSnap.data().nombre as string)
    : currentUser.uid;

  // Clave de idempotencia estable: generada fuera del callback de runTransaction
  // para sobrevivir reintentos automáticos del SDK sin duplicar el movimiento (I10).
  const ajusteId = doc(collection(db, "movimientos_inventario")).id;

  await runTransaction(db, async (transaction) => {
    // ── LECTURAS ──────────────────────────────────────────────────────────────
    const insumoRef = doc(db, "insumos", id);
    const insumoSnap = await transaction.get(insumoRef);
    if (!insumoSnap.exists()) throw new Error("Insumo no encontrado");

    const d = insumoSnap.data();
    const stockActual = (d.stock as number | undefined) ?? 0;
    const delta = nuevoStock - stockActual;

    // ── ESCRITURAS ────────────────────────────────────────────────────────────
    // El ledger hace su Fase 1 (lecturas: idempotencia + artículo) antes de
    // escribir nada — reads-before-writes preservado.
    if (delta !== 0) {
      const tipo = delta > 0 ? "ajuste_positivo" : "ajuste_negativo";
      await aplicarMovimientoEnTransaccion(transaction, {
        articuloTipo:        "insumo",
        articuloId:          id,
        articuloNombre:      (d.nombre as string) ?? id,
        unidad:              (d.unidadMedida as string | undefined) ?? "und",
        tipo,
        cantidad:            delta,
        costoUnitario:       (d.costo as number | undefined) ?? 0,
        espacioId:           (d.espacioId as string) ?? "",
        usuarioId:           currentUser.uid,
        usuarioNombre,
        claveIdempotencia:   `${tipo}:edicion:insumo:${id}:${ajusteId}`,
        referenciaColeccion: "insumos",
        referenciaId:        id,
        motivo:              "ajuste_administrativo",
      });
    }

    // Actualiza campos no-stock (ledger ya actualizó stock + secuenciaLedger).
    transaction.update(insumoRef, {
      ...dataSinStock,
      actualizadoEn: serverTimestamp(),
    });
  });
}

export async function desactivarInsumo(id: string): Promise<void> {
  await updateDoc(doc(db, "insumos", id), {
    activo: false,
    actualizadoEn: serverTimestamp(),
  });
}
