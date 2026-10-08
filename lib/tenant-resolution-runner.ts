/**
 * Ejecuta una resolución asíncrona del tenant garantizando que el estado de
 * carga se cierre también ante errores de red, Auth o Firestore.
 */
export async function runTenantResolution(
  resolve: () => Promise<void>,
  onError: (error: unknown) => void,
  onSettled: () => void,
): Promise<void> {
  try {
    await resolve()
  } catch (error) {
    onError(error)
  } finally {
    onSettled()
  }
}
