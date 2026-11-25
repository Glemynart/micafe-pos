/** Rutas explícitas de archivos archivados; una versión futura se agrega al publicar. */
const ARCHIVO: Record<string, { sha256: string; path: string }> = {
  "terminos:0.2": { sha256: "d1af0b746a61e93bfaae505eced6359d4f807d9f62f952dce8b94e4918feca7c", path: "/legal/v0.2/terminos-servicio.md" },
  "anexo-tratamiento:0.2": { sha256: "058f97dab35538c9e657b84ae778d3b1abb641a4f29e5ed73a891caebe12b9b2", path: "/legal/v0.2/anexo-tratamiento.md" },
  "terminos:0.3": { sha256: "9ff861615098ec8a6f569ac2a66514fdee4a9c37a7bdee09fb47257b126b09d4", path: "/legal/v0.3/terminos-servicio.md" },
  "anexo-tratamiento:0.3": { sha256: "70af5c2b1dc183b264b8fd0c59934d10cbae6a09efd1efc5bbe99079b4cd4f92", path: "/legal/v0.3/anexo-tratamiento.md" },
};

export function rutaDocumentoAceptado(documento: { id: string; version: string; sha256: string }): string | null {
  const entrada = ARCHIVO[`${documento.id}:${documento.version}`];
  return entrada && entrada.sha256 === documento.sha256 ? entrada.path : null;
}
