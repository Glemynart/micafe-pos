import { MODULOS_CONFIGURACION, PERFIL_FISCAL_COLOMBIA, type ModuloConfiguracionId } from './catalogos'
import { esEmailCanonico, esTelefonoCanonico, normalizarTexto } from './normalizacion'
import type { RegimenTributario } from '../impuestos-service'

export type ClasificacionCampoLegacy = 'CONFIGURACION_B1' | 'RESERVADO_B2' | 'CONFLICTO' | 'IGNORADO'
export type IncidenciaParidadLegacy =
  | 'CAMPO_DESCONOCIDO'
  | 'VALOR_AUSENTE'
  | 'TIPO_INVALIDO'
  | 'NIT_AMBIGUO_O_INVALIDO'
  | 'REGIMEN_INVALIDO'
  | 'MODULO_DESCONOCIDO'
  | 'MODULO_DUPLICADO'
  | 'CIUDAD_SIN_CODIGO_TERRITORIAL'
  | 'LOGO_AMBIGUO_SIN_VERSION'
  | 'CLASIFICACION_FISCAL_AMBIGUA'
  | 'TELEFONO_NO_CANONICO'
  | 'EMAIL_NO_CANONICO'
  | 'ENTERO_INVALIDO'

export interface CampoParidadLegacy {
  campo: string
  clasificacion: ClasificacionCampoLegacy
  destino?: string
  valorNormalizado?: unknown
  incidencias: readonly IncidenciaParidadLegacy[]
}

/** Candidato parcial: nunca contiene metadatos ni se puede persistir como B1. */
export interface CandidatoConfiguracionB1Legacy {
  identidadFiscal?: {
    nombreComercial?: string
    razonSocial?: string
    tipoDocumento?: 'NIT'
    numeroDocumento?: string
    digitoVerificacion?: string
    regimenTributario?: RegimenTributario
    contacto?: { email?: string; telefono?: string }
  }
  localizacion?: { direccion?: { linea1?: string } }
  ticket?: { mensajePie?: string }
  modulos?: { habilitados?: ModuloConfiguracionId[] }
  caja?: { baseAperturaSugerida?: number; umbralAlertaFaltante?: number }
}

export interface ReporteParidadConfiguracionLegacy {
  modo: 'DRY_RUN'
  fuente: 'configuracion/general'
  inventarioLeido: readonly string[]
  campos: readonly CampoParidadLegacy[]
  candidatoB1: CandidatoConfiguracionB1Legacy
  bloqueaReadinessFiscal: boolean
  causasReadinessFiscal: readonly string[]
  accionesRequeridas: readonly string[]
}

const CAMPOS_B2 = new Set(['consecutivo_actual', 'prefijo_factura', 'rangoFin', 'rangoInicio', 'resolucionVigencia', 'resolucion_dian'])
const CAMPOS_CONOCIDOS = new Set([
  'baseCajaSugerida', 'ciudad', 'consecutivo_actual', 'direccion_tienda', 'email', 'logoUrl',
  'mensaje_ticket', 'modulos_habilitados', 'nit_tienda', 'nombre_tienda', 'prefijo_factura',
  'rangoFin', 'rangoInicio', 'razonSocial', 'regimenTributario', 'responsable_iva',
  'resolucionVigencia', 'resolucion_dian', 'telefono', 'tipo_contribuyente', 'umbralAlertaFaltante',
])
const REGIMENES = new Set<string>(PERFIL_FISCAL_COLOMBIA.regimenesTributarios)
const esObjeto = (valor: unknown): valor is Record<string, unknown> => !!valor && typeof valor === 'object' && !Array.isArray(valor)
const texto = (valor: unknown): string | undefined => typeof valor === 'string' && normalizarTexto(valor) ? normalizarTexto(valor) : undefined
const entrada = (campo: string, clasificacion: ClasificacionCampoLegacy, incidencias: IncidenciaParidadLegacy[] = [], destino?: string, valorNormalizado?: unknown): CampoParidadLegacy => ({ campo, clasificacion, ...(destino ? { destino } : {}), ...(valorNormalizado !== undefined ? { valorNormalizado } : {}), incidencias: [...new Set(incidencias)].sort() })
const textoAusente = (valor: unknown): boolean => valor === undefined || (typeof valor === 'string' && !normalizarTexto(valor))

function nit(valor: unknown): { numero: string; dv: string } | null {
  if (typeof valor !== 'string') return null
  const coincidencia = normalizarTexto(valor).match(/^([0-9.\s]{6,20})-([0-9])$/)
  if (!coincidencia) return null
  const numero = coincidencia[1].replace(/[^0-9]/g, '')
  if (numero.length < 6 || numero.length > 15) return null
  const pesos = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]
  const suma = numero.split('').reverse().reduce((total, digito, indice) => total + Number(digito) * pesos[pesos.length - 1 - indice], 0)
  const residuo = suma % 11
  const esperado = residuo > 1 ? 11 - residuo : residuo
  return String(esperado) === coincidencia[2] ? { numero, dv: coincidencia[2] } : null
}

function enteroNoNegativo(valor: unknown): number | null { return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : null }

export function analizarConfiguracionLegacy(documento: unknown): ReporteParidadConfiguracionLegacy {
  const datos = esObjeto(documento) ? documento : {}
  const campos: CampoParidadLegacy[] = []
  const candidato: CandidatoConfiguracionB1Legacy = {}
  const acciones = new Set<string>()
  const conflicto = (campo: string, incidencias: IncidenciaParidadLegacy | readonly IncidenciaParidadLegacy[], accion: string) => { campos.push(entrada(campo, 'CONFLICTO', Array.isArray(incidencias) ? [...incidencias] : [incidencias])); acciones.add(accion) }
  const mapearTexto = (campo: string, destino: string, asignar: (valor: string) => void) => { if (textoAusente(datos[campo])) { campos.push(entrada(campo, 'IGNORADO', ['VALOR_AUSENTE'])); return } if (typeof datos[campo] !== 'string') { conflicto(campo, 'TIPO_INVALIDO', `Corregir el tipo de ${campo} antes del backfill.`); return } const valor = texto(datos[campo])!; asignar(valor); campos.push(entrada(campo, 'CONFIGURACION_B1', [], destino, valor)) }

  mapearTexto('nombre_tienda', 'identidadFiscal.nombreComercial', (valor) => { candidato.identidadFiscal = { ...candidato.identidadFiscal, nombreComercial: valor } })
  mapearTexto('razonSocial', 'identidadFiscal.razonSocial', (valor) => { candidato.identidadFiscal = { ...candidato.identidadFiscal, razonSocial: valor } })
  const valorNit = nit(datos.nit_tienda)
  if (valorNit) { candidato.identidadFiscal = { ...candidato.identidadFiscal, tipoDocumento: 'NIT', numeroDocumento: valorNit.numero, digitoVerificacion: valorNit.dv }; campos.push(entrada('nit_tienda', 'CONFIGURACION_B1', [], 'identidadFiscal.{tipoDocumento,numeroDocumento,digitoVerificacion}', valorNit)) } else conflicto('nit_tienda', typeof datos.nit_tienda === 'string' || datos.nit_tienda === undefined ? 'NIT_AMBIGUO_O_INVALIDO' : 'TIPO_INVALIDO', 'Completar o verificar NIT y dígito de verificación.')
  mapearTexto('direccion_tienda', 'localizacion.direccion.linea1', (valor) => { candidato.localizacion = { direccion: { linea1: valor } } })
  const telefono = texto(datos.telefono)
  if (textoAusente(datos.telefono)) campos.push(entrada('telefono', 'IGNORADO', ['VALOR_AUSENTE']))
  else if (typeof datos.telefono !== 'string') conflicto('telefono', 'TIPO_INVALIDO', 'Corregir el tipo de teléfono antes del backfill.')
  else if (!esTelefonoCanonico(telefono)) conflicto('telefono', 'TELEFONO_NO_CANONICO', 'Normalizar teléfono a formato E.164 antes del backfill.')
  else { candidato.identidadFiscal = { ...candidato.identidadFiscal, contacto: { ...candidato.identidadFiscal?.contacto, telefono } }; campos.push(entrada('telefono', 'CONFIGURACION_B1', [], 'identidadFiscal.contacto.telefono', telefono)) }
  const email = texto(datos.email)?.toLowerCase()
  if (textoAusente(datos.email)) campos.push(entrada('email', 'IGNORADO', ['VALOR_AUSENTE']))
  else if (typeof datos.email !== 'string') conflicto('email', 'TIPO_INVALIDO', 'Corregir el tipo de email antes del backfill.')
  else if (!esEmailCanonico(email)) conflicto('email', 'EMAIL_NO_CANONICO', 'Normalizar email antes del backfill.')
  else { candidato.identidadFiscal = { ...candidato.identidadFiscal, contacto: { ...candidato.identidadFiscal?.contacto, email } }; campos.push(entrada('email', 'CONFIGURACION_B1', [], 'identidadFiscal.contacto.email', email)) }
  const regimen = texto(datos.regimenTributario)
  if (textoAusente(datos.regimenTributario)) campos.push(entrada('regimenTributario', 'IGNORADO', ['VALOR_AUSENTE']))
  else if (typeof datos.regimenTributario !== 'string') conflicto('regimenTributario', 'TIPO_INVALIDO', 'Corregir el tipo de régimen tributario antes del backfill.')
  else if (!REGIMENES.has(regimen!)) conflicto('regimenTributario', 'REGIMEN_INVALIDO', 'Seleccionar un régimen tributario B1 permitido.')
  else { candidato.identidadFiscal = { ...candidato.identidadFiscal, regimenTributario: regimen as RegimenTributario }; campos.push(entrada('regimenTributario', 'CONFIGURACION_B1', [], 'identidadFiscal.regimenTributario', regimen)) }
  mapearTexto('mensaje_ticket', 'ticket.mensajePie', (valor) => { candidato.ticket = { mensajePie: valor } })
  const modulos = datos.modulos_habilitados
  if (modulos === undefined) campos.push(entrada('modulos_habilitados', 'IGNORADO', ['VALOR_AUSENTE']))
  else if (!Array.isArray(modulos)) conflicto('modulos_habilitados', 'TIPO_INVALIDO', 'Corregir el tipo de módulos antes del backfill.')
  else { const vistos = new Set<string>(); const incidencias: IncidenciaParidadLegacy[] = []; const validos: ModuloConfiguracionId[] = []; for (const modulo of modulos) { if (typeof modulo !== 'string' || !(MODULOS_CONFIGURACION as readonly string[]).includes(modulo)) incidencias.push('MODULO_DESCONOCIDO'); else if (vistos.has(modulo)) incidencias.push('MODULO_DUPLICADO'); else { vistos.add(modulo); validos.push(modulo as ModuloConfiguracionId) } } if (incidencias.length) conflicto('modulos_habilitados', incidencias, 'Resolver módulos desconocidos o duplicados antes del backfill.'); else { candidato.modulos = { habilitados: validos }; campos.push(entrada('modulos_habilitados', 'CONFIGURACION_B1', [], 'modulos.habilitados', validos)) } }
  for (const [campo, destino, propiedad] of [['baseCajaSugerida', 'caja.baseAperturaSugerida', 'baseAperturaSugerida'], ['umbralAlertaFaltante', 'caja.umbralAlertaFaltante', 'umbralAlertaFaltante']] as const) { const valor = enteroNoNegativo(datos[campo]); if (valor === null) campos.push(entrada(campo, datos[campo] === undefined ? 'IGNORADO' : 'CONFLICTO', [datos[campo] === undefined ? 'VALOR_AUSENTE' : 'ENTERO_INVALIDO'])); else { candidato.caja = { ...candidato.caja, [propiedad]: valor }; campos.push(entrada(campo, 'CONFIGURACION_B1', [], destino, valor)) } }
  for (const campo of CAMPOS_B2) campos.push(entrada(campo, 'RESERVADO_B2', [], 'B2.numeracion'))
  if (texto(datos.ciudad)) conflicto('ciudad', 'CIUDAD_SIN_CODIGO_TERRITORIAL', 'Completar departamento y municipio con códigos territoriales.')
  else campos.push(entrada('ciudad', 'IGNORADO', ['VALOR_AUSENTE']))
  if (texto(datos.logoUrl)) conflicto('logoUrl', 'LOGO_AMBIGUO_SIN_VERSION', 'Definir asset Branding versionado o logo de ticket explícito.')
  else campos.push(entrada('logoUrl', 'IGNORADO', ['VALOR_AUSENTE']))
  for (const campo of ['tipo_contribuyente', 'responsable_iva']) { if (texto(datos[campo])) conflicto(campo, 'CLASIFICACION_FISCAL_AMBIGUA', 'No inferir régimen tributario desde clasificación fiscal legacy.'); else campos.push(entrada(campo, 'IGNORADO', ['VALOR_AUSENTE'])) }
  for (const campo of Object.keys(datos).filter((campo) => !CAMPOS_CONOCIDOS.has(campo)).sort()) campos.push(entrada(campo, 'IGNORADO', ['CAMPO_DESCONOCIDO']))
  const causas = ['IDENTIDAD_FISCAL_INCOMPLETA', 'DOMICILIO_FISCAL_INCOMPLETO']
  if (!candidato.identidadFiscal?.nombreComercial) causas.push('NOMBRE_COMERCIAL_FALTANTE')
  if (!candidato.modulos?.habilitados?.length) causas.push('MODULOS_SIN_CONFIGURAR')
  if (campos.some((campo) => campo.clasificacion === 'CONFLICTO')) causas.push('CONFLICTOS_LEGACY')
  return { modo: 'DRY_RUN', fuente: 'configuracion/general', inventarioLeido: Object.keys(datos).sort(), campos: campos.sort((a, b) => a.campo.localeCompare(b.campo)), candidatoB1: candidato, bloqueaReadinessFiscal: true, causasReadinessFiscal: causas.sort(), accionesRequeridas: [...acciones].sort() }
}

export function serializarReporteParidadConfiguracionLegacy(reporte: ReporteParidadConfiguracionLegacy): string { return `${JSON.stringify(reporte, null, 2)}\n` }

/** Adaptador de lectura: solo invoca el lector recibido; no conoce ni expone escrituras. */
export async function ejecutarAnalisisConfiguracionLegacy(lector: () => Promise<unknown>): Promise<ReporteParidadConfiguracionLegacy> { return analizarConfiguracionLegacy(await lector()) }
