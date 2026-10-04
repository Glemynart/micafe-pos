import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("el codebase no realiza I/O ni lee el Secret durante module-load", () => {
  const entry = resolve(import.meta.dirname, "../lib/functions-tenant-credential-recovery/src/index.js");
  const script = `const Module=require('node:module');const original=Module._load;Module._load=function(r,p,m){const v=original.call(this,r,p,m);if(r==='firebase-admin/firestore')return new Proxy(v,{get(t,k){if(k==='getFirestore')throw new Error('MODULE_LOAD_FIRESTORE_IO');return t[k]}});if(r==='firebase-admin/auth')return new Proxy(v,{get(t,k){if(k==='getAuth')throw new Error('MODULE_LOAD_AUTH_IO');return t[k]}});if(r==='firebase-functions/params')return new Proxy(v,{get(t,k){if(k==='defineSecret')return()=>({value(){throw new Error('MODULE_LOAD_SECRET_READ')}});return t[k]}});return v};require(${JSON.stringify(entry)});`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
