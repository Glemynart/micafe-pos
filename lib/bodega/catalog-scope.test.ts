import assert from "node:assert/strict"
import test from "node:test"
import { perteneceAlCatalogo } from "./catalog-scope"

test("el discriminador asigna documentos nuevos solo al catálogo explícito", () => {
  assert.equal(perteneceAlCatalogo({ catalogoId: "BODEGA" }, "BODEGA"), true)
  assert.equal(perteneceAlCatalogo({ catalogoId: "NEVERA" }, "BODEGA"), false)
  assert.equal(perteneceAlCatalogo({ catalogoId: "NEVERA" }, "NEVERA"), true)
  assert.equal(perteneceAlCatalogo({ catalogoId: "otro" }, "BODEGA"), false)
})

test("los documentos históricos sin discriminador siguen en Bodega y no aparecen en Nevera", () => {
  assert.equal(perteneceAlCatalogo({ nombre: "Producto histórico" }, "BODEGA"), true)
  assert.equal(perteneceAlCatalogo({ nombre: "Producto histórico", catalogoId: null }, "BODEGA"), true)
  assert.equal(perteneceAlCatalogo({ nombre: "Producto histórico" }, "NEVERA"), false)
  assert.equal(perteneceAlCatalogo(null, "BODEGA"), false)
})
