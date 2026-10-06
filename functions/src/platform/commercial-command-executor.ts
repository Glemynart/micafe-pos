import type { Firestore } from "firebase-admin/firestore";
import { resolverTerminosOfertaTenantAprobada } from "./approved-tenant-offers";
import {
  actualizarBorradorPlan,
  aprobarOfertaComercialTenant,
  actualizarDatosAdministrativosEmpresa,
  cambiarPlanSuscripcion,
  confirmarPagoAnualSuscripcion,
  crearNuevaVersionPlan,
  crearOfertaComercialTenant,
  crearPlan,
  crearSuscripcionActiva,
  crearSuscripcionTrial,
  programarCancelacionSuscripcion,
  publicarPlan,
  renovarSuscripcion,
  retirarVersionPlan,
  revocarOfertaComercialTenant,
  revocarCancelacionSuscripcion,
  transicionarEmpresa,
  transicionarSuscripcion,
} from "../suscripciones/service";
import {
  confirmarPagoAnualRelacionContractual,
  crearRelacionContractualTrial,
} from "../suscripciones/relaciones-service";
import {
  finalizarResultadoAuditable,
  planificarConfirmacionAuditoria,
  type ConfirmacionAuditoriaPlanificada,
} from "./audit-confirmation";
import { obtenerComandoComercial, type TipoComandoComercial } from "./command-catalog";
import type {
  EnvelopePlataforma,
  FacultadPlataforma,
  TipoAgregadoAuditoria,
  TipoAuditoria,
} from "./contracts";
import { validarEnvelope } from "./validation";

type ComercialEntrada = EnvelopePlataforma & Record<string, any>;

/**
 * Ejecutor canónico de los comandos comerciales y lifecycle ya expuestos por
 * `ejecutarComandoComercialSaas`. No declara Secrets ni depende de Bootstrap.
 */
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
  const empresaObjetivoId: string | null = entrada.empresaId ?? null;
  let plan: ConfirmacionAuditoriaPlanificada;

  if (tipo === "CrearPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_CREADO";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, () => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: 1 }));
    resultado = await crearPlan(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearOfertaComercialTenant") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "OFERTA_COMERCIAL_TENANT_CREADA";
    const terminos = resolverTerminosOfertaTenantAprobada(entrada.codigoAprobacion, entrada);
    const entradaAuditoria = { ...entrada, motivoCodigo: terminos.motivoCodigo };
    const entradaServicio = {
      commandId: entrada.commandId,
      idempotencyKey: entrada.idempotencyKey,
      correlationId: entrada.correlationId,
      causationId: entrada.causationId ?? entrada.commandId,
      expectedRevision: entrada.expectedRevision,
      empresaId: terminos.empresaIdObjetivo,
      ofertaId: terminos.ofertaId,
      planIdBase: terminos.planIdBase,
      planVersionBase: terminos.planVersionBase,
      periodicidad: terminos.periodicidad,
      precioAcordado: terminos.precioAcordado,
      motivoCodigo: terminos.motivoCodigo,
      referenciaAprobacion: terminos.referenciaAprobacion,
      motivo: terminos.motivoCodigo,
      iniciaEn: entrada.iniciaEn,
      expiraEn: entrada.expiraEn,
    };
    agregado = { tipo: "OFERTA_COMERCIAL_TENANT", id: terminos.ofertaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entradaAuditoria, agregado, terminos.empresaIdObjetivo, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await crearOfertaComercialTenant(db, entradaServicio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "AprobarOfertaComercialTenant") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "OFERTA_COMERCIAL_TENANT_APROBADA";
    const terminos = resolverTerminosOfertaTenantAprobada(entrada.codigoAprobacion, entrada);
    const entradaAuditoria = { ...entrada, motivoCodigo: terminos.motivoCodigo };
    const entradaServicio = {
      commandId: entrada.commandId,
      idempotencyKey: entrada.idempotencyKey,
      correlationId: entrada.correlationId,
      causationId: entrada.causationId ?? entrada.commandId,
      expectedRevision: entrada.expectedRevision,
      empresaId: terminos.empresaIdObjetivo,
      ofertaId: terminos.ofertaId,
      planIdBase: terminos.planIdBase,
      planVersionBase: terminos.planVersionBase,
      periodicidad: terminos.periodicidad,
      precioAcordado: terminos.precioAcordado,
      motivoCodigo: terminos.motivoCodigo,
      referenciaAprobacion: terminos.referenciaAprobacion,
      motivo: terminos.motivoCodigo,
    };
    agregado = { tipo: "OFERTA_COMERCIAL_TENANT", id: terminos.ofertaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entradaAuditoria, agregado, terminos.empresaIdObjetivo, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await aprobarOfertaComercialTenant(db, entradaServicio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RevocarOfertaComercialTenant") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "OFERTA_COMERCIAL_TENANT_REVOCADA";
    agregado = { tipo: "OFERTA_COMERCIAL_TENANT", id: entrada.ofertaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await revocarOfertaComercialTenant(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearNuevaVersionPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_VERSION_CREADA";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await crearNuevaVersionPlan(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "PublicarPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_VERSION_PUBLICADA";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await publicarPlan(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ActualizarBorradorPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_BORRADOR_ACTUALIZADO";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await actualizarBorradorPlan(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RetirarVersionPlan") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "PLAN_VERSION_RETIRADA";
    agregado = { tipo: "PLAN", id: entrada.planId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await retirarVersionPlan(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearSuscripcionActiva") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CREADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, () => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: 1 }));
    resultado = await crearSuscripcionActiva(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearSuscripcionTrial") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CREADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, () => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: 1 }));
    resultado = await crearSuscripcionTrial(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CrearRelacionContractualTrial") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_RELACION_CONTRACTUAL_CREADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }), (r: any) => ({ relacionId: r.relacionId, relacionAnteriorId: entrada.relacionAnteriorId }));
    resultado = await crearRelacionContractualTrial(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "TransicionarSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    const eventos: Record<string, TipoAuditoria> = { active: "SUSCRIPCION_ACTIVADA", past_due: "SUSCRIPCION_MORA_MARCADA", suspended: "SUSCRIPCION_SUSPENDIDA", canceled: "SUSCRIPCION_CANCELADA" };
    evento = eventos[entrada.destino] ?? "SUSCRIPCION_REACTIVADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await transicionarSuscripcion(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RenovarSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_RENOVADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await renovarSuscripcion(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "CambiarPlanSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_PLAN_CAMBIADO";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await cambiarPlanSuscripcion(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ProgramarCancelacionSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CANCELACION_PROGRAMADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await programarCancelacionSuscripcion(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "RevocarCancelacionSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_CANCELACION_REVOCADA";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await revocarCancelacionSuscripcion(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ConfirmarPagoAnualSuscripcion") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_PAGO_ANUAL_CONFIRMADO";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await confirmarPagoAnualSuscripcion(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ConfirmarPagoAnualRelacionContractual") {
    facultad = "COMERCIAL_GOBERNAR";
    evento = "SUSCRIPCION_RELACION_PAGO_ANUAL_CONFIRMADO";
    agregado = { tipo: "SUSCRIPCION", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }), (r: any) => ({ relacionId: r.relacionId, reciboId: r.reciboId }));
    resultado = await confirmarPagoAnualRelacionContractual(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else if (tipo === "ActualizarDatosAdministrativosEmpresa") {
    facultad = "LIFECYCLE_GOBERNAR";
    evento = "EMPRESA_DATOS_ADMINISTRATIVOS_ACTUALIZADOS";
    agregado = { tipo: "EMPRESA", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await actualizarDatosAdministrativosEmpresa(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  } else {
    facultad = "LIFECYCLE_GOBERNAR";
    const eventos: Record<string, TipoAuditoria> = { activa: "EMPRESA_ACTIVADA", suspendida: "EMPRESA_SUSPENDIDA", cancelada: "EMPRESA_CANCELADA", archivada: "EMPRESA_ARCHIVADA", eliminada: "EMPRESA_ELIMINADA" };
    evento = eventos[entrada.destino] ?? "EMPRESA_REACTIVADA";
    agregado = { tipo: "EMPRESA", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await transicionarEmpresa(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  }
  return finalizarResultadoAuditable(db, resultado, plan);
}
