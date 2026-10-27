/**
 * Taxonomía local del catálogo inicial de Distribuidora Las Jiménez.
 * Las sugerencias no crean categorías ni confirman datos automáticamente.
 */
export const CATEGORIAS_CATALOGO_DIANA = {
  AGUA_EMBOTELLADA: "Agua embotellada",
  AGUA_DE_COCO: "Agua de coco",
  AGUARDIENTES: "Aguardientes",
  CERVEZAS_NACIONALES: "Cervezas nacionales",
  CERVEZAS_IMPORTADAS: "Cervezas importadas",
  CERVEZAS_SIN_ALCOHOL: "Cervezas sin alcohol",
  SODAS_Y_AGUA_TONICA: "Sodas y agua tónica",
  GASEOSAS: "Gaseosas",
  JUGOS_Y_NECTARES: "Jugos y néctares",
  HIDRATANTES_Y_ELECTROLITOS: "Bebidas hidratantes y electrolitos",
  BEBIDAS_ENERGIZANTES: "Bebidas energizantes",
  BEBIDAS_DE_MALTA: "Bebidas de malta",
  BEBIDAS_BASE_CERVEZA_MALTA: "Bebidas preparadas a base de cerveza o malta",
  RON: "Ron",
  VODKA: "Vodka",
  COCTELES_PREPARADOS: "Cócteles y bebidas alcohólicas preparadas",
  BEBIDAS_DE_ALOE_VERA: "Bebidas de aloe vera",
} as const;

/** Nevera tiene una taxonomía independiente y admite categorías fuera del surtido Bodega. */
export const CATEGORIAS_CATALOGO_NEVERA = {
  ...CATEGORIAS_CATALOGO_DIANA,
  BEBIDAS_DE_TE: "Tés y bebidas de té",
} as const;

export type CategoriaCatalogoDianaId = keyof typeof CATEGORIAS_CATALOGO_DIANA;
export type CategoriaCatalogoNeveraId = keyof typeof CATEGORIAS_CATALOGO_NEVERA;
export type CatalogoDianaId = "BODEGA" | "NEVERA";

export interface SugerenciaCategoriaCatalogoDiana {
  categoriaId: CategoriaCatalogoNeveraId | null;
  categoria: string | null;
  estado: "SUGERIDA" | "REVISAR";
  razon: string;
}

const REGLAS: ReadonlyArray<{
  categoriaId: CategoriaCatalogoNeveraId;
  alias: readonly string[];
  catalogo?: CatalogoDianaId;
}> = [
  { categoriaId: "AGUA_EMBOTELLADA", alias: ["agua embotellada", "agua pool", "pool", "agua cielo", "cielo", "agua cristal", "cristal"] },
  { categoriaId: "AGUA_DE_COCO", alias: ["agua de coco"] },
  { categoriaId: "AGUARDIENTES", alias: ["amarillo de manzanares", "aguardiente antioqueno", "antioqueno", "aguardiente"] },
  { categoriaId: "CERVEZAS_NACIONALES", alias: ["club colombia", "costena", "costeñita", "aguila", "poker", "pilsen", "light", "cerveza"] },
  { categoriaId: "CERVEZAS_IMPORTADAS", alias: ["budweiser", "coronita", "corona"] },
  { categoriaId: "CERVEZAS_SIN_ALCOHOL", alias: ["cerveza sin alcohol", "corona cero"] },
  { categoriaId: "SODAS_Y_AGUA_TONICA", alias: ["canada dry", "canadry", "agua tonica", "bretaña", "soda"] },
  { categoriaId: "GASEOSAS", alias: ["coca cola", "big cola", "postobon", "quatro", "gaseosa", "h2oh", "h2o", "premio"] },
  { categoriaId: "JUGOS_Y_NECTARES", alias: ["del valle", "cifrut", "nutiva", "hit", "jugo", "nectar"] },
  { categoriaId: "HIDRATANTES_Y_ELECTROLITOS", alias: ["gatorade", "sporade", "electrolit", "hidralyte", "electrolitos", "hidratante"] },
  { categoriaId: "BEBIDAS_ENERGIZANTES", alias: ["vive 100", "speed max", "energizante"] },
  { categoriaId: "BEBIDAS_DE_MALTA", alias: ["bebida de malta", "malta"] },
  { categoriaId: "BEBIDAS_BASE_CERVEZA_MALTA", alias: ["cola y pola"] },
  { categoriaId: "RON", alias: ["ron caldas", "ron esencial", "ron tradicional", "ron"] },
  { categoriaId: "VODKA", alias: ["smirnoff vodka", "smirnoff tamarindo picante", "smirnoff tamarindo", "smirnoff", "vodka"] },
  { categoriaId: "COCTELES_PREPARADOS", alias: ["reeds", "coctel", "bebida alcoholica preparada"] },
  { categoriaId: "BEBIDAS_DE_ALOE_VERA", alias: ["saviloe", "aloe vera"] },
  { categoriaId: "BEBIDAS_DE_TE", alias: ["hatsu tea", "hatsu te", "te hatsu"], catalogo: "NEVERA" },
];

function normalizar(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function contieneFrase(nombre: string, alias: string): boolean {
  return ` ${nombre} `.includes(` ${normalizar(alias)} `);
}

export function sugerirCategoriaCatalogoDiana(nombre: string, catalogo: CatalogoDianaId = "BODEGA"): SugerenciaCategoriaCatalogoDiana {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  const normalizado = normalizar(limpio);
  const reglasCatalogo = REGLAS.filter(regla => !regla.catalogo || regla.catalogo === catalogo);
  const coincidencias = reglasCatalogo.flatMap(regla => regla.alias
    .filter(alias => contieneFrase(normalizado, alias))
    .map(alias => ({ categoriaId: regla.categoriaId, alias: normalizar(alias) })));

  if (coincidencias.length === 0) {
    return { categoriaId: null, categoria: null, estado: "REVISAR", razon: "Sin coincidencia local inequívoca; revisa el producto y, si hace falta, búscalo manualmente en la web." };
  }

  const maxSpecificity = Math.max(...coincidencias.map(({ alias }) => alias.length));
  const mejores = coincidencias.filter(({ alias }) => alias.length === maxSpecificity);
  const categorias = [...new Set(mejores.map(({ categoriaId }) => categoriaId))];
  if (categorias.length !== 1) {
    return { categoriaId: null, categoria: null, estado: "REVISAR", razon: "El nombre coincide con reglas igualmente específicas de varias categorías; confirma manualmente." };
  }

  const categoriaId = categorias[0];
  return {
    categoriaId,
    categoria: CATEGORIAS_CATALOGO_NEVERA[categoriaId],
    estado: "SUGERIDA",
    razon: "Coincidencia con una regla local; confirma o corrige antes de importar.",
  };
}
