export const CATEGORIAS_BODEGA = {
  AGUAS: "Aguas",
  GASEOSAS_Y_SODAS: "Gaseosas y sodas",
  JUGOS_Y_FRUTAS: "Jugos y bebidas de fruta",
  HIDRATANTES: "Hidratantes e isotónicas",
  ENERGIZANTES: "Energizantes",
  CERVEZAS: "Cervezas",
  LICORES: "Licores",
  MALTAS: "Maltas",
  OTROS_REVISAR: "Otros por revisar",
} as const

export type CategoriaSugeribleBodegaId = keyof typeof CATEGORIAS_BODEGA

export interface SugerenciaCategoriaBodega {
  itemId: string
  nombre: string
  categoriaId: CategoriaSugeribleBodegaId
  categoria: string
  estado: "SUGERIDA" | "REVISAR"
  razon: string
}

export interface ProductoParaSugerirCategoria {
  itemId: string
  nombre: string
}

const REGLAS: Array<{ categoriaId: Exclude<CategoriaSugeribleBodegaId, "OTROS_REVISAR">; alias: string[] }> = [
  { categoriaId: "AGUAS", alias: ["agua", "aguas", "agua mineral", "agua con gas", "agua saborizada", "agua de coco"] },
  { categoriaId: "GASEOSAS_Y_SODAS", alias: ["gaseosa", "gaseosas", "soda", "sodas", "mezclador", "mezcladores"] },
  { categoriaId: "JUGOS_Y_FRUTAS", alias: ["jugo", "jugos", "nectar", "nectares", "bebida de fruta", "bebida de frutas"] },
  { categoriaId: "HIDRATANTES", alias: ["hidratante", "hidratantes", "isotonica", "isotonico", "electrolitos", "bebida hidratante"] },
  { categoriaId: "ENERGIZANTES", alias: ["energizante", "energizantes", "vive 100", "speed max"] },
  { categoriaId: "CERVEZAS", alias: ["cerveza", "cervezas"] },
  { categoriaId: "LICORES", alias: ["aguardiente", "ron", "vodka", "licor", "licores", "whisky", "whiskey", "tequila", "brandy"] },
  { categoriaId: "MALTAS", alias: ["malta", "maltas", "bebida de malta"] },
]

function normalizarParaRegla(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

function contieneFrase(texto: string, frase: string): boolean {
  return ` ${texto} `.includes(` ${frase} `)
}

export function clasificarProductosBodega(items: ProductoParaSugerirCategoria[]): SugerenciaCategoriaBodega[] {
  return items.map(item => {
    const nombre = item.nombre.trim().replace(/\s+/g, " ")
    const normalizado = normalizarParaRegla(nombre)
    const coincidencias = REGLAS.flatMap(regla => regla.alias
      .filter(alias => contieneFrase(normalizado, normalizarParaRegla(alias)))
      .map(alias => ({ categoriaId: regla.categoriaId, alias })))
    const categorias = [...new Set(coincidencias.map(match => match.categoriaId))]

    if (categorias.length === 1) {
      const categoriaId = categorias[0]
      const coincidencia = coincidencias.find(match => match.categoriaId === categoriaId)!
      return {
        itemId: item.itemId,
        nombre,
        categoriaId,
        categoria: CATEGORIAS_BODEGA[categoriaId],
        estado: "SUGERIDA" as const,
        razon: `Coincidencia local con «${coincidencia.alias}».`,
      }
    }

    return {
      itemId: item.itemId,
      nombre,
      categoriaId: "OTROS_REVISAR" as const,
      categoria: CATEGORIAS_BODEGA.OTROS_REVISAR,
      estado: "REVISAR" as const,
      razon: categorias.length > 1
        ? "El nombre coincide con más de una familia; elige la categoría manualmente."
        : "No hay una regla local clara; revisa el producto o búscalo en la web.",
    }
  })
}

export function construirBusquedaWebProducto(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ")
  if (!limpio) throw new Error("NOMBRE_PRODUCTO_REQUERIDO")
  const url = new URL("https://www.google.com/search")
  url.searchParams.set("q", `${limpio} producto Colombia`)
  return url.toString()
}
