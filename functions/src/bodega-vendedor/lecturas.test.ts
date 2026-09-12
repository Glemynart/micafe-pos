import assert from "node:assert/strict";
import test from "node:test";
import { ejecutarConsultarCatalogoVendedor, ejecutarConsultarMisVentasVendedor } from "./lecturas";

class Query { constructor(private docs: any[], private filters: [string, unknown][] = []) {} where(k: string, _op: string, v: unknown) { return new Query(this.docs, [...this.filters, [k, v]]); } async get() { return { docs: this.docs.filter(d => this.filters.every(([k, v]) => d.data()[k] === v)) }; } }
class Db { constructor(private data: Record<string, any[]>) {} collection(name: string) { return new Query(this.data[name] ?? []); } }
const doc = (id: string, data: any) => ({ id, data: () => data });

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
