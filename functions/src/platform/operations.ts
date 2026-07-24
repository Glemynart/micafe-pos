import { createHash, randomUUID } from "node:crypto";
import { type Firestore } from "firebase-admin/firestore";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { ejecutarBootstrapEmpresarial } from "../bootstrap/service";
import {
  crearNuevaVersionPlan,
  crearPlan,
  crearSuscripcionActiva,
  actualizarBorradorPlan,
  retirarVersionPlan,
  renovarSuscripcion,
  cambiarPlanSuscripcion,
  programarCancelacionSuscripcion,
  revocarCancelacionSuscripcion,
  publicarPlan,
  transicionarEmpresa,
  transicionarSuscripcion,
} from "../suscripciones/service";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import type {
  EnvelopePlataforma,
  FacultadPlataforma,
  TipoAgregadoAuditoria,
  TipoAuditoria,
} from "./contracts";
import { validarEnvelope } from "./validation";
import { obtenerComandoComercial, type TipoComandoComercial } from "./command-catalog";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type ConfirmacionAuditoriaPlanificada = {
  obligacionId: string;
  registrarEnTransaccion: (tx: any, resultado: unknown) => void;
};

function planificarConfirmacionAuditoria(
  db: Firestore,
  actorUid: string,
  facultad: FacultadPlataforma,
  tipoComando: string,
  entrada: EnvelopePlataforma,
  agregado: { tipo: TipoAgregadoAuditoria; id: string },
  empresaObjetivoId: string | null,
  tipoAuditoria: TipoAuditoria,
  revision: (resultado: any) => { esperada: number | null; resultante: number | null },
): ConfirmacionAuditoriaPlanificada {
  const ids = { obligacionId: randomUUID(), evidenciaId: randomUUID() };
  return {
    obligacionId: ids.obligacionId,
    registrarEnTransaccion: (tx, resultado) => {
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
      }, ids);
    },
  };
}

async function finalizarResultadoAuditable(
  db: Firestore,
  resultado: Record<string, unknown>,
  plan: ConfirmacionAuditoriaPlanificada,
) {
  // La obligación ya fue creada dentro de la transacción del agregado. La
  // emisión es recuperable y no vuelve a confirmar ningún hecho de dominio.
  if (!resultado.idempotente) {
    await emitirObligacionAuditoria(db, plan.obligacionId);
  }
  return resultado;
}

export async function solicitarBootstrapEmpresarial(
  db: Firestore,
  actorUid: string,
  entrada: EntradaBootstrapEmpresarial & EnvelopePlataforma,
) {
  validarEnvelope(entrada);
  const plan = planificarConfirmacionAuditoria(
    db,
    actorUid,
    "BOOTSTRAP_EMPRESARIAL_SOLICITAR",
    "SolicitarBootstrapEmpresarial",
    entrada,
    { tipo: "PROVISIONAMIENTO_EMPRESARIAL", id: `prov_${hash(entrada.idempotencyKey)}` },
    entrada.empresaId,
    "BOOTSTRAP_EMPRESARIAL_SOLICITADO",
    () => ({ esperada: null, resultante: null }),
  );
  const resultado = await ejecutarBootstrapEmpresarial(
    db,
    entrada,
    undefined,
    undefined,
    plan.registrarEnTransaccion,
  );
  return finalizarResultadoAuditable(db, resultado as unknown as Record<string, unknown>, plan);
}

type ComercialEntrada = EnvelopePlataforma & Record<string, any>;

export async function ejecutarComandoComercial(
  db: Firestore,
  actorUid: string,
  tipo: TipoComandoComercial,
  entrada: ComercialEntrada,
) {
  obtenerComandoComercial(tipo);
  validarEnvelope(entrada);
  const dominio = {
    ...entrada,
    motivo: entrada.motivoCodigo,
    causationId: entrada.causationId ?? entrada.commandId,
  };
  const ctxBase = { actorId: actorUid, origen: "PLATFORM" as const };
  let resultado: any;
  let facultad: FacultadPlataforma;
  let evento: TipoAuditoria;
  let agregado: { tipo: TipoAgregadoAuditoria; id: string };
  let empresaObjetivoId: string | null = entrada.empresaId ?? null;
  let plan: ConfirmacionAuditoriaPlanificada;

  if (tipo === "CrearPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_CREADO";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, () => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: 1 }));
    resultado = await crearPlan(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearNuevaVersionPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_VERSION_CREADA";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await crearNuevaVersionPlan(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "PublicarPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_VERSION_PUBLICADA";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await publicarPlan(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ActualizarBorradorPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_BORRADOR_ACTUALIZADO";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await actualizarBorradorPlan(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RetirarVersionPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_VERSION_RETIRADA";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await retirarVersionPlan(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearSuscripcionActiva") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CREADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, () => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: 1 }));
    resultado = await crearSuscripcionActiva(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "TransicionarSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    const eventos: Record<string, TipoAuditoria> = {
      active: "SUSCRIPCION_ACTIVADA",
      past_due: "SUSCRIPCION_MORA_MARCADA",
      suspended: "SUSCRIPCION_SUSPENDIDA",
      canceled: "SUSCRIPCION_CANCELADA",
    };
    evento = eventos[entrada.destino] ?? "SUSCRIPCION_REACTIVADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await transicionarSuscripcion(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RenovarSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_RENOVADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await renovarSuscripcion(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CambiarPlanSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_PLAN_CAMBIADO";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await cambiarPlanSuscripcion(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ProgramarCancelacionSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CANCELACION_PROGRAMADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await programarCancelacionSuscripcion(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RevocarCancelacionSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CANCELACION_REVOCADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await revocarCancelacionSuscripcion(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else {
    facultad = "LIFECYCLE_GOBERNAR";
    const eventos: Record<string, TipoAuditoria> = {
      activa: "EMPRESA_ACTIVADA",
      suspendida: "EMPRESA_SUSPENDIDA",
      cancelada: "EMPRESA_CANCELADA",
      archivada: "EMPRESA_ARCHIVADA",
      eliminada: "EMPRESA_ELIMINADA",
    };
    evento = eventos[entrada.destino] ?? "EMPRESA_REACTIVADA";
    agregado = { tipo: "EMPRESA", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await transicionarEmpresa(db, dominio as never, { ...ctxBase, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  }
  return finalizarResultadoAuditable(db, resultado, plan);
}
