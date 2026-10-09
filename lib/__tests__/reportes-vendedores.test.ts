import assert from "node:assert/strict"
import test from "node:test"
import { crearIndiceNombres } from "../actor-display"
import { resolverNombreVisibleVendedor } from "../reportes-vendedores"

test("preserva el nombre histórico del vendedor en el reporte", () => {
  const nombres = crearIndiceNombres([{ uid: "vendedor-1", nombre: "Nombre actual" }])

  assert.equal(resolverNombreVisibleVendedor("vendedor-1", "Nombre al vender", nombres), "Nombre al vender")
})

test("preserva el nombre histórico aunque falte el UID del vendedor", () => {
  const nombres = new Map<string, string>([["uid-vendedor-conocido", "Nombre actual"]])

  assert.equal(resolverNombreVisibleVendedor("desconocido", "Nombre histórico", nombres), "Nombre histórico")
  assert.equal(resolverNombreVisibleVendedor(undefined, "Nombre histórico", nombres), "Nombre histórico")
  assert.equal(resolverNombreVisibleVendedor(undefined, "uid-vendedor-conocido", nombres), "Nombre actual")
  assert.equal(resolverNombreVisibleVendedor(undefined, "Ana-Maria", nombres), "Ana-Maria")
  assert.equal(
    resolverNombreVisibleVendedor(undefined, "AlejandraMariaRodriguezGonzalez", nombres),
    "AlejandraMariaRodriguezGonzalez",
  )
})

test("resuelve el nombre tenant-aware cuando el snapshot del reporte es el UID", () => {
  const nombres = crearIndiceNombres([{ uid: "uid-vendedor-largo", nombre: "Diana Jiménez" }])

  assert.equal(resolverNombreVisibleVendedor("uid-vendedor-largo", "uid-vendedor-largo", nombres), "Diana Jiménez")
})

test("abrevia el UID si no existe un nombre disponible", () => {
  const uid = "firebase-uid-no-disponible-123456"

  assert.equal(resolverNombreVisibleVendedor(uid, uid, new Map()), "Vendedor · …123456")
})

test("no expone un UID completo cuando falta la identidad del vendedor", () => {
  assert.equal(resolverNombreVisibleVendedor("desconocido", undefined, new Map()), "Vendedor sin identificar")
  assert.equal(resolverNombreVisibleVendedor(undefined, undefined, new Map()), "Vendedor sin identificar")
  assert.equal(
    resolverNombreVisibleVendedor(undefined, "firebase-uid-no-disponible-123456", new Map()),
    "Vendedor · …123456",
  )
  assert.equal(resolverNombreVisibleVendedor(undefined, "uid-123", new Map()), "Vendedor · …id-123")
  assert.equal(resolverNombreVisibleVendedor(undefined, "u1234", new Map()), "Vendedor sin identificar")
  assert.equal(resolverNombreVisibleVendedor("u1234", "u1234", new Map()), "Vendedor sin identificar")
})
