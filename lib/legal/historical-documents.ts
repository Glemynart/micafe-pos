/** Rutas explícitas de archivos archivados; una versión futura se agrega al publicar. */
const ARCHIVO: Record<string, { sha256: string; path: string }> = {
  "terminos:0.2": { sha256: "3da9b709eb5e043fcf3bb106a5e2e155e23c49ff1f8b2aadf603296020e27ea7", path: "/legal/v0.2/terminos-servicio.md" },
  "anexo-tratamiento:0.2": { sha256: "5fa27aebf552c079b19b5c0bd85745c7cdc6a72f15aee49b8155485ff11d4aa2", path: "/legal/v0.2/anexo-tratamiento.md" },
};

export function rutaDocumentoAceptado(documento: { id: string; version: string; sha256: string }): string | null {
  const entrada = ARCHIVO[`${documento.id}:${documento.version}`];
  return entrada && entrada.sha256 === documento.sha256 ? entrada.path : null;
}
