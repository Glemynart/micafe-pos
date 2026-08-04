import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
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

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id?: string) { return new Ref(`${this.name}/${id ?? `generated-${++this.db.sequence}`}`, this.db); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, data]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path) && !this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("not-found");
    this.updates.push([ref, data]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, { ...data });
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  sequence = 0;
  private cola: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previa = this.cola;
    let liberar!: () => void;
    this.cola = new Promise<void>((resolve) => { liberar = resolve; });
    await previa;
    try {
      const tx = new Transaction(this);
      const result = await work(tx);
      tx.commit();
      return result;
    } finally {
      liberar();
    }
  }
}

const contexto: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "cajero-a", rol: "cajero" };
const item = (uid: string, quantity = 1, productId = "producto-cafe"): Data => ({
  id: productId,
  uid,
  name: "Café",
  code: "CAF",
  price: 6000,
  cost: 2000,
  category: "Cafetería",
  emoji: "☕",
  stock: 20,
  hasRecipe: false,
  quantity,
});
const envelope = (name: string, payload: Data) => ({
  commandId: `${name}-command`,
  idempotencyKey: `${name}-idempotency`,
  correlationId: `${name}-correlation`,
  causationId: null,
  motivo: null,
  payload,
});

function seedAuth(db: FakeFirestore, ctx = contexto) {
  db.docs.set(`empresas/${ctx.empresaId}`, { estado: "trial" });
  db.docs.set(`membresias/${ctx.empresaId}_${ctx.actorUid}`, {
    empresaId: ctx.empresaId,
    uid: ctx.actorUid,
    rol: ctx.rol,
    permisos: ["sell", "kitchen"],
    estado: "activa",
    activo: true,
  });
  db.docs.set(`espacios/espacio-${ctx.empresaId}`, { empresaId: ctx.empresaId });
  db.docs.set(`mesas/mesa-${ctx.empresaId}-1`, { empresaId: ctx.empresaId, espacioId: `espacio-${ctx.empresaId}`, nombre: "Mesa 1", activa: true });
  db.docs.set(`mesas/mesa-${ctx.empresaId}-2`, { empresaId: ctx.empresaId, espacioId: `espacio-${ctx.empresaId}`, nombre: "Mesa 2", activa: true });
}

function count(db: FakeFirestore, collection: string) {
  return [...db.docs.keys()].filter((path) => path.startsWith(`${collection}/`)).length;
}

function domain(error: unknown, code: string) {
  return error instanceof HttpsError && (error.details as { code?: string } | undefined)?.code === code;
}

async function crear(db: FakeFirestore, suffix = "1") {
  return ejecutarCrearCuentaSalonV1(db, contexto, envelope(`crear-${suffix}`, {
    mesaId: "mesa-empresa-a-1",
    nombreMesa: "Nombre no autoritativo",
    espacioId: "espacio-empresa-a",
    items: [item(`item-${suffix}`)],
  }));
}

test("P1-04: creación de cuenta deriva actor, mesa y tenant, y replaya el resultado", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  const first = await crear(db);
  const replay = await ejecutarCrearCuentaSalonV1(db, contexto, envelope("crear-1", {
    mesaId: "mesa-empresa-a-1", nombreMesa: "Nombre no autoritativo", espacioId: "espacio-empresa-a", items: [item("item-1")],
  }));
  assert.equal(first.pedidoId, replay.pedidoId);
  assert.equal(count(db, "pedidos_activos"), 1);
  const pedido = db.docs.get(`pedidos_activos/${first.pedidoId}`)!;
  assert.equal(pedido.cajeroId, contexto.actorUid);
  assert.equal(pedido.nombreMesa, "Mesa 1");
  assert.equal(pedido.empresaId, contexto.empresaId);
});

test("P1-04: conflicto de commandId no ejecuta una segunda intención", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  await crear(db);
  await assert.rejects(
    ejecutarCrearCuentaSalonV1(db, contexto, envelope("crear-1", {
      mesaId: "mesa-empresa-a-1", nombreMesa: "Mesa 1", espacioId: "espacio-empresa-a", items: [item("otro")],
    })),
    (error) => domain(error, "COMMAND_ID_CONFLICT"),
  );
  assert.equal(count(db, "pedidos_activos"), 1);
});

test("P1-04: enviar a cocina y transiciones rechazan regresiones", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  const { pedidoId } = await crear(db, "cocina");
  await ejecutarEnviarCuentaCocinaV1(db, contexto, envelope("enviar", { pedidoId }));
  const comandaId = [...db.docs.entries()].find(([path]) => path.startsWith("comandas_cocina/"))![0].split("/")[1];
  await ejecutarActualizarEstadoComandaSalonV1(db, contexto, envelope("preparar", { comandaId, nuevoEstado: "en_preparacion" }));
  await ejecutarActualizarEstadoComandaSalonV1(db, contexto, envelope("listo", { comandaId, nuevoEstado: "listo" }));
  await assert.rejects(
    ejecutarActualizarEstadoComandaSalonV1(db, contexto, envelope("regresion", { comandaId, nuevoEstado: "en_preparacion" })),
    (error) => domain(error, "TRANSICION_COMANDA_INVALIDA"),
  );
});

test("P1-04: separación, unión y traslado son operaciones tenant-aware", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  const origen = await crear(db, "origen");
  await ejecutarAgregarLineaCuentaSalonV1(db, contexto, envelope("agregar", { pedidoId: origen.pedidoId, item: item("item-2", 1, "producto-te") }));
  const separado = await ejecutarSepararCuentaSalonV1(db, contexto, envelope("separar", { pedidoOrigenId: origen.pedidoId, itemsToMove: [{ uid: "item-2", cantidad: 1 }] }));
  await ejecutarUnirCuentasSalonV1(db, contexto, envelope("unir", { pedidoDestinoId: origen.pedidoId, pedidosOrigenIds: [separado.pedidoNuevoId] }));
  await ejecutarTrasladarCuentaSalonV1(db, contexto, envelope("trasladar", { pedidoId: origen.pedidoId, mesaDestinoId: "mesa-empresa-a-2" }));
  assert.equal(db.docs.get(`pedidos_activos/${origen.pedidoId}`)?.mesaId, "mesa-empresa-a-2");
  assert.equal(db.docs.get(`pedidos_activos/${separado.pedidoNuevoId}`)?.estado, "unificado");

  const otroTenant: ContextoFinancieroOperativo = { empresaId: "empresa-b", actorUid: "cajero-b", rol: "cajero" };
  seedAuth(db, otroTenant);
  await assert.rejects(
    ejecutarTrasladarCuentaSalonV1(db, otroTenant, envelope("cruce-tenant", { pedidoId: origen.pedidoId, mesaDestinoId: "mesa-empresa-b-2" })),
    (error) => domain(error, "PEDIDO_NO_ENCONTRADO"),
  );
});
