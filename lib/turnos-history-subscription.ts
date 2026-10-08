export type PrepararSuscripcion<T> = (
  emitir: (valor: T) => void,
  notificarError: (error: unknown) => void,
) => Promise<() => void>;

/**
 * Coordina una suscripción cuya preparación es asíncrona y propaga tanto los
 * errores de preparación como los del listener, respetando la cancelación.
 */
export function suscribirTrasPreparacion<T>(
  preparar: PrepararSuscripcion<T>,
  callback: (valor: T) => void,
  alFallar: (error: unknown) => void,
): () => void {
  let cancelada = false;
  let liberar: () => void = () => undefined;

  const emitirSiActiva = (valor: T) => {
    if (!cancelada) callback(valor);
  };
  const errorSiActiva = (error: unknown) => {
    if (!cancelada) alFallar(error);
  };

  void Promise.resolve()
    .then(() => preparar(emitirSiActiva, errorSiActiva))
    .then((liberarSuscripcion) => {
      if (cancelada) liberarSuscripcion();
      else liberar = liberarSuscripcion;
    })
    .catch(errorSiActiva);

  return () => {
    cancelada = true;
    liberar();
  };
}
