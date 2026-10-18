import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "..");
const entry = resolve(sourceRoot, "lib/functions-bootstrap/src/index.js");

test("saas-bootstrap exige auth y BOOTSTRAP_EMPRESARIAL_SOLICITAR en el handler", () => {
  const script = `
    const assert = require("node:assert/strict");
    const Module = require("node:module");
    const originalLoad = Module._load;
    let firestoreReads = 0;
    const operator = {
      uid: "operator-synthetic",
      estado: "ACTIVO",
      facultades: ["COMERCIAL_GOBERNAR"],
      versionAutorizacion: 1,
    };
    const fakeDb = {
      collection() {
        return { doc() { return { async get() {
          firestoreReads += 1;
          return { exists: true, data: () => operator };
        } }; } };
      },
    };
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain);
      if (request === "firebase-admin/firestore") {
        return new Proxy(loaded, { get(target, property) {
          if (property === "getFirestore") return () => fakeDb;
          return target[property];
        }});
      }
      return loaded;
    };
    const { solicitarBootstrapEmpresarialSaas } = require(${JSON.stringify(entry)});
    (async () => {
      try {
        await solicitarBootstrapEmpresarialSaas.run({ auth: null, data: {} });
        throw new Error("UNAUTHENTICATED_REQUEST_ACCEPTED");
      } catch (error) {
        assert.equal(error.code, "unauthenticated");
        assert.equal(error.message, "AUTENTICACION_REQUERIDA");
      }
      assert.equal(firestoreReads, 0, "una solicitud anónima no debe consultar Firestore");

      try {
        await solicitarBootstrapEmpresarialSaas.run({
          auth: {
            uid: "operator-synthetic",
            token: { saas: { operador: true, versionAutorizacion: 1, facultades: ["COMERCIAL_GOBERNAR"] } },
          },
          data: {},
        });
        throw new Error("BOOTSTRAP_WITHOUT_REQUIRED_FACULTY_ACCEPTED");
      } catch (error) {
        assert.equal(error.code, "permission-denied");
        assert.equal(error.message, "PLATFORM_ACCESS_DENIED");
      }
      assert.equal(firestoreReads, 1, "solo debe leerse el operador para verificar la facultad canónica");
      process.stdout.write("BOOTSTRAP_AUTHORIZATION_BOUNDARY_OK");
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: sourceRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "BOOTSTRAP_AUTHORIZATION_BOUNDARY_OK");
});
