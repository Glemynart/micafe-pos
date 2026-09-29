import { createHash, randomUUID } from "node:crypto";
import { type Firestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import type { EnvelopePlataforma, FacultadPlataforma } from "./contracts";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { validarEnvelope } from "./validation";
import { finalizarResultadoAuditable, planificarConfirmacionAuditoria, type ConfirmacionAuditoriaPlanificada } from "./audit-confirmation";
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

// Boundary neutral compartido por `saas-auth` y `saas-bootstrap`.
export { solicitarBootstrapEmpresarial } from "../bootstrap/shared";

/**
 * Variante de sistema para hechos que el propio dominio confirma tras el commit —no
 * una decisión humana adicional— como la finalización de un provisionamiento ya
 * solicitado. `facultad: null` conforme ADR-SAAS-012 §2.2 ("null solo para proceso de
 * sistema sin facultad humana").
 */
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
