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

    // Todas las lecturas (autoridad, hechos comerciales, cuenta, turno y venta)
    // ya ocurrieron; el ledger estricto conserva sus propias lecturas antes de escribir.
    let movimientosInventario;
    try {
      movimientosInventario = await aplicarConsumosInventarioBodegaEnTransaccion(tx, firestore, resolucion, ventaId);
    } catch (error) {
      // El ledger es una primitiva neutral y expresa este límite con Error;
      // el boundary callable debe conservar el contrato Https de Bodega.
      if (error instanceof Error && error.message === "STOCK_INSUFICIENTE") {
        fail("failed-precondition", "STOCK_INSUFICIENTE");
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
    });
    if (solicitudRef) tx.update(solicitudRef, {
      estado: "EJECUTADA", ejecucion: { actorUid, revision: solicitud?.revision, ventaId, commandId: comando.commandId },
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    return {
      commandId: comando.commandId, ventaId, estadoOperativo: "COMPLETO" as const,
      metodoPago: comando.payload.metodoPago, total,
      ...(solicitudId ? { solicitudId } : {}),
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
