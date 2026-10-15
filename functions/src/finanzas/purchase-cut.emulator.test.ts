import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarRegistrarCompraOperativaV1, type ContextoFinancieroOperativo } from "./compras";
import { transicionarPausaCompras } from "../platform/purchase-release-control";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const hasEmulator = emulatorHost?.startsWith("127.0.0.1:") === true;
if (hasEmulator && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Purchase cut Emulator tests reject application credentials.");
}

const projectId = process.env.E2E_PURCHASE_CUT_PROJECT_ID ?? "demo-purchase-cut";
const runId = process.env.E2E_PURCHASE_CUT_RUN_ID ?? randomUUID();
const app = hasEmulator ? initializeApp({ projectId }, `purchase-cut-${runId}`) : undefined;
const db = app ? getFirestore(app) : undefined;

function emulatorDb(): Firestore {
  if (!db) throw new Error("Purchase cut Emulator tests require Firestore Emulator on 127.0.0.1.");
  return db;
}

const platformToken = {
  saas: { operador: true, versionAutorizacion: 1, facultades: ["RELEASE_COMPRAS_GOBERNAR"] },
};

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve!: () => void;
  return { promise: new Promise<void>(next => { resolve = next; }), resolve };
}

async function within<T>(promise: Promise<T>, label: string, milliseconds = 8_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function domain(error: unknown, code: string) {
  return error instanceof HttpsError && (error.details as { code?: string }).code === code;
}

function command(suffix: string, payload: Record<string, unknown>) {
  return {
    commandId: `purchase-cut:${suffix}:${runId}`,
    idempotencyKey: `purchase-cut:${suffix}:${runId}`,
    correlationId: `purchase-cut-correlation:${suffix}:${runId}`,
    causationId: null,
    motivo: "compra_proveedor",
    payload,
  };
}

function releaseCommand(empresaId: string, suffix: string, expectedRevision: number) {
  return {
    commandId: `purchase-cut-release:${suffix}:${runId}`,
    idempotencyKey: `purchase-cut-release:${suffix}:${runId}`,
    correlationId: `purchase-cut-release-correlation:${suffix}:${runId}`,
    causationId: null,
    motivoCodigo: "CORTE_RULES_APROBADO",
    empresaId,
    destino: "PAUSADA" as const,
    expectedRevision,
  };
}

type Fixture = {
  empresaId: string;
  productoId: string;
  contexto: ContextoFinancieroOperativo;
  payload: Record<string, unknown>;
};

async function seed(suffix: string): Promise<Fixture> {
  const firestore = emulatorDb();
  const empresaId = `purchase-cut-${suffix}-${runId}`;
  const productoId = `producto-${suffix}-${runId}`;
  const actorUid = `admin-${suffix}-${runId}`;
  const espacioId = `espacio-${suffix}-${runId}`;
  await Promise.all([
    firestore.collection("empresas").doc(empresaId).set({ empresaId, estado: "activa", esFundacional: true }),
    firestore.collection("membresias").doc(`${empresaId}_${actorUid}`).set({
      empresaId, uid: actorUid, rol: "admin", permisos: ["purchases"], estado: "activa", activo: true, nombre: "Admin emulator",
    }),
    firestore.collection("espacios").doc(espacioId).set({ empresaId, activo: true, nombre: "Espacio emulator" }),
    firestore.collection("productos").doc(productoId).set({
      empresaId, espacioId, nombre: "Producto emulator", unidad: "und", stock: 2, secuenciaLedger: 0, costo: 100,
    }),
    firestore.collection("cuentas_bancarias").doc("caja-principal").set({
      id: "caja-principal", empresaId, claveOperativa: "caja-principal", nombre: "Caja emulator", saldo: 1_000,
    }),
    firestore.collection("controles_release_compras").doc(empresaId).set({ empresaId, estado: "ACTIVA", revision: 1 }),
    firestore.collection("saas_operadores").doc("release-operator").set({
      uid: "release-operator", estado: "ACTIVO", facultades: ["RELEASE_COMPRAS_GOBERNAR"], versionAutorizacion: 1,
    }),
  ]);
  return {
    empresaId,
    productoId,
    contexto: { empresaId, actorUid, rol: "admin" },
    payload: {
      proveedor: "Proveedor emulator",
      espacioId,
      fechaCompra: "2026-10-15",
      cuentaClaveOperativa: "caja-principal",
      items: [{ tipo: "producto", articuloId: productoId, cantidad: 2, costoUnitario: 300 }],
    },
  };
}

async function pause(fixture: Fixture, suffix: string) {
  return transicionarPausaCompras(emulatorDb(), "release-operator", platformToken, releaseCommand(fixture.empresaId, suffix, 1));
}

async function effects(fixture: Fixture) {
  const firestore = emulatorDb();
  const [compras, movimientos, caja, producto, recibos, indices, auditorias, ventas, pauseAudit] = await Promise.all([
    firestore.collection("compras").where("empresaId", "==", fixture.empresaId).get(),
    firestore.collection("movimientos_inventario").where("empresaId", "==", fixture.empresaId).get(),
    firestore.collection("cuentas_bancarias").doc("caja-principal").get(),
    firestore.collection("productos").doc(fixture.productoId).get(),
    firestore.collection("operaciones_comandos").where("empresaId", "==", fixture.empresaId).get(),
    firestore.collection("operaciones_command_idempotency").where("empresaId", "==", fixture.empresaId).get(),
    firestore.collection("operaciones_auditoria").where("empresaId", "==", fixture.empresaId).get(),
    firestore.collection("ventas").where("empresaId", "==", fixture.empresaId).get(),
    firestore.collection("saas_auditoria_obligaciones").where("evidencia.empresaObjetivoId", "==", fixture.empresaId).get(),
  ]);
  return {
    compras: compras.size,
    movimientos: movimientos.size,
    caja: caja.data()?.saldo,
    stock: producto.data()?.stock,
    recibos: recibos.size,
    indices: indices.size,
    auditorias: auditorias.size,
    ventas: ventas.size,
    pauseAudit: pauseAudit.size,
  };
}

/**
 * Intercepta solo la primera lectura del control dentro de una transacción real
 * del Emulator. La compra ya leyó ACTIVA cuando el release confirma PAUSADA;
 * Firestore debe reintentarla y la segunda lectura debe fallar cerrada.
 */
function dbWithControlReadBarrier(realDb: Firestore, controlPath: string, observed: Deferred, continueTransaction: Deferred): Firestore {
  let held = false;
  return {
    collection: realDb.collection.bind(realDb),
    runTransaction: async (work: (transaction: any) => Promise<unknown>) => realDb.runTransaction(async transaction => {
      const transactionWithBarrier = new Proxy(transaction as object, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (property !== "get") return typeof value === "function" ? value.bind(target) : value;
          return async (reference: { path?: string }) => {
            const snapshot = await (value as (ref: unknown) => Promise<unknown>).call(target, reference);
            if (!held && reference.path === controlPath) {
              held = true;
              observed.resolve();
              await continueTransaction.promise;
            }
            return snapshot;
          };
        },
      });
      return work(transactionWithBarrier);
    }),
  } as Firestore;
}

test("ADR-SAAS-081 Emulator: pausa concurrente se linealiza después de la compra en vuelo y cierra compras posteriores", { timeout: 30_000, skip: !hasEmulator }, async () => {
  const fixture = await seed("race");
  const controlRead = deferred();
  const continuePurchase = deferred();
  const guardedDb = dbWithControlReadBarrier(
    emulatorDb(),
    `controles_release_compras/${fixture.empresaId}`,
    controlRead,
    continuePurchase,
  );
  const purchase = ejecutarRegistrarCompraOperativaV1(guardedDb, fixture.contexto, command("in-flight", fixture.payload));

  await within(controlRead.promise, "compra-no-leyo-control");
  // El Emulator serializa la transición que escribe el control detrás de la
  // transacción lectora. La compra inició antes de la pausa y puede terminar;
  // la pausa no es efectiva hasta que obtiene el commit.
  const pausing = pause(fixture, "in-flight");
  continuePurchase.resolve();
  const purchaseResult = await within(purchase, "compra-en-vuelo-no-resolvio");
  const paused = await within(pausing, "pausa-no-confirmo");
  assert.equal(paused.estado, "PAUSADA");
  assert.equal(paused.revision, 2);
  assert.ok(purchaseResult.compraId);
  assert.deepEqual(await effects(fixture), {
    compras: 1,
    movimientos: 2,
    caja: 400,
    stock: 4,
    recibos: 1,
    indices: 1,
    auditorias: 1,
    ventas: 0,
    pauseAudit: 1,
  });
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(emulatorDb(), fixture.contexto, command("after-pause", fixture.payload)),
    error => domain(error, "COMPRAS_EN_CORTE"),
  );
  assert.deepEqual(await effects(fixture), {
    compras: 1,
    movimientos: 2,
    caja: 400,
    stock: 4,
    recibos: 1,
    indices: 1,
    auditorias: 1,
    ventas: 0,
    pauseAudit: 1,
  });
});

test("ADR-SAAS-081 Emulator: cliente desconectado no confirma sin respuesta y reintenta idempotentemente tras la pausa", { skip: !hasEmulator }, async () => {
  const unsent = await seed("offline-unsent");
  const unsentCommand = command("offline-unsent", unsent.payload);
  await pause(unsent, "offline-unsent");

  // Un callable no puede confirmar una compra offline: el cliente conserva el
  // envelope pendiente y el servidor lo reevalúa al reconectar.
  let unsentClientState: "PENDIENTE" | "CONFIRMADA" = "PENDIENTE";
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(emulatorDb(), unsent.contexto, unsentCommand),
    error => domain(error, "COMPRAS_EN_CORTE"),
  );
  assert.equal(unsentClientState, "PENDIENTE");
  assert.deepEqual(await effects(unsent), {
    compras: 0, movimientos: 0, caja: 1_000, stock: 2, recibos: 0, indices: 0, auditorias: 0, ventas: 0, pauseAudit: 1,
  });

  const ambiguous = await seed("offline-ambiguous");
  const ambiguousCommand = command("offline-ambiguous", ambiguous.payload);
  // El servidor confirma la primera solicitud, pero el cliente pierde su
  // respuesta: no cambia el estado local hasta que recibe el replay.
  const serverResult = await ejecutarRegistrarCompraOperativaV1(emulatorDb(), ambiguous.contexto, ambiguousCommand);
  let ambiguousClientState: "PENDIENTE" | "CONFIRMADA" = "PENDIENTE";
  await pause(ambiguous, "offline-ambiguous");
  const replay = await ejecutarRegistrarCompraOperativaV1(emulatorDb(), ambiguous.contexto, ambiguousCommand);
  ambiguousClientState = "CONFIRMADA";

  assert.deepEqual(replay, serverResult);
  assert.equal(ambiguousClientState, "CONFIRMADA");
  assert.deepEqual(await effects(ambiguous), {
    compras: 1, movimientos: 2, caja: 400, stock: 4, recibos: 1, indices: 1, auditorias: 1, ventas: 0, pauseAudit: 1,
  });
});

test.after(async () => {
  if (app) await deleteApp(app);
});
