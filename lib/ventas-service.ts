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
  setDoc,
  deleteDoc,
  limit,
  Timestamp,
  type Unsubscribe,
  type Transaction,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import { aplicarMovimientosEnTransaccion, type EmitirMovimientoParams } from "@/lib/inventario-ledger";
import type { ImpuestoTipo, RegimenTributario } from "@/lib/impuestos-service";
import type { ModificadorGrupoSnapshot } from '@/lib/configured-line';
import { getEmpresaId, tenantQuery, withEmpresaId } from "@/lib/tenant";

export interface VentaItem {
  id: string; // ID del producto
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  subtotal: number;
  // Contrato U4 de línea configurada. Opcional para ventas históricas.
  schemaVersion?: 1;
  configurationKey?: string;
  precioBaseUnitario?: number;
  codigo?: string;
  categoria?: string;
  modificadores?: ModificadorGrupoSnapshot[];
  // ADR-TRIB-001 D6/INV-5: snapshot tributario congelado de la línea.
  // Opcionales: ventas anteriores a ADR-TRIB-001 no los tienen (dual-shape).
  base?: number;
  impuestoTipo?: ImpuestoTipo;
  impuestoTarifa?: number;
  impuestoValor?: number;
}

export interface PagoMixtoDetalle {
  metodo: 'efectivo' | 'transferencia' | 'tarjeta';
  monto: number;
}

const METODOS_MIXTO_PERMITIDOS: readonly PagoMixtoDetalle['metodo'][] = ['efectivo', 'transferencia', 'tarjeta'];

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
  // ADR-TRIB-001 D6: desglose por tipo (reemplaza {subtotal, iva, impoconsumo}).
  totales: {
    subtotalBase: number;
    totalINC: number;
    totalExcluido: number;
    total: number;
  };
  // ADR-TRIB-001 D6: régimen tributario vigente al momento de la venta.
  regimenAlMomento: RegimenTributario;
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
  empresaId: string,
  extraVentaFields?: Record<string, unknown>,
): Promise<{ consecutivo: number, incidencias: IncidenciaInventario[] }> {
  const incidencias: IncidenciaInventario[] = [];

  // I7: pago mixto debe conciliar exactamente contra el total antes de tocar
  // inventario o tesorería — ninguna pierna fuera de {efectivo,transferencia,tarjeta}
  // (cuenta_cobro explícitamente excluida) y Σ(monto) === totales.total.
  // Dominio COP entero: igualdad exacta, sin tolerancias.
  if (params.metodoPago === 'mixto') {
    const detalle = params.pagoMixtoDetalle;
    if (!detalle || detalle.length === 0) {
      throw new Error('Pago mixto requiere pagoMixtoDetalle con al menos una pierna.');
    }
    for (const pago of detalle) {
      if (!METODOS_MIXTO_PERMITIDOS.includes(pago.metodo)) {
        throw new Error(`Método de pago mixto no permitido: ${pago.metodo}`);
      }
      if (!Number.isFinite(pago.monto) || pago.monto <= 0) {
        throw new Error('Cada pierna del pago mixto debe tener un monto positivo.');
      }
    }
    const sumaDetalle = detalle.reduce((acc, pago) => acc + pago.monto, 0);
    if (sumaDetalle !== params.totales.total) {
      throw new Error(
        `La suma del pago mixto (${sumaDetalle}) no coincide con el total de la venta (${params.totales.total}).`
      );
    }
  }

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

  // ── Detectar incidencias y construir lote Ledger (I15) ────────────────────
  // Items efímeros (foto-*, quick-*) nunca resuelven a un documento real en
  // insumosMap / productosMap, por lo que la guarda `if (insumo)` / `if (producto)`
  // los excluye automáticamente del lote; ningún movimiento de Ledger se emite.
  const paramsMovimientos: EmitirMovimientoParams[] = [];

  for (const [insumoId, qtyDesc] of insumosDescuentos.entries()) {
    if (qtyDesc <= 0) continue;
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
      // consumo_receta: insumo descargado por receta de un producto vendido.
      // costoUnitario = costo vigente del insumo en el instante de la venta (I7).
      paramsMovimientos.push({
        empresaId,
        articuloTipo:        "insumo",
        articuloId:          insumoId,
        articuloNombre:      insumo.data.nombre ?? insumoId,
        unidad:              insumo.data.unidadMedida ?? "und",
        tipo:                "consumo_receta",
        cantidad:            -qtyDesc,
        costoUnitario:       insumo.data.costo ?? 0,
        espacioId:           params.espacioId ?? "",
        usuarioId:           params.cajeroId,
        usuarioNombre:       params.cajeroNombre ?? params.cajeroId,
        claveIdempotencia:   `consumo_receta:${ventaDocRef.id}:insumo:${insumoId}:0`,
        referenciaColeccion: "ventas",
        referenciaId:        ventaDocRef.id,
      });
    }
  }

  for (const [productoId, qtyDesc] of productosDescuentos.entries()) {
    if (qtyDesc <= 0) continue;
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
      // venta: descuento directo de producto (sin receta).
      // costoUnitario = costo vigente del producto en el instante de la venta (I7).
      paramsMovimientos.push({
        empresaId,
        articuloTipo:        "producto",
        articuloId:          productoId,
        articuloNombre:      producto.data.nombre ?? productoId,
        unidad:              producto.data.unidad ?? "und",
        tipo:                "venta",
        cantidad:            -qtyDesc,
        costoUnitario:       producto.data.costo ?? 0,
        espacioId:           params.espacioId ?? "",
        usuarioId:           params.cajeroId,
        usuarioNombre:       params.cajeroNombre ?? params.cajeroId,
        claveIdempotencia:   `venta:${ventaDocRef.id}:producto:${productoId}:0`,
        referenciaColeccion: "ventas",
        referenciaId:        ventaDocRef.id,
      });
    }
  }

  // El Ledger actualiza stock y secuenciaLedger co-atómicamente (I5).
  // Todas las lecturas del helper ocurren en su Fase 1, antes de cualquier
  // escritura; reads-before-writes se mantiene para toda la transacción.
  if (paramsMovimientos.length > 0) {
    await aplicarMovimientosEnTransaccion(transaction, paramsMovimientos);
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
  transaction.set(ventaDocRef, withEmpresaId(empresaId, ventaDataClean));

  if (params.estado === 'pagada') {
    const cuentaMap: Record<string, { nombre: string }> = {
      'caja-principal': { nombre: 'Caja Registradora' },
      'bancolombia':    { nombre: 'Bancolombia' },
    };

    const registrarMovimiento = (cuentaId: string, monto: number) => {
      if (monto <= 0 || !cuentaMap[cuentaId]) return;
      transaction.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(monto) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
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
      }));
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
  // MT-U3 Capa 2: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId();

  await runTransaction(db, async (transaction) => {
    resultado = await _ejecutarVenta(transaction, params, nuevaVentaDoc, empresaId);
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
  // MT-U3 Capa 2: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId();

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
      transaction, params, nuevaVentaDoc, empresaId, { pedidoId }
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

const HISTORIAL_VENTAS_LIMIT = 100;
// IMP-13 (MT-U3 §10 R7): el rango de fechas no tenía cota — a escala N-tenant
// una query sin límite es un incidente de costo. Cota generosa que no cambia
// el resultado observado hoy (volumen actual muy por debajo de este umbral).
const HISTORIAL_VENTAS_RANGO_LIMIT = 5000;

/**
 * Sin `rangoFecha`: acota a las HISTORIAL_VENTAS_LIMIT ventas más recientes.
 * Con `rangoFecha`: filtra por ese rango, acotado a HISTORIAL_VENTAS_RANGO_LIMIT
 * para preservar la búsqueda de cualquier fecha histórica sin dejar la query sin cota.
 */
export function suscribirHistorialVentas(
  espacioId: string | undefined,
  callback: (ventas: any[]) => void,
  rangoFecha?: { desde: Date; hasta: Date }
): Unsubscribe {
  const filtros = [
    ...(espacioId ? [where("espacioId", "==", espacioId)] : []),
    ...(rangoFecha
      ? [
          where("fecha", ">=", Timestamp.fromDate(rangoFecha.desde)),
          where("fecha", "<=", Timestamp.fromDate(rangoFecha.hasta)),
        ]
      : []),
    orderBy("fecha", "desc"),
    limit(rangoFecha ? HISTORIAL_VENTAS_RANGO_LIMIT : HISTORIAL_VENTAS_LIMIT),
  ];

  let unsubscribe = () => {};
  let cancelado = false;

  tenantQuery(collection(db, "ventas"), ...filtros).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
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
          // Shape histórico (pre ADR-TRIB-001): {subtotal, iva, impoconsumo}.
          subtotal_ventas: data.totales?.subtotal || data.totales?.total || 0,
          iva_total: data.totales?.iva || 0,
          impoconsumo_total: data.totales?.impoconsumo || 0,
          // Shape nuevo (ADR-TRIB-001 D6): {subtotalBase, totalINC, totalExcluido}.
          // Ambos coexisten (dual-shape): una venta solo tiene uno u otro poblado.
          subtotal_base: data.totales?.subtotalBase ?? 0,
          total_inc: data.totales?.totalINC ?? 0,
          total_excluido: data.totales?.totalExcluido ?? 0,
          total: data.totales?.total || 0,
          metodo_pago: data.metodoPago || 'efectivo',
        };
      });
      callback(ventas);
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

export async function obtenerVentaPorId(id: string): Promise<any> {
  const snap = await getDoc(doc(db, "ventas", id));
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  return null;
}

// Metadatos de emisión electrónica congelados en la propia Venta (bloque
// `dian`), fuente única para la reimpresión fiel de una Factura Electrónica
// de Venta — reemplaza la dependencia de SQLite (facturas_electronicas).
export interface DianMetadata {
  cufe: string;
  qr: string;
  numero: string;
  prefijo: string;
  pdfUrl: string;
  resolucion: string;
  emitidoEn: Timestamp;
}

/**
 * Congela los metadatos DIAN en `ventas/{id}.dian` tras una emisión exitosa
 * de Factus. Merge-only sobre el bloque `dian`: no toca `estado`, por lo que
 * permanece dentro de la rama "operativo normal" de las reglas Firestore
 * (no requiere cambio de reglas). Idempotente: reescribir el mismo bloque
 * produce el mismo estado, seguro ante reintentos.
 */
export async function guardarMetadatosDian(
  ventaId: string,
  dian: Omit<DianMetadata, "emitidoEn">
): Promise<void> {
  const ventaRef = doc(db, "ventas", ventaId);
  await setDoc(ventaRef, { dian: { ...dian, emitidoEn: serverTimestamp() } }, { merge: true });
}

export async function anularVenta(id: string): Promise<void> {
  const ventaRef = doc(db, "ventas", id);

  const auth = getAuth();
  const anulador = auth.currentUser;
  const anuladorId = anulador?.uid ?? '';
  const anuladorNombre = anulador?.displayName ?? anulador?.email ?? anuladorId;
  // MT-U3 Capa 2: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId();

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

    // Contramovimientos Ledger (I3, PR5) — devolucion_venta para productos e insumos.
    const paramsMovimientos: EmitirMovimientoParams[] = [];

    for (const [insumoId, qtyDev] of insumosDevoluciones.entries()) {
      if (qtyDev <= 0) continue;
      const insumo = insumosMap.get(insumoId);
      if (insumo) {
        paramsMovimientos.push({
          empresaId,
          articuloTipo:            "insumo",
          articuloId:              insumoId,
          articuloNombre:          insumo.data.nombre ?? insumoId,
          unidad:                  insumo.data.unidadMedida ?? "und",
          tipo:                    "devolucion_venta",
          cantidad:                qtyDev,
          costoUnitario:           insumo.data.costo ?? 0,
          espacioId:               ventaData.espacioId ?? "",
          usuarioId:               ventaData.cajeroId || "",
          usuarioNombre:           ventaData.cajeroNombre ?? ventaData.cajeroId ?? "",
          claveIdempotencia:       `devolucion_venta:${id}:insumo:${insumoId}:0`,
          referenciaColeccion:     "ventas",
          referenciaId:            id,
          movimientoRelacionadoId: `consumo_receta:${id}:insumo:${insumoId}:0`,
        });
      }
    }

    for (const [productoId, qtyDev] of productosDevoluciones.entries()) {
      if (qtyDev <= 0) continue;
      const producto = productosMap.get(productoId);
      if (producto) {
        paramsMovimientos.push({
          empresaId,
          articuloTipo:            "producto",
          articuloId:              productoId,
          articuloNombre:          producto.data.nombre ?? productoId,
          unidad:                  producto.data.unidad ?? "und",
          tipo:                    "devolucion_venta",
          cantidad:                qtyDev,
          costoUnitario:           producto.data.costo ?? 0,
          espacioId:               ventaData.espacioId ?? "",
          usuarioId:               ventaData.cajeroId || "",
          usuarioNombre:           ventaData.cajeroNombre ?? ventaData.cajeroId ?? "",
          claveIdempotencia:       `devolucion_venta:${id}:producto:${productoId}:0`,
          referenciaColeccion:     "ventas",
          referenciaId:            id,
          movimientoRelacionadoId: `venta:${id}:producto:${productoId}:0`,
        });
      }
    }

    if (paramsMovimientos.length > 0) {
      await aplicarMovimientosEnTransaccion(transaction, paramsMovimientos);
    }

    // 4. Actualizar estado de la venta a anulada (con rastro inmutable del anulador)
    transaction.update(ventaRef, {
      estado: 'anulada',
      anuladaPor: anuladorId,
      anuladaPorNombre: anuladorNombre,
      anuladaEn: serverTimestamp(),
    });

    // 5. Revertir movimientos financieros (espejo exacto de la venta original)
    const cuentaMap: Record<string, { nombre: string }> = {
      'caja-principal': { nombre: 'Caja Registradora' },
      'bancolombia':    { nombre: 'Bancolombia' },
    };

    const revertirMovimiento = (cuentaId: string, monto: number) => {
      if (monto <= 0 || !cuentaMap[cuentaId]) return;
      transaction.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(-monto) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
        cuentaId,
        cuentaNombre: cuentaMap[cuentaId].nombre,
        tipo: 'egreso',
        monto,
        concepto: `Anulación venta #${ventaData.consecutivo}`,
        categoria: 'anulacion_venta',
        referencia: id,
        usuarioId: anuladorId,
        usuarioNombre: anuladorNombre,
        espacioId: ventaData.espacioId ?? null,
        fecha: serverTimestamp(),
      }));
    };

    // Validar fondos antes de revertir: acumular débitos por cuenta y verificar
    const metodoPago: string = ventaData.metodoPago || '';
    const total: number = ventaData.totales?.total || 0;
    const debitosPorCuenta = new Map<string, number>();

    if (metodoPago === 'efectivo') {
      debitosPorCuenta.set('caja-principal', total);
    } else if (metodoPago === 'transferencia') {
      debitosPorCuenta.set('bancolombia', total);
    } else if (metodoPago === 'mixto') {
      const detalle: Array<{ metodo: string; monto: number }> = ventaData.pagoMixtoDetalle || [];
      for (const pago of detalle) {
        if (pago.metodo === 'efectivo') {
          debitosPorCuenta.set('caja-principal', (debitosPorCuenta.get('caja-principal') || 0) + pago.monto);
        } else if (pago.metodo === 'transferencia') {
          debitosPorCuenta.set('bancolombia', (debitosPorCuenta.get('bancolombia') || 0) + pago.monto);
        }
      }
    } else if (metodoPago === 'cuenta_cobro') {
      if (ventaData.estado === 'pagada' && ventaData.metodoPagoFinal) {
        const cuentaId = ventaData.metodoPagoFinal === 'efectivo' ? 'caja-principal' : 'bancolombia';
        debitosPorCuenta.set(cuentaId, total);
      }
    }

    for (const [cuentaId, montoADebitar] of debitosPorCuenta.entries()) {
      if (montoADebitar <= 0 || !cuentaMap[cuentaId]) continue;
      const cuentaSnap = await transaction.get(doc(db, 'cuentas_bancarias', cuentaId));
      if (!cuentaSnap.exists()) throw new Error(`La cuenta ${cuentaMap[cuentaId].nombre} no existe.`);
      const saldoDisponible = Number(cuentaSnap.data().saldo ?? 0);
      if (saldoDisponible < montoADebitar) {
        throw new Error(
          `Fondos insuficientes en ${cuentaMap[cuentaId].nombre} para anular la venta #${ventaData.consecutivo}. Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')} — Monto a revertir: $${montoADebitar.toLocaleString('es-CO')}.`
        );
      }
    }

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
