import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("la closure no importa monolitos ni superficies ajenas", async () => {
  const files = [
    resolve(import.meta.dirname, "index.ts"),
    resolve(import.meta.dirname, "../../functions/src/tenant-credential-recovery/handler.ts"),
  ];
  const source = await Promise.all(files.map((file) => readFile(file, "utf8"))).then((parts) => parts.join("\n"));
  for (const forbidden of [
    "credential-recovery-callables",
    "operational-auth",
    "functions/src/index",
    "wompi",
    "dusema",
    "bootstrap",
    "commercial",
    "email",
    "bodega",
    "operational-activation",
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.match(source, /OPERATIONAL_PIN_PEPPER/);
});
