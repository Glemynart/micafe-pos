import assert from "node:assert/strict"
import test from "node:test"
import { construirBusquedaWebProducto, clasificarProductosBodega } from "./category-suggestions"

test("sugiere categorías para términos colombianos explícitos", () => {
  const result = clasificarProductosBodega([
    { itemId: "fila-1", nombre: "Aguardiente Antioqueño 750 ml" },
    { itemId: "fila-2", nombre: "Vive 100 Original" },
    { itemId: "fila-3", nombre: "Speed Max" },
  ])

  assert.deepEqual(result.map(item => item.categoriaId), ["LICORES", "ENERGIZANTES", "ENERGIZANTES"])
  assert.deepEqual(result.map(item => item.estado), ["SUGERIDA", "SUGERIDA", "SUGERIDA"])
})

test("normaliza acentos y signos, y evita coincidencias parciales", () => {
  const result = clasificarProductosBodega([
    { itemId: "fila-1", nombre: "BEBIDA ENERGIZÁNTE" },
    { itemId: "fila-2", nombre: "Aguardiente" },
  ])

  assert.equal(result[0].categoriaId, "ENERGIZANTES")
  assert.equal(result[1].categoriaId, "LICORES")
  assert.equal(result[1].estado, "SUGERIDA")
})

test("deja nombres desconocidos o con señales de categorías incompatibles para revisión", () => {
  const result = clasificarProductosBodega([
    { itemId: "fila-1", nombre: "Light 330" },
    { itemId: "fila-2", nombre: "Saviloe" },
    { itemId: "fila-3", nombre: "Gaseosa con vodka" },
  ])

  assert.deepEqual(result.map(item => item.categoriaId), ["OTROS_REVISAR", "OTROS_REVISAR", "OTROS_REVISAR"])
  assert.deepEqual(result.map(item => item.estado), ["REVISAR", "REVISAR", "REVISAR"])
})

test("la búsqueda web solo codifica el nombre y contexto genérico", () => {
  const url = new URL(construirBusquedaWebProducto("  Aguardiente\nAntioqueño 750 ml "))

  assert.equal(url.origin, "https://www.google.com")
  assert.equal(url.pathname, "/search")
  assert.equal(url.searchParams.get("q"), "Aguardiente Antioqueño 750 ml producto Colombia")
  assert.deepEqual([...url.searchParams.keys()], ["q"])
})
