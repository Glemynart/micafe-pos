/**
 * reconciliador-operativo-service.ts — Service de Reconciliación Operativa B7
 *
 * Auto-healing client-side & Alerta Visual tras 15 minutos de inconsistencia (ADR-SAAS-010 §3).
 * Busca ventas en `PENDIENTE_EFECTOS` y:
 *   1. Reintenta ejecutar la Fase 2 atómica (Ledger + Tesorería + `estadoOperativo: "COMPLETO"`).
 *   2. Despliega alerta visual en el POS tras 15 minutos de permanencia en `PENDIENTE_EFECTOS`.
 *   3. Jamás anula facturas fiscales emitidas por paso del tiempo (ADR-SAAS-010 §3.1).
 */

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tenantQuery, getEmpresaId } from "@/lib/tenant";
import {
  ejecutarFase2OperativaEnTransaccion,
  type CrearVentaParams,
  type IncidenciaInventario,
} from "@/lib/ventas-service";

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
  const empresaId = await getEmpresaId();
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

    // Intentar ejecutar la Fase 2 atómica
    try {
      const paramsVenta: CrearVentaParams = {
        turnoId: ventaData.turnoId || "",
        cajeroId: ventaData.cajeroId || "",
        cajeroNombre: ventaData.cajeroNombre,
        espacioId: ventaData.espacioId,
        items: ventaData.items || [],
        totales: ventaData.totales || { subtotalBase: 0, totalINC: 0, totalExcluido: 0, total: 0 },
        regimenAlMomento: ventaData.regimenAlMomento || "no_responsable",
        metodoPago: ventaData.metodoPago || "efectivo",
        dineroRecibido: ventaData.pago?.recibido,
        cambio: ventaData.pago?.cambio,
        pagoMixto: ventaData.pagoMixto,
        pagoMixtoDetalle: ventaData.pagoMixtoDetalle,
        estado: ventaData.estado || "pagada",
      };

      await runTransaction(db, async (tx) => {
        const resFase2 = await ejecutarFase2OperativaEnTransaccion(
          tx,
          doc(db, "ventas", ventaId),
          paramsVenta,
          empresaId
        );
        resultado.incidencias.push(...resFase2.incidencias);
      });

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
