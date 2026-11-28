/** Rutas explícitas de archivos archivados; una versión futura se agrega al publicar. */
const ARCHIVO: Record<string, { sha256: string; path: string }> = {
  "terminos:0.2": { sha256: "d1af0b746a61e93bfaae505eced6359d4f807d9f62f952dce8b94e4918feca7c", path: "/legal/v0.2/terminos-servicio.md" },
  "anexo-tratamiento:0.2": { sha256: "058f97dab35538c9e657b84ae778d3b1abb641a4f29e5ed73a891caebe12b9b2", path: "/legal/v0.2/anexo-tratamiento.md" },
  "terminos:0.3": { sha256: "9ff861615098ec8a6f569ac2a66514fdee4a9c37a7bdee09fb47257b126b09d4", path: "/legal/v0.3/terminos-servicio.md" },
  "anexo-tratamiento:0.3": { sha256: "70af5c2b1dc183b264b8fd0c59934d10cbae6a09efd1efc5bbe99079b4cd4f92", path: "/legal/v0.3/anexo-tratamiento.md" },
  "terminos:0.4": { sha256: "26ae0f9eab539da0baa6a37bc3ad2a0c1f36eac9513a1d37e4cac31dc99d623e", path: "/legal/v0.4/terminos-servicio.md" },
  "anexo-tratamiento:0.4": { sha256: "a46f9557d993a03c6329e7bf43fb9a0938d112138fbb25078420426a6d1a3060", path: "/legal/v0.4/anexo-tratamiento.md" },
  "terminos:0.5": { sha256: "b0bd935ccea3708852a5567946105b1d0dfe9ade2e321738d347d52071a3232e", path: "/legal/v0.5/terminos-servicio.md" },
  "anexo-tratamiento:0.5": { sha256: "e26cff7a70312e84ededabbbcf022ace8044e90d0f5d3a5baec6fe4836e56682", path: "/legal/v0.5/anexo-tratamiento.md" },
};

export function rutaDocumentoAceptado(documento: { id: string; version: string; sha256: string }): string | null {
  const entrada = ARCHIVO[`${documento.id}:${documento.version}`];
  return entrada && entrada.sha256 === documento.sha256 ? entrada.path : null;
}
