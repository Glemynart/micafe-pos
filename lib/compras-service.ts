import {
  collection,
  doc,
  getDoc,
  runTransaction,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  type Unsubscribe,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

export interface CompraItem {
  tipo?: 'insumo' | 'producto';
  insumoId?: string;
  insumoNombre?: string;
  itemId?: string;
  itemNombre?: string;
  cantidad: number;
  unidadMedida: string;
  costoUnitario: number;
  costoTotal: number;
}

export interface Compra {
  id: string;
  fecha: unknown;
  proveedor: string;
  items: CompraItem[];
  total: number;
  espacioId: string;
  registradoPor: string;
  registradoPorNombre: string;
  cuentaId?: string;
  cuentaNombre?: string;
}

export interface RegistrarCompraParams {
  proveedor: string;
  items: CompraItem[];
  total: number;
  espacioId: string;
  cuentaId?: string;
  cuentaNombre?: string;
}

async function getCurrentUserInfo(): Promise<{ uid: string; nombre: string }> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Debe iniciar sesión para registrar una compra");

  const userSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
  const nombre = userSnap.exists() ? userSnap.data().nombre : currentUser.uid;

  return { uid: currentUser.uid, nombre };
}

export async function registrarCompra(params: RegistrarCompraParams): Promise<string> {
  const { uid, nombre } = await getCurrentUserInfo();
  const comprasRef = collection(db, "compras");
  const nuevaCompraDoc = doc(comprasRef);

  await runTransaction(db, async (transaction) => {
    // ── LECTURAS ─────────────────────────────────────────────────────────────
    const itemsToRead = new Map<string, { tipo: 'insumo' | 'producto', id: string }>();
    params.items.forEach((item) => {
      const itemTipo = item.tipo || 'insumo';
      const itemId = item.itemId || item.insumoId;
      if (itemId) itemsToRead.set(itemId, { tipo: itemTipo, id: itemId });
    });

    const itemsDataMap = new Map<string, { ref: any; data: any }>();
    for (const [itemId, info] of itemsToRead.entries()) {
      const collectionName = info.tipo === 'insumo' ? "insumos" : "productos";
      const itemRef = doc(db, collectionName, itemId);
      const itemSnap = await transaction.get(itemRef);
      if (itemSnap.exists()) itemsDataMap.set(itemId, { ref: itemRef, data: itemSnap.data() });
    }

    // Leer la cuenta bancaria si se especificó (validación)
    let cuentaRef: any = null;
    if (params.cuentaId) {
      cuentaRef = doc(db, "cuentas_bancarias", params.cuentaId);
      const cuentaSnap = await transaction.get(cuentaRef);
      if (!cuentaSnap.exists()) throw new Error("La cuenta bancaria no existe.");
    }

    // ── ESCRITURAS ───────────────────────────────────────────────────────────
    for (const item of params.items) {
      const itemId = item.itemId || item.insumoId;
      if (!itemId) continue;
      const itemData = itemsDataMap.get(itemId);
      if (itemData) {
        transaction.update(itemData.ref, {
          stock: (itemData.data.stock || 0) + item.cantidad,
          actualizadoEn: serverTimestamp(),
        });
      }
    }

    transaction.set(nuevaCompraDoc, {
      proveedor: params.proveedor,
      items: params.items,
      total: params.total,
      espacioId: params.espacioId,
      registradoPor: uid,
      registradoPorNombre: nombre,
      fecha: serverTimestamp(),
      ...(params.cuentaId ? { cuentaId: params.cuentaId, cuentaNombre: params.cuentaNombre } : {}),
    });

    // Descontar de la cuenta bancaria y registrar transacción financiera
    if (cuentaRef && params.cuentaId) {
      transaction.update(cuentaRef, { saldo: increment(-params.total) });

      const txRef = doc(collection(db, "transacciones_financieras"));
      transaction.set(txRef, {
        cuentaId: params.cuentaId,
        cuentaNombre: params.cuentaNombre ?? params.cuentaId,
        tipo: 'egreso',
        monto: params.total,
        concepto: `Compra a proveedor: ${params.proveedor}`,
        categoria: 'compras',
        referencia: nuevaCompraDoc.id,
        usuarioId: uid,
        usuarioNombre: nombre,
        espacioId: params.espacioId,
        fecha: serverTimestamp(),
      });
    }
  });

  return nuevaCompraDoc.id;
}

export function suscribirCompras(
  espacioId: string,
  callback: (compras: Compra[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "compras"),
    where("espacioId", "==", espacioId),
    orderBy("fecha", "desc")
  );

  return onSnapshot(q, (snap) => {
    const compras: Compra[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Compra, "id">),
    }));
    callback(compras);
  });
}

export async function eliminarCompra(compraId: string): Promise<void> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const compraRef = doc(db, "compras", compraId);

  await runTransaction(db, async (transaction) => {
    // ── LECTURAS ─────────────────────────────────────────────────────────────
    const compraSnap = await transaction.get(compraRef);
    if (!compraSnap.exists()) throw new Error("La compra no existe");
    const compraData = compraSnap.data();
    const items = compraData.items as CompraItem[] || [];
    const cuentaId: string | undefined = compraData.cuentaId;
    const cuentaNombre: string | undefined = compraData.cuentaNombre;
    const total: number = compraData.total || 0;

    const itemsToRead = new Map<string, { tipo: 'insumo' | 'producto', id: string }>();
    items.forEach((item) => {
      const itemTipo = item.tipo || 'insumo';
      const itemId = item.itemId || item.insumoId;
      if (itemId) itemsToRead.set(itemId, { tipo: itemTipo, id: itemId });
    });

    const itemsDataMap = new Map<string, { ref: any; data: any }>();
    for (const [itemId, info] of itemsToRead.entries()) {
      const collectionName = info.tipo === 'insumo' ? "insumos" : "productos";
      const itemRef = doc(db, collectionName, itemId);
      const itemSnap = await transaction.get(itemRef);
      if (itemSnap.exists()) itemsDataMap.set(itemId, { ref: itemRef, data: itemSnap.data() });
    }

    // Leer cuenta para validación si aplica
    let cuentaRef: any = null;
    if (cuentaId) {
      cuentaRef = doc(db, "cuentas_bancarias", cuentaId);
      await transaction.get(cuentaRef); // lectura requerida antes de la escritura
    }

    // ── ESCRITURAS ───────────────────────────────────────────────────────────
    for (const item of items) {
      const itemId = item.itemId || item.insumoId;
      if (!itemId) continue;
      const itemData = itemsDataMap.get(itemId);
      if (itemData) {
        transaction.update(itemData.ref, {
          stock: Math.max(0, (itemData.data.stock || 0) - item.cantidad),
          actualizadoEn: serverTimestamp(),
        });
      }
    }

    transaction.delete(compraRef);

    // Revertir saldo y registrar transacción de reversión (append-only)
    if (cuentaRef && cuentaId && total > 0) {
      transaction.update(cuentaRef, { saldo: increment(total) });

      const txRef = doc(collection(db, "transacciones_financieras"));
      transaction.set(txRef, {
        cuentaId,
        cuentaNombre: cuentaNombre ?? cuentaId,
        tipo: 'ingreso',
        monto: total,
        concepto: `Reversión de compra eliminada: ${compraData.proveedor}`,
        categoria: 'compras',
        referencia: compraId,
        usuarioId: currentUser?.uid ?? 'sistema',
        usuarioNombre: 'Reversión Automática',
        fecha: serverTimestamp(),
      });
    }
  });
}
