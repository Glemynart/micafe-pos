import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { EXPORT_CONTACT_AUTHORITY_COLLECTION, validarAutoridadContacto, type ContactAuthoritySnapshot } from "./tenant-annex";
import {
  EXPORT_CONTACT_DESIGNATION_COLLECTION,
  validarDesignacionContactoActiva,
  validarDesignacionContactoPendiente,
} from "./contact-designation";

const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const refPattern = /^[A-Za-z0-9._:-]{1,160}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const sameHash = (left: unknown, right: string) => typeof left === "string" && /^[a-f0-9]{64}$/.test(left)
  && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
const validDate = (value: unknown): value is string => typeof value === "string"
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export type ContactDesignation = {
  projectId: string;
  empresaId: string;
  contactId: string;
  channel: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO";
  destination: string;
  designationRef: string;
  designationAt: string;
  designationVersion: number;
  designationVerified: true;
};

type PendingContactChallenge = {
  projectId: string;
  empresaId: string;
  challengeId: string;
  contactId: string;
  channel: ContactDesignation["channel"];
  designationRef: string;
  channelProofRef: string;
  designationAt: string;
  designationVersion: number;
  tokenSha256: string;
  expectedVersion: number;
  createdAt: string;
  expiresAt: string;
  state: "PENDING" | "DELIVERED" | "FAILED" | "CONSUMED";
  deliveryRef?: string;
};

export type ContactAuthorityRepository = {
  createPending(input: Omit<PendingContactChallenge, "expectedVersion">): Promise<number | null>;
  markDelivered(projectId: string, empresaId: string, challengeId: string, deliveryRef: string): Promise<boolean>;
  markFailed(projectId: string, empresaId: string, challengeId: string): Promise<boolean>;
  consume(input: { projectId: string; empresaId: string; challengeId: string; tokenSha256: string; now: string }): Promise<ContactAuthoritySnapshot | null>;
  revoke(input: { projectId: string; empresaId: string; actorUid: string; eventId: string; now: string }): Promise<boolean>;
  readActive(projectId: string, empresaId: string): Promise<ContactAuthoritySnapshot | null>;
};

export function createContactAuthorityWorkflow({
  repository,
  authorizeOperator,
  resolveDesignation,
  deliverChallenge,
  now = () => Date.now(),
  createChallengeId = randomUUID,
  createToken = () => randomBytes(32).toString("base64url"),
}: {
  repository: ContactAuthorityRepository;
  authorizeOperator: (input: { projectId: string; empresaId: string; operatorUid: string; action: "DESIGNATE" | "REVOKE" }) => Promise<boolean>;
  resolveDesignation: (input: { projectId: string; empresaId: string; evidenceRef: string }) => Promise<ContactDesignation | null>;
  deliverChallenge: (input: { destination: string; channel: ContactDesignation["channel"]; challenge: string; idempotencyKey: string }) => Promise<{ reference: string }>;
  now?: () => number;
  createChallengeId?: () => string;
  createToken?: () => string;
}) {
  if (!repository || typeof authorizeOperator !== "function" || typeof resolveDesignation !== "function"
    || typeof deliverChallenge !== "function") throw new Error("CONTACT_AUTHORITY_NOT_CONFIGURED");

  async function begin(input: { projectId: string; empresaId: string; operatorUid: string; evidenceRef: string }) {
    if (!idPattern.test(input.projectId) || !idPattern.test(input.empresaId) || !idPattern.test(input.operatorUid)
      || !refPattern.test(input.evidenceRef)) throw new Error("CONTACT_AUTHORITY_REQUEST_INVALID");
    if (await authorizeOperator({ projectId: input.projectId, empresaId: input.empresaId, operatorUid: input.operatorUid, action: "DESIGNATE" }) !== true) {
      throw new Error("CONTACT_AUTHORITY_OPERATOR_UNAUTHORIZED");
    }
    const designation = await resolveDesignation({ projectId: input.projectId, empresaId: input.empresaId, evidenceRef: input.evidenceRef });
    if (!designation || designation.projectId !== input.projectId || designation.empresaId !== input.empresaId
      || designation.designationVerified !== true || !idPattern.test(designation.contactId ?? "")
      || !["EMAIL_VERIFICADO", "WHATSAPP_VERIFICADO"].includes(designation.channel)
      || !refPattern.test(designation.designationRef ?? "") || !validDate(designation.designationAt)
      || !Number.isSafeInteger(designation.designationVersion) || designation.designationVersion < 1
      || typeof designation.destination !== "string" || designation.destination.trim().length < 3
      || designation.destination.length > 320 || /[\r\n\u0000-\u001f]/.test(designation.destination)) {
      throw new Error("CONTACT_AUTHORITY_DESIGNATION_UNVERIFIED");
    }
    const token = createToken();
    const challengeId = createChallengeId();
    const issuedAt = now();
    const expiresAt = issuedAt + 10 * 60_000;
    if (!tokenPattern.test(token) || !idPattern.test(challengeId) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
      || Date.parse(designation.designationAt) > issuedAt) {
      throw new Error("CONTACT_AUTHORITY_CHALLENGE_INVALID");
    }
    const record: Omit<PendingContactChallenge, "expectedVersion"> = {
      projectId: input.projectId,
      empresaId: input.empresaId,
      challengeId,
      contactId: designation.contactId,
      channel: designation.channel,
      designationRef: designation.designationRef,
      channelProofRef: `channel:${challengeId}`,
      designationAt: designation.designationAt,
      designationVersion: designation.designationVersion,
      tokenSha256: hashToken(token),
      createdAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      state: "PENDING",
    };
    const expectedVersion = await repository.createPending(record);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion! < 1) throw new Error("CONTACT_AUTHORITY_CHALLENGE_NOT_CREATED");
    let delivered: { reference: string };
    try {
      delivered = await deliverChallenge({
        destination: designation.destination,
        channel: designation.channel,
        challenge: token,
        idempotencyKey: challengeId,
      });
      if (!delivered || !refPattern.test(delivered.reference ?? "")) throw new Error("DELIVERY_REFERENCE_INVALID");
    } catch {
      await repository.markFailed(input.projectId, input.empresaId, challengeId).catch(() => false);
      throw new Error("CONTACT_AUTHORITY_DELIVERY_FAILED");
    }
    if (!await repository.markDelivered(input.projectId, input.empresaId, challengeId, delivered.reference)) {
      throw new Error("CONTACT_AUTHORITY_DELIVERY_NOT_RECORDED");
    }
    return Object.freeze({ challengeId, expiresAt: record.expiresAt, expectedVersion });
  }

  async function verify(input: { projectId: string; empresaId: string; challengeId: string; token: string }) {
    if (!idPattern.test(input.projectId) || !idPattern.test(input.empresaId) || !idPattern.test(input.challengeId) || !tokenPattern.test(input.token)) {
      throw new Error("CONTACT_AUTHORITY_CHALLENGE_INVALID");
    }
    const current = now();
    if (!Number.isFinite(current)) throw new Error("CONTACT_AUTHORITY_CLOCK_INVALID");
    const authority = await repository.consume({
      projectId: input.projectId,
      empresaId: input.empresaId,
      challengeId: input.challengeId,
      tokenSha256: hashToken(input.token),
      now: new Date(current).toISOString(),
    }).catch(() => null);
    if (!authority || !validarAutoridadContacto(authority, input.projectId, input.empresaId)) throw new Error("CONTACT_AUTHORITY_CHALLENGE_INVALID");
    return Object.freeze({ verified: true, contactId: authority.contacto.id, version: authority.contacto.version });
  }

  async function revoke(input: { projectId: string; empresaId: string; operatorUid: string }) {
    if (!idPattern.test(input.projectId) || !idPattern.test(input.empresaId) || !idPattern.test(input.operatorUid)) throw new Error("CONTACT_AUTHORITY_REQUEST_INVALID");
    if (await authorizeOperator({ projectId: input.projectId, empresaId: input.empresaId, operatorUid: input.operatorUid, action: "REVOKE" }) !== true) {
      throw new Error("CONTACT_AUTHORITY_OPERATOR_UNAUTHORIZED");
    }
    const current = now();
    if (!Number.isFinite(current)) throw new Error("CONTACT_AUTHORITY_CLOCK_INVALID");
    const timestamp = new Date(current).toISOString();
    if (!validDate(timestamp) || !await repository.revoke({
      projectId: input.projectId, empresaId: input.empresaId, actorUid: input.operatorUid, eventId: randomUUID(), now: timestamp,
    })) throw new Error("CONTACT_AUTHORITY_NOT_ACTIVE");
    return Object.freeze({ revoked: true });
  }

  return Object.freeze({ begin, verify, revoke });
}

export function createFirestoreContactAuthorityRepository({ db, serverTimestamp }: { db: any; serverTimestamp: () => unknown }): ContactAuthorityRepository {
  if (!db || typeof db.runTransaction !== "function" || typeof serverTimestamp !== "function") throw new Error("CONTACT_AUTHORITY_STORE_NOT_CONFIGURED");
  const tenantRef = (empresaId: string) => db.collection(EXPORT_CONTACT_AUTHORITY_COLLECTION).doc(empresaId);
  const designationRef = (empresaId: string) => db.collection(EXPORT_CONTACT_DESIGNATION_COLLECTION).doc(empresaId);
  const eventRef = (empresaId: string, id: string) => tenantRef(empresaId).collection("events").doc(id);
  const challengeRef = (empresaId: string, id: string) => tenantRef(empresaId).collection("challenges").doc(id);
  const versionId = (version: number) => `v${String(version).padStart(6, "0")}`;

  return Object.freeze({
    async createPending(input) {
      try {
        return await db.runTransaction(async (tx: any) => {
          const root = tenantRef(input.empresaId);
          const challenge = challengeRef(input.empresaId, input.challengeId);
          const designation = designationRef(input.empresaId);
          const [rootSnap, challengeSnap, designationSnap] = await Promise.all([tx.get(root), tx.get(challenge), tx.get(designation)]);
          const current = rootSnap.exists ? rootSnap.data() : null;
          const currentDesignation = designationSnap.exists ? designationSnap.data() : null;
          if (challengeSnap.exists || current && (current.projectId !== input.projectId || current.empresaId !== input.empresaId
            || !Number.isSafeInteger(current.revision) || current.revision < 0)
            || !validarDesignacionContactoPendiente(currentDesignation, {
              projectId: input.projectId, empresaId: input.empresaId, contactId: input.contactId,
              channel: input.channel, designationRef: input.designationRef, designationVersion: input.designationVersion,
            })) return null;
          const expectedVersion = (current?.revision ?? 0) + 1;
          tx.create(challenge, { ...input, expectedVersion });
          tx.create(eventRef(input.empresaId, `challenge-${input.challengeId}`), {
            schemaVersion: 1, tipo: "VERIFICACION_INICIADA", empresaId: input.empresaId, projectId: input.projectId,
            challengeId: input.challengeId, contactId: input.contactId, version: expectedVersion,
            referenciaDesignacion: input.designationRef, creadoEn: serverTimestamp(),
          });
          return expectedVersion;
        });
      } catch { return null; }
    },
    async markDelivered(projectId, empresaId, challengeId, deliveryRef) {
      if (!refPattern.test(deliveryRef)) return false;
      try {
        return await db.runTransaction(async (tx: any) => {
          const ref = challengeRef(empresaId, challengeId);
          const snap = await tx.get(ref);
          const value = snap.data();
          if (!snap.exists || value.projectId !== projectId || value.empresaId !== empresaId || value.state !== "PENDING") return false;
          const deliveredAt = serverTimestamp();
          tx.update(ref, { state: "DELIVERED", deliveryRef, deliveredAt });
          tx.create(eventRef(empresaId, `delivered-${challengeId}`), {
            schemaVersion: 1, tipo: "VERIFICACION_ENTREGADA", empresaId, projectId, challengeId,
            contactId: value.contactId, version: value.expectedVersion, referenciaEntrega: deliveryRef,
            creadoEn: deliveredAt,
          });
          return true;
        });
      } catch { return false; }
    },
    async markFailed(projectId, empresaId, challengeId) {
      try {
        return await db.runTransaction(async (tx: any) => {
          const ref = challengeRef(empresaId, challengeId);
          const snap = await tx.get(ref);
          const value = snap.data();
          if (!snap.exists || value.projectId !== projectId || value.empresaId !== empresaId || value.state !== "PENDING") return false;
          tx.update(ref, { state: "FAILED", failedAt: serverTimestamp(), tokenSha256: null });
          tx.create(eventRef(empresaId, `delivery-failed-${challengeId}`), {
            schemaVersion: 1, tipo: "ENTREGA_FALLIDA", empresaId, projectId, challengeId, creadoEn: serverTimestamp(),
          });
          return true;
        });
      } catch { return false; }
    },
    async consume(input) {
      try {
        return await db.runTransaction(async (tx: any) => {
          const root = tenantRef(input.empresaId);
          const challenge = challengeRef(input.empresaId, input.challengeId);
          const designation = designationRef(input.empresaId);
          const [rootSnap, challengeSnap, designationSnap] = await Promise.all([tx.get(root), tx.get(challenge), tx.get(designation)]);
          const current = rootSnap.exists ? rootSnap.data() : null;
          const pending = challengeSnap.exists ? challengeSnap.data() : null;
          const currentDesignation = designationSnap.exists ? designationSnap.data() : null;
          const nowMs = Date.parse(input.now);
          if (!pending || pending.projectId !== input.projectId || pending.empresaId !== input.empresaId
            || current && (current.projectId !== input.projectId || current.empresaId !== input.empresaId
              || !Number.isSafeInteger(current.revision) || current.revision < 0)
            || pending.state !== "DELIVERED" || !sameHash(pending.tokenSha256, input.tokenSha256)
            || !validarDesignacionContactoPendiente(currentDesignation, {
              projectId: input.projectId, empresaId: input.empresaId, contactId: pending.contactId,
              channel: pending.channel, designationRef: pending.designationRef, designationVersion: pending.designationVersion,
            })
            || Date.parse(pending.expiresAt) <= nowMs || !Number.isFinite(nowMs)
            || pending.expectedVersion !== (current?.revision ?? 0) + 1
            || !validDate(pending.createdAt) || !validDate(pending.expiresAt) || !validDate(pending.designationAt)
            || Date.parse(pending.createdAt) > nowMs || Date.parse(pending.expiresAt) <= Date.parse(pending.createdAt)
            || Date.parse(pending.expiresAt) - Date.parse(pending.createdAt) > 10 * 60_000
            || !["EMAIL_VERIFICADO", "WHATSAPP_VERIFICADO"].includes(pending.channel)
            || !idPattern.test(pending.contactId) || !refPattern.test(pending.designationRef)
            || !Number.isSafeInteger(pending.designationVersion) || pending.designationVersion < 1
            || !refPattern.test(pending.channelProofRef)) return null;
          const version = pending.expectedVersion as number;
          const activatedAt = serverTimestamp();
          const contact = {
            id: pending.contactId,
            version,
            designacionVersion: pending.designationVersion,
            canal: pending.channel,
            designacionRef: pending.designationRef,
            pruebaCanalRef: pending.channelProofRef,
            designadoEn: pending.designationAt,
            verificadoEn: input.now,
          } as const;
          const authority: ContactAuthoritySnapshot = {
            schemaVersion: 1, projectId: input.projectId, empresaId: input.empresaId,
            revision: version, estado: "ACTIVO", contacto: contact,
          };
          const versionRef = root.collection("versions").doc(versionId(version));
          const event = eventRef(input.empresaId, `verified-${input.challengeId}`);
          tx.create(versionRef, { ...authority, creadoEn: activatedAt });
          tx.set(root, { ...authority, actualizadoEn: activatedAt, revocadaEn: null, revocadoPorUid: null });
          tx.update(designation, { estado: "ACTIVO", actualizadoEn: activatedAt, canalVerificadoEn: input.now });
          tx.update(challenge, { state: "CONSUMED", consumedAt: activatedAt, tokenSha256: null });
          tx.create(event, {
            schemaVersion: 1, tipo: "CONTACTO_VERIFICADO", empresaId: input.empresaId, projectId: input.projectId,
            challengeId: input.challengeId, contactId: pending.contactId, version, creadoEn: activatedAt,
          });
          return authority;
        });
      } catch { return null; }
    },
    async revoke(input) {
      try {
        return await db.runTransaction(async (tx: any) => {
          const root = tenantRef(input.empresaId);
          const designation = designationRef(input.empresaId);
          const snap = await tx.get(root);
          const designationSnap = await tx.get(designation);
          const current = snap.data();
          const currentDesignation = designationSnap.data();
          if (!designationSnap.exists || currentDesignation.projectId !== input.projectId || currentDesignation.empresaId !== input.empresaId
            || !["PENDIENTE_CANAL", "ACTIVO"].includes(currentDesignation.estado)
            || !Number.isSafeInteger(currentDesignation.revision) || !currentDesignation.contacto?.id) return false;
          const event = eventRef(input.empresaId, `revoked-${input.eventId}`);
          const revokedAt = serverTimestamp();
          if (snap.exists && current.projectId === input.projectId && current.empresaId === input.empresaId && current.estado === "ACTIVO") {
            tx.update(root, { estado: "REVOCADO", revocadaEn: revokedAt, revocadoPorUid: input.actorUid });
            tx.create(event, {
              schemaVersion: 1, tipo: "CONTACTO_REVOCADO", empresaId: input.empresaId, projectId: input.projectId,
              actorUid: input.actorUid, version: current.revision, creadoEn: revokedAt,
            });
          }
          tx.update(designation, {
            estado: "REVOCADO", actualizadoEn: revokedAt,
            contacto: { ...currentDesignation.contacto, destino: null },
          });
          tx.create(designation.collection("events").doc(`revoked-${String(currentDesignation.revision).padStart(6, "0")}`), {
            schemaVersion: 1, tipo: "DESIGNACION_REVOCADA", empresaId: input.empresaId, projectId: input.projectId,
            actorUid: input.actorUid, contactId: currentDesignation.contacto.id,
            version: currentDesignation.revision, creadoEn: revokedAt,
          });
          return true;
        });
      } catch { return false; }
    },
    async readActive(projectId, empresaId) {
      try {
        return await db.runTransaction(async (tx: any) => {
          const [snap, designationSnap] = await Promise.all([tx.get(tenantRef(empresaId)), tx.get(designationRef(empresaId))]);
          const value = snap.data();
          const designation = designationSnap.data();
          return snap.exists && designationSnap.exists && validarAutoridadContacto(value, projectId, empresaId)
            && validarDesignacionContactoActiva(designation, {
              projectId, empresaId, contactId: value.contacto.id, channel: value.contacto.canal,
              designationRef: value.contacto.designacionRef, designationAt: value.contacto.designadoEn,
              designationVersion: value.contacto.designacionVersion,
            })
            ? value : null;
        });
      } catch { return null; }
    },
  });
}

/** Adapter for ADR-SAAS-106: destinations are resolved by a server-only port and never persisted here. */
export function createVerifiedExportContactPorts({ repository, resolveDestination }: {
  repository: Pick<ContactAuthorityRepository, "readActive">;
  resolveDestination: (contact: ContactAuthoritySnapshot["contacto"]) => Promise<string | null>;
}) {
  if (!repository || typeof resolveDestination !== "function") throw new Error("CONTACT_AUTHORITY_EXPORT_PORTS_NOT_CONFIGURED");
  return Object.freeze({
    async resolveVerifiedContact({ project, tenant }: { project: string; tenant: string }) {
      const authority = await repository.readActive(project, tenant);
      if (!authority || authority.estado !== "ACTIVO") return null;
      const destination = await resolveDestination(authority.contacto);
      if (!destination) return null;
      return {
        project: authority.projectId, tenant: authority.empresaId, id: authority.contacto.id,
        version: authority.contacto.version, channel: authority.contacto.canal, verified: true, active: true, destination,
      };
    },
    async contactVersionIsActive({ project, tenant, contactId, version }: { project: string; tenant: string; contactId: string; version: number }) {
      const authority = await repository.readActive(project, tenant);
      return !!authority && authority.contacto.id === contactId && authority.contacto.version === version;
    },
  });
}
