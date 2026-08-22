import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { procesarEventoWompi, validarEventoWompi } from "./wompi";

function evento(overrides: Record<string, unknown> = {}) {
  const secret = "events_test_secret";
  const transaction = { id: "tx-1", status: "APPROVED", reference: "ref-1", amount_in_cents: 3_500_000, currency: "COP", environment: "test", ...overrides };
  const properties = ["data.transaction.id", "data.transaction.status", "data.transaction.reference", "data.transaction.amount_in_cents", "data.transaction.currency", "data.transaction.environment"];
  const timestamp = 123;
  const values = [transaction.id, transaction.status, transaction.reference, transaction.amount_in_cents, transaction.currency, transaction.environment];
  const checksum = createHash("sha256").update(`${values.join("")}${timestamp}${secret}`).digest("hex");
  return { secret, body: { event: "transaction.updated", data: { transaction }, timestamp, signature: { properties, checksum } } };
}

test("Wompi exige firma, entorno, COP, monto y propiedades autoritativas firmadas", () => {
  const valid = evento();
  assert.equal(validarEventoWompi(valid.body, valid.secret, "test").ok, true);
  assert.deepEqual(validarEventoWompi(valid.body, valid.secret, "production"), { ok: false, code: "ENVIRONMENT_MISMATCH" });
  assert.equal(validarEventoWompi({ ...valid.body, signature: { ...valid.body.signature, checksum: "0".repeat(64) } }, valid.secret, "test").ok, false);
  const unsignedAmount = structuredClone(valid.body); unsignedAmount.signature.properties = unsignedAmount.signature.properties.filter(p => p !== "data.transaction.amount_in_cents");
  assert.deepEqual(validarEventoWompi(unsignedAmount, valid.secret, "test"), { ok: false, code: "SIGNED_PROPERTIES_INVALID" });
  const unsignedEnvironment = structuredClone(valid.body); unsignedEnvironment.signature.properties = unsignedEnvironment.signature.properties.filter(p => p !== "data.transaction.environment");
  assert.deepEqual(validarEventoWompi(unsignedEnvironment, valid.secret, "test"), { ok: false, code: "SIGNED_PROPERTIES_INVALID" });
  const tamperedEnvironment = structuredClone(valid.body); tamperedEnvironment.data.transaction.environment = "production";
  assert.deepEqual(validarEventoWompi(tamperedEnvironment, valid.secret, "production"), { ok: false, code: "SIGNATURE_INVALID" });
  assert.equal(validarEventoWompi(evento({ currency: "USD" }).body, valid.secret, "test").ok, false);
});

class Ref { constructor(public path: string) {} }
class Snap { constructor(private value: any) {} get exists() { return this.value !== undefined } data() { return structuredClone(this.value) } }
class FakeDb {
  docs = new Map<string, any>();
  collection(name: string) { return { doc: (id: string) => new Ref(`${name}/${id}`) } }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const working = new Map([...this.docs].map(([key, value]) => [key, structuredClone(value)]));
    const result = await callback({ get: async (ref: Ref) => new Snap(working.get(ref.path)), update: (ref: Ref, patch: any) => working.set(ref.path, { ...working.get(ref.path), ...patch }) });
    this.docs = working; return result;
  }
}

const NOW = new Date("2026-08-22T18:00:00.000Z");

function seedClaim(db: FakeDb, overrides: { intent?: Record<string, unknown>; reserva?: Record<string, unknown>; agenda?: Record<string, unknown> } = {}) {
  const holdExpira = "2026-08-22T18:15:00.000Z";
  db.docs.set("intenciones_pago_reserva/ref-1", {
    estado: "CREADA", reference: "ref-1", empresaId: "tenant-b", reservaId: "res-b", mesaId: "mesa-b", espacioId: "espacio-b",
    moneda: "COP", montoEsperadoCentavos: 3_500_000, holdExpira, ...overrides.intent,
  });
  db.docs.set("reservas/res-b", {
    empresaId: "tenant-b", referenciaPago: "ref-1", mesaId: "mesa-b", espacioId: "espacio-b", fechaLocal: "2026-08-23",
    montoTotal: 35_000, bloques: ["10"], holdExpira, ...overrides.reserva,
  });
  db.docs.set("empresas/tenant-b", { estado: "activa" });
  db.docs.set("configuraciones/tenant-b", { reservasPublicas: { habilitadas: true, moneda: "COP", tarifaRevision: 1, cuentaClaveOperativa: "pasarela-reservas", salas: { "mesa-b": { precioBloqueCentavos: 3_500_000, productoId: "reserva-sala", impuestoTipo: "excluido", bloquesMinimos: 1, bloquesMaximos: 4 } } } });
  db.docs.set("mesas/mesa-b", { empresaId: "tenant-b", espacioId: "espacio-b" });
  db.docs.set("agendas/mesa-b_2026-08-23", { empresaId: "tenant-b", mesaId: "mesa-b", espacioId: "espacio-b", bloques: { "10": { reservaId: "res-b", estado: "hold", holdExpira } }, ...overrides.agenda });
}

test("un monto firmado pero distinto de la intención queda en revisión sin efectos", async () => {
  const db = new FakeDb();
  db.docs.set("intenciones_pago_reserva/ref-1", { estado: "CREADA", reference: "ref-1", empresaId: "tenant-b", reservaId: "res-b", mesaId: "mesa-b", espacioId: "espacio-b", moneda: "COP", montoEsperadoCentavos: 7_000_000 });
  db.docs.set("reservas/res-b", { empresaId: "tenant-b", referenciaPago: "ref-1", mesaId: "mesa-b", espacioId: "espacio-b", montoTotal: 70_000 });
  const parsed = validarEventoWompi(evento().body, evento().secret, "test");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const result = await procesarEventoWompi(db as any, parsed.event);
  assert.deepEqual(result, { status: 409, code: "PAYMENT_MISMATCH" });
  assert.equal(db.docs.get("intenciones_pago_reserva/ref-1").estado, "REQUIERE_REVISION");
});

test("un pago tardío no crea efectos cuando el hold ya expiró", async () => {
  const db = new FakeDb();
  seedClaim(db, { intent: { holdExpira: "2026-08-22T17:59:59.000Z" }, reserva: { holdExpira: "2026-08-22T17:59:59.000Z" } });
  const sample = evento(); const parsed = validarEventoWompi(sample.body, sample.secret, "test");
  assert.equal(parsed.ok, true); if (!parsed.ok) return;
  assert.deepEqual(await procesarEventoWompi(db as any, parsed.event, NOW), { status: 409, code: "PAYMENT_MISMATCH" });
  assert.equal(db.docs.get("intenciones_pago_reserva/ref-1").estado, "REQUIERE_REVISION");
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/") || path.startsWith("transacciones_financieras/")), false);
});

test("un bloque reasignado o cross-tenant detiene el pago antes de la venta fiscal", async () => {
  const db = new FakeDb();
  seedClaim(db, { agenda: { empresaId: "tenant-a", bloques: { "10": { reservaId: "otra-reserva", estado: "hold", holdExpira: "2026-08-22T18:15:00.000Z" } } } });
  const sample = evento(); const parsed = validarEventoWompi(sample.body, sample.secret, "test");
  assert.equal(parsed.ok, true); if (!parsed.ok) return;
  assert.deepEqual(await procesarEventoWompi(db as any, parsed.event, NOW), { status: 409, code: "PAYMENT_MISMATCH" });
  assert.equal(db.docs.get("intenciones_pago_reserva/ref-1").estado, "REQUIERE_REVISION");
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/") || path.startsWith("transacciones_financieras/")), false);
});
