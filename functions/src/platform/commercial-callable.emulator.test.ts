import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getApps, initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { consultarOfertaComercialTenantSaas } from "./commercial-callable";

const TEST_PROJECT_ID = "demo-e2-2-commercial-callable";
const APPROVED_TENANT_ID = "distribuidora-las-jimenez";
const APPROVED_OFFER_ID = "oferta-distribuidora-jimenez-2026";
const APPROVAL_CODE = "GATE_I_OFFER_1";
const APPROVAL_REFERENCE = "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const hasEmulator = emulatorHost !== undefined && /^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost);

if (emulatorHost !== undefined && !hasEmulator) {
  throw new Error("Commercial callable Emulator tests require a loopback Firestore Emulator.");
}
if (hasEmulator && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Commercial callable Emulator tests reject application credentials.");
}

const existingDefaultApp = getApps().find(app => app.name === "[DEFAULT]");
const app = hasEmulator
  ? existingDefaultApp ?? initializeApp({ projectId: TEST_PROJECT_ID })
  : undefined;
if (app && app.options.projectId !== TEST_PROJECT_ID) {
  throw new Error("Commercial callable Emulator tests require the dedicated demo project ID.");
}
const db = app ? getFirestore(app) : undefined;

// The callable permits only staging/production runtime IDs. Firestore remains
// bound to the explicit demo project above and the loopback Emulator host.
const originalRuntimeProject = process.env.GCLOUD_PROJECT;
if (hasEmulator) process.env.GCLOUD_PROJECT = "micafe-pos-staging";
if (app) {
  after(async () => {
    if (originalRuntimeProject === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = originalRuntimeProject;
    await deleteApp(app);
  });
}

type CallableUnderTest = {
  run(request: CallableRequest<unknown>): Promise<unknown>;
};

const callable = consultarOfertaComercialTenantSaas as unknown as CallableUnderTest;

function request(data: unknown, auth?: CallableRequest<unknown>["auth"]): CallableRequest<unknown> {
  return { data, auth: auth ?? null } as CallableRequest<unknown>;
}

function operatorAuth(
  uid: string,
  faculties: string[],
  versionAutorizacion = 1,
): NonNullable<CallableRequest<unknown>["auth"]> {
  return {
    uid,
    token: {
      saas: { operador: true, versionAutorizacion, facultades: faculties },
    } as never,
  };
}

async function seedOperator(
  database: Firestore,
  uid: string,
  faculties: string[],
  overrides: { uid?: string; estado?: "ACTIVO" | "SUSPENDIDO" | "REVOCADO"; versionAutorizacion?: number } = {},
): Promise<void> {
  await database.collection("saas_operadores").doc(uid).set({
    schemaVersion: 1,
    uid,
    estado: "ACTIVO",
    facultades: faculties,
    versionAutorizacion: 1,
    ...overrides,
  });
}

function requireEmulator(database: Firestore | undefined): asserts database is Firestore {
  assert.ok(hasEmulator && database, "Firestore Emulator must run on a loopback host");
}

async function expectDeniedWithAudit(
  database: Firestore,
  uid: string,
  auth: NonNullable<CallableRequest<unknown>["auth"]>,
  expected: { code: string; message: string; auditType: string },
): Promise<void> {
  await assert.rejects(
    callable.run(request({ codigoAprobacion: APPROVAL_CODE }, auth)),
    (error: unknown) => error instanceof HttpsError
      && error.code === expected.code
      && error.message === expected.message,
  );

  const evidence = await database.collection("saas_auditoria").where("actor.uid", "==", uid).get();
  assert.equal(evidence.size, 1);
  assert.equal(evidence.docs[0].data().tipo, expected.auditType);
  assert.equal(evidence.docs[0].data().resultado, "DENEGADO");
}

test("consultar oferta callable rechaza solicitudes no autenticadas", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);

  await assert.rejects(
    callable.run(request({ codigoAprobacion: APPROVAL_CODE })),
    (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated",
  );
});

test("consultar oferta callable exige COMERCIAL_GOBERNAR y audita la denegación", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-denied-${randomUUID()}`;
  await seedOperator(db, uid, ["PLATAFORMA_CONSULTAR"]);

  await assert.rejects(
    callable.run(request({ codigoAprobacion: APPROVAL_CODE }, operatorAuth(uid, ["PLATAFORMA_CONSULTAR"]))),
    (error: unknown) => error instanceof HttpsError
      && error.code === "permission-denied"
      && error.message === "PLATFORM_ACCESS_DENIED",
  );

  const evidence = await db.collection("saas_auditoria").where("actor.uid", "==", uid).get();
  assert.equal(evidence.size, 1);
  assert.equal(evidence.docs[0].data().tipo, "FACULTAD_AUSENTE");
  assert.equal(evidence.docs[0].data().resultado, "DENEGADO");
});

test("consultar oferta callable deniega y audita un operador sin registro canónico", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-missing-operator-${randomUUID()}`;

  await expectDeniedWithAudit(db, uid, operatorAuth(uid, ["COMERCIAL_GOBERNAR"]), {
    code: "permission-denied",
    message: "PLATFORM_ACCESS_DENIED",
    auditType: "AUTORIZACION_DENEGADA",
  });
});

test("consultar oferta callable deniega y audita un operador suspendido", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-suspended-operator-${randomUUID()}`;
  await seedOperator(db, uid, ["COMERCIAL_GOBERNAR"], { estado: "SUSPENDIDO" });

  await expectDeniedWithAudit(db, uid, operatorAuth(uid, ["COMERCIAL_GOBERNAR"]), {
    code: "permission-denied",
    message: "PLATFORM_ACCESS_DENIED",
    auditType: "OPERADOR_INACTIVO",
  });
});

test("consultar oferta callable deniega y audita el UID canónico divergente", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-uid-mismatch-${randomUUID()}`;
  await seedOperator(db, uid, ["COMERCIAL_GOBERNAR"], { uid: "different-canonical-operator" });

  await expectDeniedWithAudit(db, uid, operatorAuth(uid, ["COMERCIAL_GOBERNAR"]), {
    code: "permission-denied",
    message: "PLATFORM_ACCESS_DENIED",
    auditType: "OPERADOR_INACTIVO",
  });
});

test("consultar oferta callable deniega y audita un contexto de plataforma obsoleto", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-stale-context-${randomUUID()}`;
  await seedOperator(db, uid, ["COMERCIAL_GOBERNAR"], { versionAutorizacion: 2 });

  await expectDeniedWithAudit(db, uid, operatorAuth(uid, ["COMERCIAL_GOBERNAR"], 1), {
    code: "failed-precondition",
    message: "PLATFORM_CONTEXT_STALE",
    auditType: "CONTEXTO_PLATAFORMA_OBSOLETO",
  });
});

test("consultar oferta callable rechaza código ausente, vacío y de tipo incorrecto", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-invalid-${randomUUID()}`;
  const auth = operatorAuth(uid, ["COMERCIAL_GOBERNAR"]);
  await seedOperator(db, uid, ["COMERCIAL_GOBERNAR"]);

  for (const data of [null, {}, { codigoAprobacion: null }, { codigoAprobacion: 42 }, { codigoAprobacion: "" }]) {
    await assert.rejects(
      callable.run(request(data, auth)),
      (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
    );
  }
});

test("consultar oferta callable devuelve solo la oferta aprobada y no muta el estado comercial", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-allowed-${randomUUID()}`;
  const auth = operatorAuth(uid, ["COMERCIAL_GOBERNAR"]);
  await seedOperator(db, uid, ["COMERCIAL_GOBERNAR"]);

  const controlRef = db.collection("ofertas_comerciales_tenant").doc(APPROVED_TENANT_ID);
  const offerRef = controlRef.collection("ofertas").doc(APPROVED_OFFER_ID);
  const control = { empresaId: APPROVED_TENANT_ID, ofertaActivaId: APPROVED_OFFER_ID, revision: 3 };
  const offer = {
    schemaVersion: 1,
    ofertaId: APPROVED_OFFER_ID,
    empresaIdObjetivo: APPROVED_TENANT_ID,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1_600_000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-16",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: APPROVAL_REFERENCE,
    revision: 2,
    credentialSentinel: "must-not-leak",
  };
  await Promise.all([
    controlRef.set(control),
    offerRef.set(offer),
  ]);
  const controlBefore = (await controlRef.get()).data();
  const offerBefore = (await offerRef.get()).data();

  const result = await callable.run(request({ codigoAprobacion: APPROVAL_CODE }, auth)) as {
    autorizacion: { empresaIdObjetivo: string };
    oferta: { empresaIdObjetivo: string } | null;
  };

  assert.equal(result.autorizacion.empresaIdObjetivo, APPROVED_TENANT_ID);
  assert.equal(result.oferta?.empresaIdObjetivo, APPROVED_TENANT_ID);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.deepEqual((await controlRef.get()).data(), controlBefore);
  assert.deepEqual((await offerRef.get()).data(), offerBefore);
  assert.equal((await db.collection("saas_auditoria").where("actor.uid", "==", uid).get()).size, 0);
  assert.equal((await db.collection("saas_auditoria_obligaciones").where("evidencia.actor.uid", "==", uid).get()).size, 0);
});

test("consultar oferta callable no revela códigos de aprobación desconocidos", {
  skip: !hasEmulator,
}, async () => {
  requireEmulator(db);
  const uid = `commercial-reader-unknown-${randomUUID()}`;
  await seedOperator(db, uid, ["COMERCIAL_GOBERNAR"]);

  await assert.rejects(
    callable.run(request({ codigoAprobacion: "GATE_I_OFFER_2" }, operatorAuth(uid, ["COMERCIAL_GOBERNAR"]))),
    (error: unknown) => error instanceof HttpsError
      && error.code === "failed-precondition"
      && error.message === "OFERTA_COMERCIAL_APROBACION_NOT_FOUND",
  );
});
