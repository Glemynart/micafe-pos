import { resolverNombreActor } from "./actor-display"

/** Evita exponer UIDs completos en el reporte cuando no hay nombre disponible. */
export function resolverNombreVisibleVendedor(
  uid: string | undefined,
  snapshot: string | undefined,
  nombres: ReadonlyMap<string, string>,
): string {
  const uidLimpio = uid?.trim()
  if (!uidLimpio || uidLimpio === "desconocido") return "Vendedor sin identificar"

  const nombre = resolverNombreActor(uidLimpio, snapshot, nombres)
  return nombre === uidLimpio
    ? `Vendedor · …${uidLimpio.slice(-6)}`
    : nombre
}
