import assert from "node:assert/strict";
import test from "node:test";
import { ejecutarConsultarCatalogoVendedor, ejecutarConsultarMisVentasVendedor } from "./lecturas";
import { ejecutarConfirmarVentaBodegaV1 } from "./ventas-confirmation";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";
import { crearIdentificadorInterno } from "../turnos/identificadores";

class Query { constructor(private docs: any[], private filters: [string, unknown][] = []) {} where(k: string, _op: string, v: unknown) { return new Query(this.docs, [...this.filters, [k, v]]); } async get() { const docs = this.docs.filter(d => this.filters.every(([k, v]) => d.data()[k] === v)); return { docs, size: docs.length }; } }
class Db { constructor(private data: Record<string, any[]>) {} collection(name: string) { return new Query(this.data[name] ?? []); } }
const doc = (id: string, data: any) => ({ id, ref: { id, path: id }, data: () => data });

test("vendedor recibe solo DTOs sanitizados y aislados", async () => {
  const db = new Db({ productos: [doc("a", { empresaId: "a", nombre: "Seguro", activo: true, costo: 8, stock: 4 }), doc("b", { empresaId: "b", nombre: "Ajeno", activo: true, costo: 9 })], ventas: [doc("va", { empresaId: "a", cajeroId: "u", estado: "pagada", metodoPago: "efectivo", totales: { total: 20 }, items: [{ id: "p", cantidad: 1, precioUnitario: 20, costoUnitario: 8 }] }), doc("vb", { empresaId: "b", cajeroId: "u", costoUnitario: 9 })] });
  const catalogo = await ejecutarConsultarCatalogoVendedor(db, { empresaId: "a", rol: "vendedor" }, {});
  const ventas = await ejecutarConsultarMisVentasVendedor(db, { empresaId: "a", actorUid: "u", rol: "vendedor" }, {});
  assert.deepEqual(catalogo.productos.map((x: any) => x.nombre), ["Seguro"]);
  assert.equal(JSON.stringify(catalogo).includes("costo"), false);
  assert.equal(ventas.ventas.length, 1);
  assert.equal(JSON.stringify(ventas).includes("costoUnitario"), false);
  await assert.rejects(ejecutarConsultarCatalogoVendedor(db, { empresaId: "a", rol: "vendedor" }, { fields: ["costo"] }), /PAYLOAD_INVALID/);
  await assert.rejects(ejecutarConsultarMisVentasVendedor(db, { empresaId: "a", actorUid: "u", rol: "admin" }, {}), /ROL_NO_AUTORIZADO/);
});

test("venta Bodega materializada por U3-C aparece únicamente en las ventas del actor server-side", async () => {
  const empresaId = "empresa-lecturas-u4";
  const actorUid = "vendedor-lecturas-u4";
  const fake = new (class {
    docs = new Map<string, any>();
    collection(name: string) {
      const db = this;
      return {
        doc(id: string) { return { path: `${name}/${id}`, id }; },
        where(k: string, _op: string, v: unknown) { return new Query([...db.docs.entries()].filter(([path]) => path.startsWith(`${name}/`)).map(([path, data]) => doc(path.split("/").at(-1)!, data)), [[k, v]]); },
      };
    }
    async runTransaction<T>(work: (tx: any) => Promise<T>) {
      const writes: Array<["create" | "update", any, any]> = [];
      const tx = {
        get: async (ref: any) => ref instanceof Query ? ref.get() : ({ exists: this.docs.has(ref.path), id: ref.id, data: () => this.docs.get(ref.path) }),
        create: (ref: any, data: any) => writes.push(["create", ref, structuredClone(data)]),
        update: (ref: any, data: any) => writes.push(["update", ref, structuredClone(data)]),
      };
      const result = await work(tx);
      for (const [kind, ref, data] of writes) this.docs.set(ref.path, kind === "update" ? { ...this.docs.get(ref.path), ...data } : data);
      return result;
    }
  })();
  fake.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  fake.docs.set(`membresias/${empresaId}_${actorUid}`, { empresaId, uid: actorUid, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  fake.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
  fake.docs.set("clientes/cliente", { empresaId, nombre: "Tienda", cedula: "900", activo: true });
  fake.docs.set("productos/producto", { empresaId, nombre: "Producto", unidadMedida: "unidad", espacioId: "espacio", activo: true, stock: 10, secuenciaLedger: 1, costo: 100 });
  fake.docs.set("presentaciones_producto/presentacion", { empresaId, productoId: "producto", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1000, activo: true });
  fake.docs.set("cuentas_bancarias/banco", { id: "banco", empresaId, claveOperativa: "bancolombia", saldo: 0, nombre: "Banco" });
  const contexto: ContextoFinancieroOperativo = { empresaId, actorUid, rol: "vendedor" };
  await ejecutarConfirmarVentaBodegaV1(fake, contexto, { commandId: "cmd", idempotencyKey: "idem", correlationId: "corr", causationId: null, payload: { clienteId: "cliente", lineas: [{ productoId: "producto", presentacionId: "presentacion", cantidad: 1 }], metodoPago: "transferencia" } });
  const ventas = await ejecutarConsultarMisVentasVendedor(fake, contexto, {});
  assert.equal(ventas.ventas.length, 1);
  assert.equal(ventas.ventas[0]?.total, 1000);
  assert.equal(ventas.ventas[0]?.cliente, "Tienda");
  assert.equal(JSON.stringify(ventas).includes("cajeroId"), false);
  assert.equal(JSON.stringify(ventas).includes("costoUnitario"), false);
  assert.equal([...fake.docs.values()].find(value => value.schemaVersion === "BODEGA_MVP1_V1")?.cajeroId, actorUid);
  assert.equal(fake.docs.has(`turnos_activos/${crearIdentificadorInterno(empresaId, actorUid)}`), false);
});
