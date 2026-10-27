import assert from "node:assert/strict"
import test from "node:test"
import { filtrarProductosCatalogoBodega } from "./catalog-filter"

const productos = [
  { id: "agua", nombre: "Agua Cielo", categoriaId: "aguas" },
  { id: "ron", nombre: "Ron Caldas", categoriaId: "rones" },
  { id: "aguardiente", nombre: "Aguardiente Amarillo", categoriaId: "licores" },
]

test("Todas las categorías muestra todo el catálogo cuando no hay búsqueda", () => {
  assert.deepEqual(filtrarProductosCatalogoBodega(productos, "", "todas"), productos)
})

test("filtra por categoría y combina el filtro con la búsqueda por nombre", () => {
  assert.deepEqual(filtrarProductosCatalogoBodega(productos, "", "licores"), [productos[2]])
  assert.deepEqual(filtrarProductosCatalogoBodega(productos, "amarillo", "licores"), [productos[2]])
  assert.deepEqual(filtrarProductosCatalogoBodega(productos, "cielo", "licores"), [])
})

test("recorta y compara el texto de búsqueda sin distinguir mayúsculas", () => {
  assert.deepEqual(filtrarProductosCatalogoBodega(productos, "  RON ", "todas"), [productos[1]])
})
