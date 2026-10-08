import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import {
  crearHuellaSemantica,
  executeConContexto,
  resolverCuentaOperativa,
  resolverTurnoRecaudoPropioEnTransaccion,
  writeMovement,
  type ContextoFinancieroOperativo,
} from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { SCHEMA_VERSION_VENTA_BODEGA, normalizarComandoConfirmacionVentaBodega, type ComandoConfirmacionVentaBodega, type LineaVentaBodegaPersistida } from "./ventas-contract";
import { aplicarConsumosInventarioBodegaEnTransaccion, resolverVentaBodegaEnTransaccion } from "./ventas-resolution";
import { esCambioComercialNoVigente, proyectarComercialSolicitud } from "./solicitudes-venta";

const REGION = "us-central1";
const AGENDA = "agenda_pedidos_bodega";
const RESERVAS = "reservas_stock_bodega";
const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "No fue posible confirmar la venta Bodega.", { code: domain });
};

function sumaSegura(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total <= 0) fail("failed-precondition", "TOTAL_BODEGA_INVALIDO");
  return total;
}

function lineasPersistidas(lineas: Awaited<ReturnType<typeof resolverVentaBodegaEnTransaccion>>["lineas"]): LineaVentaBodegaPersistida[] {
  return lineas.map(linea => ({
    ...linea,
    id: linea.productoId,
    nombre: linea.productoNombreSnapshot,
    cantidad: linea.cantidadPresentaciones,
    precioUnitario: linea.precioPresentacionCOP,
    subtotal: linea.subtotalCOP,
    costoUnitario: linea.costoPresentacionCOP,
  }));
}

function millis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis(): number }).toMillis();
  return null;
}

function huellaLineasAgenda(lines: unknown): string {
  if (!Array.isArray(lines)) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
  const normalized = (lines as unknown[]).map((line: any) => {
    if (!line || typeof line.productoId !== "string" || typeof line.presentacionId !== "string"
      || !Number.isSafeInteger(line.cantidad) || line.cantidad <= 0) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
    return { productoId: line.productoId, presentacionId: line.presentacionId, cantidad: line.cantidad };
  }).sort((a: any, b: any) => `${a.productoId}:${a.presentacionId}`.localeCompare(`${b.productoId}:${b.presentacionId}`));
  return crearHuellaSemantica(normalized);
}

async function prepararConsumoReservaAgenda(tx: any, db: any, empresaId: string, solicitud: Record<string, any>, resolucion: Awaited<ReturnType<typeof resolverVentaBodegaEnTransaccion>>, now: number) {
  if (!solicitud.programacionId) {
    if (Array.isArray(solicitud.reservaIds) && solicitud.reservaIds.length > 0) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
    return null;
  }
  if (typeof solicitud.programacionId !== "string" || solicitud.programacionId.length > 512
    || !Array.isArray(solicitud.reservaIds) || solicitud.reservaIds.length === 0) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
  const agendaRef = db.collection("empresas").doc(empresaId).collection(AGENDA).doc(solicitud.programacionId);
  const agendaSnap = await tx.get(agendaRef);
  const agendaValue = agendaSnap.data() as Record<string, any> | undefined;
  if (!agendaSnap.exists || !agendaValue) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
  const agenda = agendaValue as Record<string, any>;
  if (agenda.empresaId !== empresaId || agenda.programacionId !== solicitud.programacionId
    || agenda.solicitanteUid !== solicitud.solicitanteUid || agenda.solicitudId !== solicitud.solicitudId
    || !["CONVERTIDA_A_SOLICITUD", "VENCIDA"].includes(agenda.estado)) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
  if (huellaLineasAgenda(agenda.lineas) !== huellaLineasAgenda(solicitud.intentoLineas)) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");

  const expected = new Map<string, number>();
  for (const line of agenda.lineas) {
    const total = (expected.get(line.productoId) ?? 0) + line.cantidadUnidadBase;
    if (!Number.isSafeInteger(total) || total <= 0) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
    expected.set(line.productoId, total);
  }
  const resolved = new Map(resolucion.consumos.map(consumo => [consumo.productoId, consumo.cantidadUnidadBase]));
  if (expected.size !== resolved.size || [...expected].some(([productId, quantity]) => resolved.get(productId) !== quantity)) {
    fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");
  }

  const expectedReservationIds = [...expected.keys()].map(productId => crearIdentificadorInterno(empresaId, `agenda-hold:${solicitud.programacionId}:${productId}`)).sort();
  const storedReservationIds = [...solicitud.reservaIds].filter((id: unknown): id is string => typeof id === "string").sort();
  const agendaReservationIds = Array.isArray(agenda.reservaIds) ? [...agenda.reservaIds].sort() : [];
  if (expectedReservationIds.length !== storedReservationIds.length
    || expectedReservationIds.some((id, index) => id !== storedReservationIds[index])
    || expectedReservationIds.some((id, index) => id !== agendaReservationIds[index])) fail("failed-precondition", "AGENDA_SOLICITUD_INCONSISTENTE");

  const reservas = new Map<string, { ref: any; data: Record<string, any>; estadoFinal: "CONSUMIDA" | "VENCIDA" }>();
  const efectos = new Map<string, { consumir?: number; liberar?: number }>();
  for (const productId of expected.keys()) {
    const reservationId = crearIdentificadorInterno(empresaId, `agenda-hold:${solicitud.programacionId}:${productId}`);
    const ref = db.collection("empresas").doc(empresaId).collection(RESERVAS).doc(reservationId);
    const snap = await tx.get(ref);
    const dataValue = snap.data() as Record<string, any> | undefined;
    const quantity = expected.get(productId)!;
    if (!snap.exists || !dataValue) fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
    const data = dataValue as Record<string, any>;
    if (data.empresaId !== empresaId || data.programacionId !== solicitud.programacionId
      || data.productoId !== productId || data.cantidadUnidadBase !== quantity) fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
    if (data.estado === "ACTIVA") {
      const expiration = millis(data.expiraEn);
      if (expiration === null) fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
      const expira = expiration as number;
      if (expira > now) {
        if (agenda.estado === "VENCIDA") fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
        efectos.set(productId, { consumir: quantity });
        reservas.set(reservationId, { ref, data, estadoFinal: "CONSUMIDA" });
      } else {
        efectos.set(productId, { liberar: quantity });
        reservas.set(reservationId, { ref, data, estadoFinal: "VENCIDA" });
      }
    } else if (data.estado === "VENCIDA") {
      // El worker ya liberó la proyección: la venta debe competir por el stock disponible actual.
    } else {
      fail("failed-precondition", "AGENDA_RESERVA_NO_DISPONIBLE");
    }
  }
  return { agendaRef, agenda, reservas, efectos };
}

/** U3-C: única materialización Bodega, compuesta en una transacción idempotente. */
export async function ejecutarConfirmarVentaBodegaV1(db: any, contexto: ContextoFinancieroOperativo, raw: unknown) {
  const comando = normalizarComandoConfirmacionVentaBodega(raw);
  return executeConContexto(db, contexto, comando, "confirmarVentaBodegaV1", async (tx, firestore, empresaId, actorUid, rol) => {
    const solicitudId = comando.payload.solicitudId;
    if (rol === "vendedor" && !solicitudId) fail("failed-precondition", "SOLICITUD_APROBACION_REQUERIDA");
    if (rol === "admin" && solicitudId) fail("invalid-argument", "ADMIN_NO_CONSUME_SOLICITUD");
    if (rol !== "vendedor" && rol !== "admin") fail("permission-denied", "ROL_VENTA_BODEGA_REQUERIDO");

    let solicitudRef: any = null;
    let solicitud: Record<string, any> | null = null;
    if (solicitudId) {
      solicitudRef = firestore.collection("empresas").doc(empresaId).collection("solicitudes_venta_bodega").doc(solicitudId);
      const solicitudSnap = await tx.get(solicitudRef);
      if (!solicitudSnap.exists || solicitudSnap.data()?.empresaId !== empresaId || solicitudSnap.data()?.solicitanteUid !== actorUid) {
        fail("not-found", "SOLICITUD_NO_ENCONTRADA");
      }
      solicitud = solicitudSnap.data() as Record<string, any>;
      const approval = solicitud.aprobacion as Record<string, any> | undefined;
      const expiryMillis = typeof approval?.expiraEn?.toMillis === "function" ? approval.expiraEn.toMillis() : null;
      if (solicitud.estado !== "APROBADA" || !approval || approval.revision !== solicitud.revision
        || approval.huellaComercial !== solicitud.huellaComercial || approval.totalCOP !== solicitud.totalCOP) {
        fail("failed-precondition", "SOLICITUD_NO_APROBADA");
      }
      if (expiryMillis === null || expiryMillis <= Date.now()) fail("failed-precondition", "SOLICITUD_APROBACION_EXPIRADA");
      const submittedIntent = crearHuellaSemantica({ clienteId: comando.payload.clienteId, lineas: comando.payload.lineas });
      const approvedIntent = crearHuellaSemantica({ clienteId: solicitud.clienteId, lineas: solicitud.intentoLineas });
      if (submittedIntent !== approvedIntent) fail("failed-precondition", "SOLICITUD_CONTENIDO_NO_COINCIDE");
    }

    let resolucion: Awaited<ReturnType<typeof resolverVentaBodegaEnTransaccion>>;
    try { resolucion = await resolverVentaBodegaEnTransaccion(tx, firestore, contexto, comando); }
    catch (error) {
      if (!solicitud || !esCambioComercialNoVigente(error)) throw error;
      tx.update(solicitudRef, { estado: "INVALIDADA", motivoInvalidacion: "CATALOGO_CAMBIADO", actualizadaEn: FieldValue.serverTimestamp() });
      return {
        commandId: comando.commandId, solicitudId, estado: "INVALIDADA", estadoOperativo: "SOLICITUD_INVALIDADA",
        motivo: "CATALOGO_CAMBIADO",
      };
    }
    if (solicitud) {
      const comercialVigente = proyectarComercialSolicitud(resolucion);
      const approval = solicitud.aprobacion as Record<string, any>;
      if (comercialVigente.huellaComercial !== approval.huellaComercial) {
        tx.update(solicitudRef, { estado: "INVALIDADA", motivoInvalidacion: "CATALOGO_CAMBIADO", actualizadaEn: FieldValue.serverTimestamp() });
        return {
          commandId: comando.commandId, solicitudId, estado: "INVALIDADA", estadoOperativo: "SOLICITUD_INVALIDADA",
          motivo: "CATALOGO_CAMBIADO",
        };
      }
    }
    const total = sumaSegura(resolucion.lineas.map(linea => linea.subtotalCOP));
    const esEfectivo = comando.payload.metodoPago === "efectivo";
    const cuenta = await resolverCuentaOperativa(tx, firestore, empresaId, esEfectivo ? "caja-principal" : "bancolombia");
    const turnoId = esEfectivo
      ? await resolverTurnoRecaudoPropioEnTransaccion(tx, firestore, empresaId, actorUid)
      : null;
    const ventaId = crearIdentificadorInterno(empresaId, `venta-bodega:${comando.commandId}`);
    const ventaRef = firestore.collection("ventas").doc(ventaId);
    if ((await tx.get(ventaRef)).exists) fail("already-exists", "COMMAND_ID_CONFLICT");
    const reservaAgenda = solicitud
      ? await prepararConsumoReservaAgenda(tx, firestore, empresaId, solicitud, resolucion, Date.now())
      : null;

    // Todas las lecturas (autoridad, hechos comerciales, cuenta, turno y venta)
    // ya ocurrieron; el ledger estricto conserva sus propias lecturas antes de escribir.
    let movimientosInventario;
    try {
      movimientosInventario = await aplicarConsumosInventarioBodegaEnTransaccion(tx, firestore, resolucion, ventaId, reservaAgenda?.efectos);
    } catch (error) {
      // El ledger es una primitiva neutral y expresa este límite con Error;
      // el boundary callable debe conservar el contrato Https de Bodega.
      if (error instanceof Error) {
        if (error.message === "STOCK_INSUFICIENTE" || error.message === "STOCK_DISPONIBLE_INSUFICIENTE") {
          fail("failed-precondition", "STOCK_INSUFICIENTE");
        }
        if (["STOCK_RESERVADO_INSUFICIENTE", "STOCK_RESERVADO_INVALIDO"].includes(error.message)) {
          fail("failed-precondition", "AGENDA_RESERVA_INCONSISTENTE");
        }
      }
      throw error;
    }
    const ingreso = writeMovement(tx, firestore, {
      empresaId, command: comando, key: `venta-bodega:${comando.commandId}:pago`, account: cuenta,
      tipo: "ingreso", monto: total, categoria: "ventas", actorUid, rol, turnoId, ventaId,
    });
    const lineas = lineasPersistidas(resolucion.lineas);
    tx.create(ventaRef, {
      id: ventaId, empresaId, schemaVersion: SCHEMA_VERSION_VENTA_BODEGA,
      estado: "pagada", estadoOperativo: "COMPLETO", modoOperacion: "BODEGA_MVP1",
      cajeroId: actorUid,
      clienteId: resolucion.cliente.id, clienteNombreSnapshot: resolucion.cliente.nombre,
      clienteDocumentoSnapshot: resolucion.cliente.cedula, items: lineas,
      metodoPago: comando.payload.metodoPago, pago: { metodo: comando.payload.metodoPago },
      turnoId, totales: { subtotal: total, impuestos: 0, total },
      commandId: comando.commandId, idempotencyKey: comando.idempotencyKey,
      correlationId: comando.correlationId, causationId: comando.causationId,
      fecha: FieldValue.serverTimestamp(), efectosOperativosEn: FieldValue.serverTimestamp(),
      ...(reservaAgenda ? { programacionId: solicitud?.programacionId } : {}),
    });
    if (solicitudRef) tx.update(solicitudRef, {
      estado: "EJECUTADA", ejecucion: { actorUid, revision: solicitud?.revision, ventaId, commandId: comando.commandId },
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    if (reservaAgenda) {
      for (const reserva of reservaAgenda.reservas.values()) {
        tx.update(reserva.ref, {
          estado: reserva.estadoFinal,
          ...(reserva.estadoFinal === "CONSUMIDA" ? { consumidaEn: FieldValue.serverTimestamp(), ventaId } : { vencidaEn: FieldValue.serverTimestamp() }),
          actualizadaEn: FieldValue.serverTimestamp(),
        });
      }
      tx.update(reservaAgenda.agendaRef, {
        estado: "CUMPLIDA", revision: reservaAgenda.agenda.revision + 1,
        ventaId, cumplidaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp(),
      });
    }
    return {
      commandId: comando.commandId, ventaId, estadoOperativo: "COMPLETO" as const,
      metodoPago: comando.payload.metodoPago, total,
      ...(solicitudId ? { solicitudId } : {}),
      ...(reservaAgenda ? { programacionId: solicitud?.programacionId } : {}),
      movimientoFinancieroId: ingreso.id,
      movimientosInventario: movimientosInventario.map(movimiento => movimiento.id),
      turnoId,
    };
  });
}

export const confirmarVentaBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarConfirmarVentaBodegaV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});
