/**
 * Boundary neutral de Bootstrap empresarial (ADR-SAAS-044).
 *
 * Este módulo es el único punto compartido por los adapters de `saas-auth`
 * y `saas-bootstrap`. No define una callable ni una nueva autoridad: expone
 * la operación canónica existente y la envoltura de plataforma que conserva
 * auditoría, idempotencia, claims, credenciales y estados.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { EntradaBootstrapEmpresarial } from "./contrato";
import {
  ejecutarBootstrapEmpresarial,
  type ClaimsEmitter,
  type CredentialIssuer,
  type OwnerIdentityEnabler,
  type OwnerIdentityResolver,
  type OwnerIdentityVerifier,
} from "../../functions/src/bootstrap/service";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "../../functions/src/platform/audit";
import type {
  EnvelopePlataforma,
  TipoAgregadoAuditoria,
  TipoAuditoria,
} from "../../functions/src/platform/contracts";
import { validarEnvelope } from "../../functions/src/platform/validation";
import {
  finalizarResultadoAuditable,
  planificarConfirmacionAuditoria,
  type ConfirmacionAuditoriaPlanificada,
} from "../../functions/src/platform/audit-confirmation";

export {
  ejecutarBootstrapEmpresarial,
  type ClaimsEmitter,
  type CredentialIssuer,
  type OwnerIdentityEnabler,
  type OwnerIdentityResolver,
  type OwnerIdentityVerifier,
} from "../../functions/src/bootstrap/service";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

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

/**
 * Adapter de plataforma compartido. La validación de autoridad ocurre en el
 * callable antes de invocarlo; aquí se conserva la única ruta de auditoría y
 * la única llamada al ejecutor de dominio.
 */
export async function solicitarBootstrapEmpresarial(
  db: Firestore,
  actorUid: string,
  entrada: EntradaBootstrapEmpresarial & EnvelopePlataforma,
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
  const obligacionCompletadoId = resultadoRecord.obligacionCompletadoId as string | null | undefined;
  if (resultadoRecord.estado === "COMPLETED" && obligacionCompletadoId) {
    await emitirObligacionAuditoria(db, obligacionCompletadoId);
  }
  return resultado;
}
