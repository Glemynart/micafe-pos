import divipolaRows from "./data/divipola-colombia-2024.json"

/**
 * Snapshot de DANE/Datos Abiertos Colombia (dataset gdxc-w37w), descargado
 * 2026-10-25. El conjunto informa corte de datos 2024-12-30 y contiene 1.122
 * códigos. Se versiona localmente para no depender de una consulta remota al
 * cargar el formulario.
 */
export const DIVIPOLA_SOURCE = "https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w"
export const DIVIPOLA_DATA_CUT = "2024-12-30"
export const DIVIPOLA_RETRIEVED_AT = "2026-10-25"

export interface MunicipioDivipola {
  departamentoCodigo: string
  departamento: string
  municipioCodigo: string
  municipio: string
  tipo: string
}

const municipios = divipolaRows as MunicipioDivipola[]

export function normalizarNombreTerritorial(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-CO")
}

const ordenar = (a: string, b: string) => a.localeCompare(b, "es-CO", { sensitivity: "base" })

export const departamentosDivipola = Array.from(
  new Map(municipios.map(({ departamentoCodigo, departamento }) => [departamentoCodigo, { codigo: departamentoCodigo, nombre: departamento }])).values(),
).sort((a, b) => ordenar(a.nombre, b.nombre))

export function municipiosPorDepartamento(departamentoCodigo: string): MunicipioDivipola[] {
  return municipios
    .filter(item => item.departamentoCodigo === departamentoCodigo)
    .slice()
    .sort((a, b) => ordenar(a.municipio, b.municipio))
}

export function resolverDepartamentoDivipola(nombre: string): { codigo: string; nombre: string } | undefined {
  const normalized = normalizarNombreTerritorial(nombre)
  return departamentosDivipola.find(item => normalizarNombreTerritorial(item.nombre) === normalized)
}

export function resolverMunicipioDivipola(departamentoCodigo: string, nombre: string): MunicipioDivipola | undefined {
  const normalized = normalizarNombreTerritorial(nombre)
  return municipios.find(item => item.departamentoCodigo === departamentoCodigo
    && normalizarNombreTerritorial(item.municipio) === normalized)
}

export function validarUbicacionDivipola(value: {
  departamentoCodigo?: string
  departamentoNombre?: string
  municipioCodigo?: string
  municipioNombre?: string
}): boolean {
  const departamento = departamentosDivipola.find(item => item.codigo === value.departamentoCodigo)
  const municipio = municipios.find(item => item.departamentoCodigo === value.departamentoCodigo
    && item.municipioCodigo === value.municipioCodigo)
  return !!departamento && !!municipio
    && normalizarNombreTerritorial(departamento.nombre) === normalizarNombreTerritorial(value.departamentoNombre ?? "")
    && normalizarNombreTerritorial(municipio.municipio) === normalizarNombreTerritorial(value.municipioNombre ?? "")
}
