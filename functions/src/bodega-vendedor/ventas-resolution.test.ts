import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { normalizarComandoConfirmacionVentaBodega } from "./ventas-contract";
import { aplicarConsumosInventarioBodegaEnTransaccion, resolverVentaBodegaEnTransaccion } from "./ventas-resolution";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Collection {
  constructor(private readonly db: FakeFirestore, private readonly name: string) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, structuredClone(data)]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.updates.push([ref, structuredClone(data)]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  private queue: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      const tx = new Transaction(this);
      const result = await work(tx);
      tx.commit();
      return result;
    } finally {
      release();
    }
  }
}

const empresaId = "empresa-a";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-a", rol: "vendedor" };
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const EMULATOR_PROJECT_ID = "demo-bodega-u3b-concurrencia";
const domain = (error: unknown, code: string) =>
  (error instanceof HttpsError && typeof error.details === "object" && error.details !== null && (error.details as { code?: string }).code === code)
  || (error instanceof Error && error.message === code);
const command = (lineas: Array<{ productoId: string; presentacionId: string; cantidad: number }>, suffix = "1", clienteId = "cliente-a") => normalizarComandoConfirmacionVentaBodega({
  commandId: `cmd-${suffix}`,
  idempotencyKey: `idem-${suffix}`,
  correlationId: `corr-${suffix}`,
  causationId: null,
  payload: { clienteId, lineas, metodoPago: "efectivo" },
});

function seed(db: FakeFirestore, stock = 100) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa" });
  db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
  db.docs.set("clientes/cliente-a", { empresaId, nombre: "Tienda A", cedula: "9001", telefono: "300", activo: true });
  db.docs.set("productos/producto-a", { empresaId, nombre: "Producto A", unidadMedida: "unidad", espacioId: "espacio-a", activo: true, stock, secuenciaLedger: 0, costo: 100 });
  db.docs.set("presentaciones_producto/unidad-a", { empresaId, productoId: "producto-a", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1000, activo: true });
  db.docs.set("presentaciones_producto/caja-a", { empresaId, productoId: "producto-a", nombre: "Caja", factorUnidadBase: 24, precioCOP: 20000, activo: true });
}

async function resolverYAplicar(db: FakeFirestore, input: ReturnType<typeof command>, ventaId = "venta-interna") {
  return db.runTransaction(async tx => {
    const resolucion = await resolverVentaBodegaEnTransaccion(tx, db, contexto, input);
    const movimientos = await aplicarConsumosInventarioBodegaEnTransaccion(tx, db, resolucion, ventaId);
    return { resolucion, movimientos };
  });
}

test("U3-B: conserva líneas comerciales y consolida presentaciones del mismo producto en unidad base", async () => {
  const db = new FakeFirestore(); seed(db);
  const result = await resolverYAplicar(db, command([
    { productoId: "producto-a", presentacionId: "caja-a", cantidad: 2 },
    { productoId: "producto-a", presentacionId: "caja-a", cantidad: 1 },
    { productoId: "producto-a", presentacionId: "unidad-a", cantidad: 3 },
  ]));
  assert.equal(result.resolucion.lineas.length, 3);
  assert.deepEqual(result.resolucion.lineas.map(linea => linea.cantidadUnidadBase), [48, 24, 3]);
  assert.deepEqual(result.resolucion.consumos.map(consumo => [consumo.productoId, consumo.cantidadUnidadBase]), [["producto-a", 75]]);
  assert.equal(result.movimientos.length, 1);
  assert.equal(result.movimientos[0]?.cantidad, -75);
  assert.equal(db.docs.get("productos/producto-a")?.stock, 25);
  assert.equal([...db.docs.entries()].filter(([path, data]) => path.startsWith("movimientos_inventario/") && data.tipo === "venta").length, 1);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
});

test("U3-B: stock exacto y superior se consumen en unidad base; insuficiente no deja efectos", async () => {
  const exacto = new FakeFirestore(); seed(exacto, 48);
  await resolverYAplicar(exacto, command([{ productoId: "producto-a", presentacionId: "caja-a", cantidad: 2 }], "exacto"));
  assert.equal(exacto.docs.get("productos/producto-a")?.stock, 0);

  const superior = new FakeFirestore(); seed(superior, 50);
  await resolverYAplicar(superior, command([{ productoId: "producto-a", presentacionId: "caja-a", cantidad: 2 }], "superior"));
  assert.equal(superior.docs.get("productos/producto-a")?.stock, 2);

  const insuficiente = new FakeFirestore(); seed(insuficiente, 47);
  const before = structuredClone([...insuficiente.docs.entries()]);
  await assert.rejects(
    resolverYAplicar(insuficiente, command([{ productoId: "producto-a", presentacionId: "caja-a", cantidad: 2 }], "insuficiente")),
    error => error instanceof Error && error.message === "STOCK_INSUFICIENTE",
  );
  assert.deepEqual([...insuficiente.docs.entries()], before);
});

test("U3-B: dos consumos concurrentes no permiten stock negativo ni movimiento parcial", async () => {
  const db = new FakeFirestore(); seed(db, 24);
  const first = resolverYAplicar(db, command([{ productoId: "producto-a", presentacionId: "caja-a", cantidad: 1 }], "concurrente-a"), "venta-a");
  const second = resolverYAplicar(db, command([{ productoId: "producto-a", presentacionId: "caja-a", cantidad: 1 }], "concurrente-b"), "venta-b");
  const [a, b] = await Promise.allSettled([first, second]);
  assert.equal([a, b].filter(result => result.status === "fulfilled").length, 1);
  assert.equal([a, b].filter(result => result.status === "rejected").length, 1);
  assert.equal(db.docs.get("productos/producto-a")?.stock, 0);
  assert.equal([...db.docs.entries()].filter(([path, data]) => path.startsWith("movimientos_inventario/") && data.tipo === "venta").length, 1);
});

test("U3-B Emulator: dos transacciones reales reintentan y solo una consume stock estricto", { skip: !FIRESTORE_EMULATOR_HOST }, async () => {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:")) throw new Error("U3-B requiere Firestore Emulator local.");
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("U3-B rechaza credenciales no emuladas.");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const empresa = `empresa-u3b-${suffix}`;
  const actor = `vendedor-u3b-${suffix}`;
  const productoId = `producto-u3b-${suffix}`;
  const presentacionId = `presentacion-u3b-${suffix}`;
  const clienteId = `cliente-u3b-${suffix}`;
  const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, `u3b-${suffix}`);
  const db = getFirestore(app);
  const contextoEmulador: ContextoFinancieroOperativo = { empresaId: empresa, actorUid: actor, rol: "vendedor" };
  const productoRef = db.collection("productos").doc(productoId);
  const llegadas = new Set<string>();
  const intentos = new Map<string, number>();
  let liberarLecturasIniciales!: () => void;
  const ambasLecturasIniciales = new Promise<void>(resolve => { liberarLecturasIniciales = resolve; });

  const comandoEmulador = (id: string) => normalizarComandoConfirmacionVentaBodega({
    commandId: `cmd-u3b-${id}-${suffix}`,
    idempotencyKey: `idem-u3b-${id}-${suffix}`,
    correlationId: `corr-u3b-${id}-${suffix}`,
    causationId: null,
    payload: { clienteId, lineas: [{ productoId, presentacionId, cantidad: 6 }], metodoPago: "efectivo" },
  });

  try {
    const batch = db.batch();
    batch.set(db.collection("empresas").doc(empresa), { estado: "activa" });
    batch.set(db.collection("membresias").doc(`${empresa}_${actor}`), { empresaId: empresa, uid: actor, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
    batch.set(db.collection("configuraciones").doc(empresa), { empresaId: empresa, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
    batch.set(db.collection("clientes").doc(clienteId), { empresaId: empresa, nombre: "Cliente Emulator", cedula: "9001", telefono: "300", activo: true });
    batch.set(productoRef, { empresaId: empresa, nombre: "Producto Emulator", unidadMedida: "unidad", espacioId: "espacio-u3b", activo: true, stock: 10, secuenciaLedger: 1, costo: 100 });
    batch.set(db.collection("presentaciones_producto").doc(presentacionId), { empresaId: empresa, productoId, nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1000, activo: true });
    await batch.commit();

    const consumir = async (id: string) => db.runTransaction(async tx => {
      intentos.set(id, (intentos.get(id) ?? 0) + 1);
      await tx.get(productoRef);
      if (!llegadas.has(id)) {
        llegadas.add(id);
        if (llegadas.size === 2) liberarLecturasIniciales();
        await ambasLecturasIniciales;
      }
      const resolucion = await resolverVentaBodegaEnTransaccion(tx, db, contextoEmulador, comandoEmulador(id));
      return aplicarConsumosInventarioBodegaEnTransaccion(tx, db, resolucion, `venta-interna-${id}-${suffix}`);
    });

    const [a, b] = await Promise.allSettled([consumir("a"), consumir("b")]);
    assert.equal([a, b].filter(resultado => resultado.status === "fulfilled").length, 1);
    assert.equal([a, b].filter(resultado => resultado.status === "rejected").length, 1);
    assert.equal([...intentos.values()].some(intentosPorOperacion => intentosPorOperacion > 1), true, "Firestore debe reintentar la transacción que entró en conflicto");
    assert.equal((await productoRef.get()).data()?.stock, 4);
    const movimientos = await db.collection("movimientos_inventario").where("empresaId", "==", empresa).get();
    const salidas = movimientos.docs.filter(documento => documento.data().tipo === "venta");
    assert.equal(salidas.length, 1);
    assert.equal(salidas[0]?.data().cantidad, -6);
    console.log(`U3-B Emulator concurrency: attempts a=${intentos.get("a") ?? 0}, b=${intentos.get("b") ?? 0}; stock=4; salidas=1`);
  } finally {
    await deleteApp(app);
  }
});

test("U3-B: cliente, producto y presentación ajenos o incompatibles fallan cerrados", async () => {
  const casos: Array<[string, (db: FakeFirestore) => ReturnType<typeof command>, string]> = [
    ["cliente ajeno", db => { db.docs.set("clientes/cliente-b", { empresaId: "empresa-b", activo: true }); return command([{ productoId: "producto-a", presentacionId: "unidad-a", cantidad: 1 }], "cliente-ajeno", "cliente-b"); }, "CLIENTE_NO_ENCONTRADO"],
    ["producto ajeno", db => { db.docs.set("productos/producto-b", { empresaId: "empresa-b", activo: true }); db.docs.set("presentaciones_producto/presentacion-b", { empresaId: "empresa-b", productoId: "producto-b", activo: true, nombre: "Caja", factorUnidadBase: 1, precioCOP: 1 }); return command([{ productoId: "producto-b", presentacionId: "presentacion-b", cantidad: 1 }], "producto-ajeno"); }, "PRODUCTO_NO_ENCONTRADO"],
    ["presentacion ajena", db => { db.docs.set("presentaciones_producto/presentacion-b", { empresaId: "empresa-b", productoId: "producto-a", activo: true, nombre: "Caja", factorUnidadBase: 1, precioCOP: 1 }); return command([{ productoId: "producto-a", presentacionId: "presentacion-b", cantidad: 1 }], "presentacion-ajena"); }, "PRESENTACION_NO_ENCONTRADA"],
    ["relacion invalida", db => { db.docs.set("presentaciones_producto/unidad-a", { ...db.docs.get("presentaciones_producto/unidad-a"), productoId: "otro-producto" }); return command([{ productoId: "producto-a", presentacionId: "unidad-a", cantidad: 1 }], "relacion-invalida"); }, "PRESENTACION_NO_ENCONTRADA"],
  ];
  for (const [, prepare, code] of casos) {
    const db = new FakeFirestore(); seed(db);
    await assert.rejects(db.runTransaction(tx => resolverVentaBodegaEnTransaccion(tx, db, contexto, prepare(db))), error => domain(error, code));
  }
});

test("U3-B: cliente, producto, presentación y autoridad inactivos o revocados se deniegan", async () => {
  const casos: Array<[string, (db: FakeFirestore) => void, string]> = [
    ["cliente", db => db.docs.set("clientes/cliente-a", { ...db.docs.get("clientes/cliente-a"), activo: false }), "CLIENTE_INACTIVO"],
    ["producto", db => db.docs.set("productos/producto-a", { ...db.docs.get("productos/producto-a"), activo: false }), "PRODUCTO_INACTIVO"],
    ["presentacion", db => db.docs.set("presentaciones_producto/unidad-a", { ...db.docs.get("presentaciones_producto/unidad-a"), activo: false }), "PRESENTACION_INACTIVA"],
    ["rol", db => db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: "cajero", permisos: ["sell"], estado: "activa", activo: true }), "TENANT_ACCESS_DENIED"],
    ["sell", db => db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: "vendedor", permisos: [], estado: "activa", activo: true }), "ROLE_FORBIDDEN"],
    ["membresia", db => db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: "vendedor", permisos: ["sell"], estado: "inactiva", activo: false }), "TENANT_ACCESS_DENIED"],
    ["vertical", db => db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "GENERAL", modulos: { habilitados: ["sell"] } }), "VENTA_BODEGA_NO_AUTORIZADA"],
    ["capability", db => db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: [] } }), "VENTA_BODEGA_NO_AUTORIZADA"],
  ];
  for (const [, mutate, code] of casos) {
    const db = new FakeFirestore(); seed(db); mutate(db);
    await assert.rejects(db.runTransaction(tx => resolverVentaBodegaEnTransaccion(tx, db, contexto, command([{ productoId: "producto-a", presentacionId: "unidad-a", cantidad: 1 }], code))), error => domain(error, code));
  }
});

test("U3-B: el contrato rechaza cantidades inválidas, overflow y campos comerciales controlados por cliente", async () => {
  const base = { productoId: "producto-a", presentacionId: "unidad-a", cantidad: 1 };
  for (const cantidad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => normalizarComandoConfirmacionVentaBodega({ commandId: "cmd", idempotencyKey: "idem", correlationId: "corr", causationId: null, payload: { clienteId: "cliente-a", lineas: [{ ...base, cantidad }], metodoPago: "efectivo" } }));
  }
  assert.throws(() => normalizarComandoConfirmacionVentaBodega({ commandId: "cmd", idempotencyKey: "idem", correlationId: "corr", causationId: null, payload: { clienteId: "cliente-a", lineas: [{ ...base, precioCOP: 1 }], metodoPago: "efectivo" } }));
  const db = new FakeFirestore(); seed(db);
  await assert.rejects(
    db.runTransaction(tx => resolverVentaBodegaEnTransaccion(tx, db, contexto, command([{ productoId: "producto-a", presentacionId: "caja-a", cantidad: Number.MAX_SAFE_INTEGER }], "overflow"))),
    error => domain(error, "CANTIDAD_UNIDAD_BASE_INVALIDA"),
  );
});
