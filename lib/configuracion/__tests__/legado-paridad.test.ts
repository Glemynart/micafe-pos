import assert from 'node:assert/strict'
import test from 'node:test'
import { analizarConfiguracionLegacy, ejecutarAnalisisConfiguracionLegacy, serializarReporteParidadConfiguracionLegacy } from '../legado-paridad'

const completo = () => ({
  nombre_tienda: 'Empresa Uno', razonSocial: 'Empresa Uno SAS', nit_tienda: '900.123.456-8', direccion_tienda: 'Calle 1 # 2-3', telefono: '+573001234567', email: 'contacto@empresa.co', regimenTributario: 'no_responsable', mensaje_ticket: 'Gracias.', modulos_habilitados: ['sell', 'settings'], baseCajaSugerida: 200000, umbralAlertaFaltante: 20000,
  prefijo_factura: 'POS', consecutivo_actual: 8, resolucion_dian: 'RES', rangoInicio: '1', rangoFin: '100', resolucionVigencia: '2027-01-01', ciudad: '', logoUrl: '', tipo_contribuyente: '', responsable_iva: '',
})

test('B1.8 clasifica un singleton completo sin incluir numeración en el candidato B1', () => {
  const reporte = analizarConfiguracionLegacy(completo())
  assert.equal(reporte.modo, 'DRY_RUN')
  assert.equal(reporte.campos.find((campo) => campo.campo === 'nombre_tienda')?.clasificacion, 'CONFIGURACION_B1')
  assert.equal(reporte.campos.find((campo) => campo.campo === 'consecutivo_actual')?.clasificacion, 'RESERVADO_B2')
  assert.equal(reporte.candidatoB1.identidadFiscal?.numeroDocumento, '900123456')
  assert.equal(reporte.candidatoB1.caja?.baseAperturaSugerida, 200000)
  assert.equal(JSON.stringify(reporte.candidatoB1).includes('consecutivo'), false)
})

test('B1.8 expone ausencias sin inventar valores', () => {
  const reporte = analizarConfiguracionLegacy({ nombre_tienda: '', modulos_habilitados: [] })
  assert.equal(reporte.candidatoB1.identidadFiscal?.nombreComercial, undefined)
  assert.ok(reporte.causasReadinessFiscal.includes('NOMBRE_COMERCIAL_FALTANTE'))
  assert.ok(reporte.causasReadinessFiscal.includes('IDENTIDAD_FISCAL_INCOMPLETA'))
})

test('B1.8 detecta inconsistencias, ambigüedad y campos desconocidos', () => {
  const reporte = analizarConfiguracionLegacy({ ...completo(), nit_tienda: '900.123.456-1', regimenTributario: 'inventado', modulos_habilitados: ['sell', 'sell', 'ajeno'], ciudad: 'Bogotá', logoUrl: 'https://logo.example/logo.png', responsable_iva: '1', extra: true })
  const porCampo = new Map(reporte.campos.map((campo) => [campo.campo, campo]))
  assert.equal(porCampo.get('nit_tienda')?.clasificacion, 'CONFLICTO')
  assert.equal(porCampo.get('regimenTributario')?.clasificacion, 'CONFLICTO')
  assert.equal(porCampo.get('modulos_habilitados')?.clasificacion, 'CONFLICTO')
  assert.deepEqual(porCampo.get('modulos_habilitados')?.incidencias, ['MODULO_DESCONOCIDO', 'MODULO_DUPLICADO'])
  assert.equal(porCampo.get('ciudad')?.clasificacion, 'CONFLICTO')
  assert.equal(porCampo.get('logoUrl')?.clasificacion, 'CONFLICTO')
  assert.deepEqual(porCampo.get('extra')?.incidencias, ['CAMPO_DESCONOCIDO'])
})

test('B1.8 distingue tipos inválidos de valores ausentes', () => {
  const reporte = analizarConfiguracionLegacy({ nombre_tienda: 42, nit_tienda: 1, telefono: 2, email: [], regimenTributario: {}, modulos_habilitados: 'sell' })
  const porCampo = new Map(reporte.campos.map((campo) => [campo.campo, campo]))
  for (const campo of ['nombre_tienda', 'nit_tienda', 'telefono', 'email', 'regimenTributario', 'modulos_habilitados']) assert.deepEqual(porCampo.get(campo)?.incidencias, ['TIPO_INVALIDO'])
})

test('B1.8 es repetible e invoca exclusivamente el lector inyectado', async () => {
  const singleton = completo(); let lecturas = 0
  const primero = await ejecutarAnalisisConfiguracionLegacy(async () => { lecturas += 1; return singleton })
  const segundo = analizarConfiguracionLegacy(singleton)
  assert.equal(lecturas, 1)
  assert.equal(serializarReporteParidadConfiguracionLegacy(primero), serializarReporteParidadConfiguracionLegacy(segundo))
  assert.deepEqual(singleton, completo())
})

test('B1.8 no ejecuta escrituras en el doble Admin SDK de dry-run', async () => {
  let lecturas = 0; let escrituras = 0
  const adminSoloLectura = {
    get: async () => { lecturas += 1; return completo() },
    set: () => { escrituras += 1; throw new Error('No debe escribir') },
    update: () => { escrituras += 1; throw new Error('No debe escribir') },
    delete: () => { escrituras += 1; throw new Error('No debe escribir') },
  }
  const reporte = await ejecutarAnalisisConfiguracionLegacy(() => adminSoloLectura.get())
  assert.equal(lecturas, 1)
  assert.equal(escrituras, 0)
  assert.equal(reporte.fuente, 'configuracion/general')
})
