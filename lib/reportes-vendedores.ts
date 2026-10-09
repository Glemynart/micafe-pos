import { resolverNombreActor } from "./actor-display"

// Sin UID disponible, conserva nombres legibles y abrevia tokens numéricos u opacamente largos.
const IDENTIFICADOR_OPACO = /^(?=.*\d)\S+$|^\S{28,}$/

/** Evita exponer UIDs completos en el reporte cuando no hay nombre disponible. */
export function resolverNombreVisibleVendedor(
  uid: string | undefined,
  snapshot: string | undefined,
  nombres: ReadonlyMap<string, string>,
): string {
  const uidLimpio = uid?.trim()
  const snapshotLimpio = snapshot?.trim()
  if (!uidLimpio || uidLimpio === "desconocido") {
    if (!snapshotLimpio || snapshotLimpio === "desconocido") return "Vendedor sin identificar"

    const nombreActual = nombres.get(snapshotLimpio)
    if (nombreActual && nombreActual !== snapshotLimpio) return nombreActual

    return IDENTIFICADOR_OPACO.test(snapshotLimpio)
      ? `Vendedor · …${snapshotLimpio.slice(-6)}`
      : snapshotLimpio
  }

  const nombre = resolverNombreActor(uidLimpio, snapshotLimpio, nombres)
  return nombre === uidLimpio
    ? `Vendedor · …${uidLimpio.slice(-6)}`
    : nombre
}
