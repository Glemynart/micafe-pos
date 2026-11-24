import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { aceptarDocumentosLegalesTenant, consultarEstadoLegalTenant } from "../../functions/src/legal/handler";
import { BUNDLE_LEGAL_ACTUAL, type BundleLegal } from "../../functions/src/legal/catalog";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const runId = randomUUID();
const empresaId = `legal-acceptance-${runId}`;
const uid = `admin-${runId}`;
const bundle: BundleLegal = { ...BUNDLE_LEGAL_ACTUAL, estado: "EXIGIBLE", documentos: BUNDLE_LEGAL_ACTUAL.documentos.map((doc) => ({ ...doc, estado: "PUBLICADO" })) };
const snapshotContrato = {
  schemaVersion: 1,
  planId: "mvp_comercial",
  planVersion: 2,
  codigoPlan: "MVP_COMERCIAL",
  periodicidad: "ANUAL" as const,
  precio: { importe: 1800000, moneda: "COP" },
  capacidades: ["sell"],
  limites: {},
  sedeConceptual: { cantidad: 1 as const },
  fiscalidad: null,
  vigencia: { inicio: "2026-11-23", fin: "2027-11-23" },
};
const relacionId = "contrato-emulator";
const referenciaContrato = `relacion:${relacionId}`;

test("Emulator: recibo contractual es atómico, append-only e idempotente ante concurrencia", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") && !emulatorHost?.startsWith("localhost:")) throw new Error("La prueba exige Firestore Emulator en loopback.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("La prueba no debe usar credenciales reales.");
  const app = initializeApp({ projectId: "demo-legal-acceptance" }, `legal-${runId}`);
  const db = getFirestore(app);
  const empresaRef = db.collection("empresas").doc(empresaId);
  const membresiaRef = db.collection("membresias").doc(`${empresaId}_${uid}`);
  const suscripcionRef = db.collection("suscripciones").doc(empresaId);
  const relacionesRef = suscripcionRef.collection("relaciones");
  const request = { auth: { uid, token: { empresaId, rol: "admin", auth_time: 1_700_000_000 } }, data: { bundleId: bundle.id, aceptoTerminos: true, aceptoAnexo: true, declaroFacultad: true, correlationId: `corr-${runId}`, referenciaContrato } };
  const dependencies = { db, bundle, getUser: async () => ({ disabled: false }), exigirTenant: async () => ({ id: empresaId, estado: "trial", rol: "admin", permisos: [], paisFiscal: "CO" }) as any } as any;
  try {
    await empresaRef.set({ estado: "trial", nombreComercial: "Empresa sintética" });
    await membresiaRef.set({ empresaId, uid, rol: "admin", estado: "activa", activo: true });
    await suscripcionRef.set({ empresaId, revision: 1 });
    await relacionesRef.doc("_vigente").set({ relacionVigenteId: relacionId });
    await relacionesRef.doc(relacionId).set({ relacionId, empresaId, schemaVersion: 1, revision: 1, snapshotContrato });
    const [first, replay] = await Promise.all([
      aceptarDocumentosLegalesTenant(request, dependencies),
      aceptarDocumentosLegalesTenant({
        ...request,
        data: { ...request.data, correlationId: `retry-${runId}` },
      }, dependencies),
    ]);
    const records = await empresaRef.collection("aceptacionesLegales").get();
    assert.deepEqual([first.idempotente, replay.idempotente].sort(), [false, true]);
    assert.equal(first.aceptacionId, replay.aceptacionId);
    assert.equal(records.size, 1);
    assert.equal(records.docs[0].data().empresaId, empresaId);
    assert.equal(records.docs[0].data().referenciaContrato, referenciaContrato);
    assert.match(records.docs[0].data().sha256CondicionesComerciales, /^[a-f0-9]{64}$/);
    assert.equal(records.docs[0].data().condicionesComerciales.precio.importe, 1800000);
    assert.equal(records.docs[0].data().aceptadoEn.toDate() instanceof Date, true);
    const batch = db.batch();
    for (let i = 0; i < 51; i++) {
      const actor = `admin-history-${i}`;
      const id = createHash("sha256").update([empresaId, referenciaContrato, actor, bundle.id].join("\n")).digest("hex");
      batch.create(empresaRef.collection("aceptacionesLegales").doc(id), { ...records.docs[0].data(), aceptacionId: id, uid: actor });
    }
    await batch.commit();
    const firstPage = await consultarEstadoLegalTenant({ ...request, data: {} }, dependencies);
    assert.equal(firstPage.historial.length, 50);
    assert.ok(firstPage.siguienteCursor);
    const secondPage = await consultarEstadoLegalTenant({ ...request, data: { cursor: firstPage.siguienteCursor } }, dependencies);
    assert.equal(secondPage.historial.length, 2);
    assert.equal(secondPage.siguienteCursor, null);
    assert.equal(new Set([...firstPage.historial, ...secondPage.historial].map(item => item.aceptacionId)).size, 52);
  } finally {
    const receipts = await empresaRef.collection("aceptacionesLegales").get();
    await Promise.all(receipts.docs.map((doc) => doc.ref.delete()));
    await Promise.all([empresaRef.delete(), membresiaRef.delete(), relacionesRef.doc("_vigente").delete(), relacionesRef.doc(relacionId).delete(), suscripcionRef.delete()]);
    await deleteApp(app);
  }
});
