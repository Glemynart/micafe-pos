import { resolverNombreActor } from "./actor-display"

// Sin UID disponible, conserva nombres legibles y abrevia tokens numéricos u opacamente largos.
// Los nombres de una sola palabra en PascalCase siguen siendo legibles aunque sean largos.
const IDENTIFICADOR_OPACO = /^(?=.*\d)\S+$|^(?!.*[a-z][A-Z])[A-Za-z0-9_-]{28,}$/

function referenciaUid(uid: string): string {
  return uid.length <= 6 ? "Vendedor sin identificar" : `Vendedor · …${uid.slice(-6)}`
}

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

    return IDENTIFICADOR_OPACO.test(snapshotLimpio) ? referenciaUid(snapshotLimpio) : snapshotLimpio
  }

  const nombre = resolverNombreActor(uidLimpio, snapshotLimpio, nombres)
  return nombre === uidLimpio ? referenciaUid(uidLimpio) : nombre
}
