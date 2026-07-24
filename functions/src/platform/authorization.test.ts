import assert from "node:assert/strict";
import test from "node:test";
import { autorizarPlataforma } from "./authorization";

function dbCon(data?: Record<string, unknown>) {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: data !== undefined,
          data: () => data,
        }),
      }),
    }),
  };
}

const operador = {
  schemaVersion: 1,
  uid: "operador_1",
  estado: "ACTIVO",
  facultades: ["PLATAFORMA_CONSULTAR"],
  versionAutorizacion: 4,
};

test("autoriza solo con documento activo, facultad y version canonica coincidente", async () => {
  const resultado = await autorizarPlataforma(
    dbCon(operador) as never,
    "operador_1",
    { saas: { operador: true, versionAutorizacion: 4, facultades: ["PLATAFORMA_CONSULTAR"] } },
    "PLATAFORMA_CONSULTAR",
  );
  assert.equal(resultado.uid, "operador_1");
});

test("deniega si el documento canonico no existe o esta inactivo", async () => {
  await assert.rejects(
    autorizarPlataforma(
      dbCon() as never,
      "operador_1",
      { saas: { operador: true, versionAutorizacion: 4 } },
    ),
    /PLATFORM_ACCESS_DENIED/,
  );
  await assert.rejects(
    autorizarPlataforma(
      dbCon({ ...operador, estado: "SUSPENDIDO", facultades: [] }) as never,
      "operador_1",
      { saas: { operador: true, versionAutorizacion: 4 } },
    ),
    /PLATFORM_ACCESS_DENIED/,
  );
});

test("rechaza contexto obsoleto y facultad ausente", async () => {
  await assert.rejects(
    autorizarPlataforma(
      dbCon(operador) as never,
      "operador_1",
      { saas: { operador: true, versionAutorizacion: 3 } },
    ),
    /PLATFORM_CONTEXT_STALE/,
  );
  await assert.rejects(
    autorizarPlataforma(
      dbCon(operador) as never,
      "operador_1",
      { saas: { operador: true, versionAutorizacion: 4 } },
      "OPERADORES_GOBERNAR",
    ),
    /PLATFORM_ACCESS_DENIED/,
  );
});

