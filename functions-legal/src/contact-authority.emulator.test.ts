import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  createContactAuthorityWorkflow,
  createFirestoreContactAuthorityRepository,
  createVerifiedExportContactPorts,
} from "../../functions/src/legal/contact-authority";
import { createFirestoreContactDesignationRepository, EXPORT_CONTACT_DESIGNATION_COLLECTION } from "../../functions/src/legal/contact-designation";
import { EXPORT_CONTACT_AUTHORITY_COLLECTION } from "../../functions/src/legal/tenant-annex";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

test("Emulator: private designation source binds one-use channel proof without copying destination or token into authority/events", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") && !emulatorHost?.startsWith("localhost:")) throw new Error("La prueba exige Firestore Emulator en loopback.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("La prueba no debe usar credenciales reales.");
  const suffix = randomUUID();
  const projectId = "demo-legal-contact";
  const empresaId = `tenant-${suffix}`;
  const app = initializeApp({ projectId }, `legal-contact-${suffix}`);
  const db = getFirestore(app);
  let deliveredToken = "";
  const repository = createFirestoreContactAuthorityRepository({ db, serverTimestamp: () => new Date() });
  const designations = createFirestoreContactDesignationRepository({ db, serverTimestamp: () => new Date() });
  const designationRoot = db.collection(EXPORT_CONTACT_DESIGNATION_COLLECTION).doc(empresaId);
  const empresa = db.collection("empresas").doc(empresaId);
  await empresa.set({ estado: "activa", nombre: "Tenant sintético" });
  assert.equal(await designations.propose({
    projectId, empresaId, operatorUid: "operator-synthetic", contactId: "contact-synthetic",
    channel: "EMAIL_VERIFICADO", destination: "synthetic-contact@example.invalid",
    designationRef: "designation:synthetic", designationAt: "2026-11-27T14:55:00.000Z", confirmedInstruction: true,
  }), 1);
  const designationSummary = await designations.readSummary(projectId, empresaId);
  assert.equal(designationSummary?.maskedDestination, "s•••@example.invalid");
  assert.doesNotMatch(JSON.stringify(designationSummary), /synthetic-contact@example\.invalid/);
  const workflow = createContactAuthorityWorkflow({
    repository,
    authorizeOperator: async ({ operatorUid }) => operatorUid === "operator-synthetic" ,
    resolveDesignation: ({ projectId: requestedProject, empresaId: requestedTenant, evidenceRef }, authorize) => designations.resolve({
      projectId: requestedProject, empresaId: requestedTenant, designationRef: evidenceRef,
    }, authorize),
    deliverChallenge: async ({ destination, channel, challenge }) => {
      assert.equal(destination, "synthetic-contact@example.invalid");
      assert.equal(channel, "EMAIL_VERIFICADO");
      deliveredToken = challenge;
      return { reference: "delivery:synthetic" };
    },
    now: () => Date.parse("2026-11-27T15:00:00.000Z"),
    createChallengeId: () => "challenge-synthetic",
    createToken: () => "A".repeat(43),
  });
  const root = db.collection(EXPORT_CONTACT_AUTHORITY_COLLECTION).doc(empresaId);
  try {
    const challenge = await workflow.begin({ projectId, empresaId, operatorUid: "operator-synthetic", evidenceRef: "designation:synthetic" });
    const storedChallenge = (await root.collection("challenges").doc(challenge.challengeId).get()).data();
    assert.equal(storedChallenge?.state, "DELIVERED");
    assert.notEqual(storedChallenge?.tokenSha256, deliveredToken);
    assert.doesNotMatch(JSON.stringify(storedChallenge), /synthetic-contact@example\.invalid|A{20}/);
    const deliveryEvent = await root.collection("events").doc(`delivered-${challenge.challengeId}`).get();
    assert.equal(deliveryEvent.data()?.tipo, "VERIFICACION_ENTREGADA");
    assert.equal(deliveryEvent.data()?.referenciaEntrega, "delivery:synthetic");
    assert.doesNotMatch(JSON.stringify(deliveryEvent.data()), /synthetic-contact@example\.invalid|A{20}/);
    assert.equal((await designationRoot.get()).data()?.contacto.destino, "synthetic-contact@example.invalid");

    const verified = await workflow.verify({ projectId, empresaId, operatorUid: "operator-synthetic", challengeId: challenge.challengeId, token: deliveredToken });
    assert.deepEqual(verified, { verified: true, contactId: "contact-synthetic", version: 1 });
    const authority = await repository.readActive(projectId, empresaId);
    assert.equal(authority?.contacto.version, 1);
    assert.equal((await root.collection("versions").doc("v000001").get()).exists, true);

    const ports = createVerifiedExportContactPorts({
      repository,
      resolveDestination: (contact) => designations.readDestination({
        projectId, empresaId, contactId: contact.id, designationVersion: contact.designacionVersion,
      }),
    });
    const resolved = await ports.resolveVerifiedContact({ project: projectId, tenant: empresaId });
    assert.equal(resolved?.version, 1);
    assert.equal(await ports.contactVersionIsActive({ project: projectId, tenant: empresaId, contactId: "contact-synthetic", version: 1 }), true);
    assert.equal(await ports.contactVersionIsActive({ project: projectId, tenant: empresaId, contactId: "contact-synthetic", version: 2 }), false);

    await assert.rejects(workflow.verify({ projectId, empresaId, operatorUid: "operator-synthetic", challengeId: challenge.challengeId, token: deliveredToken }), /CONTACT_AUTHORITY_CHALLENGE_INVALID/);
    await workflow.revoke({ projectId, empresaId, operatorUid: "operator-synthetic" });
    assert.equal(await repository.readActive(projectId, empresaId), null);
    assert.equal((await designationRoot.get()).data()?.contacto.destino, null);
    assert.equal((await root.collection("versions").doc("v000001").get()).exists, true);
  } finally {
    const [challenges, versions, events, designationEvents] = await Promise.all([
      root.collection("challenges").get(), root.collection("versions").get(), root.collection("events").get(),
      designationRoot.collection("events").get(),
    ]);
    const batch = db.batch();
    for (const doc of [...challenges.docs, ...versions.docs, ...events.docs, ...designationEvents.docs]) batch.delete(doc.ref);
    batch.delete(root);
    batch.delete(designationRoot);
    batch.delete(empresa);
    await batch.commit();
    await deleteApp(app);
  }
});

test("Emulator: rechaza autoridades de proyecto cruzado y TTL alterados", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") && !emulatorHost?.startsWith("localhost:")) throw new Error("La prueba exige Firestore Emulator en loopback.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("La prueba no debe usar credenciales reales.");
  const suffix = randomUUID();
  const projectId = "demo-legal-contact";
  const empresaId = `tenant-${suffix}`;
  const app = initializeApp({ projectId }, `legal-contact-invalid-${suffix}`);
  const db = getFirestore(app);
  const repository = createFirestoreContactAuthorityRepository({ db, serverTimestamp: () => new Date() });
  const root = db.collection(EXPORT_CONTACT_AUTHORITY_COLLECTION).doc(empresaId);
  const designationRoot = db.collection(EXPORT_CONTACT_DESIGNATION_COLLECTION).doc(empresaId);
  const token = "B".repeat(43);
  const tokenSha256 = createHash("sha256").update(token, "utf8").digest("hex");
  const now = "2026-11-27T15:00:00.000Z";
  const common = {
    projectId, empresaId, contactId: "contact-synthetic", channel: "EMAIL_VERIFICADO", designationRef: "designation:synthetic",
    channelProofRef: "channel:synthetic", designationAt: "2026-11-27T14:55:00.000Z", tokenSha256,
    expectedVersion: 1, designationVersion: 1, createdAt: now, state: "DELIVERED",
  };
  try {
    await designationRoot.set({ schemaVersion: 1, projectId, empresaId, revision: 1, estado: "PENDIENTE_CANAL", contacto: {
      id: "contact-synthetic", canal: "EMAIL_VERIFICADO", destino: "synthetic-contact@example.invalid",
      referenciaDesignacion: "designation:synthetic", designadoEn: "2026-11-27T14:55:00.000Z", verificadoPorUid: "operator-synthetic",
    } });
    await root.set({ schemaVersion: 1, projectId: "other-project", empresaId, revision: 0 });
    await root.collection("challenges").doc("wrong-root").set({ ...common, challengeId: "wrong-root", expiresAt: "2026-11-27T15:05:00.000Z" });
    assert.equal(await repository.consume({ projectId, empresaId, challengeId: "wrong-root", tokenSha256, now }), null);

    await root.set({ schemaVersion: 1, projectId, empresaId, revision: 0 });
    await root.collection("challenges").doc("long-ttl").set({ ...common, challengeId: "long-ttl", expiresAt: "2026-11-27T15:11:00.000Z" });
    assert.equal(await repository.consume({ projectId, empresaId, challengeId: "long-ttl", tokenSha256, now }), null);
    assert.equal((await root.collection("versions").get()).size, 0);
  } finally {
    const [challenges, versions, events] = await Promise.all([
      root.collection("challenges").get(), root.collection("versions").get(), root.collection("events").get(),
    ]);
    const batch = db.batch();
    for (const doc of [...challenges.docs, ...versions.docs, ...events.docs]) batch.delete(doc.ref);
    batch.delete(root);
    batch.delete(designationRoot);
    await batch.commit();
    await deleteApp(app);
  }
});

test("el contacto no se designa con folio no verificado y el operador debe tener autoridad", async () => {
  const repository = {
    createPending: async () => 1,
    markDelivered: async () => true,
    markFailed: async () => true,
    consume: async () => null,
    revoke: async () => true,
    readActive: async () => null,
  };
  const workflow = createContactAuthorityWorkflow({
    repository,
    authorizeOperator: async () => false,
    resolveDesignation: async () => null,
    deliverChallenge: async () => ({ reference: "delivery:synthetic" }),
    createChallengeId: () => "challenge-synthetic",
    createToken: () => "A".repeat(43),
  });
  await assert.rejects(workflow.begin({ projectId: "demo", empresaId: "tenant", operatorUid: "operator", evidenceRef: "free-text:1" }), /CONTACT_AUTHORITY_OPERATOR_UNAUTHORIZED/);
});
