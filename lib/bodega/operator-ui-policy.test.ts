import assert from "node:assert/strict"
import test from "node:test"
import {
  accionEstadoVendedor,
  esBodegaMvp1,
  mostrarOperacionesGenericas,
  rolInicialOperador,
} from "./operator-ui-policy"

test("Bodega MVP-1 no expone operaciones genéricas y su alta inicia como vendedor", () => {
  assert.equal(esBodegaMvp1("BODEGA_MVP1"), true)
  assert.equal(mostrarOperacionesGenericas("BODEGA_MVP1"), false)
  assert.equal(rolInicialOperador("BODEGA_MVP1"), "vendedor")
})

test("verticales no Bodega conservan la superficie y rol inicial legacy", () => {
  assert.equal(esBodegaMvp1("GENERAL"), false)
  assert.equal(mostrarOperacionesGenericas("GENERAL"), true)
  assert.equal(rolInicialOperador("GENERAL"), "cajero")
  assert.equal(rolInicialOperador(null), "cajero")
})

test("el operador Bodega inactivo expone una restauración canónica reversible", () => {
  assert.deepEqual(accionEstadoVendedor(true), {
    estadoSolicitado: "inactiva",
    etiqueta: "Desactivar operador",
    confirmacion: "Desactivar",
    resultado: "Usuario desactivado",
  })
  assert.deepEqual(accionEstadoVendedor(false), {
    estadoSolicitado: "activa",
    etiqueta: "Reactivar operador",
    confirmacion: "Reactivar",
    resultado: "Usuario reactivado",
  })
})
