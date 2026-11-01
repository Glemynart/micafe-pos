const ROLES_QUE_PUEDEN_ENVIAR = new Set(['admin', 'cajero', 'supervisor'])

export type ClaimsPush = {
  uid?: unknown
  empresaId?: unknown
  rol?: unknown
}

export type MembresiaPush = {
  uid?: unknown
  empresaId?: unknown
  rol?: unknown
  estado?: unknown
  activo?: unknown
}

export function claimsPushAutorizados(claims: ClaimsPush): boolean {
  if (typeof claims.uid !== 'string' || !claims.uid
    || typeof claims.empresaId !== 'string' || !claims.empresaId
    || typeof claims.rol !== 'string' || !ROLES_QUE_PUEDEN_ENVIAR.has(claims.rol)) {
    return false
  }

  return true
}

export function puedeEnviarPushTenant(
  claims: ClaimsPush,
  membresia: MembresiaPush | undefined,
): boolean {
  if (!claimsPushAutorizados(claims)) return false

  return membresia?.uid === claims.uid
    && membresia.empresaId === claims.empresaId
    && membresia.rol === claims.rol
    && membresia.estado === 'activa'
    && membresia.activo === true
}
