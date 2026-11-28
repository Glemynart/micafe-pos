import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BUNDLE_LEGAL_ACTUAL, obtenerDocumentoLegalPublico } from "../../functions/src/legal/catalog";
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

test("las páginas públicas resuelven la misma versión y ruta del bundle vigente", () => {
  const page = readFileSync(resolve(repository, "components/legal/legal-document-page.tsx"), "utf8");
  const publicDocuments = [
    ["terminos", "terminos"],
    ["privacidad", "politica-tratamiento"],
    ["aviso", "aviso-autorizacion"],
    ["anexo", "anexo-tratamiento"],
  ] as const;

  for (const [pageKey, documentId] of publicDocuments) {
    const document = obtenerDocumentoLegalPublico(pageKey);
    assert.equal(document.id, documentId);
    assert.equal(document.version, "0.9");
    assert.equal(document.estado, "BORRADOR");
    assert.ok(document.rutaPublica.startsWith(`/legal/v${document.version}/`));
    assert.ok(readFileSync(resolve(repository, "public", document.rutaPublica.slice(1)), "utf8"));
  }

  assert.match(page, /obtenerDocumentoLegalPublico\(documentKey\)/);
  assert.match(page, /document\.rutaPublica/);
  assert.doesNotMatch(page, /v0\.5/);
});

test("la revisión 0.9 conserva intactos los borradores 0.8 y 0.7 servidos previamente", () => {
  const archived: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
    "0.7": [
      ["terminos-servicio.md", "efcd8eb2365386b8a4277fd7dd731895139fb0861fcc6dd2092fdcb2139d850b"],
      ["politica-tratamiento.md", "64207fef36b1fab0ae468c26852863a82b7ac4d3d7e86c975dde9d1eb7a6392a"],
      ["aviso-autorizacion.md", "5ab4a8e97dde0ee5d2b147d319c1a6d4de33a011615f8104f930d39d0144f47c"],
      ["anexo-tratamiento.md", "7b5b7107e7d1a0e0e77b8da5057eaf56bce0c0b0e02ffba2425be0f12396138b"],
    ],
    "0.8": [
      ["terminos-servicio.md", "922c841d7f62fbdc225e01b3d4735751aa761fccc945bd5a98996b52973dd17d"],
      ["politica-tratamiento.md", "405c40f992b6c73bac87c8e03131bb244bfdb64f704094423cc2833ff96090f4"],
      ["aviso-autorizacion.md", "2a5da1937dead674b459d2b8c85d9940c7e48a5233b863a63f06041c119d4491"],
      ["anexo-tratamiento.md", "fd9d857f510b0fe5feda31f980b87a2f101dd4028f464e289ae6d36bf35c40d7"],
    ],
  };

  for (const [version, documents] of Object.entries(archived)) {
    for (const [file, expectedHash] of documents) {
      const bytes = bytesLf(resolve(repository, `public/legal/v${version}`, file));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `${file} v${version} debe permanecer inmutable`);
    }
  }
});

test("el historial solo enlaza un archivo archivado con huella coincidente", () => {
  const archived = [
    { id: "terminos", version: "0.5", sha256: "b0bd935ccea3708852a5567946105b1d0dfe9ade2e321738d347d52071a3232e", path: "/legal/v0.5/terminos-servicio.md" },
    { id: "anexo-tratamiento", version: "0.5", sha256: "e26cff7a70312e84ededabbbcf022ace8044e90d0f5d3a5baec6fe4836e56682", path: "/legal/v0.5/anexo-tratamiento.md" },
  ] as const;
  for (const doc of archived) {
    const path = rutaDocumentoAceptado(doc);
    assert.equal(path, doc.path);
    assert.equal(createHash("sha256").update(bytesLf(resolve(repository, "public", path!.slice(1)))).digest("hex"), doc.sha256);
    assert.equal(rutaDocumentoAceptado({ ...doc, sha256: "0".repeat(64) }), null);
    assert.equal(rutaDocumentoAceptado({ ...doc, version: "../../otra" }), null);
  }
  const currentDraft = BUNDLE_LEGAL_ACTUAL.documentos.find(item => item.id === "terminos")!;
  assert.equal(rutaDocumentoAceptado(currentDraft), null);
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

test("la revisión 0.4 conserva los borradores 0.3 archivados sin mutarlos", () => {
  const archived = [
    ["terminos-servicio.md", "9ff861615098ec8a6f569ac2a66514fdee4a9c37a7bdee09fb47257b126b09d4"],
    ["politica-tratamiento.md", "f5a66894035a13e1b1c4ea09106f48eba9b28f567525d19b59ae619ede3e28d2"],
    ["aviso-autorizacion.md", "686dd5cd457f41d49a6114f1b9b7bd5a22b8ac565c23b7c27d1813350655c4fe"],
    ["anexo-tratamiento.md", "70af5c2b1dc183b264b8fd0c59934d10cbae6a09efd1efc5bbe99079b4cd4f92"],
  ] as const;
  for (const [file, expectedHash] of archived) {
    const bytes = bytesLf(resolve(repository, "public/legal/v0.3", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `${file} v0.3 debe permanecer inmutable`);
  }
});

test("la revisión 0.5 conserva los borradores 0.4 archivados sin mutarlos", () => {
  const archived = [
    ["terminos-servicio.md", "26ae0f9eab539da0baa6a37bc3ad2a0c1f36eac9513a1d37e4cac31dc99d623e"],
    ["politica-tratamiento.md", "5f9c4d767d52202b6b004b69a149c5ec6cace1d46383d35e0c80e2ab626e0be9"],
    ["aviso-autorizacion.md", "91c657428f1be458f629fb2c6b6d2acd5fc275d052f8ff926952f35faf0751da"],
    ["anexo-tratamiento.md", "a46f9557d993a03c6329e7bf43fb9a0938d112138fbb25078420426a6d1a3060"],
  ] as const;
  for (const [file, expectedHash] of archived) {
    const bytes = bytesLf(resolve(repository, "public/legal/v0.4", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `${file} v0.4 debe permanecer inmutable`);
  }
});

test("la revisión 0.6 conserva inmutable el bundle público 0.5", () => {
  const archived = [
    ["terminos-servicio.md", "b0bd935ccea3708852a5567946105b1d0dfe9ade2e321738d347d52071a3232e"],
    ["politica-tratamiento.md", "f532ba15e4f4d51205ed80717d819d9321dd527e4569c1a132c9154cf29ba4a6"],
    ["aviso-autorizacion.md", "6425ba3c4bf154842a8ab7a01c01e2770a99ef1d51e8f2d33ade29a657aa4839"],
    ["anexo-tratamiento.md", "e26cff7a70312e84ededabbbcf022ace8044e90d0f5d3a5baec6fe4836e56682"],
  ] as const;
  for (const [file, expectedHash] of archived) {
    const bytes = bytesLf(resolve(repository, "public/legal/v0.5", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `${file} v0.5 debe permanecer inmutable`);
  }
});
