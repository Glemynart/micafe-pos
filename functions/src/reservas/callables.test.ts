import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarCancelarReservaOperativaV1,
  ejecutarCompletarReservaOperativaV1,
} from "./callables";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";
import { crearIdentificadorInterno } from "../turnos/identificadores";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined, readonly ref?: Ref) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Collection {
  constructor(private readonly name: string) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly writes: Array<[Ref, Data, "set" | "update"]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path), ref); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, structuredClone(data)]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.writes.push([ref, structuredClone(data), "update"]);
  }
  set(ref: Ref, data: Data) {
    this.writes.push([ref, structuredClone(data), "set"]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data, mode] of this.writes) {
      this.db.docs.set(ref.path, mode === "set" ? data : { ...this.db.docs.get(ref.path), ...data });
    }
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(name); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this);
    const result = await work(tx);
    tx.commit();
    return result;
  }
}

const contexto: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "admin-a", rol: "admin" };
const envelope = (commandId: string, payload: Data) => ({
  commandId,
  idempotencyKey: `idem-${commandId}`,
  correlationId: `corr-${commandId}`,
  causationId: `cause-${commandId}`,
  payload,
});
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seedAuth(db: FakeFirestore) {
  db.docs.set("empresas/empresa-a", { estado: "trial" });
  db.docs.set("membresias/empresa-a_admin-a", {
    empresaId: "empresa-a", uid: "admin-a", rol: "admin", permisos: ["reservas", "sell"], estado: "activa", activo: true,
  });
}

function seedReserva(db: FakeFirestore, estadoPago: "pendiente" | "pagado" = "pagado") {
  db.docs.set("reservas/r-1", {
    empresaId: "empresa-a",
    mesaId: "mesa-1",
    espacioId: "espacio-1",
    fechaLocal: "2026-08-20",
    bloques: ["10"],
    montoTotal: 25000,
    clienteNombre: "Cliente",
    estadoPago,
    estadoReserva: "activa",
  });
  db.docs.set("agendas/mesa-1_2026-08-20", {
    empresaId: "empresa-a",
    mesaId: "mesa-1",
    espacioId: "espacio-1",
    bloques: { "10": { reservaId: "r-1", estado: "hold", holdExpira: "2026-08-20T15:00:00.000Z" } },
  });
}

test("G-SAAS-02: cancelar reserva libera agenda solo bajo autoridad server-side y es replay-safe", async () => {
  const db = new FakeFirestore(); seedAuth(db); seedReserva(db, "pagado");
  const data = envelope("cancelar-r-1", { reservaId: "r-1", estadoReserva: "completada", montoTotal: 1 });

  const first = await ejecutarCancelarReservaOperativaV1(db, contexto, data);
  const replay = await ejecutarCancelarReservaOperativaV1(db, contexto, data);

  assert.equal(first.estadoReserva, "cancelada");
  assert.deepEqual(replay, first);
  assert.equal(db.docs.get("reservas/r-1")?.estadoReserva, "cancelada");
  assert.equal(db.docs.get("agendas/mesa-1_2026-08-20")?.bloques?.["10"], undefined);
});

test("G-SAAS-02: completar reserva pagada confirma agenda sin crear una venta", async () => {
  const db = new FakeFirestore(); seedAuth(db); seedReserva(db, "pagado");
  const data = envelope("completar-r-1", { reservaId: "r-1", turnoId: "turno-spoof", metodoPago: "efectivo", montoTotal: 1 });

  const first = await ejecutarCompletarReservaOperativaV1(db, contexto, data);
  const replay = await ejecutarCompletarReservaOperativaV1(db, contexto, data);

  assert.equal(first.estadoReserva, "completada");
  assert.deepEqual(replay, first);
  assert.equal(db.docs.get("reservas/r-1")?.estadoReserva, "completada");
  assert.equal(db.docs.get("agendas/mesa-1_2026-08-20")?.bloques?.["10"]?.estado, "confirmado");
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 0);
});

test("G-SAAS-02: completar reserva pendiente exige turno y medio de pago antes de reclamarla", async () => {
  const db = new FakeFirestore(); seedAuth(db); seedReserva(db, "pendiente");
  await assert.rejects(
    ejecutarCompletarReservaOperativaV1(db, contexto, envelope("completar-sin-turno", { reservaId: "r-1", montoTotal: 1 })),
    error => domain(error, "TURNO_REQUERIDO"),
  );
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("reservas_operaciones/")).length, 0);
  assert.equal(db.docs.get("reservas/r-1")?.estadoReserva, "activa");
});

test("P1-09: la cancelación tenant no compite con un pago Wompi reclamado", async () => {
  const db = new FakeFirestore(); seedAuth(db); seedReserva(db, "pendiente");
  db.docs.set("reservas/r-1", { ...db.docs.get("reservas/r-1"), referenciaPago: "ref-1" });
  db.docs.set("intenciones_pago_reserva/ref-1", { estado: "PAGO_RECLAMADO", empresaId: "empresa-a", reservaId: "r-1" });

  await assert.rejects(
    ejecutarCancelarReservaOperativaV1(db, contexto, envelope("cancelar-pago-wompi", { reservaId: "r-1" })),
    error => domain(error, "RESERVA_EN_PROCESO"),
  );
  assert.equal(db.docs.get("reservas/r-1")?.estadoReserva, "activa");
  assert.equal(db.docs.get("agendas/mesa-1_2026-08-20")?.bloques?.["10"] !== undefined, true);
});

test("G-SAAS-02: una cancelación no compite con un completado reclamado", async () => {
  const db = new FakeFirestore(); seedAuth(db); seedReserva(db, "pendiente");
  db.docs.set(`reservas_operaciones/${crearIdentificadorInterno("empresa-a", "reserva:r-1")}`, { estado: "EN_PROCESO" });
  // La prueba usa el comportamiento observable del dominio sin depender del
  // identificador opaco de la colección técnica: una venta determinista en
  // curso bloquea la cancelación antes de mutar la reserva.
  db.docs.set("ventas/reserva_r-1", { empresaId: "empresa-a", estadoOperativo: "PENDIENTE_EFECTOS" });
  await assert.rejects(
    ejecutarCancelarReservaOperativaV1(db, contexto, envelope("cancelar-en-cobro", { reservaId: "r-1" })),
    error => domain(error, "RESERVA_EN_PROCESO"),
  );
  assert.equal(db.docs.get("reservas/r-1")?.estadoReserva, "activa");
});
