import test from "node:test";
import assert from "node:assert/strict";
import {
  crearEndpointsEmulador,
  exigirProjectIdEmulador,
  parsearEndpointLocal,
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
