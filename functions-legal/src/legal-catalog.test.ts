import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BUNDLE_LEGAL_ACTUAL } from "../../functions/src/legal/catalog";

const repository = resolve(import.meta.dirname, "../..");
const sourceById: Record<string, string> = {
  terminos: "terminos-servicio.md",
  "politica-tratamiento": "politica-tratamiento.md",
  "aviso-autorizacion": "aviso-autorizacion.md",
  "anexo-tratamiento": "anexo-tratamiento.md",
};

test("cada huella pública coincide con el borrador legal y la descarga exacta", () => {
  for (const document of BUNDLE_LEGAL_ACTUAL.documentos) {
    const source = readFileSync(resolve(repository, "docs/legal", sourceById[document.id]!));
    const download = readFileSync(resolve(repository, "public", document.rutaPublica.slice(1)));
    const hash = createHash("sha256").update(source).digest("hex");
    assert.equal(hash, document.sha256, `${document.id} debe coincidir con la huella del servidor`);
    assert.deepEqual(download, source, `${document.id} debe poder descargarse sin alterar sus bytes`);
  }
  assert.equal(BUNDLE_LEGAL_ACTUAL.estado, "PREPARACION");
});
