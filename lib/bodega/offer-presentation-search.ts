export type PresentacionOfertaBuscable = {
  id: string;
  productoNombre: string;
  presentacionNombre: string;
  factorUnidadBase: number;
};

function normalizarBusqueda(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").trim();
}

export function filtrarPresentacionesOferta<T extends PresentacionOfertaBuscable>(
  opciones: readonly T[],
  consulta: string,
): T[] {
  const terminos = normalizarBusqueda(consulta).split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return [...opciones];

  return opciones.filter(opcion => {
    const texto = normalizarBusqueda(`${opcion.productoNombre} ${opcion.presentacionNombre} ${opcion.factorUnidadBase}`);
    return terminos.every(termino => texto.includes(termino));
  });
}
