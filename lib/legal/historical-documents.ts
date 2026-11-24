/** Rutas explícitas de archivos archivados; una versión futura se agrega al publicar. */
const ARCHIVO: Record<string, { sha256: string; path: string }> = {
  "terminos:0.2": { sha256: "0aa156f6234bf6d99b4f81d06fd4bd60048af63b16b42a78e44b100f505c4a52", path: "/legal/v0.2/terminos-servicio.md" },
  "anexo-tratamiento:0.2": { sha256: "fea2422ee7520accc1bb56fb68f0d9a27dd05527b29a9686dd1f2958ceac5638", path: "/legal/v0.2/anexo-tratamiento.md" },
};

export function rutaDocumentoAceptado(documento: { id: string; version: string; sha256: string }): string | null {
  const entrada = ARCHIVO[`${documento.id}:${documento.version}`];
  return entrada && entrada.sha256 === documento.sha256 ? entrada.path : null;
}
