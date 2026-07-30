import { logger } from "firebase-functions";
import { ejecutarAplicarEfectosVentaOperativaV1 } from "./callables";
import { validarEmpresaEscribible } from "../operational-auth";

interface ReciboFiscalCanonico {
  empresaId: string;
  actorOriginal: { uid: string; rolEfectivo: string };
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string;
}

function texto(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function leerReciboFiscalCanonico(data: unknown): ReciboFiscalCanonico | null {
  if (!data || typeof data !== "object") return null;
  const recibo = data as Record<string, unknown>;
  const actorOriginal = recibo.actorOriginal;
  if (!actorOriginal || typeof actorOriginal !== "object") return null;
  const actor = actorOriginal as Record<string, unknown>;
  if (!texto(recibo.empresaId) || !texto(actor.uid) || !texto(actor.rolEfectivo)
    || !texto(recibo.commandId) || !texto(recibo.idempotencyKey)
    || !texto(recibo.correlationId) || !texto(recibo.causationId)) return null;
  return {
    empresaId: recibo.empresaId,
    actorOriginal: { uid: actor.uid, rolEfectivo: actor.rolEfectivo },
    commandId: recibo.commandId,
    idempotencyKey: recibo.idempotencyKey,
    correlationId: recibo.correlationId,
    causationId: recibo.causationId,
  };
}

/** R1-B.2: recuperación durable; nunca anula ni escribe una ruta alternativa. */
export async function reconciliarVentasPendientes(db: any, ejecutar = ejecutarAplicarEfectosVentaOperativaV1): Promise<{ procesadas: number; completadas: number; pendientes: number }> {
  // Se recorre el conjunto pendiente completo: un fallo individual no puede
  // fijar la cola ni impedir el intento de ventas posteriores.
  const pendientes = await db.collection("ventas").where("estadoOperativo", "==", "PENDIENTE_EFECTOS").get();
  let completadas = 0;
  for (const venta of pendientes.docs) {
    const recibos = await db.collection("fiscal_comandos").where("ventaId", "==", venta.id).get();
    if (recibos.size !== 1) {
      logger.error("r1b_reconciliation_sale_without_unique_canonical_receipt", { ventaId: venta.id, recibos: recibos.size });
      continue;
    }
    const recibo = leerReciboFiscalCanonico(recibos.docs[0].data());
    if (!recibo) {
      logger.error("r1b_reconciliation_sale_with_invalid_canonical_receipt", { ventaId: venta.id });
      continue;
    }
    try {
      await validarEmpresaEscribible(recibo.empresaId, db);
      await ejecutar(db, { empresaId: recibo.empresaId, actorUid: recibo.actorOriginal.uid, rol: recibo.actorOriginal.rolEfectivo, ejecutorTecnico: "reconciliarVentasPendientesOperativas" }, {
        commandId: recibo.commandId, idempotencyKey: `efectos-venta:${venta.id}`,
        correlationId: recibo.correlationId,
        causationId: recibo.causationId, payload: { ventaId: venta.id },
      });
      completadas++;
    } catch (error) {
      logger.warn("r1b_reconciliation_retryable_failure", { ventaId: venta.id, empresaId: recibo.empresaId, commandId: recibo.commandId, idempotencyKey: recibo.idempotencyKey, error: error instanceof Error ? error.name : "unknown" });
    }
  }
  return { procesadas: pendientes.size, completadas, pendientes: pendientes.size - completadas };
}
