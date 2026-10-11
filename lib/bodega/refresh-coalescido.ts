export function crearRefrescoCoalescido(refrescar: () => Promise<void>): () => Promise<void> {
  let enCurso: Promise<void> | null = null
  let solicitado = false

  const ejecutar = (): Promise<void> => {
    solicitado = true
    if (enCurso) return enCurso

    const trabajo = (async () => {
      while (solicitado) {
        solicitado = false
        await refrescar()
      }
    })()
    enCurso = trabajo
    void trabajo.then(
      () => finalizar(trabajo),
      () => finalizar(trabajo),
    )
    return trabajo
  }

  const finalizar = (trabajo: Promise<void>) => {
    if (enCurso !== trabajo) return
    enCurso = null
    if (solicitado) void ejecutar()
  }

  return ejecutar
}
