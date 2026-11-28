import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { BUNDLE_LEGAL_ACTUAL } from "../../lib/legal/legal-bundle";

function normalizeLf(bytes: Buffer): string {
  return bytes.toString("utf8").replace(/\r\n/g, "\n");
}

function sha256Utf8Lf(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

test("el bundle legal coincide con las fuentes y assets públicos versionados", async () => {
  for (const document of BUNDLE_LEGAL_ACTUAL.documentos) {
    const assetPath = path.join(process.cwd(), "public", document.rutaPublica.replace(/^\//, ""));
    const sourcePath = path.join(process.cwd(), "docs", "legal", path.basename(document.rutaPublica));
    const [assetBytes, sourceBytes] = await Promise.all([readFile(assetPath), readFile(sourcePath)]);
    const asset = normalizeLf(assetBytes);
    const source = normalizeLf(sourceBytes);
    const actualSha256 = sha256Utf8Lf(asset);

    assert.equal(source, asset, `${document.id}: la fuente y el asset público divergen`);
    assert.equal(actualSha256, document.sha256, `${document.id}: SHA-256 del bundle desactualizado`);
  }
});

test("los assets v0.6 ya servidos en staging conservan sus hashes históricos", async () => {
  const previousHashes: Readonly<Record<string, string>> = {
    "terminos-servicio.md": "0f6509480588051f312b37e1bf352ff7c70721857f19ccd56b02640d53ffe059",
    "politica-tratamiento.md": "d48202440860a96cd6ae3428aee0272209fbfbd485cba92f8cc35e0a25f1e0ee",
    "aviso-autorizacion.md": "42e9338cae72059cad52aeb8c96e0e4946c0fadfd56dedfffa443bd50a7ea8dd",
    "anexo-tratamiento.md": "e8a9f52ade5ea2785bac7f2c79976b1d7d57ad73710d1b752ae5ed9a8cf87b6e",
  };

  for (const [fileName, expectedSha256] of Object.entries(previousHashes)) {
    const assetPath = path.join(process.cwd(), "public", "legal", "v0.6", fileName);
    const content = normalizeLf(await readFile(assetPath));
    assert.equal(sha256Utf8Lf(content), expectedSha256, `${fileName}: hash histórico v0.6 alterado`);
  }
});
