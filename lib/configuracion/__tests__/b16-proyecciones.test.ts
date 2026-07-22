import assert from 'node:assert/strict'
import test from 'node:test'
import { crearPlantillaConfiguracionRevision1 } from '../plantilla'
import {
  proyectarCajaConfiguracion,
  proyectarImpresionConfiguracion,
  proyectarModulosConfiguracion,
  proyectarPosConfiguracion,
} from '../proyecciones'

const configuracion = () => crearPlantillaConfiguracionRevision1({
  empresaId: 'empresa-b16',
  nombreComercial: 'Empresa Neutral',
  creadaEn: {},
  actualizadaEn: {},
  ultimaMutacion: {
    actorTipo: 'SYSTEM',
    actorId: 'system',
    origen: 'BOOTSTRAP',
    commandId: 'init',
    correlationId: 'corr',
  },
})

test('B1.6 proyecta módulos, caja, impresión y POS sin exponer colecciones mutables', () => {
  const original = configuracion()
  original.modulos.habilitados = ['sell', 'shifts']
  original.pos.metodosPagoHabilitados = ['efectivo', 'transferencia']

  const modulos = proyectarModulosConfiguracion(original)
  const caja = proyectarCajaConfiguracion(original)
  const impresion = proyectarImpresionConfiguracion(original)
  const pos = proyectarPosConfiguracion(original)

  assert.deepEqual(modulos.habilitados, ['sell', 'shifts'])
  assert.equal(caja.baseAperturaSugerida, 200000)
  assert.equal(impresion.formatoPapel, 'MM_80')
  assert.deepEqual(pos.metodosPagoHabilitados, ['efectivo', 'transferencia'])

  modulos.habilitados.push('settings')
  pos.metodosPagoHabilitados.push('cuenta_cobro')
  caja.rolesConTurnoObligatorio.push('admin')

  assert.deepEqual(original.modulos.habilitados, ['sell', 'shifts'])
  assert.deepEqual(original.pos.metodosPagoHabilitados, ['efectivo', 'transferencia'])
  assert.deepEqual(original.caja.rolesConTurnoObligatorio, ['cajero'])
})

test('B1.6 conserva políticas operativas cerradas en las proyecciones', () => {
  const original = configuracion()
  original.caja.permitirRelevo = false
  original.impresion.autoImprimirVenta = true
  original.pos.metodoPagoPredeterminado = 'transferencia'

  assert.equal(proyectarCajaConfiguracion(original).permitirRelevo, false)
  assert.equal(proyectarImpresionConfiguracion(original).autoImprimirVenta, true)
  assert.equal(proyectarPosConfiguracion(original).metodoPagoPredeterminado, 'transferencia')
})
