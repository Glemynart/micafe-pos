import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."); const bin = resolve(root, "node_modules/firebase-functions/lib/bin/firebase-functions.js");
async function port(){const s=createServer();s.listen(0,"127.0.0.1");await once(s,"listening");const a=s.address();s.close();if(!a||typeof a==="string")throw new Error("PORT");return a.port;}
test("saas-bodega-membership descubre una callable Gen2 sin Secrets", async()=>{const p=await port();const child=spawn(process.execPath,[bin],{cwd:root,env:{...process.env,FUNCTIONS_CONTROL_API:"true",PORT:String(p)}});after(()=>child.kill());let result:any;for(let i=0;i<50;i+=1){try{const r=await fetch(`http://127.0.0.1:${p}/__/functions.yaml`);if(r.ok){result=JSON.parse(await r.text());break;}}catch{}await new Promise(done=>setTimeout(done,100));}assert.ok(result);assert.deepEqual(Object.keys(result.endpoints),["actualizarMembresiaBodegaV1"]);assert.deepEqual(result.endpoints.actualizarMembresiaBodegaV1.region,["us-central1"]);assert.deepEqual(result.params??[],[]);assert.equal(JSON.stringify(result).toLowerCase().includes("secret"),false);});
