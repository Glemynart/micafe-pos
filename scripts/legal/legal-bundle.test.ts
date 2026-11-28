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

test("los assets v0.7 ya servidos en staging conservan sus hashes históricos", async () => {
  const previousHashes: Readonly<Record<string, string>> = {
    "terminos-servicio.md": "efcd8eb2365386b8a4277fd7dd731895139fb0861fcc6dd2092fdcb2139d850b",
    "politica-tratamiento.md": "64207fef36b1fab0ae468c26852863a82b7ac4d3d7e86c975dde9d1eb7a6392a",
    "aviso-autorizacion.md": "5ab4a8e97dde0ee5d2b147d319c1a6d4de33a011615f8104f930d39d0144f47c",
    "anexo-tratamiento.md": "7b5b7107e7d1a0e0e77b8da5057eaf56bce0c0b0e02ffba2425be0f12396138b",
  };

  for (const [fileName, expectedSha256] of Object.entries(previousHashes)) {
    const assetPath = path.join(process.cwd(), "public", "legal", "v0.7", fileName);
    const content = normalizeLf(await readFile(assetPath));
    assert.equal(sha256Utf8Lf(content), expectedSha256, `${fileName}: hash histórico v0.7 alterado`);
  }
});

test("los assets v0.8 ya servidos en staging conservan sus hashes históricos", async () => {
  const previousHashes: Readonly<Record<string, string>> = {
    "terminos-servicio.md": "922c841d7f62fbdc225e01b3d4735751aa761fccc945bd5a98996b52973dd17d",
    "politica-tratamiento.md": "405c40f992b6c73bac87c8e03131bb244bfdb64f704094423cc2833ff96090f4",
    "aviso-autorizacion.md": "2a5da1937dead674b459d2b8c85d9940c7e48a5233b863a63f06041c119d4491",
    "anexo-tratamiento.md": "fd9d857f510b0fe5feda31f980b87a2f101dd4028f464e289ae6d36bf35c40d7",
  };

  for (const [fileName, expectedSha256] of Object.entries(previousHashes)) {
    const assetPath = path.join(process.cwd(), "public", "legal", "v0.8", fileName);
    const content = normalizeLf(await readFile(assetPath));
    assert.equal(sha256Utf8Lf(content), expectedSha256, `${fileName}: hash histórico v0.8 alterado`);
  }
});

test("los assets v0.9 servidos en staging conservan sus hashes versionados", async () => {
  const stagedHashes: Readonly<Record<string, string>> = {
    "terminos-servicio.md": "7af90c5fc6c1bf2c4e06a5cedd1fe427bf698995bfa1b5a31bfcd1a9c25a2b7a",
    "politica-tratamiento.md": "440fdaa02e6b3c687e7f8cc35862269ebe7e8af45ed263121e7edf2daae8e554",
    "aviso-autorizacion.md": "eb3fa4a8dddecc1fea7ee6817e96093828f31bd04bd920389336009982fe32a3",
    "anexo-tratamiento.md": "aaeff070aa6b11a714281d9fc94b5e64af34ea2403efae42bae0cb2dbb76bcbc",
  };

  for (const [fileName, expectedSha256] of Object.entries(stagedHashes)) {
    const assetPath = path.join(process.cwd(), "public", "legal", "v0.9", fileName);
    const content = normalizeLf(await readFile(assetPath));
    assert.equal(sha256Utf8Lf(content), expectedSha256, `${fileName}: hash v0.9 alterado`);
  }
});
