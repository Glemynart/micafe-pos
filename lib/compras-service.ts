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

    // Leer la cuenta bancaria si se especificó (validación de existencia y fondos)
    let cuentaRef: any = null;
    if (params.cuentaId) {
      cuentaRef = doc(db, "cuentas_bancarias", params.cuentaId);
      const cuentaSnap = await transaction.get(cuentaRef);
      if (!cuentaSnap.exists()) throw new Error("La cuenta bancaria no existe.");
      const saldoDisponible = Number((cuentaSnap.data() as { saldo?: number } | undefined)?.saldo ?? 0);
      if (saldoDisponible < params.total) {
        throw new Error(
          `Fondos insuficientes en la cuenta seleccionada. Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')} — Total de la compra: $${params.total.toLocaleString('es-CO')}.`
        );
      }
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

    // Fix C-5: propagar el último costo de compra al campo cache del artículo.
    // costoUnitario ya calculado en el loop anterior; doc() es pura (sin red).
    for (const pm of paramsMovimientos) {
      if (pm.costoUnitario > 0) {
        const col = pm.articuloTipo === 'producto' ? 'productos' : 'insumos';
        transaction.update(doc(db, col, pm.articuloId), { costo: pm.costoUnitario });
      }
    }

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
  const { uid, nombre: usuarioNombre } = await getCurrentUserInfo();
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
    const espacioId: string = (compraData.espacioId as string) || "";

    // Leer cuenta si aplica. Si ya no existe (fue eliminada), omitir reversión financiera.
    let cuentaRef: any = null;
    let cuentaExiste = false;
    if (cuentaId) {
      cuentaRef = doc(db, "cuentas_bancarias", cuentaId);
      const cuentaSnap = await transaction.get(cuentaRef);
      cuentaExiste = cuentaSnap.exists();
    }

    // ── LEDGER: consolidar por artículo y emitir devolucion_compra ────────────
    // Espejo exacto de registrarCompra: misma lógica de agregación y misma clave
    // base (compraId:tipo:itemId:0), con prefijo devolucion_compra y cantidad
    // negativa — I13: devolucion_compra es salida (signo -1).
    // articuloNombre y unidad se toman del snapshot almacenado en la compra
    // (no es necesario releer los artículos desde Firestore).
    interface AgregadoBaja {
      tipo: 'insumo' | 'producto';
      cantidadTotal: number;
      costoTotal: number;
      nombre: string;
      unidad: string;
    }
    const itemsAgregados = new Map<string, AgregadoBaja>();
    for (const item of items) {
      const itemId = item.itemId || item.insumoId;
      if (!itemId) continue;
      const tipo = item.tipo ?? 'insumo';
      const nombre = item.itemNombre ?? item.insumoNombre ?? itemId;
      const prev = itemsAgregados.get(itemId);
      if (prev) {
        prev.cantidadTotal += item.cantidad;
        prev.costoTotal    += item.costoTotal;
      } else {
        itemsAgregados.set(itemId, {
          tipo,
          cantidadTotal: item.cantidad,
          costoTotal:    item.costoTotal,
          nombre,
          unidad: item.unidadMedida,
        });
      }
    }

    const paramsMovimientos: EmitirMovimientoParams[] = [];
    for (const [itemId, agr] of itemsAgregados.entries()) {
      if (agr.cantidadTotal <= 0) continue;
      const costoUnitario = agr.costoTotal / agr.cantidadTotal;
      paramsMovimientos.push({
        articuloTipo:            agr.tipo,
        articuloId:              itemId,
        articuloNombre:          agr.nombre,
        unidad:                  agr.unidad,
        tipo:                    'devolucion_compra',
        cantidad:                -agr.cantidadTotal,
        costoUnitario,
        espacioId,
        usuarioId:               uid,
        usuarioNombre,
        claveIdempotencia:       `devolucion_compra:${compraId}:${agr.tipo}:${itemId}:0`,
        movimientoRelacionadoId: `compra:${compraId}:${agr.tipo}:${itemId}:0`,
        referenciaColeccion:     'compras',
        referenciaId:            compraId,
        motivo:                  'eliminacion_compra',
      });
    }

    // Fase 1 interna del ledger (idempotencia + artículo) ocurre aquí, antes de
    // cualquier escritura — reads-before-writes preservado a nivel de transacción.
    if (paramsMovimientos.length > 0) {
      await aplicarMovimientosEnTransaccion(transaction, paramsMovimientos);
    }

    // ── ESCRITURAS ────────────────────────────────────────────────────────────
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
        usuarioId: uid,
        usuarioNombre,
        espacioId,
        fecha: serverTimestamp(),
      });
    }
  });
}
