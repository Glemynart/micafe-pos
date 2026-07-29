export function mensajeErrorApertura(error: unknown): string {
  const code = typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined

  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Tu sesión expiró. Inicia sesión nuevamente.'
    case 'TENANT_ACCESS_DENIED':
      return 'No tienes acceso a esta empresa.'
    case 'ROLE_FORBIDDEN':
      return 'No tienes permisos para abrir un turno.'
    case 'EMPRESA_NO_OPERATIVA':
      return 'La empresa no está operativa para abrir turnos.'
    case 'PAYLOAD_INVALID':
      return 'Revisa la base y las notas de apertura.'
    case 'LOCK_CONFLICT':
      return 'Ya hay una apertura en proceso. Espera un momento.'
    case 'ABORTED':
      return 'No fue posible completar la apertura. Intenta de nuevo.'
    case 'COMMAND_ID_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return 'La solicitud de apertura ya no es válida. Intenta de nuevo.'
    case 'OPERATION_TOO_LARGE':
      return 'La solicitud es demasiado grande. Reduce las notas.'
    case 'UNAVAILABLE':
      return 'No fue posible comunicarse con el servidor. Intenta de nuevo.'
    case 'CLIENT_STORAGE_UNAVAILABLE':
      return 'Tu navegador no permite completar la apertura. Habilita el almacenamiento y vuelve a intentar.'
    default:
      return 'No se pudo abrir el turno. Intenta de nuevo.'
  }
}
