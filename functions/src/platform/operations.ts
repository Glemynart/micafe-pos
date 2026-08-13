import { createHash, randomUUID } from "node:crypto";
import { type Firestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { ejecutarBootstrapEmpresarial, type ClaimsEmitter, type CredentialIssuer, type OwnerIdentityEnabler, type OwnerIdentityResolver, type OwnerIdentityVerifier } from "../bootstrap/service";
import {
  crearNuevaVersionPlan,
  crearPlan,
  crearSuscripcionActiva,
  crearSuscripcionTrial,
  actualizarBorradorPlan,
  actualizarDatosAdministrativosEmpresa,
  retirarVersionPlan,
  renovarSuscripcion,
  confirmarPagoAnualSuscripcion,
  cambiarPlanSuscripcion,
  programarCancelacionSuscripcion,
  revocarCancelacionSuscripcion,
  publicarPlan,
  transicionarEmpresa,
  transicionarSuscripcion,
} from "../suscripciones/service";
import { crearRelacionContractualTrial } from "../suscripciones/relaciones-service";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import type {
  EnvelopePlataforma,
  FacultadPlataforma,
  TipoAgregadoAuditoria,
  TipoAuditoria,
} from "./contracts";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { validarEnvelope } from "./validation";
import { obtenerComandoComercial, type TipoComandoComercial } from "./command-catalog";
import { emitirCredencialInicial, type ResolverPrincipal } from "./emitir-credencial-inicial";
import {
  resolverPlanEmisionCredencialInicial,
  resolverPlanReemisionCredencialInicialTemporal,
  revalidarDestinoProvisionableEnTransaccion,
  revalidarReemisionTemporalEnTransaccion,
} from "./provisionar-credencial-inicial-tenant";
import { permisosPredeterminados } from "../operational-auth";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Igual que operational-auth.ts/incorporaciones.ts: cada módulo que necesita
// el pepper declara su propia referencia; se resuelve por nombre en runtime.
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const MOTIVO_REEMISION_CREDENCIAL_INICIAL = "REEMISION_ADMINISTRATIVA_PIN_NO_ENTREGADO";

type ConfirmacionAuditoriaPlanificada = {
  obligacionId: string;
  registrarEnTransaccion: (tx: any, resultado: unknown) => { obligacionId: string };
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

/**
 * Variante de sistema para hechos que el propio dominio confirma tras el commit —no
 * una decisión humana adicional— como la finalización de un provisionamiento ya
 * solicitado. `facultad: null` conforme ADR-SAAS-012 §2.2 ("null solo para proceso de
 * sistema sin facultad humana").
 */
function planificarConfirmacionSistema(
  db: Firestore,
  tipoComando: string,
  entrada: EnvelopePlataforma,
  agregado: { tipo: TipoAgregadoAuditoria; id: string },
  empresaObjetivoId: string | null,
  tipoAuditoria: TipoAuditoria,
): ConfirmacionAuditoriaPlanificada {
  const ids = { obligacionId: randomUUID(), evidenciaId: randomUUID() };
  return {
    obligacionId: ids.obligacionId,
    registrarEnTransaccion: (tx) => {
      crearObligacionAuditoria(db, tx, {
        tipo: tipoAuditoria,
        resultado: "CONFIRMADO",
        origen: "SISTEMA",
        actor: { tipo: "SISTEMA", uid: null },
        facultad: null,
        comando: { id: entrada.commandId, tipo: tipoComando },
        agregado,
        empresaObjetivoId,
        revision: { esperada: null, resultante: null },
        correlacionId: entrada.correlationId,
        causacionId: entrada.causationId,
        motivo: { codigo: entrada.motivoCodigo, resumen: null },
      }, ids);
      return { obligacionId: ids.obligacionId };
    },
  };
}

async function finalizarResultadoAuditable(
  db: Firestore,
  resultado: Record<string, unknown>,
  plan: ConfirmacionAuditoriaPlanificada,
) {
  // La obligación ya fue creada dentro de la transacción del agregado (fresca o, en un
  // reintento idempotente, recuperada desde el resultado durable — nunca regenerada).
  // La emisión es en sí misma idempotente y no vuelve a confirmar ningún hecho de dominio.
  const obligacionId = resultado.idempotente
    ? (resultado.obligacionId as string | undefined)
    : plan.obligacionId;
  if (obligacionId) {
    await emitirObligacionAuditoria(db, obligacionId);
  }
  return resultado;
}

export async function solicitarBootstrapEmpresarial(
  db: Firestore,
  actorUid: string,
  entrada: EntradaBootstrapEmpresarial & EnvelopePlataforma,
  // Puntos de inyección de ADR-SAAS-007 (ver `ejecutarBootstrapEmpresarial`), expuestos
  // únicamente para pruebas; el callable de producción invoca esta función con 3
  // argumentos y conserva los emisores/verificadores por defecto de Firebase Admin.
  customClaimsEmitter?: ClaimsEmitter,
  ownerIdentityVerifier?: OwnerIdentityVerifier,
  credentialIssuer?: CredentialIssuer,
  ownerIdentityResolver?: OwnerIdentityResolver,
  ownerIdentityEnabler?: OwnerIdentityEnabler,
) {
  validarEnvelope(entrada);
  const agregadoProvisionamiento = {
    tipo: "PROVISIONAMIENTO_EMPRESARIAL" as const,
    id: `prov_${hash(entrada.idempotencyKey)}`,
  };
  const solicitud = planificarConfirmacionAuditoria(
    db,
    actorUid,
    "BOOTSTRAP_EMPRESARIAL_SOLICITAR",
    "SolicitarBootstrapEmpresarial",
    entrada,
    agregadoProvisionamiento,
    entrada.empresaId,
    "BOOTSTRAP_EMPRESARIAL_SOLICITADO",
    () => ({ esperada: null, resultante: null }),
  );
  const completado = planificarConfirmacionSistema(
    db,
    "SolicitarBootstrapEmpresarial",
    entrada,
    agregadoProvisionamiento,
    entrada.empresaId,
    "BOOTSTRAP_EMPRESARIAL_COMPLETADO",
  );
  // El envelope de plataforma admite `causationId: null` para un comando raíz (ADR-SAAS-011
  // §8); el contrato de Bootstrap de ADR-SAAS-007 exige un identificador comercial no vacío.
  // Se normaliza aquí, en la traducción de envelope de plataforma a envelope de dominio, sin
  // tocar la validación ni el servicio canónico de ADR-SAAS-007.
  const resultado = await ejecutarBootstrapEmpresarial(
    db,
    { ...entrada, causationId: entrada.causationId ?? entrada.commandId },
    customClaimsEmitter,
    ownerIdentityVerifier,
    solicitud.registrarEnTransaccion,
    completado.registrarEnTransaccion,
    credentialIssuer,
    ownerIdentityResolver,
    ownerIdentityEnabler,
  );
  const resultadoRecord = resultado as unknown as Record<string, unknown>;
  await finalizarResultadoAuditable(db, resultadoRecord, solicitud);
  // Solo se emite si el hecho durable efectivamente registró un obligacionCompletadoId
  // (observador invocado dentro de la transacción de finalización). Nunca se cae a un
  // id recién generado en esta llamada: no fue persistido y no existe obligación que
  // emitir bajo ese id — provocaría AUDIT_OBLIGATION_NOT_FOUND sobre un hecho ya
  // confirmado (p. ej. un provisionamiento completado por la ruta de autoservicio,
  // sin observador de plataforma).
  const obligacionCompletadoId = resultadoRecord.obligacionCompletadoId as string | null | undefined;
  if (resultadoRecord.estado === "COMPLETED" && obligacionCompletadoId) {
    await emitirObligacionAuditoria(db, obligacionCompletadoId);
  }
  return resultado;
}

/**
 * ADR-SAAS-013 — comando `ProvisionarCredencialInicialTenant`. A diferencia
 * del resto de comandos comerciales (revision-guarded, una única
 * transacción autocontenida vía `previo`/`registrar` en suscripciones/service.ts),
 * este necesita dependencias de Admin SDK (pepper, verificación de
 * identidad) que ese patrón no modela — por eso, igual que
 * `solicitarBootstrapEmpresarial`, es una función dedicada en vez de un caso
 * más de `ejecutarComandoComercial`.
 *
 * Las precondiciones (empresa provisionable, destino = ownerUid exacto,
 * membresía admin activa, decisión EMITIR/REEMITIR/RECHAZAR) viven
 * exclusivamente en `resolverPlanEmisionCredencialInicial` — esta función
 * NO las reimplementa, solo las envuelve con el envelope/auditoría de
 * plataforma que ADR-SAAS-012 exige para cualquier comando. La escritura en
 * sí (única, reutilizada tal cual desde Capa 2) vive exclusivamente en
 * `emitirCredencialInicial`.
 */
export async function provisionarCredencialInicialTenant(
  db: Firestore,
  actorUid: string,
  entrada: EnvelopePlataforma & { empresaId: string },
  // Inyección para pruebas, mismo patrón que el resto del archivo; producción
  // usa `getAuth().getUser(uid)` (default de `emitirCredencialInicial`).
  resolverPrincipal?: ResolverPrincipal,
  pepperParam?: string,
) {
  validarEnvelope(entrada);
  // Resuelve preconditions y decide EMITIR/REEMITIR/RECHAZAR ANTES de crear
  // cualquier obligación de auditoría: un rechazo (empresa inexistente,
  // owner sin membresía, credencial ya activa) no debe dejar una obligación
  // PENDIENTE huérfana que nadie va a confirmar.
  const plan = await resolverPlanEmisionCredencialInicial(db, entrada.empresaId);

  const agregado = { tipo: "EMPRESA" as const, id: entrada.empresaId };
  const confirmacion = planificarConfirmacionAuditoria(
    db,
    actorUid,
    "LIFECYCLE_GOBERNAR",
    "ProvisionarCredencialInicialTenant",
    entrada,
    agregado,
    entrada.empresaId,
    plan.tipoEvento,
    () => ({ esperada: null, resultante: null }),
  );

  const permisos = await permisosPredeterminados("admin", db);
  const pepper = pepperParam ?? PIN_PEPPER.value();

  const emitida = await emitirCredencialInicial(db, {
    empresaId: entrada.empresaId,
    uid: plan.ownerUid,
    rol: "admin",
    permisos,
    origen: "PLATAFORMA",
    emisorUid: actorUid,
    nombreComercial: plan.nombreComercial,
    pepper,
    reemplazarIncorporacionId: plan.reemplazarIncorporacionId,
    resolverPrincipal,
    auditObserver: confirmacion.registrarEnTransaccion,
    validarAntesDeEmitirEnTransaccion: (tx) => revalidarDestinoProvisionableEnTransaccion(
      db,
      tx,
      entrada.empresaId,
      plan.ownerUid,
    ),
  });

  const resultado = {
    empresaId: entrada.empresaId,
    uid: plan.ownerUid,
    incorporacionId: emitida.incorporacionId,
    codigo: emitida.codigo,
    pinTemporal: emitida.pinTemporal,
    estado: emitida.estado,
    obligacionId: emitida.obligacionId,
    idempotente: emitida.estado === "YA_EXISTENTE",
  };
  return finalizarResultadoAuditable(db, resultado, confirmacion);
}

/**
 * ADR-SAAS-013 §4.4.1. Rotación administrativa dirigida de una credencial
 * temporal vigente cuya única entrega se perdió. Nunca es un override de la
 * provisión ordinaria: exige la incorporación que la UI observó y solo la
 * sustituye si esa misma incorporación conserva todas sus invariantes dentro
 * de la transacción del emisor.
 */
export async function reemitirCredencialInicialTemporalTenant(
  db: Firestore,
  actorUid: string,
  entrada: EnvelopePlataforma & { empresaId: string; incorporacionId: string },
  tokenPlataforma: TokenPlataforma,
  resolverPrincipal?: ResolverPrincipal,
  pepperParam?: string,
) {
  validarEnvelope(entrada);
  if (entrada.motivoCodigo !== MOTIVO_REEMISION_CREDENCIAL_INICIAL) {
    throw new HttpsError("invalid-argument", "MOTIVO_REEMISION_INVALIDO");
  }
  const plan = await resolverPlanReemisionCredencialInicialTemporal(db, entrada.empresaId, entrada.incorporacionId);
  if (plan.idempotente) {
    return {
      empresaId: entrada.empresaId,
      uid: plan.ownerUid,
      incorporacionId: plan.incorporacionId,
      codigo: plan.codigoAnterior,
      pinTemporal: null,
      estado: "YA_EXISTENTE" as const,
      obligacionId: null,
      idempotente: true,
    };
  }
  const agregado = { tipo: "EMPRESA" as const, id: entrada.empresaId };
  const confirmacion = planificarConfirmacionAuditoria(
    db,
    actorUid,
    "LIFECYCLE_GOBERNAR",
    "ReemitirCredencialInicialTemporalTenant",
    entrada,
    agregado,
    entrada.empresaId,
    "CREDENCIAL_INICIAL_REEMITIDA",
    () => ({ esperada: null, resultante: null }),
    (resultado) => ({
      rotacionAdministrativa: true,
      incorporacionAnteriorId: plan.incorporacionId,
      incorporacionNuevaId: resultado.incorporacionId,
      codigoAnterior: plan.codigoAnterior,
      codigoNuevo: resultado.codigo,
    }),
  );
  const permisos = await permisosPredeterminados("admin", db);
  const pepper = pepperParam ?? PIN_PEPPER.value();
  const emitida = await emitirCredencialInicial(db, {
    empresaId: entrada.empresaId,
    uid: plan.ownerUid,
    rol: "admin",
    permisos,
    origen: "PLATAFORMA",
    emisorUid: actorUid,
    nombreComercial: plan.nombreComercial,
    pepper,
    reemplazarIncorporacionId: plan.incorporacionId,
    resolverPrincipal,
    auditObserver: confirmacion.registrarEnTransaccion,
    validarAntesDeEmitirEnTransaccion: async (tx) => {
      await autorizarPlataforma(db, actorUid, tokenPlataforma, "LIFECYCLE_GOBERNAR", tx);
      await revalidarReemisionTemporalEnTransaccion(db, tx, entrada.empresaId, plan);
    },
  });
  const resultado = {
    empresaId: entrada.empresaId,
    uid: plan.ownerUid,
    incorporacionId: emitida.incorporacionId,
    codigo: emitida.codigo,
    pinTemporal: emitida.pinTemporal,
    estado: emitida.estado,
    obligacionId: emitida.obligacionId,
    idempotente: emitida.estado === "YA_EXISTENTE",
  };
  return finalizarResultadoAuditable(db, resultado, confirmacion);
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
    resultado = await crearPlan(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
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
    plan = planificarConfirmacionAuditoria(
      db,
      actorUid,
      facultad,
      tipo,
      entrada,
      agregado,
      empresaObjetivoId,
      evento,
      (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }),
      (r: any) => ({ relacionId: r.relacionId, relacionAnteriorId: entrada.relacionAnteriorId }),
    );
    resultado = await crearRelacionContractualTrial(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
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
  } else if (tipo === "ActualizarDatosAdministrativosEmpresa") {
    facultad = "LIFECYCLE_GOBERNAR";
    evento = "EMPRESA_DATOS_ADMINISTRATIVOS_ACTUALIZADOS";
    agregado = { tipo: "EMPRESA", id: entrada.empresaId };
    plan = planificarConfirmacionAuditoria(db, actorUid, facultad, tipo, entrada, agregado, empresaObjetivoId, evento, (r: any) => ({ esperada: Number.isInteger(entrada.expectedRevision) ? entrada.expectedRevision : null, resultante: Number.isInteger(r.revision) ? r.revision : null }));
    resultado = await actualizarDatosAdministrativosEmpresa(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
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
    resultado = await transicionarEmpresa(db, dominio as never, { ...ctxBase, obligacionId: plan.obligacionId, registrarResultadoEnTransaccion: plan.registrarEnTransaccion });
  }
  return finalizarResultadoAuditable(db, resultado, plan);
}
