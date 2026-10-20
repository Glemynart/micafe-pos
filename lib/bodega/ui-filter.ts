function normalizarBusqueda(valor: string | null | undefined): string {
  return (valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-CO")
}

export function filtrarPorTextoBodega<T>(items: readonly T[], busqueda: string, campos: (item: T) => readonly (string | null | undefined)[]): T[] {
  const termino = normalizarBusqueda(busqueda)
  if (!termino) return [...items]
  return items.filter(item => campos(item).some(campo => normalizarBusqueda(campo).includes(termino)))
}
