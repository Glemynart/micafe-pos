import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { EnvelopePlataforma } from "./contracts";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { validarEnvelope } from "./validation";
import { finalizarResultadoAuditable, planificarConfirmacionAuditoria } from "./audit-confirmation";
import { emitirCredencialInicial, type ResolverPrincipal } from "../credential-core/emitir-credencial-inicial";
import {
  resolverPlanReemisionCredencialInicialTemporal,
  revalidarReemisionTemporalEnTransaccion,
} from "../credential-core/provisionar-credencial-inicial-tenant";
import { permisosPredeterminados } from "../tenant-permissions";

const MOTIVO_REEMISION_CREDENCIAL_INICIAL = "REEMISION_ADMINISTRATIVA_PIN_NO_ENTREGADO";

/**
 * Composicion canonica de la reemision administrativa. No declara Secrets ni
 * endpoints: los adapters inyectan el pepper y la resolucion del principal.
 */
export async function reemitirCredencialInicialTemporalTenant(
  db: Firestore,
  actorUid: string,
  entrada: EnvelopePlataforma & { empresaId: string; incorporacionId: string },
  tokenPlataforma: TokenPlataforma,
  resolverPrincipal: ResolverPrincipal,
  pepper: string,
) {
  validarEnvelope(entrada);
  if (entrada.motivoCodigo !== MOTIVO_REEMISION_CREDENCIAL_INICIAL) {
    throw new HttpsError("invalid-argument", "MOTIVO_REEMISION_INVALIDO");
  }

  const plan = await resolverPlanReemisionCredencialInicialTemporal(
    db,
    entrada.empresaId,
    entrada.incorporacionId,
  );
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

  const confirmacion = planificarConfirmacionAuditoria(
    db,
    actorUid,
    "LIFECYCLE_GOBERNAR",
    "ReemitirCredencialInicialTemporalTenant",
    entrada,
    { tipo: "EMPRESA", id: entrada.empresaId },
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
