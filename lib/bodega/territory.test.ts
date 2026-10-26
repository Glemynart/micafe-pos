import assert from "node:assert/strict"
import test from "node:test"
import {
  departamentosDivipola,
  municipiosPorDepartamento,
  resolverDepartamentoDivipola,
  resolverMunicipioDivipola,
  validarUbicacionDivipola,
} from "../territory/divipola"

test("DIVIPOLA conserva códigos como texto y resuelve nombres con diferencias de acento", () => {
  const antioquia = resolverDepartamentoDivipola("Antioquia")
  assert.deepEqual(antioquia, { codigo: "05", nombre: "ANTIOQUIA" })
  assert.deepEqual(resolverMunicipioDivipola("05", "Medellin"), {
    departamentoCodigo: "05",
    departamento: "ANTIOQUIA",
    municipioCodigo: "05001",
    municipio: "MEDELLÍN",
    tipo: "Municipio",
  })
  assert.equal(municipiosPorDepartamento("05").every(item => item.municipioCodigo.startsWith("05")), true)
});

test("la ubicación exige nombres y códigos que correspondan a la misma pareja oficial", () => {
  const ubicacion = {
    departamentoCodigo: "05",
    departamentoNombre: "Antioquia",
    municipioCodigo: "05001",
    municipioNombre: "Medellín",
  }
  assert.equal(validarUbicacionDivipola(ubicacion), true)
  assert.equal(validarUbicacionDivipola({ ...ubicacion, municipioCodigo: "08001" }), false)
  assert.equal(validarUbicacionDivipola({ ...ubicacion, municipioNombre: "Bogotá, D.C." }), false)
  assert.equal(validarUbicacionDivipola({ ...ubicacion, departamentoCodigo: "5" }), false)
  assert.equal(departamentosDivipola.length > 0, true)
});

test("el snapshot territorial conserva 1.122 filas y códigos únicos con ceros iniciales", () => {
  const items = departamentosDivipola.flatMap(departamento => municipiosPorDepartamento(departamento.codigo))
  assert.equal(items.length, 1122)
  assert.equal(new Set(items.map(item => item.municipioCodigo)).size, items.length)
  assert.equal(items.every(item => /^\d{2}$/.test(item.departamentoCodigo)
    && /^\d{5}$/.test(item.municipioCodigo)
    && item.municipioCodigo.startsWith(item.departamentoCodigo)), true)
});
