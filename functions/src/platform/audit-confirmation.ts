import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import type {
  EnvelopePlataforma,
  FacultadPlataforma,
  TipoAgregadoAuditoria,
  TipoAuditoria,
} from "./contracts";

export type ConfirmacionAuditoriaPlanificada = {
  obligacionId: string;
  registrarEnTransaccion: (tx: any, resultado: unknown) => { obligacionId: string };
};

export function planificarConfirmacionAuditoria(
  db: Firestore,
  actorUid: string,
  facultad: FacultadPlataforma,
  tipoComando: string,
  entrada: EnvelopePlataforma,
  agregado: { tipo: TipoAgregadoAuditoria; id: string },
  empresaObjetivoId: string | null,
  tipoAuditoria: TipoAuditoria,
  revision: (resultado: any) => { esperada: number | null; resultante: number | null },
  detalle?: (resultado: any) => Record<string, unknown>,
): ConfirmacionAuditoriaPlanificada {
  const ids = { obligacionId: randomUUID(), evidenciaId: randomUUID() };
  return {
    obligacionId: ids.obligacionId,
    registrarEnTransaccion: (tx, resultado) => {
      const detalleAuditable = detalle?.(resultado);
      crearObligacionAuditoria(db, tx, {
        tipo: tipoAuditoria,
        resultado: "CONFIRMADO",
        actor: { tipo: "OPERADOR", uid: actorUid },
        facultad,
        comando: { id: entrada.commandId, tipo: tipoComando },
        agregado,
        empresaObjetivoId,
        revision: revision(resultado),
        correlacionId: entrada.correlationId,
        causacionId: entrada.causationId,
        motivo: { codigo: entrada.motivoCodigo, resumen: null },
        ...(detalleAuditable ? { detalle: detalleAuditable } : {}),
      }, ids);
      return { obligacionId: ids.obligacionId };
    },
  };
}

export async function finalizarResultadoAuditable(
  db: Firestore,
  resultado: Record<string, unknown>,
  plan: ConfirmacionAuditoriaPlanificada,
) {
  const obligacionId = resultado.idempotente
    ? (resultado.obligacionId as string | undefined)
    : plan.obligacionId;
  if (obligacionId) await emitirObligacionAuditoria(db, obligacionId);
  return resultado;
}
