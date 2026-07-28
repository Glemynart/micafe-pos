import type { RegimenTributario } from '../impuestos-service'
import type { OperacionConfiguracion } from './operaciones'

export interface ConfiguracionSettingsEditable {
  nombre_tienda: string
  nit_tienda: string
  razonSocial: string
  direccion_tienda: string
  ciudad: string
  telefono: string
  email: string
  regimenTributario: RegimenTributario
  mensaje_ticket: string
  baseCajaSugerida: number
  umbralAlertaFaltante: number
}

export type ComandoSettings = 'actualizarConfiguracionEmpresa' | 'actualizarPoliticasOperativas'
export interface ComandoSettingsPlanificado {
  comando: ComandoSettings
  operaciones: OperacionConfiguracion[]
}

const set = (ruta: Extract<OperacionConfiguracion, { tipo: 'SET' }>['ruta'], valor: unknown): OperacionConfiguracion => ({ tipo: 'SET', ruta, valor })
const remove = (ruta: Extract<OperacionConfiguracion, { tipo: 'REMOVE' }>['ruta']): OperacionConfiguracion => ({ tipo: 'REMOVE', ruta })
const opcional = (ruta: Extract<OperacionConfiguracion, { tipo: 'SET' }>['ruta'], valor: string): OperacionConfiguracion => valor.trim() ? set(ruta, valor.trim()) : remove(ruta)

function operacionesNit(nit: string): OperacionConfiguracion[] {
  const normalizado = nit.trim()
  if (!normalizado) return [remove('identidadFiscal.numeroDocumento'), remove('identidadFiscal.digitoVerificacion'), remove('identidadFiscal.tipoDocumento')]
  const coincidencia = /^(\d{5,15})-(\d)$/.exec(normalizado)
  if (!coincidencia) throw new Error('El NIT debe incluir número y dígito de verificación (ej. 900123456-7).')
  return [
    set('identidadFiscal.numeroDocumento', coincidencia[1]),
    set('identidadFiscal.digitoVerificacion', coincidencia[2]),
    set('identidadFiscal.tipoDocumento', 'NIT'),
  ]
}

/** Mapea exclusivamente controles B1 de Settings; B2 no participa en esta pantalla. */
export function crearOperacionesSettings(config: ConfiguracionSettingsEditable): ComandoSettingsPlanificado[] {
  return [
    {
      comando: 'actualizarConfiguracionEmpresa',
      operaciones: [
        set('identidadFiscal.nombreComercial', config.nombre_tienda.trim()),
        ...operacionesNit(config.nit_tienda),
        opcional('identidadFiscal.razonSocial', config.razonSocial),
        opcional('localizacion.direccion.linea1', config.direccion_tienda),
        opcional('localizacion.direccion.municipioNombre', config.ciudad),
        opcional('identidadFiscal.contacto.telefono', config.telefono),
        opcional('identidadFiscal.contacto.email', config.email),
        set('identidadFiscal.regimenTributario', config.regimenTributario),
        set('ticket.mensajePie', config.mensaje_ticket.trim()),
      ],
    },
    {
      comando: 'actualizarPoliticasOperativas',
      operaciones: [
        set('caja.baseAperturaSugerida', config.baseCajaSugerida),
        set('caja.umbralAlertaFaltante', config.umbralAlertaFaltante),
      ],
    },
  ]
}
