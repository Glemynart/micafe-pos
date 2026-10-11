import { HttpsError } from "firebase-functions/v2/https";
import { errorPayloadCompraBodega, errorPoliticaCompraBodega } from "../../lib/bodega/compra-policy";

export function exigirCompraBodegaHabilitada(configuracion: unknown): void {
  const code = errorPoliticaCompraBodega(configuracion);
  if (code) throw new HttpsError("failed-precondition", "Compras de Bodega no disponibles.", { code });
}

export function validarPayloadCompraBodega(payload: unknown): void {
  const code = errorPayloadCompraBodega(payload);
  if (code) throw new HttpsError("invalid-argument", "Solicitud de compra inválida.", { code });
}
