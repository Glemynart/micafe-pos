import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("el adapter no importa fronteras prohibidas ni acepta autoridad de payload", async () => {
  const files = [
    resolve(import.meta.dirname, "index.ts"),
    resolve(import.meta.dirname, "../../functions/src/bodega/close-turn.ts"),
    resolve(import.meta.dirname, "../../functions/src/bodega/operational-core.ts"),
    resolve(import.meta.dirname, "../../functions/src/bodega-vendedor/clientes.ts"),
    resolve(import.meta.dirname, "../../functions/src/bodega-vendedor/presentaciones.ts"),
    resolve(import.meta.dirname, "../../functions/src/bodega-vendedor/lecturas.ts"),
    resolve(import.meta.dirname, "../../functions/src/inventario/callables.ts"),
    resolve(import.meta.dirname, "../../functions/src/turnos/callable.ts"),
    resolve(import.meta.dirname, "../../functions/src/configuracion/reader.ts"),
    resolve(import.meta.dirname, "../../functions/src/tenant-configuration/authority.ts"),
  ];
  const source = (await Promise.all(files.map(file => readFile(file, "utf8")))).join("\n");
  for (const forbidden of ["functions/src/index", "operational-auth", "configuracion/service", "finanzas/callables", "defineSecret", "wompi", "dusema", "bootstrap", "email", "recovery", "activation"]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `IMPORT_PROHIBIDO_${forbidden}`);
  }
  const adapter = await readFile(files[0], "utf8");
  assert.equal(adapter.includes("empresaId: request.data"), false);
  assert.equal(adapter.includes("rol: request.data"), false);
});
