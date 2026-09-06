import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  crearEndpointsEmulador,
  exigirProjectIdEmulador,
  parsearEndpointLocal,
  prepararParametrosDusemaEmulador,
} from "./emulator-preflight.mjs";

test("acepta únicamente proyectos demo válidos para el preflight", () => {
  assert.equal(exigirProjectIdEmulador("demo-p0-01-e2e", "demo-p0-01-"), "demo-p0-01-e2e");
  assert.throws(() => exigirProjectIdEmulador("micafe-pos", "demo-p0-01-"), /solo admite un proyecto/iu);
  assert.throws(() => exigirProjectIdEmulador("demo-p0-01-e2e/produccion", "demo-p0-01-"), /solo admite un proyecto/iu);
});

test("rechaza endpoints que no sean loopback", () => {
  assert.deepEqual(parsearEndpointLocal("127.0.0.1:8085", "Firestore", 8085), {
    host: "127.0.0.1",
    port: 8085,
    endpoint: "127.0.0.1:8085",
  });
  assert.throws(() => parsearEndpointLocal("production.example.com:8085", "Firestore", 8085), /loopback/iu);
  assert.throws(() => parsearEndpointLocal("127.0.0.1:0", "Firestore", 8085), /puerto válido/iu);
});

test("construye los tres endpoints locales con valores deterministas", () => {
  assert.deepEqual(crearEndpointsEmulador({}), {
    functions: { host: "127.0.0.1", port: 5001, endpoint: "127.0.0.1:5001" },
    firestore: { host: "127.0.0.1", port: 8085, endpoint: "127.0.0.1:8085" },
    auth: { host: "127.0.0.1", port: 9099, endpoint: "127.0.0.1:9099" },
  });
});

test("prepara parámetros Dusema sintéticos para Emulator y restaura el archivo local", () => {
  const functionsDir = mkdtempSync(join(tmpdir(), "micafe-pos-e2e-"));
  const envFile = join(functionsDir, ".env.local");
  const original = "OTRO_PARAMETRO=conservar\nDUSEMA_S2S_ISSUER=anterior\n";
  writeFileSync(envFile, original);

  try {
    const limpiar = prepararParametrosDusemaEmulador(functionsDir);
    const preparado = readFileSync(envFile, "utf8");
    assert.match(preparado, /^OTRO_PARAMETRO=conservar$/m);
    assert.match(preparado, /^DUSEMA_ADMIN_BASE_URL=https:\/\/dusema-e2e\.invalid$/m);
    assert.match(preparado, /^DUSEMA_S2S_ENVIRONMENT=staging$/m);
    assert.doesNotMatch(preparado, /^DUSEMA_S2S_ISSUER=anterior$/m);
    limpiar();
    assert.equal(readFileSync(envFile, "utf8"), original);
  } finally {
    rmSync(functionsDir, { recursive: true, force: true });
  }
});

test("elimina el archivo efímero cuando no existía configuración local", () => {
  const functionsDir = mkdtempSync(join(tmpdir(), "micafe-pos-e2e-"));
  const envFile = join(functionsDir, ".env.local");
  try {
    const limpiar = prepararParametrosDusemaEmulador(functionsDir);
    assert.equal(existsSync(envFile), true);
    limpiar();
    assert.equal(existsSync(envFile), false);
  } finally {
    rmSync(functionsDir, { recursive: true, force: true });
  }
});
