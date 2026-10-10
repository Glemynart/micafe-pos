export function resolverTurnoSeleccionado<T extends { id: string }>(
  turnos: readonly T[],
  seleccionadoId: string | null,
): T | null {
  if (!seleccionadoId) return null
  return turnos.find((turno) => turno.id === seleccionadoId) ?? null
}
