import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import {
  executeConContexto,
  resolverCuentaOperativa,
  resolverTurnoRecaudoPropioEnTransaccion,
  writeMovement,
  type ContextoFinancieroOperativo,
} from "../finanzas/callables";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { SCHEMA_VERSION_VENTA_BODEGA, normalizarComandoConfirmacionVentaBodega, type ComandoConfirmacionVentaBodega, type LineaVentaBodegaPersistida } from "./ventas-contract";
import { aplicarConsumosInventarioBodegaEnTransaccion, resolverVentaBodegaEnTransaccion } from "./ventas-resolution";

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
    const resolucion = await resolverVentaBodegaEnTransaccion(tx, firestore, contexto, comando);
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
    const movimientosInventario = await aplicarConsumosInventarioBodegaEnTransaccion(tx, firestore, resolucion, ventaId);
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
    return {
      commandId: comando.commandId, ventaId, estadoOperativo: "COMPLETO" as const,
      metodoPago: comando.payload.metodoPago, total,
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
