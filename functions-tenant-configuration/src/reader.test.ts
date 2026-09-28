import assert from "node:assert/strict";
import test from "node:test";
import { crearPlantillaConfiguracionRevision1 } from "../../lib/configuracion/plantilla";
import { leerConfiguracionEmpresa } from "../../functions/src/configuracion/reader";

const empresaId = "empresa-reader";
const configuracion = crearPlantillaConfiguracionRevision1({
  empresaId,
  nombreComercial: "Reader",
  creadaEn: "test",
  actualizadaEn: "test",
  ultimaMutacion: { actorTipo: "SYSTEM", actorId: "test", origen: "BOOTSTRAP", commandId: "command", correlationId: "correlation" },
});

class Db {
  constructor(private readonly docs: Record<string, unknown>) {}

  collection(name: string) {
    return { doc: (id: string) => ({
      get: async () => {
        const data = this.docs[`${name}/${id}`];
        return { exists: data !== undefined, data: () => data };
      },
    }) };
  }
}

async function rechazaConCodigo(promesa: Promise<unknown>, codigo: string) {
  await assert.rejects(promesa, (error: { code?: string }) => error.code === codigo);
}

test("reporta not-found cuando la configuración no existe", async () => {
  await rechazaConCodigo(leerConfiguracionEmpresa(new Db({ [`empresas/${empresaId}`]: { paisFiscal: "CO" } }) as never, empresaId), "not-found");
});

test("reporta failed-precondition cuando la configuración no valida contra la empresa", async () => {
  await rechazaConCodigo(leerConfiguracionEmpresa(new Db({
    [`empresas/${empresaId}`]: { paisFiscal: "CO" },
    [`configuraciones/${empresaId}`]: { empresaId },
  }) as never, empresaId), "failed-precondition");
});

test("devuelve la configuración válida sin mutarla", async () => {
  const resultado = await leerConfiguracionEmpresa(new Db({
    [`empresas/${empresaId}`]: { paisFiscal: "CO" },
    [`configuraciones/${empresaId}`]: configuracion,
  }) as never, empresaId);
  assert.equal(resultado.empresaId, empresaId);
  assert.equal(resultado.revision, 1);
});
