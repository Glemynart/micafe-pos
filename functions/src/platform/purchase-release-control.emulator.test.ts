import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { transicionarPausaCompras, type EntradaTransicionPausaCompras } from "./purchase-release-control";
import type { TokenPlataforma } from "./authorization";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const hasEmulator = emulatorHost?.startsWith("127.0.0.1:") === true;
if (hasEmulator && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Purchase release-control Emulator tests reject application credentials.");
}

const projectId = "demo-e2-2-purchase-release-control";
const runId = randomUUID();
const app = hasEmulator ? initializeApp({ projectId }, `purchase-release-control-${runId}`) : undefined;
const db = app ? getFirestore(app) : undefined;

const token: TokenPlataforma = {
  saas: { operador: true, versionAutorizacion: 1, facultades: ["RELEASE_COMPRAS_GOBERNAR"] },
};

function input(empresaId: string, suffix: string): EntradaTransicionPausaCompras {
  return {
    commandId: `cmd:${suffix}:${runId}`,
    idempotencyKey: `idem:${suffix}:${runId}`,
    correlationId: `corr:${suffix}:${runId}`,
    causationId: null,
    motivoCodigo: "CORTE_RULES_APROBADO",
    empresaId,
    destino: "PAUSADA",
    expectedRevision: 1,
  };
}

test("ADR-SAAS-084 Emulator: dos pausas concurrentes en la misma revisión producen una sola transición y evidencia v2", {
  timeout: 30_000,
  skip: !hasEmulator,
}, async t => {
  assert.ok(app && db, "Firestore Emulator is required on 127.0.0.1");
  t.after(async () => deleteApp(app));

  const empresaId = `purchase-control-race-${runId}`;
  await Promise.all([
    db.collection("empresas").doc(empresaId).set({ empresaId, estado: "activa" }),
    db.collection("saas_operadores").doc("release-operator").set({
      uid: "release-operator",
      estado: "ACTIVO",
      facultades: ["RELEASE_COMPRAS_GOBERNAR"],
      versionAutorizacion: 1,
    }),
    db.collection("controles_release_compras").doc(empresaId).set({
      schemaVersion: 1,
      empresaId,
      estado: "ACTIVA",
      revision: 1,
    }),
  ]);

  const results = await Promise.allSettled([
    transicionarPausaCompras(db, "release-operator", token, input(empresaId, "first")),
    transicionarPausaCompras(db, "release-operator", token, input(empresaId, "second")),
  ]);
  const fulfilled = results.filter(result => result.status === "fulfilled");
  const rejected = results.filter(result => result.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const rejection = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(
    (rejection instanceof HttpsError && rejection.message === "CONFLICTO_REVISION_CORTE_COMPRAS")
      || (typeof rejection === "object" && rejection !== null && "code" in rejection && rejection.code === "aborted"),
    "loser must conflict on expectedRevision or fail closed on transaction contention",
  );

  const control = await db.collection("controles_release_compras").doc(empresaId).get();
  assert.deepEqual(
    { estado: control.data()?.estado, revision: control.data()?.revision },
    { estado: "PAUSADA", revision: 2 },
  );

  const [evidencias, obligaciones] = await Promise.all([
    db.collection("saas_auditoria").where("empresaObjetivoId", "==", empresaId).get(),
    db.collection("saas_auditoria_obligaciones").where("evidencia.empresaObjetivoId", "==", empresaId).get(),
  ]);
  assert.equal(evidencias.size, 1);
  assert.equal(obligaciones.size, 1);

  const evidencia = evidencias.docs[0].data();
  assert.equal(evidencia.schemaVersion, 2);
  assert.equal(evidencia.tipo, "COMPRAS_PAUSADAS");
  assert.deepEqual(evidencia.revision, { esperada: 1, resultante: 2 });
  assert.equal(evidencia.detalle.estado, "PAUSADA");

  const obligacion = obligaciones.docs[0].data();
  assert.equal(obligacion.schemaVersion, 1);
  assert.equal(obligacion.estado, "EMITIDA");
  assert.equal(obligacion.evidencia.schemaVersion, 2);
  assert.equal(obligacion.evidencia.evidenciaId, evidencia.evidenciaId);
  assert.equal(obligacion.evidencia.tipo, evidencia.tipo);
  assert.deepEqual(obligacion.evidencia.revision, evidencia.revision);
});
