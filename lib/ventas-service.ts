/**
 * ventas-service.ts — B7 Cutover y Certificación Final
 *
 * Funciones Firestore para gestionar Ventas, Cuentas por Cobrar y el descuento de stock.
 * Implementa la Saga en 2 Fases con Contrato de Estado Operativo (ADR-SAAS-010):
 *  - Fase 1 (Backend Cloud Functions): `confirmarVentaFiscalCallable`. Genera consecutivo inmutable,
 *    `snapshotFiscal` y establece `estadoOperativo: "PENDIENTE_EFECTOS"`.
 *  - Fase 2 (Cliente POS / Reconciliador): Transacción atómica local Firestore que descuenta el Ledger,
 *    acredita la tesorería y transiciona `estadoOperativo: "COMPLETO"`.
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
  getDocs,
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
import { getFunctions, httpsCallable } from "firebase/functions";
import { aplicarMovimientosEnTransaccion, type EmitirMovimientoParams } from "@/lib/inventario-ledger";
import type { ImpuestoTipo, RegimenTributario } from "@/lib/impuestos-service";
import type { ModificadorGrupoSnapshot } from '@/lib/configured-line';
import { getEmpresaId, tenantQuery, withEmpresaId } from "@/lib/tenant";

export function esVentaCompletada(venta: any): boolean {
  return venta?.estadoOperativo === "COMPLETO";
}

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
  // ADR-TRIB-001 D6: desglose por tipo.
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

export interface IncidenciaInventario {
  tipo: 'stock_insuficiente'
  itemId: string
  itemNombre: string
  stockAnterior: number
  cantidadSolicitada: number
}

/**
 * Consulta la asignación de numeración vigente para el tenant y devuelve los números de revisión esperados.
 */
export async function obtenerRevisionesNumeracionActiva(
  tipoDocumento: string = "pos"
): Promise<{ expectedRevision: number; expectedAsignacionRevision: number }> {
  const empresaId = await getEmpresaId();
  const qAsignacion = query(
    collection(db, "asignaciones_numeracion"),
    where("empresaId", "==", empresaId),
    where("estado", "==", "VIGENTE"),
    where("tipoDocumento", "==", tipoDocumento),
    limit(1)
  );
  const snapAsignacion = await getDocs(qAsignacion);
  if (snapAsignacion.empty) {
    throw new Error("No existe una asignación de numeración vigente para la empresa.");
  }
  const asignacionDocData = snapAsignacion.docs[0].data();
  const expectedAsignacionRevision = asignacionDocData.revision ?? 1;
  const numeracionId = asignacionDocData.numeracionId;

  const numDocRef = doc(db, "numeraciones", `${empresaId}_${numeracionId}`);
  const numSnap = await getDoc(numDocRef);
  if (!numSnap.exists()) {
    throw new Error("La numeración referenciada por la asignación no existe.");
  }
  const expectedRevision = numSnap.data().revision ?? 1;

  return { expectedRevision, expectedAsignacionRevision };
}

/**
 * Fase 2 de la Saga Operativa: Aplica los efectos de inventario (Ledger) y tesorería,
 * y promueve la venta de `PENDIENTE_EFECTOS` a `COMPLETO` dentro de una transacción atómica.
 */
export async function ejecutarFase2OperativaEnTransaccion(
  transaction: Transaction,
  ventaDocRef: DocumentReference,
  params: CrearVentaParams,
  empresaId: string
): Promise<{ incidencias: IncidenciaInventario[] }> {
  const incidencias: IncidenciaInventario[] = [];

  const ventaSnap = await transaction.get(ventaDocRef);
  if (!ventaSnap.exists()) {
    throw new Error("La venta no existe.");
  }
  const ventaData = ventaSnap.data();

  // Guarda de Concurrencia / Idempotencia (ADR-SAAS-010 §5.1)
  if (ventaData.estadoOperativo === "COMPLETO") {
    return { incidencias: [] };
  }
  if (ventaData.estadoOperativo !== "PENDIENTE_EFECTOS") {
    throw new Error(`Estado operativo no permite completar la venta: ${ventaData.estadoOperativo}`);
  }

  // Validación de pago mixto (I7)
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

  // 1. LECTURAS (reads-before-writes)
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

  // 2. ESCRITURAS ATÓMICAS (Fase 2)
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

  if (paramsMovimientos.length > 0) {
    await aplicarMovimientosEnTransaccion(transaction, paramsMovimientos);
  }

  // Actualización a estado COMPLETO
  transaction.update(ventaDocRef, {
    estadoOperativo: "COMPLETO",
    efectosAplicadosEn: serverTimestamp(),
  });

  // Movimientos de tesorería
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
        concepto: `Venta #${ventaData.consecutivo || ''}`,
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

  return { incidencias };
}

/**
 * Registra una venta en Firestore utilizando la Saga en 2 Fases (B7 Cutover).
 */
export async function registrarVenta(
  params: CrearVentaParams
): Promise<{ id: string; consecutivo: number; incidenciasInventario: IncidenciaInventario[] }> {
  const nuevaVentaDoc = doc(collection(db, "ventas"));
  const ventaId = nuevaVentaDoc.id;
  const empresaId = await getEmpresaId();

  // 1. Obtener revisiones de numeración y asignación
  const { expectedRevision, expectedAsignacionRevision } = await obtenerRevisionesNumeracionActiva("pos");

  // 2. FASE 1: Invocación Cloud Function (confirmarVentaFiscal)
  const functions = getFunctions();
  const callConfirmarVenta = httpsCallable<any, { ventaId: string; numero: number; prefijo: string }>(
    functions,
    "confirmarVentaFiscalCallable"
  );

  const payloadFiscal = {
    commandId: `cmd_sale_${ventaId}`,
    idempotencyKey: `idem_sale_${ventaId}`,
    correlationId: `corr_sale_${ventaId}`,
    causationId: `cause_sale_${ventaId}`,
    expectedRevision,
    expectedAsignacionRevision,
    ventaId,
    espacioId: params.espacioId,
    tipoDocumento: "pos",
    venta: {
      items: params.items.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        codigo: item.codigo,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        impuestoTipo: item.impuestoTipo ?? "inc_8",
        impuestoTarifa: item.impuestoTarifa ?? 8,
        impuestoValor: item.impuestoValor ?? 0,
        base: item.base ?? item.subtotal,
      })),
      totales: params.totales,
      metodoPago: params.metodoPago,
      pago: {
        metodo: params.metodoPago,
        recibido: params.dineroRecibido,
        cambio: params.cambio,
      },
      turnoId: params.turnoId,
      cajeroId: params.cajeroId,
      cajeroNombre: params.cajeroNombre,
      clienteId: params.clienteId,
      clienteNombre: params.clienteNombre,
      clienteDocumento: params.clienteDocumento,
      notasFiado: params.notasFiado,
      regimenAlMomento: params.regimenAlMomento,
      estado: params.estado,
      pagoMixto: params.pagoMixto,
      pagoMixtoDetalle: params.pagoMixtoDetalle,
    },
  };

  const resFiscal = await callConfirmarVenta(payloadFiscal);
  const consecutivo = resFiscal.data.numero;

  // 3. FASE 2: Transacción Firestore atómica local (Ledger + Tesorería + COMPLETO)
  let incidencias: IncidenciaInventario[] = [];
  await runTransaction(db, async (transaction) => {
    const resFase2 = await ejecutarFase2OperativaEnTransaccion(
      transaction,
      nuevaVentaDoc,
      params,
      empresaId
    );
    incidencias = resFase2.incidencias;
  });

  return { id: ventaId, consecutivo, incidenciasInventario: incidencias };
}

export type CobrarPedidoResult =
  | { status: 'ok', ventaId: string, consecutivo: number, incidenciasInventario: IncidenciaInventario[] }
  | { status: 'already_paid', ventaId: string }

export async function cobrarPedido(
  params: CrearVentaParams,
  pedidoId: string
): Promise<CobrarPedidoResult> {
  const nuevaVentaDoc = doc(collection(db, "ventas"));
  const ventaId = nuevaVentaDoc.id;
  const empresaId = await getEmpresaId();

  // Validar estado del pedido
  const pedidoRef = doc(db, 'pedidos_activos', pedidoId);
  const pedidoSnap = await getDoc(pedidoRef);
  if (!pedidoSnap.exists()) throw new Error('Pedido no encontrado');

  const pedido = pedidoSnap.data();
  if (!pedido.activo || pedido.estado !== 'abierto') {
    return { status: 'already_paid', ventaId: pedido.ventaId || '' };
  }

  // 1. Obtener revisiones
  const { expectedRevision, expectedAsignacionRevision } = await obtenerRevisionesNumeracionActiva("pos");

  // 2. FASE 1: Invocación Cloud Function
  const functions = getFunctions();
  const callConfirmarVenta = httpsCallable<any, { ventaId: string; numero: number; prefijo: string }>(
    functions,
    "confirmarVentaFiscalCallable"
  );

  const payloadFiscal = {
    commandId: `cmd_sale_${ventaId}`,
    idempotencyKey: `idem_sale_${ventaId}`,
    correlationId: `corr_sale_${ventaId}`,
    causationId: `cause_sale_${ventaId}`,
    expectedRevision,
    expectedAsignacionRevision,
    ventaId,
    espacioId: params.espacioId,
    tipoDocumento: "pos",
    venta: {
      items: params.items.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        codigo: item.codigo,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        impuestoTipo: item.impuestoTipo ?? "inc_8",
        impuestoTarifa: item.impuestoTarifa ?? 8,
        impuestoValor: item.impuestoValor ?? 0,
        base: item.base ?? item.subtotal,
      })),
      totales: params.totales,
      metodoPago: params.metodoPago,
      pago: {
        metodo: params.metodoPago,
        recibido: params.dineroRecibido,
        cambio: params.cambio,
      },
      turnoId: params.turnoId,
      cajeroId: params.cajeroId,
      cajeroNombre: params.cajeroNombre,
      clienteId: params.clienteId,
      clienteNombre: params.clienteNombre,
      clienteDocumento: params.clienteDocumento,
      notasFiado: params.notasFiado,
      regimenAlMomento: params.regimenAlMomento,
      estado: params.estado,
      pedidoId,
    },
  };

  const resFiscal = await callConfirmarVenta(payloadFiscal);
  const consecutivo = resFiscal.data.numero;

  // 3. FASE 2: Transacción local
  let incidencias: IncidenciaInventario[] = [];
  await runTransaction(db, async (transaction) => {
    const comandaIds: string[] = pedido.comandaIds || [];
    const comandaSnaps = await Promise.all(
      comandaIds.map(id => transaction.get(doc(db, 'comandas_cocina', id)))
    );

    const resFase2 = await ejecutarFase2OperativaEnTransaccion(
      transaction,
      nuevaVentaDoc,
      params,
      empresaId
    );
    incidencias = resFase2.incidencias;

    transaction.update(pedidoRef, {
      estado: 'pagado',
      activo: false,
      fechaPago: serverTimestamp(),
      ventaId,
    });

    for (const snap of comandaSnaps) {
      if (snap.exists() && snap.data().estado !== 'entregado') {
        transaction.update(snap.ref, { estado: 'entregado', completadoEn: serverTimestamp() });
      }
    }
  });

  return { status: 'ok', ventaId, consecutivo, incidenciasInventario: incidencias };
}

const HISTORIAL_VENTAS_LIMIT = 100;
const HISTORIAL_VENTAS_RANGO_LIMIT = 5000;

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
          subtotal_ventas: data.totales?.subtotal || data.totales?.total || 0,
          iva_total: data.totales?.iva || 0,
          impoconsumo_total: data.totales?.impoconsumo || 0,
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

export interface DianMetadata {
  cufe: string;
  qr: string;
  numero: string;
  prefijo: string;
  pdfUrl: string;
  resolucion: string;
  emitidoEn: Timestamp;
}

export async function guardarMetadatosDian(
  ventaId: string,
  dian: Omit<DianMetadata, "emitidoEn">
): Promise<void> {
  const ventaRef = doc(db, "ventas", ventaId);
  await setDoc(ventaRef, { dian: { ...dian, emitidoEn: serverTimestamp() } }, { merge: true });
}

/**
 * Máquina de Estados de Anulación según `estadoOperativo` (ADR-SAAS-010 §8).
 */
export async function anularVenta(id: string): Promise<void> {
  const ventaRef = doc(db, "ventas", id);
  const auth = getAuth();
  const anulador = auth.currentUser;
  const anuladorId = anulador?.uid ?? '';
  const anuladorNombre = anulador?.displayName ?? anulador?.email ?? anuladorId;
  const empresaId = await getEmpresaId();

  await runTransaction(db, async (transaction) => {
    const ventaSnap = await transaction.get(ventaRef);
    if (!ventaSnap.exists()) {
      throw new Error("La venta no existe.");
    }

    const ventaData = ventaSnap.data();

    if (
      ventaData.estado === 'anulada' ||
      ventaData.estadoOperativo === 'ANULADA_SIN_EFECTOS' ||
      ventaData.estadoOperativo === 'ANULADA_CON_EFECTOS'
    ) {
      throw new Error("La venta ya ha sido anulada previamente.");
    }

    const estadoOp = ventaData.estadoOperativo ?? "COMPLETO";

    // ── ANULACIÓN PRE-EFECTOS ──────────────────────────────────────────────
    if (estadoOp === "PENDIENTE_EFECTOS") {
      transaction.update(ventaRef, {
        estado: 'anulada',
        estadoOperativo: 'ANULADA_SIN_EFECTOS',
        anuladaPor: anuladorId,
        anuladaPorNombre: anuladorNombre,
        anuladaEn: serverTimestamp(),
      });
      return;
    }

    // ── ANULACIÓN POST-EFECTOS (COMPENSATORIA) ──────────────────────────────
    // 1. LEER RECETAS
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

    // 2. LEER INSUMOS Y PRODUCTOS
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

    // 3. FASE DE ESCRITURAS (Contramovimientos Ledger)
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

    // Actualizar estado de la venta
    transaction.update(ventaRef, {
      estado: 'anulada',
      estadoOperativo: 'ANULADA_CON_EFECTOS',
      anuladaPor: anuladorId,
      anuladaPorNombre: anuladorNombre,
      anuladaEn: serverTimestamp(),
    });

    // 4. Revertir movimientos financieros
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
      if (ventaData.estado === 'pagada' && ventaData.metodoPagoFinal) {
        const cuentaId = ventaData.metodoPagoFinal === 'efectivo' ? 'caja-principal' : 'bancolombia';
        revertirMovimiento(cuentaId, total);
      }
    }
  });
}
