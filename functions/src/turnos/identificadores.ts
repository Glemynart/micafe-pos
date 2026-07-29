/**
 * Codifica segmentos sin usar delimitadores ambiguos en IDs internos de Firestore.
 * El formato base64url del JSON de un arreglo de strings es reversible y canónico.
 */
const PREFIJO_IDENTIFICADOR_INTERNO = "r1a-";

export function crearIdentificadorInterno(...segmentos: readonly string[]): string {
  return `${PREFIJO_IDENTIFICADOR_INTERNO}${Buffer.from(JSON.stringify(segmentos), "utf8").toString("base64url")}`;
}

export function descomponerIdentificadorInterno(identificador: string): string[] {
  if (!identificador.startsWith(PREFIJO_IDENTIFICADOR_INTERNO)) {
    throw new Error("Identificador interno inválido");
  }
  const segmentos: unknown = JSON.parse(
    Buffer.from(identificador.slice(PREFIJO_IDENTIFICADOR_INTERNO.length), "base64url").toString("utf8"),
  );
  if (!Array.isArray(segmentos) || !segmentos.every((segmento) => typeof segmento === "string")) {
    throw new Error("Identificador interno inválido");
  }
  const normalizados = [...segmentos];
  if (crearIdentificadorInterno(...normalizados) !== identificador) {
    throw new Error("Identificador interno inválido");
  }
  return normalizados;
}
