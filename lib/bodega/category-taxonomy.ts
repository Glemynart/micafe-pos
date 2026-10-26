export const CATEGORIAS_BODEGA_IA = {
  AGUAS: "Aguas",
  GASEOSAS_Y_SODAS: "Gaseosas y sodas",
  JUGOS_Y_FRUTAS: "Jugos y bebidas de fruta",
  HIDRATANTES: "Hidratantes e isotónicas",
  ENERGIZANTES: "Energizantes",
  CERVEZAS: "Cervezas",
  LICORES: "Licores",
  MALTAS: "Maltas",
  OTROS_REVISAR: "Otros por revisar",
} as const;

export type CategoriaBodegaIaId = keyof typeof CATEGORIAS_BODEGA_IA;
