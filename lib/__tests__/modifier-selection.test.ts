import assert from 'node:assert/strict'
import test from 'node:test'
import { crearConfiguracionModificadores } from '../configured-line'
import {
  calcularPrecioModificadores,
  resolverGruposProducto,
  validarSelecciones,
} from '../modifier-selection'

test('P1-02: resuelve relaciones activas, filtros y overrides sin perder el snapshot comercial', () => {
  const grupos = [{
    id: 'leches',
    espacioId: 'cafeteria',
    nombre: 'Tipo de leche',
    minSeleccion: 1,
    maxSeleccion: 1,
    activo: true,
    orden: 1,
    opciones: [
      { id: 'avena', nombre: 'Avena', precioDelta: 800, activo: true, orden: 2, cocinaNombre: 'LECHE AVENA' },
      { id: 'entera', nombre: 'Entera', precioDelta: 0, activo: true, orden: 1 },
      { id: 'agotada', nombre: 'Agotada', precioDelta: 500, activo: false, orden: 3 },
    ],
  }]
  const relaciones = [{
    id: 'producto-leches',
    espacioId: 'cafeteria',
    productoId: 'latte',
    grupoId: 'leches',
    orden: 1,
    activo: true,
    opcionesPermitidas: ['avena', 'entera'],
    opcionOverrides: { avena: { precioDelta: 1200 } },
  }]

  const resueltos = resolverGruposProducto('latte', grupos, relaciones)
  assert.deepEqual(resueltos[0]?.opciones.map((opcion) => [opcion.id, opcion.precioDelta]), [
    ['entera', 0],
    ['avena', 1200],
  ])

  const selecciones = { leches: ['avena'] }
  assert.deepEqual(validarSelecciones(resueltos, selecciones), {})
  assert.equal(calcularPrecioModificadores(resueltos, selecciones), 1200)

  const snapshot = crearConfiguracionModificadores(
    'latte',
    6000,
    resueltos,
    [{ grupoId: 'leches', opcionIds: ['avena'] }],
  )
  assert.deepEqual(snapshot.modificadores, [{
    grupoId: 'leches',
    opcionIds: ['avena'],
    nombreGrupo: 'Tipo de leche',
    opciones: [{
      opcionId: 'avena',
      nombre: 'Avena',
      precioDelta: 1200,
      cocinaNombre: 'LECHE AVENA',
    }],
  }])
  assert.equal(snapshot.configurationKey, 'mod:v1|p:latte|g:leches:avena')
})

test('P1-02: rechaza selecciones duplicadas o fuera de la relación del producto', () => {
  const grupo = {
    id: 'extras',
    nombre: 'Extras',
    orden: 1,
    minSeleccion: 0,
    maxSeleccion: 2,
    opciones: [{ id: 'canela', nombre: 'Canela', precioDelta: 300, default: false }],
    inconsistencias: [],
  }

  assert.equal(validarSelecciones([grupo], { extras: ['canela', 'canela'] }).extras, 'La selección contiene opciones no disponibles.')
  assert.equal(validarSelecciones([grupo], { extras: ['vainilla'] }).extras, 'La selección contiene opciones no disponibles.')
})
