import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("el entrypoint no ejecuta I/O Admin ni lee Secrets durante module-load", () => {
  const entry = resolve(sourceRoot, "lib/functions-operational-activation/src/index.js");
  const script = `
    const Module = require("node:module");
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain);
      if (request === "firebase-admin/firestore") return new Proxy(loaded, { get(target, property) {
        if (property === "getFirestore") throw new Error("MODULE_LOAD_FIRESTORE_IO");
        return target[property];
      }});
      if (request === "firebase-admin/auth") return new Proxy(loaded, { get(target, property) {
        if (property === "getAuth") throw new Error("MODULE_LOAD_AUTH_IO");
        return target[property];
      }});
      if (request === "firebase-functions/params") return new Proxy(loaded, { get(target, property) {
        if (property === "defineSecret") return () => ({ value() { throw new Error("MODULE_LOAD_SECRET_READ"); } });
        return target[property];
      }});
      return loaded;
    };
    require(${JSON.stringify(entry)});
    process.stdout.write("MODULE_LOAD_OK");
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: sourceRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "MODULE_LOAD_OK");
});
