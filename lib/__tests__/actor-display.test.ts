import assert from "node:assert/strict"
import test from "node:test"
import { crearIndiceNombres, resolverNombreActor } from "../actor-display"

test("el actor conserva el nombre snapshot cuando existe", () => {
  const nombres = crearIndiceNombres([{ uid: "u1", nombre: "Nombre actual" }])
  assert.equal(resolverNombreActor("u1", "Nombre histórico", nombres), "Nombre histórico")
})

test("el actor resuelve el nombre del perfil cuando el snapshot solo tiene UID", () => {
  const nombres = crearIndiceNombres([{ uid: "u1", nombre: "Ana Pérez" }])
  assert.equal(resolverNombreActor("u1", "u1", nombres), "Ana Pérez")
})

test("el actor conserva un fallback seguro cuando no existe perfil", () => {
  assert.equal(resolverNombreActor("u1", undefined, new Map()), "u1")
  assert.equal(resolverNombreActor(undefined, undefined, new Map()), "Sin identificar")
})
