import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createContactExportManager } from "./contact-export-manager";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

test("Emulator: contacto de exportación exige facultad, contacto sintético, canal de un uso y revocación", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") && !emulatorHost?.startsWith("localhost:")) throw new Error("La prueba exige Firestore Emulator en loopback.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("La prueba no debe usar credenciales reales.");
  const suffix = randomUUID();
  const projectId = "demo-legal-acceptance";
  const empresaId = `tenant-${suffix}`;
  const uid = `operator-${suffix}`;
  const noFacultyUid = `operator-no-faculty-${suffix}`;
  const app = initializeApp({ projectId }, `contact-manager-${suffix}`);
  const db = getFirestore(app);
  const operator = db.collection("saas_operadores").doc(uid);
  const noFacultyOperator = db.collection("saas_operadores").doc(noFacultyUid);
  const actor = { uid, token: { saas: { operador: true, versionAutorizacion: 1 } } };
  let deliveredCode = "";
  const manager = createContactExportManager({
    db, projectId, allowSyntheticWrites: true,
    deliverChallenge: async ({ destination, channel, challenge }) => {
      assert.equal(destination, "contacto@example.invalid");
      assert.equal(channel, "EMAIL_VERIFICADO");
      deliveredCode = challenge;
      return { reference: "delivery:synthetic" };
    },
    now: () => new Date("2026-11-28T16:00:00.000Z"),
  });
  const root = db.collection("saas_export_contact_authorities").doc(empresaId);
  const designationRoot = db.collection("saas_export_contact_designations").doc(empresaId);
  try {
    await Promise.all([
      operator.set({ uid, estado: "ACTIVO", versionAutorizacion: 1, facultades: ["EXPORTACION_CONTACTO_GOBERNAR"] }),
      noFacultyOperator.set({ uid: noFacultyUid, estado: "ACTIVO", versionAutorizacion: 1, facultades: ["PRIVACIDAD_CONSULTAS_TRAMITAR"] }),
      db.collection("empresas").doc(empresaId).set({ estado: "activa", nombre: "Tenant sintético" }),
    ]);

    await assert.rejects(manager.handle({ uid: noFacultyUid, token: { saas: { operador: true, versionAutorizacion: 1 } } }, {
      accion: "DESIGNAR", empresaId, canal: "EMAIL_VERIFICADO", destino: "contacto@example.invalid",
      instruccionRef: "instruccion:sintetica", instruccionConfirmada: true,
    }), /PLATFORM_ACCESS_DENIED/);

    const propuesta = await manager.handle(actor, {
      accion: "DESIGNAR", empresaId, canal: "EMAIL_VERIFICADO", destino: "contacto@example.invalid",
      instruccionRef: "instruccion:sintetica", instruccionConfirmada: true,
    });
    assert.deepEqual(propuesta, { estado: "PENDIENTE_CANAL", revision: 1 });
    await assert.rejects(manager.handle(actor, {
      accion: "DESIGNAR", empresaId, canal: "EMAIL_VERIFICADO", destino: "contacto@example.com",
      instruccionRef: "instruccion:real", instruccionConfirmada: true,
    }), /CONTACTO_EXPORTACION_ENTRADA_INVALIDA/);

    const status = await manager.handle(actor, { accion: "CONSULTAR", empresaId }) as any;
    assert.equal(status.estado, "PENDIENTE_CANAL");
    assert.equal(status.designacion.maskedDestination, "c•••@example.invalid");
    assert.doesNotMatch(JSON.stringify(status), /contacto@example\.invalid/);

    const noProviderManager = createContactExportManager({
      db, projectId, allowSyntheticWrites: true,
      now: () => new Date("2026-11-28T16:00:00.000Z"),
    });
    await assert.rejects(noProviderManager.handle(actor, {
      accion: "INICIAR_VERIFICACION", empresaId, instruccionRef: "instruccion:sintetica",
    }), /CONTACTO_EXPORTACION_CANAL_NO_CONFIGURADO/);
    const failedDeliveries = await root.collection("challenges").where("state", "==", "FAILED").get();
    assert.equal(failedDeliveries.size, 1);
    assert.equal(failedDeliveries.docs[0].get("tokenSha256"), null);
    assert.equal((await designationRoot.get()).get("estado"), "PENDIENTE_CANAL");

    const tenantRef = db.collection("empresas").doc(empresaId);
    const racingManager = createContactExportManager({
      db, projectId, allowSyntheticWrites: true,
      deliverChallenge: async () => {
        await tenantRef.delete();
        return { reference: "delivery:tenant-removed" };
      },
      now: () => new Date("2026-11-28T16:00:00.000Z"),
    });
    await assert.rejects(racingManager.handle(actor, {
      accion: "INICIAR_VERIFICACION", empresaId, instruccionRef: "instruccion:sintetica",
    }), /CONTACTO_EXPORTACION_NO_DISPONIBLE/);
    const allFailedDeliveries = await root.collection("challenges").where("state", "==", "FAILED").get();
    assert.equal(allFailedDeliveries.size, 2);
    assert.ok(allFailedDeliveries.docs.every(doc => doc.get("tokenSha256") === null));
    await tenantRef.set({ estado: "activa", nombre: "Tenant sintético" });

    const challenge = await manager.handle(actor, { accion: "INICIAR_VERIFICACION", empresaId, instruccionRef: "instruccion:sintetica" }) as any;
    assert.equal(typeof challenge.challengeId, "string");
    assert.equal("token" in challenge, false);
    assert.equal("codigo" in challenge, false);
    const storedChallenge = (await root.collection("challenges").doc(challenge.challengeId).get()).data();
    assert.equal(storedChallenge?.state, "DELIVERED");
    assert.doesNotMatch(JSON.stringify(storedChallenge), /contacto@example\.invalid/);
    assert.doesNotMatch(JSON.stringify(storedChallenge), new RegExp(deliveredCode));

    const verification = await manager.handle(actor, {
      accion: "VERIFICAR_CANAL", empresaId, challengeId: challenge.challengeId, codigo: deliveredCode,
    });
    assert.deepEqual(verification, { verified: true, contactId: (await designationRoot.get()).get("contacto.id"), version: 1 });
    assert.equal((await designationRoot.get()).get("estado"), "ACTIVO");

    await operator.update({ facultades: [], versionAutorizacion: 2 });
    await assert.rejects(manager.handle(actor, { accion: "CONSULTAR", empresaId }), /PLATFORM_ACCESS_DENIED/);
    await operator.update({ facultades: ["EXPORTACION_CONTACTO_GOBERNAR"], versionAutorizacion: 3 });
    const currentActor = { uid, token: { saas: { operador: true, versionAutorizacion: 3 } } };
    assert.deepEqual(await manager.handle(currentActor, { accion: "REVOCAR", empresaId }), { revoked: true });
    assert.equal((await designationRoot.get()).get("estado"), "REVOCADO");
    assert.equal((await designationRoot.get()).get("contacto.destino"), null);
    assert.equal(await manager.handle(currentActor, { accion: "CONSULTAR", empresaId }).then((value: any) => value.estado), "REVOCADO");
  } finally {
    const [challenges, versions, authorityEvents, designationEvents, audit, obligations, deniedAudit, deniedObligations] = await Promise.all([
      root.collection("challenges").get(), root.collection("versions").get(), root.collection("events").get(),
      designationRoot.collection("events").get(), db.collection("saas_auditoria").where("actor.uid", "==", uid).get(),
      db.collection("saas_auditoria_obligaciones").where("actor.uid", "==", uid).get(),
      db.collection("saas_auditoria").where("actor.uid", "==", noFacultyUid).get(),
      db.collection("saas_auditoria_obligaciones").where("actor.uid", "==", noFacultyUid).get(),
    ]);
    const batch = db.batch();
    for (const doc of [...challenges.docs, ...versions.docs, ...authorityEvents.docs, ...designationEvents.docs, ...audit.docs, ...obligations.docs, ...deniedAudit.docs, ...deniedObligations.docs]) batch.delete(doc.ref);
    batch.delete(root); batch.delete(designationRoot); batch.delete(operator); batch.delete(noFacultyOperator);
    batch.delete(db.collection("empresas").doc(empresaId));
    await batch.commit();
    await deleteApp(app);
  }
});

test("el manager rechaza escrituras fuera de un proyecto Emulator demo", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") && !emulatorHost?.startsWith("localhost:")) throw new Error("La prueba exige Firestore Emulator en loopback.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("La prueba no debe usar credenciales reales.");
  const suffix = randomUUID();
  const app = initializeApp({ projectId: "demo-legal-acceptance" }, `contact-manager-closed-${suffix}`);
  const db = getFirestore(app);
  const uid = `operator-${suffix}`;
  const empresaId = `tenant-${suffix}`;
  try {
    await Promise.all([
      db.collection("saas_operadores").doc(uid).set({ uid, estado: "ACTIVO", versionAutorizacion: 1, facultades: ["EXPORTACION_CONTACTO_GOBERNAR"] }),
      db.collection("empresas").doc(empresaId).set({ estado: "activa" }),
    ]);
    const manager = createContactExportManager({ db, projectId: "micafe-pos", allowSyntheticWrites: false });
    await assert.rejects(manager.handle({ uid, token: { saas: { operador: true, versionAutorizacion: 1 } } }, {
      accion: "DESIGNAR", empresaId, canal: "EMAIL_VERIFICADO", destino: "contacto@example.invalid",
      instruccionRef: "instruccion:sintetica", instruccionConfirmada: true,
    }), /CONTACTO_EXPORTACION_SOLO_SINTETICO/);
    assert.equal((await db.collection("saas_export_contact_designations").doc(empresaId).get()).exists, false);
  } finally {
    const [audit, obligations] = await Promise.all([
      db.collection("saas_auditoria").where("actor.uid", "==", uid).get(),
      db.collection("saas_auditoria_obligaciones").where("actor.uid", "==", uid).get(),
    ]);
    const batch = db.batch();
    for (const doc of [...audit.docs, ...obligations.docs]) batch.delete(doc.ref);
    batch.delete(db.collection("saas_operadores").doc(uid));
    batch.delete(db.collection("empresas").doc(empresaId));
    await batch.commit();
    await deleteApp(app);
  }
});
