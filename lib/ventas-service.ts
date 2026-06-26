/**
 * ventas-service.ts
 *
 * Funciones Firestore para gestionar Ventas, Cuentas por Cobrar y el descuento de stock.
 */

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  increment,
  query,
  orderBy,
  where,
  onSnapshot,
  getDoc,
  deleteDoc,
  type Unsubscribe,
  type Transaction,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface VentaItem {
  id: string; // ID del producto
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  subtotal: number;
}

export interface PagoMixtoDetalle {
  metodo: 'efectivo' | 'transferencia';
  monto: number;
}

export interface CrearVentaParams {
  turnoId: string;
  cajeroId: string;
  cajeroNombre?: string;
  espacioId?: string;
  clienteId?: string;
  // Datos de cliente y fiado
  clienteNombre?: string;
  clienteDocumento?: string;
  notasFiado?: string;
  items: VentaItem[];
  totales: {
    subtotal: number;
    iva: number;
    impoconsumo: number;
    total: number;
  };
  metodoPago: 'efectivo' | 'transferencia' | 'cuenta_cobro' | 'mixto';
  // Pago simple
  dineroRecibido?: number;
  cambio?: number;
  // Pago mixto
  pagoMixto?: boolean;
  pagoMixtoDetalle?: PagoMixtoDetalle[];
  estado: 'pagada' | 'pendiente';
}

/**
 * Registra una venta en Firestore mediante una transacción.
 * Si el producto tiene receta, descuenta de `insumos`. Si no, descuenta de `productos`.
 */
export interface IncidenciaInventario {
  tipo: 'stock_insuficiente'
  itemId: string
  itemNombre: string
  stockAnterior: number
  cantidadSolicitada: number
}

async function _ejecutarVenta(
  transaction: Transaction,
  params: CrearVentaParams,
  ventaDocRef: DocumentReference,
  extraVentaFields?: Record<string, unknown>,
): Promise<{ consecutivo: number, incidencias: IncidenciaInventario[] }> {
  const incidencias: IncidenciaInventario[] = [];

  const recetasMap = new Map<string, any>();
  for (const item of params.items) {
    if (item.id.startsWith('quick-')) continue;
    const recetaRef = doc(db, "recetas", item.id);
    const recetaSnap = await transaction.get(recetaRef);
    if (recetaSnap.exists()) {
      recetasMap.set(item.id, recetaSnap.data());
    }
  }

  const insumosToRead = new Set<string>();
  const productosToRead = new Set<string>();
  for (const item of params.items) {
    if (item.id.startsWith('quick-')) continue;
    const receta = recetasMap.get(item.id);
    if (receta && receta.ingredientes && receta.ingredientes.length > 0) {
      for (const ing of receta.ingredientes) {
        insumosToRead.add(ing.insumoId);
      }
    } else {
      productosToRead.add(item.id);
    }
  }

  const insumosMap = new Map<string, any>();
  for (const insumoId of insumosToRead) {
    const insumoRef = doc(db, "insumos", insumoId);
    const insumoSnap = await transaction.get(insumoRef);
    if (insumoSnap.exists()) {
      insumosMap.set(insumoId, { ref: insumoRef, data: insumoSnap.data() });
    }
  }

  const productosMap = new Map<string, any>();
  for (const productoId of productosToRead) {
    const productoRef = doc(db, "productos", productoId);
    const productoSnap = await transaction.get(productoRef);
    if (productoSnap.exists()) {
      productosMap.set(productoId, { ref: productoRef, data: productoSnap.data() });
    }
  }

  const configRef = doc(db, "configuracion", "general");
  const configSnap = await transaction.get(configRef);
  let nuevoConsecutivo = 1;
  if (configSnap.exists()) {
    nuevoConsecutivo = (configSnap.data().consecutivo_actual || 0) + 1;
  }

  const insumosDescuentos = new Map<string, number>();
  const productosDescuentos = new Map<string, number>();
  for (const item of params.items) {
    if (item.id.startsWith('quick-')) continue;
    const receta = recetasMap.get(item.id);
    if (receta && receta.ingredientes && receta.ingredientes.length > 0) {
      for (const ing of receta.ingredientes) {
        const currentDescuento = insumosDescuentos.get(ing.insumoId) || 0;
        insumosDescuentos.set(ing.insumoId, currentDescuento + (ing.cantidad * item.cantidad));
      }
    } else {
      const currentDescuento = productosDescuentos.get(item.id) || 0;
      productosDescuentos.set(item.id, currentDescuento + item.cantidad);
    }
  }

  for (const [insumoId, qtyDesc] of insumosDescuentos.entries()) {
    const insumo = insumosMap.get(insumoId);
    if (insumo) {
      const currentStock = insumo.data.stock || 0;
      if (qtyDesc > currentStock) {
        incidencias.push({
          tipo: 'stock_insuficiente',
          itemId: insumoId,
          itemNombre: insumo.data.nombre || insumoId,
          stockAnterior: currentStock,
          cantidadSolicitada: qtyDesc,
        });
      }
      transaction.update(insumo.ref, { stock: Math.max(0, currentStock - qtyDesc) });
    }
  }

  for (const [productoId, qtyDesc] of productosDescuentos.entries()) {
    const producto = productosMap.get(productoId);
    if (producto) {
      const currentStock = producto.data.stock || 0;
      if (qtyDesc > currentStock) {
        incidencias.push({
          tipo: 'stock_insuficiente',
          itemId: productoId,
          itemNombre: producto.data.nombre || productoId,
          stockAnterior: currentStock,
          cantidadSolicitada: qtyDesc,
        });
      }
      transaction.update(producto.ref, { stock: Math.max(0, currentStock - qtyDesc) });
    }
  }

  transaction.set(configRef, { consecutivo_actual: nuevoConsecutivo }, { merge: true });

  const ahora = new Date();
  const fechaLimiteDIAN =
    params.metodoPago === 'cuenta_cobro'
      ? new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
      : null;

  const ventaData = {
    ...params,
    ...extraVentaFields,
    consecutivo: nuevoConsecutivo,
    fecha: serverTimestamp(),
    ...(fechaLimiteDIAN ? { fechaLimiteDIAN } : {}),
  };
  const ventaDataClean = Object.fromEntries(
    Object.entries(ventaData).filter(([, v]) => v !== undefined)
  );
  transaction.set(ventaDocRef, ventaDataClean);

  if (params.estado === 'pagada') {
    const cuentaMap: Record<string, { nombre: string }> = {
      'caja-principal': { nombre: 'Caja Registradora' },
      'bancolombia':    { nombre: 'Bancolombia' },
    };

    const registrarMovimiento = (cuentaId: string, monto: number) => {
      if (monto <= 0 || !cuentaMap[cuentaId]) return;
      transaction.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(monto) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), {
        cuentaId,
        cuentaNombre: cuentaMap[cuentaId].nombre,
        tipo: 'ingreso',
        monto,
        concepto: `Venta #${nuevoConsecutivo}`,
        categoria: 'ventas',
        referencia: ventaDocRef.id,
        usuarioId: params.cajeroId,
        usuarioNombre: params.cajeroNombre ?? params.cajeroId,
        espacioId: params.espacioId ?? null,
        fecha: serverTimestamp(),
      });
    };

    if (params.metodoPago === 'efectivo') {
      registrarMovimiento('caja-principal', params.totales.total);
    } else if (params.metodoPago === 'transferencia') {
      registrarMovimiento('bancolombia', params.totales.total);
    } else if (params.metodoPago === 'mixto' && params.pagoMixtoDetalle) {
      for (const pago of params.pagoMixtoDetalle) {
        if (pago.metodo === 'efectivo') registrarMovimiento('caja-principal', pago.monto);
        else if (pago.metodo === 'transferencia') registrarMovimiento('bancolombia', pago.monto);
      }
    }
  }

  return { consecutivo: nuevoConsecutivo, incidencias };
}

export async function registrarVenta(params: CrearVentaParams): Promise<{id: string, consecutivo: number, incidenciasInventario: IncidenciaInventario[]}> {
  const nuevaVentaDoc = doc(collection(db, "ventas"));
  let resultado: { consecutivo: number, incidencias: IncidenciaInventario[] };

  await runTransaction(db, async (transaction) => {
    resultado = await _ejecutarVenta(transaction, params, nuevaVentaDoc);
  });

  return { id: nuevaVentaDoc.id, consecutivo: resultado!.consecutivo, incidenciasInventario: resultado!.incidencias };
}

export type CobrarPedidoResult =
  | { status: 'ok', ventaId: string, consecutivo: number, incidenciasInventario: IncidenciaInventario[] }
  | { status: 'already_paid', ventaId: string }

export async function cobrarPedido(
  params: CrearVentaParams,
  pedidoId: string,
): Promise<CobrarPedidoResult> {
  const nuevaVentaDoc = doc(collection(db, "ventas"));
  let resultado: CobrarPedidoResult;

  await runTransaction(db, async (transaction) => {
    const pedidoRef = doc(db, 'pedidos_activos', pedidoId);
    const pedidoSnap = await transaction.get(pedidoRef);
    if (!pedidoSnap.exists()) throw new Error('Pedido no encontrado');

    const pedido = pedidoSnap.data();
    if (!pedido.activo || pedido.estado !== 'abierto') {
      resultado = { status: 'already_paid', ventaId: pedido.ventaId || '' };
      return;
    }

    const comandaIds: string[] = pedido.comandaIds || [];
    const comandaSnaps = await Promise.all(
      comandaIds.map(id => transaction.get(doc(db, 'comandas_cocina', id)))
    );

    const { consecutivo, incidencias } = await _ejecutarVenta(
      transaction, params, nuevaVentaDoc, { pedidoId }
    );

    transaction.update(pedidoRef, {
      estado: 'pagado',
      activo: false,
      fechaPago: serverTimestamp(),
      ventaId: nuevaVentaDoc.id,
    });

    for (const snap of comandaSnaps) {
      if (snap.exists() && snap.data().estado !== 'entregado') {
        transaction.update(snap.ref, { estado: 'entregado', completadoEn: serverTimestamp() });
      }
    }

    resultado = {
      status: 'ok',
      ventaId: nuevaVentaDoc.id,
      consecutivo,
      incidenciasInventario: incidencias,
    };
  });

  return resultado!;
}

export function suscribirHistorialVentas(espacioId: string | undefined, callback: (ventas: any[]) => void): Unsubscribe {
  let q;
  if (espacioId) {
    q = query(collection(db, "ventas"), where("espacioId", "==", espacioId), orderBy("fecha", "desc"));
  } else {
    q = query(collection(db, "ventas"), orderBy("fecha", "desc"));
  }
  
  return onSnapshot(q, (snap) => {
    const ventas = snap.docs.map((d) => {
      const data = d.data();
      const items = data.items || [];
      const resumen = items.map((i: any) => `${i.cantidad}x ${i.nombre}`).join(', ');
      
      let fechaFormat = "";
      if (data.fecha?.toDate) {
        const dateObj = data.fecha.toDate();
        const pad = (n: number) => n.toString().padStart(2, '0');
        fechaFormat = `${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
      } else if (typeof data.fecha === 'string') {
        fechaFormat = data.fecha;
      }
      
      return {
        id: d.id,
        ...data,
        fecha: fechaFormat, 
        resumen,
        subtotal_ventas: data.totales?.subtotal || data.totales?.total || 0,
        iva_total: data.totales?.iva || 0,
        impoconsumo_total: data.totales?.impoconsumo || 0,
        total: data.totales?.total || 0,
        metodo_pago: data.metodoPago || 'efectivo',
      };
    });
    callback(ventas);
  });
}

export async function obtenerVentaPorId(id: string): Promise<any> {
  const snap = await getDoc(doc(db, "ventas", id));
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  return null;
}

export async function anularVenta(id: string): Promise<void> {
  const ventaRef = doc(db, "ventas", id);

  await runTransaction(db, async (transaction) => {
    const ventaSnap = await transaction.get(ventaRef);
    if (!ventaSnap.exists()) {
      throw new Error("La venta no existe.");
    }

    const ventaData = ventaSnap.data();
    if (ventaData.estado === 'anulada') {
      throw new Error("La venta ya ha sido anulada previamente.");
    }

    // 1. LEER TODAS LAS RECETAS DE LOS ITEMS
    const recetasMap = new Map<string, any>();
    const items = ventaData.items || [];
    
    for (const item of items) {
      if (item.id.startsWith('quick-')) continue;
      const recetaRef = doc(db, "recetas", item.id);
      const recetaSnap = await transaction.get(recetaRef);
      if (recetaSnap.exists()) {
        recetasMap.set(item.id, recetaSnap.data());
      }
    }

    // 2. LEER INSUMOS Y PRODUCTOS PARA DEVOLVERLOS AL INVENTARIO
    const insumosToRead = new Set<string>();
    const productosToRead = new Set<string>();

    for (const item of items) {
      if (item.id.startsWith('quick-')) continue;
      const receta = recetasMap.get(item.id);
      if (receta && receta.ingredientes && receta.ingredientes.length > 0) {
        for (const ing of receta.ingredientes) {
          insumosToRead.add(ing.insumoId);
        }
      } else {
        productosToRead.add(item.id);
      }
    }

    const insumosMap = new Map<string, any>();
    for (const insumoId of insumosToRead) {
      const insumoRef = doc(db, "insumos", insumoId);
      const insumoSnap = await transaction.get(insumoRef);
      if (insumoSnap.exists()) {
        insumosMap.set(insumoId, { ref: insumoRef, data: insumoSnap.data() });
      }
    }

    const productosMap = new Map<string, any>();
    for (const productoId of productosToRead) {
      const productoRef = doc(db, "productos", productoId);
      const productoSnap = await transaction.get(productoRef);
      if (productoSnap.exists()) {
        productosMap.set(productoId, { ref: productoRef, data: productoSnap.data() });
      }
    }

    // 3. FASE DE ESCRITURAS (Writes)
    const insumosDevoluciones = new Map<string, number>();
    const productosDevoluciones = new Map<string, number>();

    for (const item of items) {
      if (item.id.startsWith('quick-')) continue;
      const receta = recetasMap.get(item.id);
      
      if (receta && receta.ingredientes && receta.ingredientes.length > 0) {
        for (const ing of receta.ingredientes) {
          const currentDevolucion = insumosDevoluciones.get(ing.insumoId) || 0;
          insumosDevoluciones.set(ing.insumoId, currentDevolucion + (ing.cantidad * item.cantidad));
        }
      } else {
        const currentDevolucion = productosDevoluciones.get(item.id) || 0;
        productosDevoluciones.set(item.id, currentDevolucion + item.cantidad);
      }
    }

    // Aplicar escrituras para devolver inventario
    for (const [insumoId, qtyDev] of insumosDevoluciones.entries()) {
      const insumo = insumosMap.get(insumoId);
      if (insumo) {
        const currentStock = insumo.data.stock || 0;
        transaction.update(insumo.ref, { stock: currentStock + qtyDev });
      }
    }

    for (const [productoId, qtyDev] of productosDevoluciones.entries()) {
      const producto = productosMap.get(productoId);
      if (producto) {
        const currentStock = producto.data.stock || 0;
        transaction.update(producto.ref, { stock: currentStock + qtyDev });
      }
    }

    // 4. Actualizar estado de la venta a anulada
    transaction.update(ventaRef, { estado: 'anulada' });

    // 5. Revertir movimientos financieros (espejo exacto de la venta original)
    const cuentaMap: Record<string, { nombre: string }> = {
      'caja-principal': { nombre: 'Caja Registradora' },
      'bancolombia':    { nombre: 'Bancolombia' },
    };

    const revertirMovimiento = (cuentaId: string, monto: number) => {
      if (monto <= 0 || !cuentaMap[cuentaId]) return;
      transaction.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(-monto) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), {
        cuentaId,
        cuentaNombre: cuentaMap[cuentaId].nombre,
        tipo: 'egreso',
        monto,
        concepto: `Anulación venta #${ventaData.consecutivo}`,
        categoria: 'anulacion_venta',
        referencia: id,
        usuarioId: ventaData.cajeroId || '',
        usuarioNombre: ventaData.cajeroNombre || ventaData.cajeroId || '',
        espacioId: ventaData.espacioId ?? null,
        fecha: serverTimestamp(),
      });
    };

    const metodoPago: string = ventaData.metodoPago || '';
    const total: number = ventaData.totales?.total || 0;

    if (metodoPago === 'efectivo') {
      revertirMovimiento('caja-principal', total);
    } else if (metodoPago === 'transferencia') {
      revertirMovimiento('bancolombia', total);
    } else if (metodoPago === 'mixto') {
      const detalle: Array<{ metodo: string; monto: number }> = ventaData.pagoMixtoDetalle || [];
      for (const pago of detalle) {
        if (pago.metodo === 'efectivo') revertirMovimiento('caja-principal', pago.monto);
        else if (pago.metodo === 'transferencia') revertirMovimiento('bancolombia', pago.monto);
      }
    } else if (metodoPago === 'cuenta_cobro') {
      // El recaudo (marcarComoPagada) sí registra el ingreso — revertirlo si ya fue cobrado
      if (ventaData.estado === 'pagada' && ventaData.metodoPagoFinal) {
        const cuentaId = ventaData.metodoPagoFinal === 'efectivo' ? 'caja-principal' : 'bancolombia';
        revertirMovimiento(cuentaId, total);
      }
      // Si estado === 'pendiente': nunca se contabilizó → sin reversión
    }
    // 'tarjeta'/'otros': ninguna cuenta fue acreditada al vender → sin reversión
  });
}
