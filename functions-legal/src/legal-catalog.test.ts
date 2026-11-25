import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BUNDLE_LEGAL_ACTUAL } from "../../functions/src/legal/catalog";
import { rutaDocumentoAceptado } from "../../lib/legal/historical-documents";

const repository = resolve(import.meta.dirname, "../..");
const sourceById: Record<string, string> = {
  terminos: "terminos-servicio.md",
  "politica-tratamiento": "politica-tratamiento.md",
  "aviso-autorizacion": "aviso-autorizacion.md",
  "anexo-tratamiento": "anexo-tratamiento.md",
};

function bytesLf(path: string): Buffer {
  return Buffer.from(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), "utf8");
}

test("cada huella pública coincide con el borrador legal y la descarga exacta", () => {
  for (const document of BUNDLE_LEGAL_ACTUAL.documentos) {
    const source = bytesLf(resolve(repository, "docs/legal", sourceById[document.id]!));
    const download = bytesLf(resolve(repository, "public", document.rutaPublica.slice(1)));
    const hash = createHash("sha256").update(source).digest("hex");
    assert.equal(hash, document.sha256, `${document.id} debe coincidir con la huella del servidor`);
    assert.deepEqual(download, source, `${document.id} debe poder descargarse sin alterar sus bytes`);
  }
  assert.equal(BUNDLE_LEGAL_ACTUAL.estado, "PREPARACION");
});

test("el historial solo enlaza un archivo archivado con huella coincidente", () => {
  for (const id of ["terminos", "anexo-tratamiento"] as const) {
    const doc = BUNDLE_LEGAL_ACTUAL.documentos.find(item => item.id === id)!;
    const path = rutaDocumentoAceptado(doc);
    assert.equal(path, doc.rutaPublica);
    assert.equal(createHash("sha256").update(bytesLf(resolve(repository, "public", path!.slice(1)))).digest("hex"), doc.sha256);
    assert.equal(rutaDocumentoAceptado({ ...doc, sha256: "0".repeat(64) }), null);
    assert.equal(rutaDocumentoAceptado({ ...doc, version: "../../otra" }), null);
  }
  assert.equal(rutaDocumentoAceptado({ id: "desconocido", version: "0.2", sha256: "0".repeat(64) }), null);
});

test("la revisión 0.3 conserva los borradores 0.2 archivados sin mutarlos", () => {
  const archived = [
    ["terminos-servicio.md", "d1af0b746a61e93bfaae505eced6359d4f807d9f62f952dce8b94e4918feca7c"],
    ["politica-tratamiento.md", "23f6df3d56a79639665124ed1507cd584887ce1cd4b0352262207546d346049d"],
    ["aviso-autorizacion.md", "43e87345b3b54c71c668e5abe281c0f43d7da9e7f70d33f92aedf092806dd55d"],
    ["anexo-tratamiento.md", "058f97dab35538c9e657b84ae778d3b1abb641a4f29e5ed73a891caebe12b9b2"],
  ] as const;
  for (const [file, expectedHash] of archived) {
    const bytes = bytesLf(resolve(repository, "public/legal/v0.2", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `${file} v0.2 debe permanecer inmutable`);
  }
});
