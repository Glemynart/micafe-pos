/**
 * productos-service.ts
 *
 * Funciones Firestore para leer / crear / editar / eliminar productos,
 * filtrando por espacioId y opcionalmente categoriaId.
 * Usa onSnapshot para actualizaciones en tiempo real.
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
  deleteDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { aplicarMovimientoEnTransaccion } from "@/lib/inventario-ledger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

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
  // Consignación
  consignadorId?: string;   // quién dejó el producto
  stockInicial?: number;    // unidades originales entregadas
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type ProductoInput = Omit<Producto, 'id' | 'creadoEn' | 'actualizadoEn'>;


// ─── Leer (tiempo real) ───────────────────────────────────────────────────────

/**
 * Suscribe a los productos activos de un espacio en tiempo real.
 * Si se provee categoriaId, filtra además por categoría.
 */
export function suscribirProductos(
  espacioId: string,
  callback: (productos: Producto[]) => void,
  categoriaId?: string
): Unsubscribe {
  const filtros = [
    where("espacioId", "==", espacioId),
    where("activo", "==", true),
  ];
  if (categoriaId) {
    filtros.push(where("categoriaId", "==", categoriaId));
  }

  const q = query(
    collection(db, "productos"),
    ...filtros
  );

  return onSnapshot(q, (snap) => {
    const productos: Producto[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Producto, "id">),
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    callback(productos);
  });
}

// ─── Crear ────────────────────────────────────────────────────────────────────

export async function crearProducto(data: ProductoInput): Promise<string> {
  const ref = await addDoc(collection(db, "productos"), {
    ...data,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
}

// ─── Editar ───────────────────────────────────────────────────────────────────

export async function editarProducto(
  id: string,
  data: Partial<ProductoInput>
): Promise<void> {
  const { stock: nuevoStock, ...dataSinStock } = data;

  // Sin cambio de stock: actualización simple de metadatos.
  if (nuevoStock === undefined) {
    await updateDoc(doc(db, "productos", id), {
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
    const productoRef = doc(db, "productos", id);
    const productoSnap = await transaction.get(productoRef);
    if (!productoSnap.exists()) throw new Error("Producto no encontrado");

    const d = productoSnap.data();
    const stockActual = (d.stock as number | undefined) ?? 0;
    const delta = nuevoStock - stockActual;

    // ── ESCRITURAS ────────────────────────────────────────────────────────────
    // El ledger hace su Fase 1 (lecturas: idempotencia + artículo) antes de
    // escribir nada — reads-before-writes preservado.
    if (delta !== 0) {
      const tipo = delta > 0 ? "ajuste_positivo" : "ajuste_negativo";
      await aplicarMovimientoEnTransaccion(transaction, {
        articuloTipo:        "producto",
        articuloId:          id,
        articuloNombre:      (d.nombre as string) ?? id,
        unidad:              (d.unidad as string | undefined) ?? "und",
        tipo,
        cantidad:            delta,
        costoUnitario:       (d.costo as number | undefined) ?? 0,
        espacioId:           (d.espacioId as string) ?? "",
        usuarioId:           currentUser.uid,
        usuarioNombre,
        claveIdempotencia:   `${tipo}:edicion:producto:${id}:${ajusteId}`,
        referenciaColeccion: "productos",
        referenciaId:        id,
        motivo:              "ajuste_administrativo",
      });
    }

    // Actualiza campos no-stock (ledger ya actualizó stock + secuenciaLedger).
    transaction.update(productoRef, {
      ...dataSinStock,
      actualizadoEn: serverTimestamp(),
    });
  });
}

// ─── Eliminar (soft delete) ───────────────────────────────────────────────────

export async function desactivarProducto(id: string): Promise<void> {
  await updateDoc(doc(db, "productos", id), {
    activo: false,
    actualizadoEn: serverTimestamp(),
  });
}

/** Eliminación física — usar con precaución */
export async function eliminarProducto(id: string): Promise<void> {
  await deleteDoc(doc(db, "productos", id));
}
