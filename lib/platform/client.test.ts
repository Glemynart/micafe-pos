import assert from "node:assert/strict";
import test from "node:test";
import { FACULTADES_PLATAFORMA } from "./client";

test("expone la facultad de corte de compras en el Backoffice", () => {
  assert.ok(FACULTADES_PLATAFORMA.includes("RELEASE_COMPRAS_GOBERNAR"));
});
