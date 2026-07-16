import assert from 'node:assert/strict'
import test from 'node:test'
import {
  crearConfigurationKey,
  crearConfiguracionModificadores,
  sonLineasComercialmenteEquivalentes,
} from '../configured-line'

test('configurationKey depende solo de IDs y no del orden de selección', () => {
  const primera = crearConfigurationKey('producto-1', [
    { grupoId: 'extras', opcionIds: ['leche', 'canela'] },
    { grupoId: 'tamano', opcionIds: ['grande'] },
  ])
  const segunda = crearConfigurationKey('producto-1', [
    { grupoId: 'tamano', opcionIds: ['grande'] },
    { grupoId: 'extras', opcionIds: ['canela', 'leche'] },
  ])

  assert.equal(primera, segunda)
})

test('el snapshot conserva los valores efectivos de las opciones seleccionadas', () => {
  const configuracion = crearConfiguracionModificadores('cafe', 5000, [{
    id: 'leche', nombre: 'Leche', orden: 0, minSeleccion: 0, maxSeleccion: 2,
    inconsistencias: [],
    opciones: [{ id: 'avena', nombre: 'Avena', precioDelta: 1200, default: false, cocinaNombre: 'LECHE AVENA' }],
  }], [{ grupoId: 'leche', opcionIds: ['avena'] }])

  assert.deepEqual(configuracion.modificadores, [{
    grupoId: 'leche', opcionIds: ['avena'], nombreGrupo: 'Leche',
    opciones: [{ opcionId: 'avena', nombre: 'Avena', precioDelta: 1200, cocinaNombre: 'LECHE AVENA' }],
  }])
})

test('la fusión U4 ignora textos visibles y exige equivalencia comercial', () => {
  const base = {
    id: 'cafe', schemaVersion: 1 as const, configurationKey: 'mod:v1|p:cafe',
    price: 5000, cost: 1200, category: 'calientes', impuestoTipo: 'inc_8' as const,
  }

  assert.equal(sonLineasComercialmenteEquivalentes(base, { ...base }), true)
  assert.equal(sonLineasComercialmenteEquivalentes(base, { ...base, price: 5500 }), false)
  assert.equal(sonLineasComercialmenteEquivalentes(base, { ...base, schemaVersion: undefined }), false)
})
