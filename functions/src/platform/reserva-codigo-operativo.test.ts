import assert from "node:assert/strict";
import test from "node:test";
import {
  CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO,
  idReservaCodigoOperativo,
  reservarCodigoOperativoEnTransaccion,
} from "./reserva-codigo-operativo";

class Ref {
  constructor(readonly path: string) {}
  get id() { return this.path.split("/").pop()!; }
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
}

class Query {
  constructor(readonly codigo: string, readonly docs: Map<string, unknown>) {}
  limit() { return this; }
  ejecutar() {
    const existe = [...this.docs.entries()].some(([path, valor]) =>
      path.startsWith("credenciales_operativas/") && (valor as { codigo?: string }).codigo === this.codigo);
    return { empty: !existe };
  }
}

class DbFalso {
  readonly docs = new Map<string, unknown>();
  collection(nombre: string) {
    const ref = new Ref(nombre) as Ref & { where?: (campo: string, operador: string, codigo: string) => Query };
    ref.where = (_campo, _operador, codigo) => new Query(codigo, this.docs);
    return ref;
  }
  async transaccion(codigo: string) {
    const tx = {
      get: async (objetivo: Ref | Query) => objetivo instanceof Query
        ? objetivo.ejecutar()
        : { exists: this.docs.has(objetivo.path) },
      create: (ref: Ref, valor: unknown) => {
        if (this.docs.has(ref.path)) throw new Error("already exists");
        this.docs.set(ref.path, valor);
      },
    };
    await reservarCodigoOperativoEnTransaccion(this as unknown as FirebaseFirestore.Firestore, tx as never, codigo);
  }
}

test("la reserva canónica se crea una sola vez y no contiene propietario ni incorporación", async () => {
  const db = new DbFalso();
  const codigo = "atrato-7k2m";

  await db.transaccion(codigo);

  const reserva = db.docs.get(`reservas_codigos_operativos/${idReservaCodigoOperativo(codigo)}`) as Record<string, unknown>;
  assert.equal(reserva.codigo, codigo);
  assert.deepEqual(Object.keys(reserva).sort(), ["codigo", "creadaEn"]);
  await assert.rejects(() => db.transaccion(codigo), new RegExp(CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO));
});

test("las credenciales históricas sin reserva siguen bloqueando la asignación", async () => {
  const db = new DbFalso();
  db.docs.set("credenciales_operativas/empresa-anterior_atrato-7k2m", { codigo: "atrato-7k2m" });

  await assert.rejects(
    () => db.transaccion("atrato-7k2m"),
    new RegExp(CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO),
  );
  assert.equal(db.docs.has(`reservas_codigos_operativos/${idReservaCodigoOperativo("atrato-7k2m")}`), false);
});
