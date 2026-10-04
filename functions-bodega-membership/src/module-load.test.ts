import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
test("el entrypoint no hace I/O durante module-load",()=>{const entry=resolve(import.meta.dirname,"../lib/functions-bodega-membership/src/index.js");const script=`const M=require('node:module');const o=M._load;M._load=function(r,p,m){const v=o.call(this,r,p,m);if(r==='firebase-admin/firestore'||r==='firebase-admin/auth')return new Proxy(v,{get(t,k){if(k==='getFirestore'||k==='getAuth')throw new Error('MODULE_LOAD_IO');return t[k]}});if(r==='firebase-functions/params')throw new Error('SECRET');return v};require(${JSON.stringify(entry)});`;const result=spawnSync(process.execPath,["-e",script],{encoding:"utf8"});assert.equal(result.status,0,result.stderr);});
