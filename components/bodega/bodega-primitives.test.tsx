import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BodegaEmptyState, BodegaSearch } from "./bodega-primitives"

test("el buscador Bodega tiene nombre accesible explícito", () => {
  const html = renderToStaticMarkup(createElement(BodegaSearch, { value: "", onChange: () => {}, placeholder: "Buscar clientes" }))
  assert.match(html, /aria-label="Buscar clientes"/)
  assert.match(html, /type="search"/)
})

test("un estado vacío informa sin ocultar el motivo", () => {
  const html = renderToStaticMarkup(createElement(BodegaEmptyState, { title: "Sin coincidencias", detail: "Prueba otra búsqueda" }))
  assert.match(html, /role="status"/)
  assert.match(html, /Sin coincidencias/)
  assert.match(html, /Prueba otra búsqueda/)
})
