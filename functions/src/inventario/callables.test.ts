import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarActualizarArticuloInventarioV1,
  ejecutarCrearArticuloInventarioV1,
  ejecutarRegistrarMermaOperativaV1,
} from "./callables";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined, readonly ref?: Ref) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
  where(field: string, operator: "==", value: unknown) { return new Query(this.name, this.db).where(field, operator, value); }
}

class Query {
  private readonly filters: Array<[string, unknown]> = [];
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  where(field: string, operator: "==", value: unknown) {
    assert.equal(operator, "==");
    this.filters.push([field, value]);
    return this;
  }
  orderBy(_field?: string, _direction?: string) { return this; }
  limit(_count?: number) { return this; }
  snapshots() {
    const prefix = `${this.name}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .filter(([, data]) => this.filters.every(([field, value]) => data[field] === value))
      .map(([path, data]) => new Snapshot(path.slice(prefix.length), data, new Ref(path, this.db)));
    return { docs };
  }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  private readonly sets: Array<[Ref, Data, boolean]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref | Query) {
    return ref instanceof Query ? ref.snapshots() : new Snapshot(ref.id, this.db.docs.get(ref.path), ref);
  }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, structuredClone(data)]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.updates.push([ref, structuredClone(data)]);
  }
  set(ref: Ref, data: Data, options: { merge?: boolean } = {}) { this.sets.push([ref, data, options.merge === true]); }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
    for (const [ref, data, merge] of this.sets) {
      const current = this.db.docs.get(ref.path) ?? {};
      const next = merge ? { ...current } : {};
      for (const [key, value] of Object.entries(data)) next[key] = value && typeof value === "object" && value.constructor?.name === "NumericIncrementTransform"
        ? Number(current[key] ?? 0) + Number((value as { operand: number }).operand) : value;
      this.db.docs.set(ref.path, next);
    }
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this);
    const result = await work(tx);
    tx.commit();
    return result;
  }
}

const contexto: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "admin-a", rol: "admin" };
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seedAuth(db: FakeFirestore, ctx = contexto, permisos = ["inventory", "waste"]) {
  db.docs.set(`empresas/${ctx.empresaId}`, { estado: "trial" });
  db.docs.set(`membresias/${ctx.empresaId}_${ctx.actorUid}`, {
    empresaId: ctx.empresaId, uid: ctx.actorUid, rol: ctx.rol, permisos, estado: "activa", activo: true,
  });
  db.docs.set(`configuraciones/${ctx.empresaId}`, { empresaId: ctx.empresaId, vertical: "BODEGA_MVP1" });
  db.docs.set(`usuarios/${ctx.actorUid}`, { nombre: "Administradora" });
  db.docs.set(`espacios/espacio-a`, { empresaId: ctx.empresaId, nombre: "Cafetería" });
}

const envelope = (commandId: string, payload: Data, motivo?: string) => ({
  commandId,
  idempotencyKey: `idem-${commandId}`,
  correlationId: `corr-${commandId}`,
  ...(motivo ? { motivo } : {}),
  payload,
});

test("G-SAAS-02: crear artículo con stock inicial emite catálogo y kardex atómicos", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  const result = await ejecutarCrearArticuloInventarioV1(db, contexto, envelope("crear-insumo-1", {
    articuloTipo: "insumo",
    data: { nombre: "Café", unidadMedida: "g", costo: 2, stock: 10, stockMinimo: 5, espacioId: "espacio-a", activo: true },
  }));

  const insumo = db.docs.get(`insumos/${result.articuloId}`);
  assert.equal(insumo?.empresaId, "empresa-a");
  assert.equal(insumo?.stock, 10);
  assert.equal(insumo?.secuenciaLedger, 1);
  assert.equal(db.docs.get(`movimientos_inventario/${result.movimientoId}`)?.motivo, "inventario_inicial");
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("operaciones_comandos/")).length, 1);
});

test("G-SAAS-02: crear producto rechaza una categoría de otro tenant sin escribir", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("categorias/categoria-b", { empresaId: "empresa-b", espacioId: "espacio-b", activo: true });
  const before = structuredClone([...db.docs.entries()]);

  await assert.rejects(
    ejecutarCrearArticuloInventarioV1(db, contexto, envelope("crear-producto-categoria-ajena", {
      articuloTipo: "producto",
      data: { nombre: "Tinto", categoriaId: "categoria-b", unidad: "und", costo: 100, espacioId: "espacio-a", stock: 0 },
    })),
    error => domain(error, "CATEGORIA_INVALIDA"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("G-SAAS-02: cambiar la categoría de un producto rechaza referencias de otro tenant", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("categorias/categoria-b", { empresaId: "empresa-b", espacioId: "espacio-b", activo: true });
  db.docs.set("productos/producto-a", {
    empresaId: "empresa-a", nombre: "Tinto", categoriaId: "categoria-a", unidad: "und", costo: 100,
    stock: 0, secuenciaLedger: 0, espacioId: "espacio-a", activo: true,
  });
  const before = structuredClone([...db.docs.entries()]);

  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("mover-producto-categoria-ajena", {
      articuloTipo: "producto", articuloId: "producto-a", data: { categoriaId: "categoria-b" },
    })),
    error => domain(error, "CATEGORIA_INVALIDA"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("G-SAAS-02: crear producto conserva una categoría del mismo tenant", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("categorias/categoria-a", { empresaId: "empresa-a", espacioId: "espacio-a", activo: true });

  const result = await ejecutarCrearArticuloInventarioV1(db, contexto, envelope("crear-producto-categoria-propia", {
    articuloTipo: "producto",
    data: { nombre: "Tinto", categoriaId: "categoria-a", unidad: "und", costo: 100, espacioId: "espacio-a", stock: 0 },
  }));

  assert.equal(db.docs.get("productos/" + result.articuloId)?.categoriaId, "categoria-a");
});

test("ADR-SAAS-094: producto y categoría Nevera quedan aislados con IDs de catálogo", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("categorias/categoria-nevera", { empresaId: "empresa-a", espacioId: "espacio-a", activo: true, catalogoId: "NEVERA" });
  db.docs.set("categorias/categoria-bodega", { empresaId: "empresa-a", espacioId: "espacio-a", activo: true, catalogoId: "BODEGA" });

  const nevera = await ejecutarCrearArticuloInventarioV1(db, contexto, envelope("crear-nevera", {
    articuloTipo: "producto",
    data: { nombre: "Corona tradicional", categoriaId: "categoria-nevera", catalogoId: "NEVERA", unidad: "unidad", costo: 0, espacioId: "espacio-a", stock: 0 },
  }));
  assert.equal(db.docs.get(`productos/${nevera.articuloId}`)?.catalogoId, "NEVERA");

  await assert.rejects(
    ejecutarCrearArticuloInventarioV1(db, contexto, envelope("crear-bodega-categoria-nevera", {
      articuloTipo: "producto",
      data: { nombre: "Corona no debe cruzar", categoriaId: "categoria-nevera", catalogoId: "BODEGA", unidad: "unidad", costo: 0, espacioId: "espacio-a", stock: 0 },
    })),
    error => domain(error, "CATEGORIA_CATALOGO_INVALIDO"),
  );
});

test("ADR-SAAS-094: producto no puede migrar de catálogo después de crearse", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-nevera", {
    empresaId: "empresa-a", catalogoId: "NEVERA", nombre: "Vodka", categoriaId: "categoria-nevera", unidad: "unidad",
    costo: 0, stock: 0, secuenciaLedger: 0, espacioId: "espacio-a", activo: true,
  });
  const before = structuredClone([...db.docs.entries()]);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("mover-nevera-a-bodega", {
      articuloTipo: "producto", articuloId: "producto-nevera", data: { catalogoId: "BODEGA" },
    })),
    error => domain(error, "CATALOGO_PRODUCTO_INMUTABLE"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("ADR-SAAS-096: el stock Nevera se carga directamente sin tocar Bodega", async () => {
  for (const data of [
    { stock: 1, costo: 0 },
    { stock: 0, costo: 1 },
    { stockInicial: 1 },
  ]) {
    const db = new FakeFirestore(); seedAuth(db);
    db.docs.set("categorias/categoria-nevera", { empresaId: "empresa-a", espacioId: "espacio-a", activo: true, catalogoId: "NEVERA" });
    await assert.rejects(
      ejecutarCrearArticuloInventarioV1(db, contexto, envelope(`crear-nevera-${data.stock}-${data.costo}`, {
        articuloTipo: "producto",
        data: { nombre: "Bebida", categoriaId: "categoria-nevera", catalogoId: "NEVERA", unidad: "unidad", ...data, espacioId: "espacio-a" },
      })),
      error => domain(error, "NEVERA_STOCK_INICIAL_NO_PERMITIDO"),
    );
  }

  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-nevera", { empresaId: "empresa-a", catalogoId: "NEVERA", nombre: "Bebida", stock: 0, costo: 0, secuenciaLedger: 0, espacioId: "espacio-a", activo: true });
  db.docs.set("productos/producto-bodega", { empresaId: "empresa-a", catalogoId: "BODEGA", nombre: "Bebida", stock: 18, costo: 900, secuenciaLedger: 0, espacioId: "espacio-a", activo: true });
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("ajuste-stock-nevera", {
      articuloTipo: "producto", articuloId: "producto-nevera", data: { stock: 1 },
    })),
    error => domain(error, "COSTO_NEVERA_REQUERIDO"),
  );

  const before = structuredClone([...db.docs.entries()]);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("ajuste-stock-inicial-nevera", {
      articuloTipo: "producto", articuloId: "producto-nevera", data: { stockInicial: 1 },
    })),
    error => domain(error, "NEVERA_STOCK_INICIAL_NO_PERMITIDO"),
  );
  assert.deepEqual([...db.docs.entries()], before);

  const comando = envelope("cargar-stock-nevera", {
    articuloTipo: "producto", articuloId: "producto-nevera", data: { stock: 12, costo: 1250 },
  }, "carga_inicial_nevera");
  const result = await ejecutarActualizarArticuloInventarioV1(db, contexto, comando);
  const movement = db.docs.get(`movimientos_inventario/${result.movimientoId}`);
  assert.equal(db.docs.get("productos/producto-nevera")?.stock, 12);
  assert.equal(db.docs.get("productos/producto-nevera")?.costo, 1250);
  assert.equal(movement?.tipo, "ajuste_positivo");
  assert.equal(movement?.cantidad, 12);
  assert.equal(movement?.costoUnitario, 1250);
  assert.equal(movement?.costoTotal, 15_000);
  assert.equal(db.docs.get("productos/producto-bodega")?.stock, 18);
  assert.equal(db.docs.get("productos/producto-bodega")?.costo, 900);
  db.docs.set("productos/producto-nevera-inactivo", { empresaId: "empresa-a", catalogoId: "NEVERA", nombre: "Inactivo", stock: 0, costo: 0, secuenciaLedger: 0, espacioId: "espacio-a", activo: false });
  const beforeInactive = structuredClone([...db.docs.entries()]);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("ajustar-inactivo-nevera", {
      articuloTipo: "producto", articuloId: "producto-nevera-inactivo", data: { stock: 1, costo: 1250 },
    })),
    error => domain(error, "PRODUCTO_INACTIVO"),
  );
  assert.deepEqual([...db.docs.entries()], beforeInactive);
  const afterIntake = structuredClone([...db.docs.entries()]);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("cambiar-costo-sin-entrada-nevera", {
      articuloTipo: "producto", articuloId: "producto-nevera", data: { stock: 12, costo: 1300 },
    })),
    error => domain(error, "COSTO_NEVERA_REQUIERE_ENTRADA"),
  );
  assert.deepEqual([...db.docs.entries()], afterIntake);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("cambiar-costo-al-reducir-nevera", {
      articuloTipo: "producto", articuloId: "producto-nevera", data: { stock: 11, costo: 1300 },
    })),
    error => domain(error, "COSTO_NEVERA_REQUIERE_ENTRADA"),
  );
  assert.deepEqual([...db.docs.entries()], afterIntake);
  await ejecutarActualizarArticuloInventarioV1(db, contexto, comando);
  assert.equal(db.docs.get("productos/producto-nevera")?.stock, 12);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("movimientos_inventario/")).length, 1);

  const creado = new FakeFirestore(); seedAuth(creado);
  creado.docs.set("categorias/categoria-nevera", { empresaId: "empresa-a", espacioId: "espacio-a", activo: true, catalogoId: "NEVERA" });
  const nevera = await ejecutarCrearArticuloInventarioV1(creado, contexto, envelope("crear-nevera-stock-cero", {
    articuloTipo: "producto",
    data: { nombre: "Bebida retail", categoriaId: "categoria-nevera", catalogoId: "NEVERA", unidad: "unidad", costo: 0, stock: 0, stockInicial: 0, espacioId: "espacio-a" },
  }));
  const productoNevera = creado.docs.get(`productos/${nevera.articuloId}`);
  assert.equal(productoNevera?.stock, 0);
  assert.equal(productoNevera?.stockInicial, 0);
  assert.equal([...creado.docs.values()].filter(doc => doc.articuloId === nevera.articuloId && doc.cantidad !== undefined).length, 0);
});

test("G-SAAS-02: crear producto acepta el ID determinista largo de categoría del importador", async () => {
  const tenantId = "distribuidora-las-jimenez";
  const ctx: ContextoFinancieroOperativo = { empresaId: tenantId, actorUid: "admin-a", rol: "admin" };
  const db = new FakeFirestore(); seedAuth(db, ctx);
  const commandId = "catalogo-diana:b8e7358b277508e7c9dd2bac33c9bcb333f4b6899f71e2cc9c188a98ba44f704:categoria:agua-embotellada";
  const categoriaId = `r1a-${Buffer.from(JSON.stringify([tenantId, `categoria:${commandId}`]), "utf8").toString("base64url")}`;
  assert.equal(categoriaId.length, 202);
  db.docs.set(`categorias/${categoriaId}`, { empresaId: tenantId, espacioId: "espacio-a", activo: true });

  const result = await ejecutarCrearArticuloInventarioV1(db, ctx, envelope("crear-producto-catalogo-diana", {
    articuloTipo: "producto",
    data: { nombre: "Agua Pool Con Gas x 20 unds", categoriaId, unidad: "unidad", costo: 0, espacioId: "espacio-a", stock: 0 },
  }));

  assert.equal(db.docs.get(`productos/${result.articuloId}`)?.categoriaId, categoriaId);
});

test("G-SAAS-02: crear producto rechaza IDs de categoría que no caben en una referencia Firestore", async () => {
  for (const categoriaId of ["x".repeat(1501), "é".repeat(751), "categoria/con-separador", ".", "..", "__system__"]) {
    const db = new FakeFirestore(); seedAuth(db);
    const before = structuredClone([...db.docs.entries()]);
    await assert.rejects(
      ejecutarCrearArticuloInventarioV1(db, contexto, envelope(`categoria-id-invalido-${categoriaId.length}`, {
        articuloTipo: "producto",
        data: { nombre: "Tinto", categoriaId, unidad: "und", costo: 0, espacioId: "espacio-a", stock: 0 },
      })),
      error => domain(error, "CATEGORIA_INVALIDA"),
    );
    assert.deepEqual([...db.docs.entries()], before);
  }
});

test("G-SAAS-02: crear producto o insumo rechaza costos que no sean COP enteros seguros sin escribir", async () => {
  for (const articuloTipo of ["producto", "insumo"] as const) {
    for (const costo of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const db = new FakeFirestore(); seedAuth(db);
      const before = structuredClone([...db.docs.entries()]);
      const data = articuloTipo === "producto"
        ? { nombre: "Tinto", categoriaId: "bebidas", unidad: "und", costo, espacioId: "espacio-a", stock: 0 }
        : { nombre: "Café", unidadMedida: "g", costo, espacioId: "espacio-a", stock: 0 };

      await assert.rejects(
        ejecutarCrearArticuloInventarioV1(db, contexto, envelope(`crear-${articuloTipo}-${costo}`, { articuloTipo, data })),
        error => domain(error, "COSTO_INVALIDO"),
      );
      assert.deepEqual([...db.docs.entries()], before);
    }
  }
});

test("G-SAAS-02: actualizar producto o insumo rechaza costos fraccionarios sin mutar el artículo", async () => {
  for (const [articuloTipo, id, path] of [
    ["producto", "producto-a", "productos/producto-a"],
    ["insumo", "insumo-a", "insumos/insumo-a"],
  ] as const) {
    const db = new FakeFirestore(); seedAuth(db);
    db.docs.set(path, { empresaId: "empresa-a", nombre: "Artículo", costo: 100, stock: 0, secuenciaLedger: 0, espacioId: "espacio-a" });
    const before = structuredClone([...db.docs.entries()]);

    await assert.rejects(
      ejecutarActualizarArticuloInventarioV1(db, contexto, envelope(`actualizar-${id}-costo-fraccionario`, {
        articuloTipo, articuloId: id, data: { costo: 100.5 },
      })),
      error => domain(error, "COSTO_INVALIDO"),
    );
    assert.deepEqual([...db.docs.entries()], before);
  }
});

test("G-SAAS-02: ajustar stock resuelve el delta server-side y replay no duplica", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-1", { empresaId: "empresa-a", nombre: "Tinto", unidad: "und", costo: 0, stock: 10, secuenciaLedger: 1, espacioId: "espacio-a" });
  const data = envelope("ajuste-producto-1", { articuloTipo: "producto", articuloId: "producto-1", data: { stock: 7 } }, "conteo físico");

  const first = await ejecutarActualizarArticuloInventarioV1(db, contexto, data);
  const replay = await ejecutarActualizarArticuloInventarioV1(db, contexto, data);
  assert.deepEqual(replay, first);
  assert.equal(db.docs.get("productos/producto-1")?.stock, 7);
  assert.equal(db.docs.get("productos/producto-1")?.secuenciaLedger, 2);
  assert.equal(db.docs.get(`movimientos_inventario/${first.movimientoId}`)?.tipo, "ajuste_negativo");
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("movimientos_inventario/")).length, 1);
  assert.equal(db.docs.get("empresas/empresa-a/bodega_senales/disponibilidad")?.version, 1);
});

test("ADR-064: producto con reserva activa no se puede desactivar", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-reservado", { empresaId: "empresa-a", nombre: "Tinto", unidad: "und", costo: 0, stock: 10, stockReservado: 4, secuenciaLedger: 1, espacioId: "espacio-a", activo: true });
  const before = structuredClone([...db.docs.entries()]);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, contexto, envelope("desactivar-producto-reservado", { articuloTipo: "producto", articuloId: "producto-reservado", data: { activo: false } })),
    error => domain(error, "PRODUCTO_CON_STOCK_RESERVADO"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("G-SAAS-02: merma deriva nombre, unidad, costo y actor del servidor", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("insumos/cafe", { empresaId: "empresa-a", nombre: "Café", unidadMedida: "g", costo: 3, stock: 10, secuenciaLedger: 1, espacioId: "espacio-a" });
  const result = await ejecutarRegistrarMermaOperativaV1(db, contexto, envelope("merma-1", {
    insumoId: "cafe", cantidad: 2, motivo: "expired", notas: "Lote vencido",
  }, "expired"));

  const merma = db.docs.get(`mermas/${result.mermaId}`);
  assert.equal(merma?.insumoNombre, "Café");
  assert.equal(merma?.unidadMedida, "g");
  assert.equal(merma?.costo, 6);
  assert.equal(merma?.registradoPor, "admin-a");
  assert.equal(db.docs.get("insumos/cafe")?.stock, 8);
  assert.equal(db.docs.get(`movimientos_inventario/${result.movimientoId}`)?.costoTotal, 6);
});

test("G-SAAS-02: merma no acepta autoridad calculada por cliente ni stock negativo", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("insumos/cafe", { empresaId: "empresa-a", nombre: "Café", unidadMedida: "g", costo: 3, stock: 1, secuenciaLedger: 1, espacioId: "espacio-a" });
  const before = structuredClone([...db.docs]);
  await assert.rejects(
    ejecutarRegistrarMermaOperativaV1(db, contexto, envelope("merma-invalida", {
      insumoId: "cafe", cantidad: 2, motivo: "expired", insumoNombre: "Falso", espacioId: "ajeno",
    }, "expired")),
    error => domain(error, "CAMPO_ARTICULO_NO_PERMITIDO"),
  );
  assert.deepEqual([...db.docs], before);
});

test("G-SAAS-02: tenant y capacidad se revalidan dentro de la transacción", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-1", { empresaId: "empresa-a", nombre: "Tinto", unidad: "und", costo: 0, stock: 1, secuenciaLedger: 1, espacioId: "espacio-a" });
  const sinCapacidad = { ...contexto, actorUid: "cajero-a", rol: "cajero" };
  seedAuth(db, sinCapacidad, []);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, sinCapacidad, envelope("sin-capacidad", { articuloTipo: "producto", articuloId: "producto-1", data: { stock: 2 } })),
    error => domain(error, "ROLE_FORBIDDEN"),
  );
  assert.equal(db.docs.get("productos/producto-1")?.stock, 1);
});
