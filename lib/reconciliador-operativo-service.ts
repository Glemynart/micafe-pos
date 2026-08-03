/**
 * reconciliador-operativo-service.ts — Service de Reconciliación Operativa B7
 *
 * Solicitud de retry server-authoritative & Alerta Visual tras 15 minutos de
 * inconsistencia (ADR-SAAS-010 §3).
 * Busca ventas en `PENDIENTE_EFECTOS` y:
 *   1. Solicita a la Callable la Fase 2 atómica (Ledger + Tesorería + `estadoOperativo: "COMPLETO"`).
 *   2. Despliega alerta visual en el POS tras 15 minutos de permanencia en `PENDIENTE_EFECTOS`.
 *   3. Jamás anula facturas fiscales emitidas por paso del tiempo (ADR-SAAS-010 §3.1).
 */

import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tenantQuery } from "@/lib/tenant";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { IncidenciaInventario } from "@/lib/ventas-service";

export interface VentaPendienteConciliacion {
  ventaId: string;
  consecutivo: number;
  creadaEn: Date;
  minutosTranscurridos: number;
  requiereAlertaVisual: boolean;
}

export interface ResultadoReconciliacion {
  ventasProcesadas: number;
  ventasCompletadas: number;
  ventasConAlerta: VentaPendienteConciliacion[];
  incidencias: IncidenciaInventario[];
}

const MINUTOS_ALERTA_VISUAL = 15;

/**
 * Escanea y reconcilia ventas en estado `PENDIENTE_EFECTOS` para el tenant activo.
 */
export async function reconciliarVentasPendientes(): Promise<ResultadoReconciliacion> {
  const qPendientes = await tenantQuery(
    collection(db, "ventas"),
    where("estadoOperativo", "==", "PENDIENTE_EFECTOS")
  );
  const snapPendientes = await getDocs(qPendientes);

  const resultado: ResultadoReconciliacion = {
    ventasProcesadas: snapPendientes.size,
    ventasCompletadas: 0,
    ventasConAlerta: [],
    incidencias: [],
  };

  if (snapPendientes.empty) {
    return resultado;
  }

  const ahoraMs = Date.now();
  const ejecutarFase2 = httpsCallable<{
    commandId: string;
    idempotencyKey: string;
    correlationId: string;
    causationId: string;
    payload: { ventaId: string };
  }, { incidenciasInventario?: IncidenciaInventario[] }>(getFunctions(), "aplicarEfectosVentaOperativaV1");

  for (const docSnap of snapPendientes.docs) {
    const ventaData = docSnap.data();
    const ventaId = docSnap.id;

    // Calcular antigüedad
    let fechaCreacion: Date = new Date();
    if (ventaData.fecha?.toDate) {
      fechaCreacion = ventaData.fecha.toDate();
    } else if (ventaData.fecha instanceof Date) {
      fechaCreacion = ventaData.fecha;
    } else if (typeof ventaData.fecha === "string") {
      fechaCreacion = new Date(ventaData.fecha);
    }

    const diffMs = ahoraMs - fechaCreacion.getTime();
    const minutosTranscurridos = Math.floor(diffMs / (1000 * 60));
    const requiereAlertaVisual = minutosTranscurridos >= MINUTOS_ALERTA_VISUAL;

    // Solicitar la Fase 2 atómica al backend. El cliente no escribe hechos
    // críticos ni calcula efectos derivados.
    try {
      const commandId = `efectos-venta:${ventaId}`;
      const resFase2 = await ejecutarFase2({
        commandId,
        idempotencyKey: commandId,
        correlationId: `corr-efectos-venta:${ventaId}`,
        causationId: `cmd_sale_${ventaId}`,
        payload: { ventaId },
      });
      resultado.incidencias.push(...(resFase2.data.incidenciasInventario ?? []));

      resultado.ventasCompletadas++;
    } catch (err) {
      console.warn(`[reconciliador] No se pudo auto-conciliar venta #${ventaData.consecutivo} (${ventaId}):`, err);

      if (requiereAlertaVisual) {
        resultado.ventasConAlerta.push({
          ventaId,
          consecutivo: ventaData.consecutivo || 0,
          creadaEn: fechaCreacion,
          minutosTranscurridos,
          requiereAlertaVisual,
        });
      }
    }
  }

  return resultado;
}
