import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearContextoVentaBodegaDesdeRequest, revalidarAutoridadVentaBodegaEnTransaccion } from "./ventas-authority";
import { MAX_LINEAS_BODEGA_U3, normalizarComandoConfirmacionVentaBodega } from "./ventas-contract";

type Data = Record<string, any>;
class Snapshot { constructor(readonly id: string, private readonly value: Data | undefined) {} get exists() { return this.value !== undefined; } data() { return this.value; } }
class Ref { constructor(readonly path: string, private readonly db: FakeFirestore) {} get id() { return this.path.split("/").at(-1)!; } async get() { return new Snapshot(this.id, this.db.docs.get(this.path)); } }
class Collection { constructor(private readonly name: string, private readonly db: FakeFirestore) {} doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); } }
class Transaction { constructor(private readonly db: FakeFirestore) {} async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path)); } }
class FakeFirestore {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) { return work(new Transaction(this)); }
}

const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;
const base = (lineas = [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 1 }]) => ({
  commandId: "cmd-1", idempotencyKey: "idem-1", correlationId: "corr-1", causationId: null,
  payload: { clienteId: "cliente-1", lineas, metodoPago: "efectivo" },
});

function seed(db: FakeFirestore, overrides: { rol?: string; permisos?: string[]; estado?: string; activo?: boolean; vertical?: string; modulos?: string[] } = {}) {
  const empresaId = "empresa-a"; const uid = "vendedor-a";
  db.docs.set(`empresas/${empresaId}`, { estado: "activa" });
  db.docs.set(`membresias/${empresaId}_${uid}`, {
    empresaId, uid, rol: overrides.rol ?? "vendedor", permisos: overrides.permisos ?? ["sell"],
    estado: overrides.estado ?? "activa", activo: overrides.activo ?? true,
  });
  db.docs.set(`configuraciones/${empresaId}`, {
    empresaId, vertical: overrides.vertical ?? "BODEGA_MVP1", modulos: { habilitados: overrides.modulos ?? ["sell"] },
  });
  return { empresaId, actorUid: uid, rol: "vendedor" };
}

test("U3-A contrato: acepta el mínimo, causationId texto o null y los dos medios aprobados", () => {
  assert.equal(normalizarComandoConfirmacionVentaBodega(base()).payload.metodoPago, "efectivo");
  const transferencia = { ...base(), causationId: "causa-1", payload: { ...base().payload, metodoPago: "transferencia" as const } };
  assert.equal(normalizarComandoConfirmacionVentaBodega(transferencia).causationId, "causa-1");
});

test("U3-A contrato: allowlist, identificadores, cliente, cantidad y método fallan cerrados", () => {
  const invalidos: Array<[string, unknown]> = [
    ["campo sensible", { ...base(), empresaId: "empresa-b" }], ["command", { ...base(), commandId: "" }],
    ["idempotencia", { ...base(), idempotencyKey: "" }], ["correlacion", { ...base(), correlationId: "" }],
    ["causation", { ...base(), causationId: 1 }], ["cliente", { ...base(), payload: { ...base().payload, clienteId: "" } }],
    ["campos linea", { ...base(), payload: { ...base().payload, lineas: [{ ...base().payload.lineas[0], precioCOP: 1 }] } }],
    ["cero", { ...base(), payload: { ...base().payload, lineas: [{ ...base().payload.lineas[0], cantidad: 0 }] } }],
    ["negativo", { ...base(), payload: { ...base().payload, lineas: [{ ...base().payload.lineas[0], cantidad: -1 }] } }],
    ["decimal", { ...base(), payload: { ...base().payload, lineas: [{ ...base().payload.lineas[0], cantidad: 1.5 }] } }],
    ["nan", { ...base(), payload: { ...base().payload, lineas: [{ ...base().payload.lineas[0], cantidad: Number.NaN }] } }],
    ["infinito", { ...base(), payload: { ...base().payload, lineas: [{ ...base().payload.lineas[0], cantidad: Number.POSITIVE_INFINITY }] } }],
    ["mixto", { ...base(), payload: { ...base().payload, metodoPago: "mixto" } }], ["tarjeta", { ...base(), payload: { ...base().payload, metodoPago: "tarjeta" } }],
    ["credito", { ...base(), payload: { ...base().payload, metodoPago: "credito" } }], ["cartera", { ...base(), payload: { ...base().payload, metodoPago: "cartera" } }],
  ];
  for (const [, input] of invalidos) assert.throws(() => normalizarComandoConfirmacionVentaBodega(input));
});

test("U3-A contrato: el presupuesto de líneas se valida antes de la transacción", () => {
  assert.throws(() => normalizarComandoConfirmacionVentaBodega(base([])));
  assert.equal(normalizarComandoConfirmacionVentaBodega(base()).payload.lineas.length, 1);
  const maximas = Array.from({ length: MAX_LINEAS_BODEGA_U3 }, (_, index) => ({ productoId: `p-${index}`, presentacionId: `pr-${index}`, cantidad: 1 }));
  assert.equal(normalizarComandoConfirmacionVentaBodega(base(maximas)).payload.lineas.length, MAX_LINEAS_BODEGA_U3);
  assert.throws(() => normalizarComandoConfirmacionVentaBodega(base([...maximas, { productoId: "extra", presentacionId: "extra", cantidad: 1 }])));
});

test("U3-A autoridad: vendedor activo con sell y capability Bodega puede avanzar", async () => {
  const db = new FakeFirestore(); const contexto = seed(db);
  await db.runTransaction(tx => revalidarAutoridadVentaBodegaEnTransaccion(tx, db, contexto));
});

test("U3-A autoridad: falla cerrada para membresía, rol, sell, capability, vertical y tenant ajeno", async () => {
  const casos: Array<[string, Parameters<typeof seed>[1], string]> = [
    ["membresia inactiva", { estado: "inactiva", activo: false }, "TENANT_ACCESS_DENIED"],
    ["rol", { rol: "cajero" }, "TENANT_ACCESS_DENIED"], ["sell", { permisos: [] }, "ROLE_FORBIDDEN"],
    ["capability", { modulos: [] }, "VENTA_BODEGA_NO_AUTORIZADA"], ["vertical", { vertical: "GENERAL" }, "VENTA_BODEGA_NO_AUTORIZADA"],
  ];
  for (const [, changes, expected] of casos) {
    const db = new FakeFirestore(); const contexto = seed(db, changes);
    await assert.rejects(db.runTransaction(tx => revalidarAutoridadVentaBodegaEnTransaccion(tx, db, contexto)), error => domain(error, expected));
  }
  const db = new FakeFirestore(); const contexto = seed(db);
  await assert.rejects(db.runTransaction(tx => revalidarAutoridadVentaBodegaEnTransaccion(tx, db, { ...contexto, empresaId: "empresa-b" })), error => domain(error, "EMPRESA_NO_OPERATIVA"));
});

test("U3-A autoridad: request sin autenticación y membresía inexistente se deniegan", async () => {
  const db = new FakeFirestore();
  await assert.rejects(crearContextoVentaBodegaDesdeRequest({ data: {} }, db), error => error instanceof HttpsError && error.code === "unauthenticated");
  db.docs.set("empresas/empresa-a", { estado: "activa" });
  await assert.rejects(crearContextoVentaBodegaDesdeRequest({ auth: { uid: "vendedor-a", token: { empresaId: "empresa-a", rol: "vendedor" } } }, db));
});
