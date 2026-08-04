import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  ejecutarCrearCuentaSalonV1,
  ejecutarAgregarLineaCuentaSalonV1,
  ejecutarEnviarCuentaCocinaV1,
  ejecutarActualizarEstadoComandaSalonV1,
  ejecutarSepararCuentaSalonV1,
  ejecutarUnirCuentasSalonV1,
  ejecutarTrasladarCuentaSalonV1,
  type ContextoFinancieroOperativo,
} from "./callables";

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.E2E_P1_04_PROJECT_ID ?? "demo-p1-04-e2e";
const RUN_ID = process.env.E2E_P1_04_RUN_ID ?? `p1-04-${Date.now()}`;
const EVIDENCE_DIR = process.env.E2E_P1_04_EVIDENCE_DIR ?? `artifacts/e2e/p1-04/${RUN_ID}`;

function exigirEmulador() {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:")) throw new Error("P1-04 solo puede ejecutarse contra Firestore Emulator.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("P1-04 rechaza credenciales productivas.");
}

function envelope(name: string, payload: Record<string, unknown>) {
  return {
    commandId: `p104-${name}-${RUN_ID}`,
    idempotencyKey: `p104-idem-${name}-${RUN_ID}`,
    correlationId: `p104-corr-${name}-${RUN_ID}`,
    causationId: null,
    motivo: null,
    payload,
  };
}

function item(id: string, uid: string) {
  return { id, uid, name: id, code: id, price: 6000, cost: 2000, category: "demo", emoji: "☕", stock: 20, hasRecipe: false, quantity: 1 };
}

async function seedTenant(db: FirebaseFirestore.Firestore, empresaId: string) {
  const batch = db.batch();
  batch.set(db.collection("empresas").doc(empresaId), { empresaId, estado: "trial", esFundacional: false });
  for (const actorUid of ["cajero-a", "cajero-b"]) {
    batch.set(db.collection("membresias").doc(`${empresaId}_${actorUid}`), { empresaId, uid: actorUid, rol: "cajero", permisos: ["sell", "kitchen"], estado: "activa", activo: true });
  }
  batch.set(db.collection("espacios").doc(`espacio-${empresaId}`), { empresaId, nombre: "Espacio demo" });
  for (const mesaId of ["mesa-1", "mesa-2"]) {
    batch.set(db.collection("mesas").doc(`${empresaId}-${mesaId}`), { empresaId, espacioId: `espacio-${empresaId}`, nombre: mesaId, activa: true });
  }
  await batch.commit();
}

function contexto(empresaId: string, actorUid = "cajero-a"): ContextoFinancieroOperativo {
  return { empresaId, actorUid, rol: "cajero" };
}

test("P1-04 Emulator: dos tenants y dos actores conservan autoridad, replay y concurrencia", { skip: !FIRESTORE_EMULATOR_HOST }, async () => {
  exigirEmulador();
  const app = initializeApp({ projectId: PROJECT_ID }, `p1-04-${RUN_ID}`);
  const db = getFirestore(app);
  const tenantA = `e2e-p1-04-${RUN_ID}-a`;
  const tenantB = `e2e-p1-04-${RUN_ID}-b`;
  const evidence: Record<string, unknown> = { runId: RUN_ID, projectId: PROJECT_ID, target: "firestore-emulator", status: "FAIL" };
  try {
    await seedTenant(db, tenantA);
    await seedTenant(db, tenantB);

    const crearEnvelope = envelope("crear", { mesaId: `${tenantA}-mesa-1`, nombreMesa: "Mesa 1", espacioId: `espacio-${tenantA}`, items: [item("cafe", "cafe-1")] });
    const [first, replay] = await Promise.all([
      ejecutarCrearCuentaSalonV1(db, contexto(tenantA, "cajero-a"), crearEnvelope),
      ejecutarCrearCuentaSalonV1(db, contexto(tenantA, "cajero-b"), crearEnvelope),
    ]);
    assert.equal(first.pedidoId, replay.pedidoId);
    assert.equal((await db.collection("pedidos_activos").where("empresaId", "==", tenantA).get()).size, 1);
    const pedidoId = first.pedidoId as string;

    await Promise.all([
      ejecutarAgregarLineaCuentaSalonV1(db, contexto(tenantA, "cajero-a"), envelope("agregar-a", { pedidoId, item: item("te", "te-1") })),
      ejecutarAgregarLineaCuentaSalonV1(db, contexto(tenantA, "cajero-b"), envelope("agregar-b", { pedidoId, item: item("pan", "pan-1") })),
    ]);
    const pedidoConcurrente = (await db.collection("pedidos_activos").doc(pedidoId).get()).data()!;
    assert.equal(pedidoConcurrente.items.length, 3);

    await ejecutarEnviarCuentaCocinaV1(db, contexto(tenantA), envelope("enviar", { pedidoId }));
    const comandas = await db.collection("comandas_cocina").where("empresaId", "==", tenantA).get();
    assert.equal(comandas.size, 1);
    const comandaId = comandas.docs[0].id;
    await ejecutarActualizarEstadoComandaSalonV1(db, contexto(tenantA, "cajero-b"), envelope("preparar", { comandaId, nuevoEstado: "en_preparacion" }));
    await ejecutarActualizarEstadoComandaSalonV1(db, contexto(tenantA), envelope("listo", { comandaId, nuevoEstado: "listo" }));
    assert.equal((await db.collection("comandas_cocina").doc(comandaId).get()).data()?.estado, "listo");

    const cuentaOrigen = await ejecutarCrearCuentaSalonV1(db, contexto(tenantA), envelope("crear-origen", { mesaId: `${tenantA}-mesa-1`, nombreMesa: "Mesa 1", espacioId: `espacio-${tenantA}`, items: [item("origen", "origen-1")] }));
    await ejecutarAgregarLineaCuentaSalonV1(db, contexto(tenantA), envelope("agregar-origen", { pedidoId: cuentaOrigen.pedidoId, item: item("mover", "mover-1") }));
    const separada = await ejecutarSepararCuentaSalonV1(db, contexto(tenantA), envelope("separar", { pedidoOrigenId: cuentaOrigen.pedidoId, itemsToMove: [{ uid: "mover-1", cantidad: 1 }] }));
    await ejecutarUnirCuentasSalonV1(db, contexto(tenantA), envelope("unir", { pedidoDestinoId: cuentaOrigen.pedidoId, pedidosOrigenIds: [separada.pedidoNuevoId] }));
    await ejecutarTrasladarCuentaSalonV1(db, contexto(tenantA), envelope("trasladar", { pedidoId: cuentaOrigen.pedidoId, mesaDestinoId: `${tenantA}-mesa-2` }));
    assert.equal((await db.collection("pedidos_activos").doc(cuentaOrigen.pedidoId).get()).data()?.mesaId, `${tenantA}-mesa-2`);

    await assert.rejects(
      ejecutarTrasladarCuentaSalonV1(db, contexto(tenantB), envelope("tenant-cruzado", { pedidoId, mesaDestinoId: `${tenantB}-mesa-2` })),
      /No fue posible completar la operación de salón/,
    );
    evidence.status = "PASS";
    evidence.completedAt = new Date().toISOString();
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(`${EVIDENCE_DIR}/p1-04-emulator.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await deleteApp(app);
  }
});
