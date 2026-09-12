import assert from "node:assert/strict";
import test from "node:test";
import {
  ejecutarConsultarClientesVendedor,
  ejecutarCrearClienteVendedor,
  normalizarEntradaClienteVendedor,
} from "./clientes";
import { exigirTenantActivo } from "../operational-auth";

const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

class Query {
  constructor(private readonly docs: ReturnType<typeof doc>[], private readonly filtros: [string, unknown][] = []) {}
  where(campo: string, _operador: string, valor: unknown) { return new Query(this.docs, [...this.filtros, [campo, valor]]); }
  async get() { return { docs: this.docs.filter((item) => this.filtros.every(([campo, valor]) => item.data()[campo] === valor)) }; }
}

class Db {
  readonly escritos: Record<string, unknown>[] = [];
  constructor(private readonly data: Record<string, ReturnType<typeof doc>[]>) {}
  collection(nombre: string) {
    return {
      where: (campo: string, _operador: string, valor: unknown) => new Query(this.data[nombre] ?? [], [[campo, valor]]),
      add: async (valor: Record<string, unknown>) => {
        this.escritos.push(valor);
        return { id: "cliente-" + this.escritos.length };
      },
    };
  }
}

class TenantRef {
  constructor(private readonly path: string, private readonly docs: Map<string, Record<string, unknown>>) {}
  doc(id: string) { return new TenantRef(`${this.path}/${id}`, this.docs); }
  async get() {
    const data = this.docs.get(this.path);
    return { exists: data !== undefined, data: () => data };
  }
}

class TenantDb {
  private readonly docs = new Map<string, Record<string, unknown>>();
  seed(path: string, data: Record<string, unknown>) { this.docs.set(path, data); }
  collection(id: string) { return new TenantRef(id, this.docs); }
}

const entradaValida = {
  nombre: "Comercial A",
  cedula: "900123456",
  tipoDocumento: "NIT",
  telefono: "3001234567",
  contacto: "Ana",
  direccion: "Calle 1",
  barrioZona: "Centro",
};
const contextoVendedor = {
  empresaId: "empresa-a",
  rol: "vendedor",
  permisos: ["sell"],
  clientesHabilitados: true,
};

test("U2-A: vendedor consulta solo clientes activos de su tenant mediante DTO fijo", async () => {
  const db = new Db({ clientes: [
    doc("a-activo", { empresaId: "empresa-a", ...entradaValida, activo: true, saldo: 500, limiteCredito: 99 }),
    doc("a-inactivo", { empresaId: "empresa-a", nombre: "Inactivo", cedula: "2", telefono: "3", activo: false }),
    doc("b-activo", { empresaId: "empresa-b", nombre: "Ajeno", cedula: "4", telefono: "5", activo: true }),
    doc("legacy", { empresaId: "empresa-a", nombre: "Legacy", cedula: "6", telefono: "7", activo: true }),
  ] });

  const respuestaA = await ejecutarConsultarClientesVendedor(db, contextoVendedor, {});
  const respuestaB = await ejecutarConsultarClientesVendedor(db, { ...contextoVendedor, empresaId: "empresa-b" }, {});

  assert.deepEqual(respuestaA.clientes.map((cliente) => cliente.id), ["a-activo", "legacy"]);
  assert.deepEqual(respuestaB.clientes.map((cliente) => cliente.id), ["b-activo"]);
  assert.equal(JSON.stringify(respuestaA).includes("saldo"), false);
  assert.equal(JSON.stringify(respuestaA).includes("limiteCredito"), false);
  assert.equal(respuestaA.clientes[1].contacto, null);
  await assert.rejects(ejecutarConsultarClientesVendedor(db, contextoVendedor, { empresaId: "empresa-b" }), /PAYLOAD_INVALIDO/);
  await assert.rejects(ejecutarConsultarClientesVendedor(db, { ...contextoVendedor, rol: "admin" }, {}), /ROL_NO_AUTORIZADO/);
});

test("U2-A: creación deriva empresaId del contexto servidor y rechaza autoridad adicional", async () => {
  const db = new Db({ clientes: [] });
  const resultado = await ejecutarCrearClienteVendedor(db, contextoVendedor, entradaValida);
  assert.equal(resultado.cliente.id, "cliente-1");
  assert.deepEqual(db.escritos[0] && {
    empresaId: db.escritos[0].empresaId,
    activo: db.escritos[0].activo,
    nombre: db.escritos[0].nombre,
    cedula: db.escritos[0].cedula,
  }, { empresaId: "empresa-a", activo: true, nombre: "Comercial A", cedula: "900123456" });
  assert.equal(Object.hasOwn(db.escritos[0], "saldo"), false);
  await assert.rejects(ejecutarCrearClienteVendedor(db, contextoVendedor, { ...entradaValida, empresaId: "empresa-b" }), /PAYLOAD_INVALIDO/);
  await assert.rejects(ejecutarCrearClienteVendedor(db, { ...contextoVendedor, rol: "admin" }, entradaValida), /ROL_NO_AUTORIZADO/);
});

test("U2-A: lectura y creación fallan cerradas sin sell o sin capability clientes", async () => {
  const db = new Db({ clientes: [] });
  for (const contexto of [
    { ...contextoVendedor, permisos: [] },
    { ...contextoVendedor, clientesHabilitados: false },
    { ...contextoVendedor, rol: "cajero" },
  ]) {
    await assert.rejects(ejecutarConsultarClientesVendedor(db, contexto, {}), /ROL_NO_AUTORIZADO/);
    await assert.rejects(ejecutarCrearClienteVendedor(db, contexto, entradaValida), /ROL_NO_AUTORIZADO/);
  }
});

test("U2-A: la frontera canónica rechaza una membresía vendedor inactiva antes de lectura o creación", async () => {
  const db = new TenantDb();
  db.seed("empresas/empresa-a", { estado: "activa", paisFiscal: "CO" });
  db.seed("membresias/empresa-a_vendedor-a", {
    empresaId: "empresa-a", uid: "vendedor-a", rol: "vendedor", permisos: ["sell"], estado: "inactiva", activo: false,
  });
  const request = { auth: { uid: "vendedor-a", token: { empresaId: "empresa-a", rol: "vendedor" } } };
  await assert.rejects(exigirTenantActivo(request, db as any), /Credenciales operativas inválidas/);
});

test("U2-A: valida nombre, documento, teléfono y opcionales del contrato", () => {
  for (const campo of ["nombre", "cedula", "telefono"] as const) {
    const invalida = { ...entradaValida, [campo]: "  " };
    assert.throws(() => normalizarEntradaClienteVendedor(invalida), /INVALIDO/);
  }
  assert.throws(() => normalizarEntradaClienteVendedor({ ...entradaValida, tipoDocumento: "CE" }), /TIPO_DOCUMENTO_INVALIDO/);
  assert.throws(() => normalizarEntradaClienteVendedor({ ...entradaValida, activo: false }), /PAYLOAD_INVALIDO/);
  assert.deepEqual(normalizarEntradaClienteVendedor({ nombre: " Legacy ", cedula: " 7 ", telefono: " 300 ", contacto: undefined }), {
    nombre: "Legacy", cedula: "7", telefono: "300",
  });
});
