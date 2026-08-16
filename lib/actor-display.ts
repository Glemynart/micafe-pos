export interface PerfilActor {
  uid: string
  nombre?: string
}

export function crearIndiceNombres(perfiles: PerfilActor[]): Map<string, string> {
  return new Map(
    perfiles
      .filter((perfil) => typeof perfil.uid === "string" && perfil.uid.length > 0)
      .map((perfil) => [perfil.uid, perfil.nombre?.trim() || perfil.uid]),
  )
}

/** Prioriza el snapshot histórico y usa el perfil actual como respaldo. */
export function resolverNombreActor(
  uid: string | undefined,
  snapshot: string | undefined,
  nombres: ReadonlyMap<string, string>,
): string {
  const snapshotLimpio = snapshot?.trim()
  if (snapshotLimpio && snapshotLimpio !== uid) return snapshotLimpio
  if (uid && nombres.get(uid) && nombres.get(uid) !== uid) return nombres.get(uid) as string
  return snapshotLimpio || uid || "Sin identificar"
}
