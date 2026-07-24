import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { obtenerComandoComercial } from "./command-catalog";

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

