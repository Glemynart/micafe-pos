import assert from "node:assert/strict";
import test from "node:test";
import { resolverModulosHabilitados } from "../modulos-plan";

test("B1 intersecta catálogo, capacidades del plan y selección inicial", () => {
  assert.deepEqual(
    resolverModulosHabilitados(["sell", "capacidad_externa"], ["sell", "reports"]),
    ["sell"],
  );
});

test("B1 no agrega sell cuando el plan no lo contrata", () => {
  assert.deepEqual(resolverModulosHabilitados(["reports"], ["sell", "reports"]), ["reports"]);
});
