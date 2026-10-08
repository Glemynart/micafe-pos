export type PrepararSuscripcion<T> = (
  emitir: (valor: T) => void,
  notificarError: (error: unknown) => void,
) => Promise<() => void>;

export type EtapaHistorialTurnos =
  | "consulta_turnos"
  | "lectura_membresias"
  | "listener_turnos";

export interface DiagnosticoHistorialTurnos {
  etapa: EtapaHistorialTurnos;
  codigo: string | null;
}

const MENSAJE_ERROR_HISTORIAL = "No fue posible completar la carga del historial de turnos.";

/** Error sanitizado: conserva etapa y código Firebase, nunca el mensaje/datos crudos. */
export class ErrorHistorialTurnos extends Error {
  readonly diagnostico: DiagnosticoHistorialTurnos;

  constructor(etapa: EtapaHistorialTurnos, error: unknown) {
    super(MENSAJE_ERROR_HISTORIAL);
    this.name = "ErrorHistorialTurnos";
    this.diagnostico = { etapa, codigo: obtenerCodigoFirebase(error) };
  }
}

function obtenerCodigoFirebase(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const codigo = (error as { code?: unknown }).code;
  if (typeof codigo !== "string") return null;

  const normalizado = codigo.replace(/^firestore\//, "");
  return /^[a-z][a-z0-9-]{0,63}$/.test(normalizado) ? normalizado : null;
}

export function obtenerDiagnosticoHistorialTurnos(
  error: unknown,
): DiagnosticoHistorialTurnos | null {
  return error instanceof ErrorHistorialTurnos ? error.diagnostico : null;
}

export async function conEtapaHistorialTurnos<T>(
  etapa: EtapaHistorialTurnos,
  operacion: () => Promise<T>,
): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    throw new ErrorHistorialTurnos(etapa, error);
  }
}

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
