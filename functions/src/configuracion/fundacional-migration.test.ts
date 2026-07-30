import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPRESA_FUNDACIONAL_ID,
  migrarConfiguracionEmpresaFundacional,
} from "./fundacional-migration";
import { leerConfiguracionEmpresa } from "./service";
import { validarConfiguracionEmpresa } from "../../../lib/configuracion";

class Ref {
  constructor(public readonly path: string, private readonly db: Db) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.read(this.path)); }
}

class Snap {
  constructor(private readonly value: unknown) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value === undefined ? undefined : structuredClone(this.value); }
}

class Db {
  private docs = new Map<string, unknown>();

  collection(id: string) { return new Ref(id, this); }
  seed(path: string, value: unknown) { this.docs.set(path, structuredClone(value)); }
  read(path: string) { return this.docs.get(path); }

  async runTransaction<T>(callback: (tx: {
    get: (ref: Ref) => Promise<Snap>;
    create: (ref: Ref, value: unknown) => void;
  }) => Promise<T>): Promise<T> {
    const working = new Map([...this.docs].map(([path, value]) => [path, structuredClone(value)]));
    const result = await callback({
      get: async (ref) => new Snap(working.get(ref.path)),
      create: (ref, value) => {
        if (working.has(ref.path)) throw new Error(`EXISTS:${ref.path}`);
        working.set(ref.path, structuredClone(value));
      },
    });
    this.docs = working;
    return result;
  }
}

function crearDbFundacional(): Db {
  const db = new Db();
  db.seed(`empresas/${EMPRESA_FUNDACIONAL_ID}`, {
    id: EMPRESA_FUNDACIONAL_ID,
    empresaId: EMPRESA_FUNDACIONAL_ID,
    nombre: "Mi Café Especial",
    estado: "activa",
    paisFiscal: "CO",
    esFundacional: true,
  });
  db.seed(`espacios/esp_${EMPRESA_FUNDACIONAL_ID}_1`, { empresaId: EMPRESA_FUNDACIONAL_ID, nombre: "Espacio histórico" });
  db.seed("ventas/venta_historica", { empresaId: EMPRESA_FUNDACIONAL_ID, total: 25000 });
  db.seed("productos/producto_historico", { empresaId: EMPRESA_FUNDACIONAL_ID, nombre: "Café" });
  return db;
}

test("la migración fundacional crea únicamente la configuración B1 ausente y preserva los datos históricos", async () => {
  const db = crearDbFundacional();
  const antesEmpresa = structuredClone(db.read(`empresas/${EMPRESA_FUNDACIONAL_ID}`));
  const antesEspacio = structuredClone(db.read(`espacios/esp_${EMPRESA_FUNDACIONAL_ID}_1`));
  const antesVenta = structuredClone(db.read("ventas/venta_historica"));
  const antesProducto = structuredClone(db.read("productos/producto_historico"));

  const resultado = await migrarConfiguracionEmpresaFundacional(db as never);
  const configuracion = db.read(`configuraciones/${EMPRESA_FUNDACIONAL_ID}`);

  assert.deepEqual(resultado, { empresaId: EMPRESA_FUNDACIONAL_ID, creada: true, idempotente: false });
  assert.ok(configuracion);
  assert.equal(validarConfiguracionEmpresa(configuracion, {
    empresaId: EMPRESA_FUNDACIONAL_ID,
    paisFiscalEmpresa: "CO",
  }).valida, true);
  assert.deepEqual(db.read(`empresas/${EMPRESA_FUNDACIONAL_ID}`), antesEmpresa);
  assert.deepEqual(db.read(`espacios/esp_${EMPRESA_FUNDACIONAL_ID}_1`), antesEspacio);
  assert.deepEqual(db.read("ventas/venta_historica"), antesVenta);
  assert.deepEqual(db.read("productos/producto_historico"), antesProducto);
});

test("la migración fundacional es idempotente y no sobrescribe una configuración existente", async () => {
  const db = crearDbFundacional();
  await migrarConfiguracionEmpresaFundacional(db as never);
  const antesConfiguracion = structuredClone(db.read(`configuraciones/${EMPRESA_FUNDACIONAL_ID}`));
  const antesEmpresa = structuredClone(db.read(`empresas/${EMPRESA_FUNDACIONAL_ID}`));

  const resultado = await migrarConfiguracionEmpresaFundacional(db as never);

  assert.deepEqual(resultado, { empresaId: EMPRESA_FUNDACIONAL_ID, creada: false, idempotente: true });
  assert.deepEqual(db.read(`configuraciones/${EMPRESA_FUNDACIONAL_ID}`), antesConfiguracion);
  assert.deepEqual(db.read(`empresas/${EMPRESA_FUNDACIONAL_ID}`), antesEmpresa);
});

test("la configuración creada es legible por el servicio que respalda obtenerConfiguracionEmpresa", async () => {
  const db = crearDbFundacional();
  await migrarConfiguracionEmpresaFundacional(db as never);

  const configuracion = await leerConfiguracionEmpresa(db as never, EMPRESA_FUNDACIONAL_ID);

  assert.equal(configuracion.empresaId, EMPRESA_FUNDACIONAL_ID);
  assert.equal(configuracion.revision, 1);
  assert.equal(configuracion.schemaVersion, 1);
  assert.equal(configuracion.ultimaMutacion.origen, "BACKFILL");
});
