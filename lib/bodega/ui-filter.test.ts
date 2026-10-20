import assert from "node:assert/strict"
import test from "node:test"
import { filtrarPorTextoBodega } from "./ui-filter"

const items = [
  { id: "1", nombre: "Café molido", documento: "1001" },
  { id: "2", nombre: "Aceite vegetal", documento: "2002" },
  { id: "3", nombre: "Azúcar blanca", documento: "3003" },
]

test("la búsqueda Bodega ignora tildes, mayúsculas y espacios externos", () => {
  assert.deepEqual(filtrarPorTextoBodega(items, "  CAFE  ", item => [item.nombre, item.documento]), [items[0]])
  assert.deepEqual(filtrarPorTextoBodega(items, "azucar", item => [item.nombre, item.documento]), [items[2]])
})

test("la búsqueda Bodega permite encontrar un cliente por documento y conserva el orden", () => {
  assert.deepEqual(filtrarPorTextoBodega(items, "2002", item => [item.nombre, item.documento]), [items[1]])
  assert.deepEqual(filtrarPorTextoBodega(items, "", item => [item.nombre, item.documento]), items)
})

test("una proyección antigua sin teléfono no rompe el directorio", () => {
  const antiguo = { nombre: "Almacén Central", telefono: undefined }
  assert.deepEqual(filtrarPorTextoBodega([antiguo], "almacen", item => [item.nombre, item.telefono]), [antiguo])
  assert.deepEqual(filtrarPorTextoBodega([antiguo], "otro", item => [item.nombre, item.telefono]), [])
})
