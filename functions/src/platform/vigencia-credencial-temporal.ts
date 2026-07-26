/**
 * Determina la vigencia de la credencial temporal inicial emitida por la
 * plataforma. Las incorporaciones DIRECTA históricas no llevan `origen` ni
 * `expiraEn`; esas conservan su comportamiento anterior y no entran aquí.
 */

type DocumentoTemporal = {
  origen?: unknown;
  expiraEn?: unknown;
} | undefined;

function millisTimestamp(valor: unknown): number | null {
  if (!valor || typeof valor !== "object") return null;
  const toMillis = (valor as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== "function") return null;
  const millis = (toMillis as () => unknown).call(valor);
  return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
}

/**
 * Solo aplica a la pareja de documentos creada por la plataforma. Si uno de
 * esos documentos perdió el origen o su TTL, se falla cerrado: no puede
 * convertirse una credencial temporal incompleta en una sesión de activación.
 */
export function esCredencialTemporalPlataformaVencidaOInvalida(
  incorporacion: DocumentoTemporal,
  credencial: DocumentoTemporal,
  ahoraMs = Date.now(),
): boolean {
  const hayOrigenPlataforma = incorporacion?.origen === "PLATAFORMA"
    || credencial?.origen === "PLATAFORMA";
  if (!hayOrigenPlataforma) return false;

  if (incorporacion?.origen !== "PLATAFORMA" || credencial?.origen !== "PLATAFORMA") {
    return true;
  }

  const expiraIncorporacion = millisTimestamp(incorporacion.expiraEn);
  const expiraCredencial = millisTimestamp(credencial.expiraEn);
  return expiraIncorporacion === null
    || expiraCredencial === null
    || expiraIncorporacion <= ahoraMs
    || expiraCredencial <= ahoraMs;
}
