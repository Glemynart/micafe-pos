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
import { aplicarMovimientosEnTransaccion, type EmitirMovimientoParams } from "@/lib/inventario-ledger";

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
  fechaCompra?: string; // YYYY-MM-DD; si se omite usa serverTimestamp()
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

  // Parsear YYYY-MM-DD como medianoche local (no UTC) para evitar desfase de timezone.
  // Compras sin fechaCompra usan el timestamp del servidor como fallback.
  const fechaDoc = params.fechaCompra
    ? (() => { const [y, m, d] = params.fechaCompra!.split('-').map(Number); return new Date(y, m - 1, d) })()
    : serverTimestamp();

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

    // ── LEDGER: consolidar por artículo y emitir movimiento compra ───────────
    // Si el mismo artículo aparece en varias filas se consolida en un único
    // movimiento (misma semántica que el stock anterior). El ledger actualiza
    // stock y secuenciaLedger co-atómicamente dentro de esta transacción (I5).
    interface AgregadoItem {
      tipo: 'insumo' | 'producto';
      cantidadTotal: number;
      costoTotal: number;
      nombre: string;
      unidad: string;
    }
    const itemsAgregados = new Map<string, AgregadoItem>();
    for (const item of params.items) {
      const itemId = item.itemId || item.insumoId;
      if (!itemId || !itemsDataMap.has(itemId)) continue;
      const tipo = item.tipo ?? 'insumo';
      const artData = itemsDataMap.get(itemId)!.data;
      const prev = itemsAgregados.get(itemId);
      if (prev) {
        prev.cantidadTotal += item.cantidad;
        prev.costoTotal    += item.costoTotal;
      } else {
        itemsAgregados.set(itemId, {
          tipo,
          cantidadTotal: item.cantidad,
          costoTotal:    item.costoTotal,
          nombre: artData.nombre ?? item.itemNombre ?? item.insumoNombre ?? itemId,
          unidad: artData.unidadMedida ?? item.unidadMedida,
        });
      }
    }

    // ── ESCRITURAS ───────────────────────────────────────────────────────────
    // Se construye primero el array completo de params y luego se invoca el
    // helper por lote una única vez: todas las lecturas del ledger ocurren en
    // la Fase 1 del helper antes de cualquier escritura (reads-before-writes).
    const paramsMovimientos: EmitirMovimientoParams[] = [];
    for (const [itemId, agr] of itemsAgregados.entries()) {
      const costoUnitario = agr.cantidadTotal > 0 ? agr.costoTotal / agr.cantidadTotal : 0;
      paramsMovimientos.push({
        articuloTipo:        agr.tipo,
        articuloId:          itemId,
        articuloNombre:      agr.nombre,
        unidad:              agr.unidad,
        tipo:                'compra',
        cantidad:            agr.cantidadTotal,
        costoUnitario,
        espacioId:           params.espacioId,
        usuarioId:           uid,
        usuarioNombre:       nombre,
        claveIdempotencia:   `compra:${nuevaCompraDoc.id}:${agr.tipo}:${itemId}:0`,
        referenciaColeccion: 'compras',
        referenciaId:        nuevaCompraDoc.id,
      });
    }
    await aplicarMovimientosEnTransaccion(transaction, paramsMovimientos);

    transaction.set(nuevaCompraDoc, {
      proveedor: params.proveedor,
      items: params.items,
      total: params.total,
      espacioId: params.espacioId,
      registradoPor: uid,
      registradoPorNombre: nombre,
      fecha: fechaDoc,
      creadoEn: serverTimestamp(),
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

    // Leer cuenta si aplica. Si ya no existe (fue eliminada), omitir reversión financiera.
    let cuentaRef: any = null;
    let cuentaExiste = false;
    if (cuentaId) {
      cuentaRef = doc(db, "cuentas_bancarias", cuentaId);
      const cuentaSnap = await transaction.get(cuentaRef);
      cuentaExiste = cuentaSnap.exists();
    }

    // ── ESCRITURAS ───────────────────────────────────────────────────────────
    // Acumular cantidades por itemId: un único update por insumo/producto.
    const cantidadesBaja = new Map<string, number>();
    for (const item of items) {
      const itemId = item.itemId || item.insumoId;
      if (!itemId) continue;
      cantidadesBaja.set(itemId, (cantidadesBaja.get(itemId) ?? 0) + item.cantidad);
    }
    for (const [itemId, totalCantidad] of cantidadesBaja.entries()) {
      const itemData = itemsDataMap.get(itemId);
      if (itemData) {
        transaction.update(itemData.ref, {
          stock: Math.max(0, (itemData.data.stock || 0) - totalCantidad),
          actualizadoEn: serverTimestamp(),
        });
      }
    }

    transaction.delete(compraRef);

    // Revertir saldo solo si la cuenta aún existe; si fue eliminada se omite sin crash.
    if (cuentaRef && cuentaExiste && cuentaId && total > 0) {
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
