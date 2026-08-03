import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";
import { facultadTransicionEmpresa, obtenerComandoComercial } from "./command-catalog";

test("el catálogo cerrado rechaza un tipo ajeno antes de asignar una facultad", () => {
  assert.throws(
    () => obtenerComandoComercial("TransicionarEmpresaNoAutorizada"),
    (error: unknown) => error instanceof HttpsError
      && error.code === "invalid-argument"
      && error.message === "COMANDO_PLATAFORMA_INVALIDO",
  );
});

test("TransicionarEmpresa conserva su facultad exclusiva de lifecycle", () => {
  assert.equal(
    obtenerComandoComercial("TransicionarEmpresa").facultad,
    "LIFECYCLE_GOBERNAR",
  );
});

test("CrearSuscripcionTrial exige la facultad comercial", () => {
  assert.equal(
    obtenerComandoComercial("CrearSuscripcionTrial").facultad,
    "COMERCIAL_GOBERNAR",
  );
});

function dbEmpresas(docs: Record<string, { estado: string } | { uid: string; estado: string; facultades: string[]; versionAutorizacion: number }>) {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: `${name}/${id}` in docs,
          data: () => docs[`${name}/${id}`],
        }),
      }),
    }),
  };
}

test("lifecycle normal (activar, suspender, cancelar rutinario) exige LIFECYCLE_GOBERNAR", async () => {
  const db = dbEmpresas({ "empresas/empresa_a": { estado: "activa" } });
  assert.equal(await facultadTransicionEmpresa(db as never, "suspendida", "empresa_a"), "LIFECYCLE_GOBERNAR");
  assert.equal(await facultadTransicionEmpresa(db as never, "activa", "empresa_a"), "LIFECYCLE_GOBERNAR");
  assert.equal(await facultadTransicionEmpresa(db as never, "cancelada", "empresa_a"), "LIFECYCLE_GOBERNAR");
});

test("archivar y eliminar exigen CONSERVACION_GOBERNAR de forma incondicional", async () => {
  const db = dbEmpresas({ "empresas/empresa_a": { estado: "cancelada" } });
  assert.equal(await facultadTransicionEmpresa(db as never, "archivada", "empresa_a"), "CONSERVACION_GOBERNAR");
  const db2 = dbEmpresas({ "empresas/empresa_a": { estado: "archivada" } });
  assert.equal(await facultadTransicionEmpresa(db2 as never, "eliminada", "empresa_a"), "CONSERVACION_GOBERNAR");
});

test("restaurar (destino cancelada desde archivada) exige CONSERVACION_GOBERNAR, no LIFECYCLE_GOBERNAR", async () => {
  const db = dbEmpresas({ "empresas/empresa_a": { estado: "archivada" } });
  assert.equal(await facultadTransicionEmpresa(db as never, "cancelada", "empresa_a"), "CONSERVACION_GOBERNAR");
});

test("conservación denegada sin la facultad y permitida con la facultad correspondiente", async () => {
  const empresaArchivada = { "empresas/empresa_a": { estado: "archivada" as const } };

  const dbSoloLifecycle = dbEmpresas({
    ...empresaArchivada,
    "saas_operadores/op_1": { uid: "op_1", estado: "ACTIVO", facultades: ["LIFECYCLE_GOBERNAR"], versionAutorizacion: 1 },
  });
  const facultadRequerida = await facultadTransicionEmpresa(dbSoloLifecycle as never, "eliminada", "empresa_a");
  assert.equal(facultadRequerida, "CONSERVACION_GOBERNAR");
  await assert.rejects(
    autorizarPlataforma(
      dbSoloLifecycle as never,
      "op_1",
      { saas: { operador: true, versionAutorizacion: 1, facultades: ["LIFECYCLE_GOBERNAR"] } },
      facultadRequerida,
    ),
    /PLATFORM_ACCESS_DENIED/,
  );

  const dbConConservacion = dbEmpresas({
    ...empresaArchivada,
    "saas_operadores/op_2": { uid: "op_2", estado: "ACTIVO", facultades: ["CONSERVACION_GOBERNAR"], versionAutorizacion: 1 },
  });
  const resultado = await autorizarPlataforma(
    dbConConservacion as never,
    "op_2",
    { saas: { operador: true, versionAutorizacion: 1, facultades: ["CONSERVACION_GOBERNAR"] } },
    facultadRequerida,
  );
  assert.equal(resultado.uid, "op_2");
});

test("lifecycle normal permanece autorizado con LIFECYCLE_GOBERNAR sin exigir CONSERVACION_GOBERNAR", async () => {
  const db = dbEmpresas({
    "empresas/empresa_a": { estado: "trial" },
    "saas_operadores/op_3": { uid: "op_3", estado: "ACTIVO", facultades: ["LIFECYCLE_GOBERNAR"], versionAutorizacion: 1 },
  });
  const facultadRequerida = await facultadTransicionEmpresa(db as never, "activa", "empresa_a");
  assert.equal(facultadRequerida, "LIFECYCLE_GOBERNAR");
  const resultado = await autorizarPlataforma(
    db as never,
    "op_3",
    { saas: { operador: true, versionAutorizacion: 1, facultades: ["LIFECYCLE_GOBERNAR"] } },
    facultadRequerida,
  );
  assert.equal(resultado.uid, "op_3");
});

