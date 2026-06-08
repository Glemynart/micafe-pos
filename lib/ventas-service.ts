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
  query,
  orderBy,
  where,
  onSnapshot,
  getDoc,
  deleteDoc,
  type Unsubscribe,
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
export async function registrarVenta(params: CrearVentaParams): Promise<{id: string, consecutivo: number}> {
  const ventasRef = collection(db, "ventas");
  const nuevaVentaDoc = doc(ventasRef); // Generar ID para la nueva venta

  const consecutivoGenerado = await runTransaction(db, async (transaction) => {
    // 1. LEER TODAS LAS RECETAS PRIMERO
    const recetasMap = new Map<string, any>();
    
    for (const item of params.items) {
      if (item.id.startsWith('quick-')) continue;
      const recetaRef = doc(db, "recetas", item.id);
      const recetaSnap = await transaction.get(recetaRef);
      if (recetaSnap.exists()) {
        recetasMap.set(item.id, recetaSnap.data());
      }
    }

    // 2. LEER TODOS LOS INSUMOS Y PRODUCTOS NECESARIOS (Fase de Reads puros)
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

    // LEER CONSECUTIVO ACTUAL (Fase de Reads)
    const configRef = doc(db, "configuracion", "general");
    const configSnap = await transaction.get(configRef);
    let nuevoConsecutivo = 1;
    if (configSnap.exists()) {
      nuevoConsecutivo = (configSnap.data().consecutivo_actual || 0) + 1;
    }

    // 3. FASE DE ESCRITURAS (Writes - Ya no se puede hacer ningún GET después de esto)
    
    // Preparar los descuentos
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

    // Aplicar escrituras de inventario
    for (const [insumoId, qtyDesc] of insumosDescuentos.entries()) {
      const insumo = insumosMap.get(insumoId);
      if (insumo) {
        const currentStock = insumo.data.stock || 0;
        transaction.update(insumo.ref, { stock: currentStock - qtyDesc });
      }
    }

    for (const [productoId, qtyDesc] of productosDescuentos.entries()) {
      const producto = productosMap.get(productoId);
      if (producto) {
        const currentStock = producto.data.stock || 0;
        transaction.update(producto.ref, { stock: currentStock - qtyDesc });
      }
    }

    // ACTUALIZAR CONSECUTIVO (Fase de Writes)
    transaction.set(configRef, { consecutivo_actual: nuevoConsecutivo }, { merge: true });

    // 4. Escribir la venta
    const ahora = new Date();
    const fechaLimiteDIAN =
      params.metodoPago === 'cuenta_cobro'
        ? new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
        : null;

    const ventaData = {
      ...params,
      consecutivo: nuevoConsecutivo,
      fecha: serverTimestamp(),
      ...(fechaLimiteDIAN ? { fechaLimiteDIAN } : {}),
    };
    transaction.set(nuevaVentaDoc, ventaData);
    
    return nuevoConsecutivo;
  });

  return { id: nuevaVentaDoc.id, consecutivo: consecutivoGenerado };
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

export async function eliminarVenta(id: string): Promise<void> {
  await deleteDoc(doc(db, "ventas", id));
}
