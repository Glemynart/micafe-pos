export interface ProductoCatalogoFiltrable {
  nombre: string
  categoriaId: string
}

export function filtrarProductosCatalogoBodega<T extends ProductoCatalogoFiltrable>(
  productos: readonly T[],
  busqueda: string,
  categoriaId: string,
): T[] {
  const nombreBuscado = busqueda.trim().toLocaleLowerCase("es")

  return productos.filter(producto => {
    const coincideCategoria = categoriaId === "todas" || producto.categoriaId === categoriaId
    const coincideNombre = nombreBuscado === ""
      || producto.nombre.toLocaleLowerCase("es").includes(nombreBuscado)

    return coincideCategoria && coincideNombre
  })
}
