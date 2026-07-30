import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const fuente = readFileSync(resolve(process.cwd(), "lib/reportes-service.ts"), "utf8");

test("Reportes no consulta perfiles globales", () => {
  assert.equal(/collection\(db,\s*['\"]usuarios['\"]\)/.test(fuente), false);
});

test("Reportes resuelve roles exclusivamente desde membresías del tenant", () => {
  assert.match(
    fuente,
    /collection\(db,\s*['\"]membresias['\"]\),\s*where\(['\"]empresaId['\"],\s*['\"]==['\"],\s*empresaId\)/,
  );
});
