import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarRegistrarCompraOperativaV1, type ContextoFinancieroOperativo } from "./compras";
import { ejecutarRegistrarCompraBodegaV1 } from "./compra-core";

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

class Query {
  readonly filters: Array<[string, unknown]> = [];
  constructor(readonly collectionName: string, private readonly db: FakeFirestore) {}
  where(field: string, _operator: string, value: unknown) {
    const next = new Query(this.collectionName, this.db);
    next.filters.push(...this.filters, [field, value]);
    return next;
  }
}

class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
  where(field: string, operator: string, value: unknown) { return new Query(this.name, this.db).where(field, operator, value); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  private readonly sets: Array<[Ref, Data, boolean]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref | Query): Promise<Snapshot & { size?: number; docs?: Snapshot[] }> {
    if (ref instanceof Query) {
      const docs = [...this.db.docs.entries()]
        .filter(([path]) => path.startsWith(`${ref.collectionName}/`))
        .filter(([, value]) => ref.filters.every(([field, expected]) => value[field] === expected))
        .map(([path, value]) => {
          const documentRef = new Ref(path, this.db);
          return new Snapshot(documentRef.id, value, documentRef);
        });
      return Object.assign(new Snapshot("query", undefined), { size: docs.length, docs });
    }
    return new Snapshot(ref.id, this.db.docs.get(ref.path), ref);
  }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, data]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path) && !this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("not-found");
    this.updates.push([ref, data]);
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
  private cola: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previa = this.cola;
    let liberar!: () => void;
    this.cola = new Promise<void>(resolve => { liberar = resolve; });
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

const empresaId = "empresa-a";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-a", rol: "admin" };
const envelope = (suffix: string, payload: Record<string, unknown>) => ({
  commandId: `compra:${suffix}`,
  idempotencyKey: `compra:${suffix}`,
  correlationId: `corr:${suffix}`,
  causationId: null,
  motivo: "compra_proveedor",
  payload,
});
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;
const legacyBodega = (error: unknown) => domain(error, "BODEGA_USE_CANONICAL")
  && error instanceof HttpsError
  && error.message.includes("registrarCompraBodegaV1");

function seed(db: FakeFirestore, saldo = 0) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`membresias/${empresaId}_${contexto.actorUid}`, { empresaId, uid: contexto.actorUid, rol: contexto.rol, permisos: ["purchases"], estado: "activa", activo: true, nombre: "Administradora" });
  db.docs.set("espacios/cafeteria", { empresaId, activo: true, nombre: "Cafetería" });
  db.docs.set("productos/cafe", { empresaId, espacioId: "cafeteria", nombre: "Café catálogo", unidad: "und", stock: 2, secuenciaLedger: 0, costo: 100 });
  db.docs.set("cuentas_bancarias/caja-principal", { id: "caja-principal", empresaId, claveOperativa: "caja-principal", nombre: "Caja principal", saldo });
  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "ACTIVA", revision: 1 });
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    proveedor: "Proveedor histórico",
    espacioId: "cafeteria",
    fechaCompra: "2026-08-04",
    items: [{ tipo: "producto", articuloId: "cafe", cantidad: 2, costoUnitario: 300, itemNombre: "Nombre manipulado", unidadMedida: "caja" }],
    ...overrides,
  };
}

test("P0-12: confirma compra con snapshots del catálogo, inventario y costo en la misma autoridad", async () => {
  const db = new FakeFirestore(); seed(db);
  const result = await ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("snapshot", payload()));
  const compra = db.docs.get(`compras/${result.compraId}`);
  assert.equal(compra?.proveedor, "Proveedor histórico");
  assert.deepEqual(compra?.items[0], {
    articuloId: "cafe", tipo: "producto", articuloNombre: "Café catálogo", unidad: "und", cantidad: 2, costoUnitario: 300, costoTotal: 600,
    itemId: "cafe", itemNombre: "Café catálogo", unidadMedida: "und",
  });
  assert.equal(compra?.snapshotComercial.version, 1);
  assert.equal(db.docs.get("productos/cafe")?.stock, 4);
  assert.equal(db.docs.get("productos/cafe")?.costo, 300);
  assert.equal(db.docs.get(`movimientos_inventario/compra:${result.compraId}:producto:cafe:0`)?.referenciaId, result.compraId);
  assert.equal(db.docs.get(`empresas/${empresaId}/bodega_senales/disponibilidad`)?.version, 1);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("transacciones_financieras/")).length, 0);
});

test("ADR-SAAS-075: la callable legacy rechaza una compra nueva de Bodega sin efectos parciales", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "purchases"] } });
  const antes = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("legacy-bodega-new", payload())),
    legacyBodega,
  );

  assert.deepEqual([...db.docs.entries()], antes);
});

test("ADR-SAAS-075: la callable legacy revalida Bodega antes de devolver un replay", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "GENERAL", modulos: { habilitados: ["purchases"] } });
  const command = envelope("legacy-bodega-replay", payload());
  const result = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);
  const compraAntes = db.docs.get(`compras/${result.compraId}`);
  const movimientoAntes = db.docs.get(`movimientos_inventario/compra:${result.compraId}:producto:cafe:0`);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "purchases"] } });
  const antesReplay = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, command),
    legacyBodega,
  );

  assert.deepEqual([...db.docs.entries()], antesReplay);
  assert.equal(db.docs.get(`compras/${result.compraId}`), compraAntes);
  assert.equal(db.docs.get(`movimientos_inventario/compra:${result.compraId}:producto:cafe:0`), movimientoAntes);
});

test("Bodega: registra compra con la misma transacción y el nuevo tipo idempotente", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "purchases"] } });
  const command = envelope("bodega-core", payload());
  const result = await ejecutarRegistrarCompraBodegaV1(db, contexto, command);
  const replay = await ejecutarRegistrarCompraBodegaV1(db, contexto, command);
  const recibos = [...db.docs.entries()].filter(([path]) => path.startsWith("operaciones_comandos/"));

  assert.deepEqual(replay, result);
  assert.equal(db.docs.get(`compras/${result.compraId}`)?.total, 600);
  assert.equal(db.docs.get("productos/cafe")?.stock, 4);
  assert.equal(db.docs.get(`empresas/${empresaId}/bodega_senales/disponibilidad`)?.version, 1);
  assert.equal(recibos.length, 1);
  assert.equal(recibos[0][1].tipo, "registrarCompraBodegaV1");
});

test("ADR-SAAS-081: una compra nueva queda rechazada durante el corte sin efectos parciales", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "PAUSADA", revision: 2 });
  const before = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("corte-nueva", payload())),
    error => domain(error, "COMPRAS_EN_CORTE"),
  );

  assert.deepEqual([...db.docs.entries()], before);
});

test("ADR-SAAS-081: un replay confirmado sobrevive la pausa sin duplicar efectos", async () => {
  const db = new FakeFirestore(); seed(db);
  const command = envelope("corte-replay-confirmado", payload());
  const first = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);
  const snapshot = [...db.docs.entries()];
  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "PAUSADA", revision: 2 });

  const replay = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);

  assert.deepEqual(replay, first);
  const afterWithoutControl = [...db.docs.entries()].filter(([path]) => path !== `controles_release_compras/${empresaId}`);
  const beforeWithoutControl = snapshot.filter(([path]) => path !== `controles_release_compras/${empresaId}`);
  assert.deepEqual(afterWithoutControl, beforeWithoutControl);
});

test("ADR-SAAS-081: reintento ambiguo sin recibo no materializa una compra durante la pausa", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "PAUSADA", revision: 2 });
  const command = envelope("corte-reintento-sin-recibo", payload());

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, command),
    error => domain(error, "COMPRAS_EN_CORTE"),
  );
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, command),
    error => domain(error, "COMPRAS_EN_CORTE"),
  );
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("compras/")).length, 0);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("operaciones_comandos/")).length, 0);
});

test("ADR-SAAS-081: reanudar explícitamente permite una compra nueva y conserva el aislamiento tenant", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "PAUSADA", revision: 2 });
  db.docs.set("controles_release_compras/empresa-b", { schemaVersion: 1, empresaId: "empresa-b", estado: "PAUSADA", revision: 4 });
  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "ACTIVA", revision: 3 });

  const result = await ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("corte-reanudada", payload()));

  assert.ok(db.docs.get(`compras/${result.compraId}`));
  assert.equal(db.docs.get("controles_release_compras/empresa-b")?.estado, "PAUSADA");
});

test("ADR-SAAS-081: ausencia o forma ambigua del control falla cerrada", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.delete(`controles_release_compras/${empresaId}`);
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("corte-ausente", payload())),
    error => domain(error, "COMPRAS_CONTROL_NO_CONFIGURADO"),
  );

  db.docs.set(`controles_release_compras/${empresaId}`, { schemaVersion: 1, empresaId, estado: "ACTIVA", revision: 0 });
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("corte-ambiguo", payload())),
    error => domain(error, "COMPRAS_CONTROL_INVALIDO"),
  );
});

test("ADR-SAAS-081: control sin schemaVersion o con versión desconocida falla cerrado", async () => {
  for (const [suffix, schemaVersion] of [["sin-version", undefined], ["version-desconocida", 2]] as const) {
    const db = new FakeFirestore(); seed(db);
    db.docs.set(`controles_release_compras/${empresaId}`, {
      ...(schemaVersion === undefined ? {} : { schemaVersion }),
      empresaId,
      estado: "ACTIVA",
      revision: 1,
    });
    const before = [...db.docs.entries()];

    await assert.rejects(
      ejecutarRegistrarCompraOperativaV1(db, contexto, envelope(`control-${suffix}`, payload())),
      error => domain(error, "COMPRAS_CONTROL_INVALIDO"),
    );
    assert.deepEqual([...db.docs.entries()], before);
  }
});

test("ADR-SAAS-081: una revisión agotada no permite comprar si ya no puede pausarse", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`controles_release_compras/${empresaId}`, {
    schemaVersion: 1,
    empresaId,
    estado: "ACTIVA",
    revision: Number.MAX_SAFE_INTEGER,
  });
  const before = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("revision-agotada", payload())),
    error => domain(error, "COMPRAS_CONTROL_INVALIDO"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("ADR-SAAS-081: una compra se permite en la revisión inmediatamente anterior a la agotada", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`controles_release_compras/${empresaId}`, {
    schemaVersion: 1,
    empresaId,
    estado: "ACTIVA",
    revision: Number.MAX_SAFE_INTEGER - 1,
  });

  const result = await ejecutarRegistrarCompraOperativaV1(
    db,
    contexto,
    envelope("revision-previa-agotada", payload()),
  );

  assert.ok(db.docs.has(`compras/${result.compraId}`));
});

test("Bodega: revalida permiso antes de devolver el recibo de un replay", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "purchases"] } });
  const command = envelope("bodega-replay-revoked", payload());
  const result = await ejecutarRegistrarCompraBodegaV1(db, contexto, command);
  db.docs.set(`membresias/${empresaId}_${contexto.actorUid}`, { ...db.docs.get(`membresias/${empresaId}_${contexto.actorUid}`), permisos: ["inventory"] });
  const beforeReplay = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraBodegaV1(db, contexto, command),
    error => domain(error, "ROLE_FORBIDDEN"),
  );
  assert.equal(db.docs.get(`compras/${result.compraId}`)?.total, 600);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("operaciones_comandos/")).length, 1);
  assert.deepEqual([...db.docs.entries()], beforeReplay);
});

test("Bodega: revalida vertical y módulo antes de devolver el recibo de un replay", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "purchases"] } });
  const command = envelope("bodega-replay-disabled", payload());
  await ejecutarRegistrarCompraBodegaV1(db, contexto, command);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "GENERAL", modulos: { habilitados: ["purchases"] } });

  await assert.rejects(
    ejecutarRegistrarCompraBodegaV1(db, contexto, command),
    error => domain(error, "VERTICAL_NO_COMPATIBLE"),
  );

  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory"] } });

  await assert.rejects(
    ejecutarRegistrarCompraBodegaV1(db, contexto, command),
    error => domain(error, "MODULO_NO_HABILITADO"),
  );
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("compras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("operaciones_comandos/")).length, 1);
});

test("Bodega: vuelve a validar vertical y módulo dentro de la transacción antes de escribir", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory"] } });
  await assert.rejects(
    ejecutarRegistrarCompraBodegaV1(db, contexto, envelope("bodega-disabled", payload())),
    error => domain(error, "MODULO_NO_HABILITADO"),
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("compras/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("movimientos_inventario/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("operaciones_comandos/")), false);
});

test("Bodega: rechaza configuración con empresaId distinto al tenant autorizado", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId: "empresa-ajena", vertical: "BODEGA_MVP1", modulos: { habilitados: ["purchases"] } });
  await assert.rejects(
    ejecutarRegistrarCompraBodegaV1(db, contexto, envelope("bodega-wrong-config-tenant", payload())),
    error => domain(error, "CONFIGURACION_INVALIDA"),
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("compras/")), false);
});

test("Bodega: exige el permiso canónico purchases y no deja efectos parciales", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["purchases"] } });
  db.docs.set(`membresias/${empresaId}_${contexto.actorUid}`, { empresaId, uid: contexto.actorUid, rol: contexto.rol, permisos: ["inventory"], estado: "activa", activo: true });
  await assert.rejects(
    ejecutarRegistrarCompraBodegaV1(db, contexto, envelope("bodega-no-permission", payload())),
    error => domain(error, "ROLE_FORBIDDEN"),
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("compras/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("movimientos_inventario/")), false);
});

test("P1-03: resuelve proveedor por empresaId + proveedorId y congela su snapshot", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("proveedores/proveedor-a", {
    empresaId,
    nombre: "Proveedor canónico",
    nit: "900123456",
    telefono: "3000000000",
    estado: "ACTIVO",
  });

  const command = envelope("proveedor-snapshot", payload({
    proveedor: "Nombre manipulado",
    proveedorId: "proveedor-a",
  }));
  const result = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);
  const replay = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);
  assert.deepEqual(replay, result);
  const compra = db.docs.get(`compras/${result.compraId}`);

  assert.equal(compra?.proveedor, "Proveedor canónico");
  assert.equal(compra?.proveedorId, "proveedor-a");
  assert.deepEqual(compra?.proveedorSnapshot, {
    id: "proveedor-a",
    nombre: "Proveedor canónico",
    nit: "900123456",
    telefono: "3000000000",
    estado: "ACTIVO",
  });
  assert.equal(compra?.snapshotComercial.proveedor, "Proveedor canónico");

  db.docs.set("proveedores/proveedor-a", { empresaId, nombre: "Proveedor renombrado", estado: "ACTIVO" });
  assert.equal(db.docs.get(`compras/${result.compraId}`)?.proveedorSnapshot.nombre, "Proveedor canónico");
});

test("P1-03: rechaza proveedor inactivo o ajeno sin efectos parciales", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("proveedores/inactivo", { empresaId, nombre: "Inactivo", estado: "INACTIVO" });
  db.docs.set("proveedores/ajeno", { empresaId: "empresa-b", nombre: "Ajeno", estado: "ACTIVO" });
  const before = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("proveedor-inactivo", payload({ proveedorId: "inactivo" }))),
    error => domain(error, "PROVEEDOR_INACTIVO"),
  );
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("proveedor-ajeno", payload({ proveedorId: "ajeno" }))),
    error => domain(error, "PROVEEDOR_NO_ENCONTRADO"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("P0-12: resuelve la cuenta reservada por clave y el replay no duplica efectos", async () => {
  const db = new FakeFirestore(); seed(db, 1000);
  const data = envelope("idempotente", { ...payload(), cuentaClaveOperativa: "caja-principal" });
  const [first, second] = await Promise.all([
    ejecutarRegistrarCompraOperativaV1(db, contexto, data),
    ejecutarRegistrarCompraOperativaV1(db, contexto, data),
  ]);
  assert.deepEqual(second, first);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 400);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("transacciones_financieras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("compras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("operaciones_comandos/")).length, 1);
});

test("P0-12: una compra sin fondos revierte ledger, costo, saldo, compra y auditoría", async () => {
  const db = new FakeFirestore(); seed(db, 100);
  const before = [...db.docs.entries()];
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("rollback", { ...payload(), cuentaClaveOperativa: "caja-principal" })),
    error => domain(error, "FONDOS_INSUFICIENTES"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("P0-12: rechaza artículo de otro tenant sin escribir datos", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("productos/cafe", { empresaId: "empresa-b", espacioId: "cafeteria", nombre: "Ajeno", unidad: "und", stock: 2, secuenciaLedger: 0, costo: 100 });
  const before = [...db.docs.entries()];
  await assert.rejects(ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("aislamiento", payload())), error => domain(error, "ARTICULO_NO_ENCONTRADO"));
  assert.deepEqual([...db.docs.entries()], before);
});

test("P0-12: la misma identidad con payload distinto se rechaza como conflicto", async () => {
  const db = new FakeFirestore(); seed(db);
  const first = envelope("conflict", payload());
  await ejecutarRegistrarCompraOperativaV1(db, contexto, first);
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, { ...first, payload: payload({ proveedor: "Otro proveedor" }) }),
    error => domain(error, "COMMAND_ID_CONFLICT"),
  );
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("compras/")).length, 1);
});

test("P0-12: no acepta IDs físicos de cuenta como autoridad", async () => {
  const db = new FakeFirestore(); seed(db);
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("cuenta-fisica", payload({ cuentaId: "caja-principal" }))),
    error => domain(error, "CUENTA_CLAVE_REQUERIDA"),
  );
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("compras/")).length, 0);
});
