export type CatalogoId = "BODEGA" | "NEVERA"

/** Existing documents without a discriminator remain in Bodega until the versioned backfill runs. */
export function perteneceAlCatalogo(value: unknown, catalogoId: CatalogoId): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const actual = (value as Record<string, unknown>).catalogoId
  if (actual === undefined || actual === null) return catalogoId === "BODEGA"
  return actual === catalogoId
}
