import assert from 'node:assert/strict'
import test from 'node:test'
import { crearOperacionesSettings } from '../settings-operations'

test('Settings traduce todos los campos B1 editables a comandos y rutas canónicas', () => {
  const comandos = crearOperacionesSettings({
    nombre_tienda: 'Café Norte', nit_tienda: '900123456-7', razonSocial: 'Café Norte SAS',
    direccion_tienda: 'Calle 1 # 2-3', ciudad: 'Bogotá', telefono: '+573001234567',
    email: 'admin@cafe.test', regimenTributario: 'responsable_iva', mensaje_ticket: 'Vuelve pronto',
    baseCajaSugerida: 150000, umbralAlertaFaltante: 25000,
  })

  assert.deepEqual(comandos, [
    {
      comando: 'actualizarConfiguracionEmpresa',
      operaciones: [
        { tipo: 'SET', ruta: 'identidadFiscal.nombreComercial', valor: 'Café Norte' },
        { tipo: 'SET', ruta: 'identidadFiscal.numeroDocumento', valor: '900123456' },
        { tipo: 'SET', ruta: 'identidadFiscal.digitoVerificacion', valor: '7' },
        { tipo: 'SET', ruta: 'identidadFiscal.tipoDocumento', valor: 'NIT' },
        { tipo: 'SET', ruta: 'identidadFiscal.razonSocial', valor: 'Café Norte SAS' },
        { tipo: 'SET', ruta: 'localizacion.direccion.linea1', valor: 'Calle 1 # 2-3' },
        { tipo: 'SET', ruta: 'localizacion.direccion.municipioNombre', valor: 'Bogotá' },
        { tipo: 'SET', ruta: 'identidadFiscal.contacto.telefono', valor: '+573001234567' },
        { tipo: 'SET', ruta: 'identidadFiscal.contacto.email', valor: 'admin@cafe.test' },
        { tipo: 'SET', ruta: 'identidadFiscal.regimenTributario', valor: 'responsable_iva' },
        { tipo: 'SET', ruta: 'ticket.mensajePie', valor: 'Vuelve pronto' },
      ],
    },
    {
      comando: 'actualizarPoliticasOperativas',
      operaciones: [
        { tipo: 'SET', ruta: 'caja.baseAperturaSugerida', valor: 150000 },
        { tipo: 'SET', ruta: 'caja.umbralAlertaFaltante', valor: 25000 },
      ],
    },
  ])
})

test('Settings elimina opcionales B1 vacíos sin tocar campos fiscales B2', () => {
  const [configuracion] = crearOperacionesSettings({
    nombre_tienda: 'Café Norte', nit_tienda: '', razonSocial: '', direccion_tienda: '', ciudad: '',
    telefono: '', email: '', regimenTributario: 'no_responsable', mensaje_ticket: '',
    baseCajaSugerida: 0, umbralAlertaFaltante: 0,
  })
  assert.deepEqual(configuracion.operaciones.slice(1, 10), [
    { tipo: 'REMOVE', ruta: 'identidadFiscal.numeroDocumento' },
    { tipo: 'REMOVE', ruta: 'identidadFiscal.digitoVerificacion' },
    { tipo: 'REMOVE', ruta: 'identidadFiscal.tipoDocumento' },
    { tipo: 'REMOVE', ruta: 'identidadFiscal.razonSocial' },
    { tipo: 'REMOVE', ruta: 'localizacion.direccion.linea1' },
    { tipo: 'REMOVE', ruta: 'localizacion.direccion.municipioNombre' },
    { tipo: 'REMOVE', ruta: 'identidadFiscal.contacto.telefono' },
    { tipo: 'REMOVE', ruta: 'identidadFiscal.contacto.email' },
    { tipo: 'SET', ruta: 'identidadFiscal.regimenTributario', valor: 'no_responsable' },
  ])
  assert.equal(configuracion.operaciones.some((operacion) => operacion.ruta.includes('consecutivo') || operacion.ruta.includes('resolucion')), false)
})
