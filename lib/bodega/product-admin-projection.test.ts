import assert from "node:assert/strict";
import test from "node:test";
import { proyectarProductoBodegaAdmin } from "./product-admin-projection";

test("expone el costo canónico del producto en unidad base al panel administrativo", () => {
  const producto = proyectarProductoBodegaAdmin("producto-a", {
    nombre: "Producto A",
    unidadMedida: "unidad",
    costo: 1_250,
  });

  assert.equal(producto.id, "producto-a");
  assert.equal(producto.unidad, "unidad");
  assert.equal(producto.costoUnidadBaseCOP, 1_250);
});

test("representa costo ausente como no disponible, sin inventar un valor", () => {
  const producto = proyectarProductoBodegaAdmin("producto-b", { nombre: "Producto B" });

  assert.equal(producto.costoUnidadBaseCOP, 0);
});
