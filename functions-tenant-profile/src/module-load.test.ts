import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("el entrypoint no consulta Firestore/Auth ni Secrets durante module-load", () => {
  const entry = resolve(import.meta.dirname, "../lib/functions-tenant-profile/src/index.js");
  const script = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain);
      if (request === 'firebase-admin/firestore' || request === 'firebase-admin/auth') {
        return new Proxy(loaded, { get(target, key) {
          if (key === 'getFirestore' || key === 'getAuth') throw new Error('MODULE_LOAD_IO');
          return target[key];
        }});
      }
      if (request === 'firebase-functions/params') throw new Error('SECRET');
      return loaded;
    };
    require(${JSON.stringify(entry)});
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
