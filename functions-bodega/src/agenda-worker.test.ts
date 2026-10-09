import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { despacharEventosOperativosBodega, despacharNotificacionSolicitudVentaBodegaPendiente, expirarReservasAgendaBodega } from "./agenda-worker";

type Data = Record<string, any>;
class Ref {
  constructor(readonly path: string, private readonly db: FakeDb) {}
  get id() { return this.path.split("/").at(-1)!; }
  collection(name: string) { return new Collection(`${this.path}/${name}`, this.db); }
  async get() { return new Snap(this, this.db.docs.get(this.path)); }
  async update(value: Data) { this.db.update(this.path, value); }
}
class Snap {
  constructor(readonly ref: Ref, private readonly value: Data | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class Query {
  private maximum = Number.POSITIVE_INFINITY;
  constructor(private readonly db: FakeDb, private readonly path: string, private readonly filters: Array<[string, string, unknown]> = [], private readonly group = false) {}
  where(field: string, operator: string, value: unknown) { return new Query(this.db, this.path, [...this.filters, [field, operator, value]], this.group); }
  limit(value: number) { const query = new Query(this.db, this.path, this.filters, this.group); query.maximum = value; return query; }
  async get() {
    const docs = [...this.db.docs.entries()].filter(([path, data]) => {
      const segments = path.split("/");
      const inScope = this.group
        ? segments.length >= 4 && segments.at(-2) === this.path
        : path.startsWith(`${this.path}/`) && segments.length === this.path.split("/").length + 1;
      return inScope && this.filters.every(([field, operator, expected]) => {
        const actual = data[field];
        if (operator === "==") return actual === expected;
        if (operator === "in") return Array.isArray(expected) && expected.includes(actual);
        if (operator === "<=") return actual instanceof Timestamp && expected instanceof Timestamp && actual.toMillis() <= expected.toMillis();
        return false;
      });
    }).slice(0, this.maximum).map(([path, data]) => new Snap(new Ref(path, this.db), data));
    return { docs, size: docs.length };
  }
}
class Collection {
  constructor(private readonly path: string, private readonly db: FakeDb) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  where(field: string, operator: string, expected: unknown) { return new Query(this.db, this.path, [[field, operator, expected]]); }
  limit(value: number) { return new Query(this.db, this.path).limit(value); }
}
class Tx {
  private readonly updates: Array<[string, Data]> = [];
  constructor(private readonly db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snap(ref, this.db.docs.get(ref.path)); }
  update(ref: Ref, value: Data) { this.updates.push([ref.path, value]); }
  commit() { for (const [path, value] of this.updates) this.db.update(path, value); }
}
class FakeDb {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(name, this); }
  collectionGroup(name: string) { return new Query(this, name, [], true); }
  async getAll(...refs: Ref[]) { return Promise.all(refs.map(ref => ref.get())); }
  async runTransaction<T>(work: (tx: Tx) => Promise<T>) { const tx = new Tx(this); const result = await work(tx); tx.commit(); return result; }
  update(path: string, value: Data) {
    const current = this.docs.get(path);
    if (!current) throw new Error("not-found");
    const next = { ...current, ...value };
    for (const [key, operation] of Object.entries(value)) {
      if (operation && typeof operation === "object" && Array.isArray(current[key])) {
        const transform = operation as { __arrayRemove?: unknown[]; elements?: unknown[] };
        const removed = transform.__arrayRemove ?? (operation.constructor.name === "ArrayRemoveTransform" ? transform.elements : undefined);
        if (removed) next[key] = current[key].filter((item: unknown) => !removed.includes(item));
      }
    }
    this.docs.set(path, next);
  }
}

const empresaId = "empresa-agenda-worker";
const programacionId = "programacion-worker";
const now = Date.parse("2026-10-07T15:00:00.000Z");
const eventoId = "evento-agenda-worker";

function seedEvent(db: FakeDb, options: { token?: boolean; state?: string } = {}) {
  db.docs.set(`eventos_operativos/${eventoId}`, {
    eventoId, empresaId, tipo: "RECORDATORIO_AGENDA_PEDIDO", agregado: { id: programacionId },
    payloadOperativo: { etapa: "fecha_programada" }, fechaDisponible: Timestamp.fromMillis(now),
    estadoDespacho: options.state ?? "PENDIENTE", intentos: 0,
  });
  db.docs.set(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`, {
    empresaId, programacionId, solicitanteUid: "seller-worker", estado: "RESERVADA",
  });
  db.docs.set("membresias/admin-worker", { empresaId, uid: "admin-worker", rol: "admin", activo: true, estado: "activa" });
  db.docs.set("membresias/seller-worker", { empresaId, uid: "seller-worker", rol: "vendedor", activo: true, estado: "activa" });
  db.docs.set("usuarios/admin-worker", { fcmTokens: options.token ? ["token-admin"] : [] });
  db.docs.set("usuarios/seller-worker", { fcmTokens: options.token ? ["token-seller"] : [] });
}

function seedSolicitudEvent(db: FakeDb, options: { token?: boolean; state?: string; requestState?: string } = {}) {
  const solicitudId = "solicitud-push-1";
  db.docs.set(`eventos_operativos/${eventoId}`, {
    eventoId, empresaId, tipo: "SOLICITUD_VENTA_BODEGA_PENDIENTE",
    agregado: { tipo: "SOLICITUD_VENTA_BODEGA", id: solicitudId },
    payloadOperativo: { solicitudId }, fechaDisponible: Timestamp.fromMillis(now),
    estadoDespacho: options.state ?? "PENDIENTE", intentos: 0,
  });
  db.docs.set(`empresas/${empresaId}/solicitudes_venta_bodega/${solicitudId}`, {
    empresaId, solicitudId, estado: options.requestState ?? "PENDIENTE_APROBACION",
  });
  db.docs.set("membresias/admin-worker", { empresaId, uid: "admin-worker", rol: "admin", activo: true, estado: "activa" });
  db.docs.set("membresias/seller-worker", { empresaId, uid: "seller-worker", rol: "vendedor", activo: true, estado: "activa" });
  db.docs.set("membresias/admin-ajeno", { empresaId: "otra-empresa", uid: "admin-ajeno", rol: "admin", activo: true, estado: "activa" });
  db.docs.set("membresias/admin-inactivo", { empresaId, uid: "admin-inactivo", rol: "admin", activo: false, estado: "suspendida" });
  db.docs.set("usuarios/admin-worker", { fcmTokens: options.token ? ["token-admin"] : [] });
  db.docs.set("usuarios/seller-worker", { fcmTokens: options.token ? ["token-seller"] : [] });
  db.docs.set("usuarios/admin-ajeno", { fcmTokens: options.token ? ["token-admin-ajeno"] : [] });
  db.docs.set("usuarios/admin-inactivo", { fcmTokens: options.token ? ["token-admin-inactivo"] : [] });
}

test("solicitud pendiente: notifica solo al admin activo del tenant con payload genérico", async () => {
  const db = new FakeDb(); seedSolicitudEvent(db, { token: true });
  const calls: Array<{ tokens: string[]; data: Data }> = [];
  const messaging = { async sendEachForMulticast(input: Data) { calls.push(input); return { responses: input.tokens.map(() => ({ success: true })) }; } };

  assert.equal(await despacharNotificacionSolicitudVentaBodegaPendiente(db, messaging as any, eventoId, now), true);
  assert.equal(db.docs.get(`eventos_operativos/${eventoId}`)?.estadoDespacho, "ENVIADO");
  assert.deepEqual(calls.map(call => [call.tokens, call.data]), [[ ["token-admin"], {
    title: "Nueva solicitud de venta", body: "Hay una solicitud pendiente de revisión.",
    url: "/admin/solicitudes", eventId,
  } ]]);
  assert.equal(JSON.stringify(calls).includes("solicitud-push-1"), false);
});

test("solicitud ya resuelta antes del despacho se omite sin enviar push", async () => {
  const db = new FakeDb(); seedSolicitudEvent(db, { token: true, requestState: "APROBADA" });
  const messaging = { async sendEachForMulticast() { throw new Error("NO_DEBE_ENVIAR"); } };

  assert.equal(await despacharNotificacionSolicitudVentaBodegaPendiente(db, messaging as any, eventoId, now), true);
  assert.equal(db.docs.get(`eventos_operativos/${eventoId}`)?.estadoDespacho, "OMITIDO");
});

test("el trigger y Scheduler comparten el claim y no envían dos veces el mismo evento", async () => {
  const db = new FakeDb(); seedSolicitudEvent(db, { token: true });
  let sends = 0;
  const messaging = { async sendEachForMulticast(input: Data) { sends += input.tokens.length; return { responses: input.tokens.map(() => ({ success: true })) }; } };

  assert.equal(await despacharNotificacionSolicitudVentaBodegaPendiente(db, messaging as any, eventoId, now), true);
  assert.equal(await despacharEventosOperativosBodega(db, messaging as any, now), 0);
  assert.equal(sends, 1);
});

test("ADR-064 worker: despacha recordatorio a admin y vendedor solo con membresías activas", async () => {
  const db = new FakeDb(); seedEvent(db, { token: true });
  const calls: Array<{ tokens: string[]; data: Data }> = [];
  const messaging = { async sendEachForMulticast(input: Data) { calls.push(input); return { responses: input.tokens.map(() => ({ success: true })) }; } };
  const processed = await despacharEventosOperativosBodega(db, messaging as any, now);
  assert.equal(processed, 1);
  assert.equal(db.docs.get(`eventos_operativos/${eventoId}`)?.estadoDespacho, "ENVIADO");
  assert.deepEqual(calls.map(call => [call.tokens, call.notification, call.data]).sort(), [
    [["token-admin"], undefined, {
      title: "Pedido para hoy", body: "Llegó la fecha programada para atender un pedido.",
      url: "/admin/agenda", eventId: eventoId,
    }],
    [["token-seller"], undefined, {
      title: "Pedido para hoy", body: "Llegó la fecha programada para atender un pedido.",
      url: "/pos", eventId: eventoId,
    }],
  ].sort());
});

test("ADR-064 worker: ausencia de tokens queda durable y no altera la programación", async () => {
  const db = new FakeDb(); seedEvent(db);
  const processed = await despacharEventosOperativosBodega(db, { async sendEachForMulticast() { throw new Error("NO_DEBE_ENVIAR"); } } as any, now);
  assert.equal(processed, 1);
  assert.equal(db.docs.get(`eventos_operativos/${eventoId}`)?.estadoDespacho, "SIN_DESTINATARIO");
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`)?.estado, "RESERVADA");
});

test("ADR-064 worker: fallo transitorio conserva outbox y aplica backoff", async () => {
  const db = new FakeDb(); seedEvent(db, { token: true });
  const messaging = { async sendEachForMulticast(input: Data) { return { responses: input.tokens.map(() => ({ success: false, error: { code: "messaging/internal-error" } })) }; } };
  await despacharEventosOperativosBodega(db, messaging as any, now);
  const event = db.docs.get(`eventos_operativos/${eventoId}`)!;
  assert.equal(event.estadoDespacho, "REINTENTAR");
  assert.equal(event.fechaDisponible.toMillis(), now + 60_000);
  assert.equal(event.intentos, 1);
});

test("ADR-064 worker: un invalid-argument no elimina un token que podría ser válido", async () => {
  const db = new FakeDb(); seedEvent(db, { token: true });
  const messaging = { async sendEachForMulticast(input: Data) { return { responses: input.tokens.map(() => ({ success: false, error: { code: "messaging/invalid-argument" } })) }; } };
  await despacharEventosOperativosBodega(db, messaging as any, now);
  assert.deepEqual(db.docs.get("usuarios/admin-worker")?.fcmTokens, ["token-admin"]);
  assert.deepEqual(db.docs.get("usuarios/seller-worker")?.fcmTokens, ["token-seller"]);
  const event = db.docs.get(`eventos_operativos/${eventoId}`)!;
  assert.equal(event.estadoDespacho, "FALLIDO");
  assert.equal(event.ultimoErrorCodigo, "messaging/invalid-argument");
});

test("ADR-064 worker: tokens expirados se eliminan y nunca marcan un recordatorio como enviado", async () => {
  const db = new FakeDb(); seedEvent(db, { token: true });
  const messaging = { async sendEachForMulticast(input: Data) { return { responses: input.tokens.map(() => ({ success: false, error: { code: "messaging/registration-token-not-registered" } })) }; } };
  await despacharEventosOperativosBodega(db, messaging as any, now);
  assert.deepEqual(db.docs.get("usuarios/admin-worker")?.fcmTokens, []);
  assert.deepEqual(db.docs.get("usuarios/seller-worker")?.fcmTokens, []);
  const event = db.docs.get(`eventos_operativos/${eventoId}`)!;
  assert.equal(event.estadoDespacho, "SIN_DESTINATARIO");
  assert.equal(event.ultimoErrorCodigo, "AGENDA_PUSH_SIN_TOKENS_VALIDOS");
  assert.equal(event.despachadoEn, undefined);
});

test("ADR-064 worker: vencimiento libera stock y conserva agenda/historial", async () => {
  const db = new FakeDb();
  const reservaId = "reserva-worker";
  db.docs.set(`empresas/${empresaId}/reservas_stock_bodega/${reservaId}`, {
    empresaId, programacionId, productoId: "producto-worker", cantidadUnidadBase: 4,
    estado: "ACTIVA", expiraEn: Timestamp.fromMillis(now - 1),
  });
  db.docs.set(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`, {
    empresaId, programacionId, reservaIds: [reservaId], estado: "RESERVADA", revision: 2,
  });
  db.docs.set("productos/producto-worker", { empresaId, stock: 10, stockReservado: 4 });
  const expired = await expirarReservasAgendaBodega(db, now);
  assert.equal(expired, 1);
  assert.equal(db.docs.get("productos/producto-worker")?.stock, 10);
  assert.equal(db.docs.get("productos/producto-worker")?.stockReservado, 0);
  assert.equal(db.docs.get(`empresas/${empresaId}/reservas_stock_bodega/${reservaId}`)?.estado, "VENCIDA");
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`)?.estado, "VENCIDA");
});

test("ADR-064 worker: libera todos los productos de una agenda aunque expire en lotes", async () => {
  const db = new FakeDb();
  const secondReservationId = "reserva-worker-2";
  db.docs.set(`empresas/${empresaId}/reservas_stock_bodega/reserva-worker`, {
    empresaId, programacionId, productoId: "producto-worker", cantidadUnidadBase: 4,
    estado: "ACTIVA", expiraEn: Timestamp.fromMillis(now - 1),
  });
  db.docs.set(`empresas/${empresaId}/reservas_stock_bodega/${secondReservationId}`, {
    empresaId, programacionId, productoId: "producto-worker-2", cantidadUnidadBase: 3,
    estado: "ACTIVA", expiraEn: Timestamp.fromMillis(now - 1),
  });
  db.docs.set(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`, {
    empresaId, programacionId, reservaIds: ["reserva-worker", secondReservationId], estado: "RESERVADA", revision: 2,
  });
  db.docs.set("productos/producto-worker", { empresaId, stock: 10, stockReservado: 4 });
  db.docs.set("productos/producto-worker-2", { empresaId, stock: 10, stockReservado: 3 });

  assert.equal(await expirarReservasAgendaBodega(db, now, 1), 1);
  assert.equal(db.docs.get("productos/producto-worker")?.stockReservado, 0);
  assert.equal(db.docs.get("productos/producto-worker-2")?.stockReservado, 3);
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`)?.estado, "VENCIDA");

  assert.equal(await expirarReservasAgendaBodega(db, now, 1), 1);
  assert.equal(db.docs.get("productos/producto-worker-2")?.stockReservado, 0);
  assert.equal(db.docs.get(`empresas/${empresaId}/reservas_stock_bodega/${secondReservationId}`)?.estado, "VENCIDA");
});
