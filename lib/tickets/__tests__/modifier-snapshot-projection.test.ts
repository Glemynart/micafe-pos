import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  proyectarModificadoresCocina,
  proyectarModificadoresTicket,
} from '../../modifier-snapshot-projection'

const SNAPSHOT = [{
  grupoId: 'tamano',
  opcionIds: ['grande'],
  opciones: [{ opcionId: 'grande', nombre: 'Grande', precioDelta: 0, cocinaNombre: 'VASO GRANDE' }],
}, {
  grupoId: 'leche',
  opcionIds: ['almendra', 'canela'],
  opciones: [
    { opcionId: 'almendra', nombre: 'Leche Almendra', precioDelta: 1500, cocinaNombre: 'ALMENDRA' },
    { opcionId: 'canela', nombre: 'Canela', precioDelta: 0 },
  ],
}]

test('proyecciÃ³n de ticket usa el nombre comercial y adicional del snapshot', () => {
  assert.deepEqual(proyectarModificadoresTicket(SNAPSHOT), [
    { nombre: 'Grande', precioDelta: 0 },
    { nombre: 'Leche Almendra', precioDelta: 1500 },
    { nombre: 'Canela', precioDelta: 0 },
  ])
})

test('proyecciÃ³n de cocina usa cocinaNombre sin precios ni IDs', () => {
  assert.deepEqual(proyectarModificadoresCocina(SNAPSHOT), [
    'VASO GRANDE',
    'ALMENDRA',
    'Canela',
  ])
})

test('snapshot legacy sin opciones completas no produce detalle', () => {
  const legacy = [{ grupoId: 'leche', opcionIds: ['almendra'] }]
  assert.equal(proyectarModificadoresTicket(legacy), undefined)
  assert.deepEqual(proyectarModificadoresCocina(legacy), [])
})
