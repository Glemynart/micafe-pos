import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "../../functions/src/platform/authorization";
import { createContactAuthorityWorkflow, createFirestoreContactAuthorityRepository } from "../../functions/src/legal/contact-authority";
import { createFirestoreContactDesignationRepository } from "../../functions/src/legal/contact-designation";

const FACULTAD = "EXPORTACION_CONTACTO_GOBERNAR" as const;
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const REFERENCIA = /^[A-Za-z0-9._:-]{4,160}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO = /^\+[1-9]\d{7,14}$/;

type Actor = { uid: string; token: TokenPlataforma };
type Input = Record<string, unknown>;
type DeliverChallenge = (input: {
  destination: string;
  channel: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO";
  challenge: string;
  idempotencyKey: string;
}) => Promise<{ reference: string }>;

function invalid(): never {
  throw new HttpsError("invalid-argument", "CONTACTO_EXPORTACION_ENTRADA_INVALIDA");
}

function dataRecord(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Input;
}

function requireKeys(data: Input, allowed: string[]) {
  if (Object.keys(data).some(key => !allowed.includes(key))) invalid();
}

function requireId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) return invalid();
  return value;
}

function requireReference(value: unknown): string {
  if (typeof value !== "string" || !REFERENCIA.test(value)) return invalid();
  return value;
}

function requireDestination(channel: unknown, value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || value.length > 320
    || (channel === "EMAIL_VERIFICADO" && !EMAIL.test(value))
    || (channel === "WHATSAPP_VERIFICADO" && !TELEFONO.test(value))) return invalid();
  return value;
}

function requireChannel(value: unknown): "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO" {
  if (value !== "EMAIL_VERIFICADO" && value !== "WHATSAPP_VERIFICADO") return invalid();
  return value;
}

function failClosed(): never {
  throw new HttpsError("failed-precondition", "CONTACTO_EXPORTACION_SOLO_SINTETICO");
}

function genericDomainError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message === "CONTACT_AUTHORITY_OPERATOR_UNAUTHORIZED") {
    throw new HttpsError("permission-denied", "PLATFORM_ACCESS_DENIED");
  }
  if (message === "CONTACT_AUTHORITY_REQUEST_INVALID" || message === "CONTACT_AUTHORITY_CHALLENGE_INVALID") {
    throw new HttpsError("invalid-argument", "CONTACTO_EXPORTACION_ENTRADA_INVALIDA");
  }
  if (message === "CONTACT_AUTHORITY_DELIVERY_FAILED") {
    throw new HttpsError("failed-precondition", "CONTACTO_EXPORTACION_CANAL_NO_CONFIGURADO");
  }
  throw new HttpsError("failed-precondition", "CONTACTO_EXPORTACION_NO_DISPONIBLE");
}

/**
 * Backoffice operations for ADR-SAAS-109/112. Writes are enabled only for a
 * synthetic project when the caller explicitly opts in (Emulator tests); the
 * deployed callable passes false until the external channel is separately approved.
 */
export function createContactExportManager({
  db,
  projectId,
  allowSyntheticWrites = false,
  deliverChallenge = async (): Promise<{ reference: string }> => {
    throw new Error("CONTACT_CHANNEL_PROVIDER_UNAVAILABLE");
  },
  now = () => new Date(),
}: {
  db: Firestore;
  projectId: string;
  allowSyntheticWrites?: boolean;
  deliverChallenge?: DeliverChallenge;
  now?: () => Date;
}) {
  const designations = createFirestoreContactDesignationRepository({
    db, serverTimestamp: () => FieldValue.serverTimestamp(),
  });
  const authority = createFirestoreContactAuthorityRepository({
    db, serverTimestamp: () => FieldValue.serverTimestamp(),
  });

  const authorize = (actor: Actor, tx?: FirebaseFirestore.Transaction) => {
    if (!actor || typeof actor.uid !== "string" || !ID.test(actor.uid)) {
      throw new HttpsError("unauthenticated", "Autenticación requerida.");
    }
    return autorizarPlataforma(db, actor.uid, actor.token, FACULTAD, tx);
  };

  function workflow(actor: Actor) {
    return createContactAuthorityWorkflow({
      repository: authority,
      authorizeOperator: async ({ operatorUid }, tx) => {
        if (operatorUid !== actor.uid) return false;
        await authorize(actor, tx);
        return true;
      },
      resolveDesignation: (input, authorizeInTransaction) => designations.resolve({
        projectId: input.projectId, empresaId: input.empresaId, designationRef: input.evidenceRef,
      }, authorizeInTransaction),
      deliverChallenge,
      now: () => now().getTime(),
    });
  }

  async function handle(actor: Actor, rawInput: unknown) {
    const input = dataRecord(rawInput);
    const action = input.accion;
    try {
      if (action === "CONSULTAR") {
        requireKeys(input, ["accion", "empresaId"]);
        const empresaId = requireId(input.empresaId);
        await authorize(actor);
        const company = await db.collection("empresas").doc(empresaId).get();
        if (!company.exists) throw new HttpsError("not-found", "EMPRESA_NO_ENCONTRADA");
        const summary = await designations.readSummary(projectId, empresaId, async tx => { await authorize(actor, tx); });
        return { estado: summary?.estado ?? "SIN_DESIGNACION", designacion: summary };
      }

      if (action === "DESIGNAR") {
        requireKeys(input, ["accion", "empresaId", "canal", "destino", "instruccionRef", "instruccionConfirmada"]);
        const empresaId = requireId(input.empresaId);
        const canal = requireChannel(input.canal);
        const destino = requireDestination(canal, input.destino);
        const instruccionRef = requireReference(input.instruccionRef);
        if (input.instruccionConfirmada !== true) invalid();
        await authorize(actor);
        if (!allowSyntheticWrites || !projectId.startsWith("demo-")) failClosed();
        if (canal !== "EMAIL_VERIFICADO" || !destino.toLowerCase().endsWith(".invalid")) invalid();
        const company = await db.collection("empresas").doc(empresaId).get();
        if (!company.exists) throw new HttpsError("not-found", "EMPRESA_NO_ENCONTRADA");
        const fecha = now();
        if (!Number.isFinite(fecha.getTime())) throw new HttpsError("failed-precondition", "CONTACTO_EXPORTACION_NO_DISPONIBLE");
        const revision = await designations.propose({
          projectId, empresaId, operatorUid: actor.uid, contactId: randomUUID(), channel: canal,
          destination: destino, designationRef: instruccionRef, designationAt: fecha.toISOString(),
          confirmedInstruction: true,
        }, async tx => { await authorize(actor, tx); });
        if (!revision) throw new HttpsError("failed-precondition", "CONTACTO_EXPORTACION_DESIGNACION_NO_REGISTRADA");
        return { estado: "PENDIENTE_CANAL", revision };
      }

      if (action === "INICIAR_VERIFICACION") {
        requireKeys(input, ["accion", "empresaId", "instruccionRef"]);
        const empresaId = requireId(input.empresaId);
        const instruccionRef = requireReference(input.instruccionRef);
        await authorize(actor);
        if (!allowSyntheticWrites || !projectId.startsWith("demo-")) failClosed();
        const company = await db.collection("empresas").doc(empresaId).get();
        if (!company.exists) throw new HttpsError("not-found", "EMPRESA_NO_ENCONTRADA");
        return await workflow(actor).begin({ projectId, empresaId, operatorUid: actor.uid, evidenceRef: instruccionRef });
      }

      if (action === "VERIFICAR_CANAL") {
        requireKeys(input, ["accion", "empresaId", "challengeId", "codigo"]);
        const empresaId = requireId(input.empresaId);
        const challengeId = requireId(input.challengeId);
        if (typeof input.codigo !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.codigo)) invalid();
        await authorize(actor);
        if (!allowSyntheticWrites || !projectId.startsWith("demo-")) failClosed();
        return await workflow(actor).verify({
          projectId, empresaId, operatorUid: actor.uid, challengeId, token: input.codigo,
        });
      }

      if (action === "REVOCAR") {
        requireKeys(input, ["accion", "empresaId"]);
        const empresaId = requireId(input.empresaId);
        await authorize(actor);
        if (!allowSyntheticWrites || !projectId.startsWith("demo-")) failClosed();
        return await workflow(actor).revoke({ projectId, empresaId, operatorUid: actor.uid });
      }

      invalid();
    } catch (error) {
      return genericDomainError(error);
    }
  }

  return Object.freeze({ handle });
}
