import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { aceptarDocumentosLegalesTenant } from "../../functions/src/legal/handler";
import { BUNDLE_LEGAL_ACTUAL, type BundleLegal } from "../../functions/src/legal/catalog";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const runId = randomUUID();
const empresaId = `legal-acceptance-${runId}`;
const uid = `admin-${runId}`;
const bundle: BundleLegal = { ...BUNDLE_LEGAL_ACTUAL, estado: "EXIGIBLE", documentos: BUNDLE_LEGAL_ACTUAL.documentos.map((doc) => ({ ...doc, estado: "PUBLICADO" })) };

test("Emulator: recibo contractual es atómico, append-only e idempotente", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") && !emulatorHost?.startsWith("localhost:")) throw new Error("La prueba exige Firestore Emulator en loopback.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("La prueba no debe usar credenciales reales.");
  const app = initializeApp({ projectId: "demo-legal-acceptance" }, `legal-${runId}`);
  const db = getFirestore(app);
  const empresaRef = db.collection("empresas").doc(empresaId);
  const membresiaRef = db.collection("membresias").doc(`${empresaId}_${uid}`);
  const request = { auth: { uid, token: { empresaId, rol: "admin", auth_time: 1_700_000_000 } }, data: { bundleId: bundle.id, aceptoTerminos: true, aceptoAnexo: true, declaroFacultad: true, correlationId: `corr-${runId}` } };
  const dependencies = { db, bundle, getUser: async () => ({ disabled: false }), exigirTenant: async () => ({ id: empresaId, estado: "trial", rol: "admin", permisos: [], paisFiscal: "CO" }) as any } as any;
  try {
    await empresaRef.set({ estado: "trial", nombreComercial: "Empresa sintética" });
    await membresiaRef.set({ empresaId, uid, rol: "admin", estado: "activa", activo: true });
    const first = await aceptarDocumentosLegalesTenant(request, dependencies);
    const replay = await aceptarDocumentosLegalesTenant(request, dependencies);
    const records = await empresaRef.collection("aceptacionesLegales").get();
    assert.equal(first.idempotente, false);
    assert.equal(replay.idempotente, true);
    assert.equal(first.aceptacionId, replay.aceptacionId);
    assert.equal(records.size, 1);
    assert.equal(records.docs[0].data().empresaId, empresaId);
    assert.equal(records.docs[0].data().aceptadoEn.toDate() instanceof Date, true);
  } finally {
    const receipts = await empresaRef.collection("aceptacionesLegales").get();
    await Promise.all(receipts.docs.map((doc) => doc.ref.delete()));
    await Promise.all([empresaRef.delete(), membresiaRef.delete()]);
    await deleteApp(app);
  }
});
