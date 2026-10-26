import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";
import { resolverCallableOperacionBodega } from "@/lib/bodega/operation-routing";
import type { CatalogImportCommand } from "@/lib/bodega/diana-catalog-import";

interface CatalogImportEnvelope {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

/** Invokes only existing server-authoritative catalog commands. */
export const ejecutarComandoImportacionCatalogo: CatalogImportCommand = async (nombre, commandId, payload) => {
  const callableName = resolverCallableOperacionBodega("BODEGA_MVP1", nombre);
  const callable = httpsCallable<CatalogImportEnvelope, Record<string, unknown>>(getFirebaseFunctions(), callableName);
  const envelope: CatalogImportEnvelope = {
    commandId,
    idempotencyKey: commandId,
    correlationId: `${commandId}:correlation`,
    payload,
  };
  return (await callable(envelope)).data;
};
