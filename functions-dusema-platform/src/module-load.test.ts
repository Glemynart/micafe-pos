import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("el module-load no inicializa Firestore ni hace solicitudes S2S", () => {
  const entry = resolve(import.meta.dirname, "../lib/functions-dusema-platform/src/index.js");
  const script = `const Module=require('node:module');const original=Module._load;global.fetch=()=>{throw new Error('MODULE_LOAD_NETWORK_IO')};Module._load=function(r,p,m){const v=original.call(this,r,p,m);if(r==='firebase-admin/firestore')return new Proxy(v,{get(t,k){if(k==='getFirestore')throw new Error('MODULE_LOAD_FIRESTORE_IO');return t[k]}});return v};require(${JSON.stringify(entry)});`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
