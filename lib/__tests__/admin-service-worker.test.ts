import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function worker({ network = async () => new Response("build-new"), cached = "build-old" as string | null } = {}) {
  const listeners = new Map<string, (event: any) => void>();
  const stored: string[] = [];
  const deleted: string[] = [];
  let networkStarted = false;
  let resolveNetwork: (() => void) | undefined;
  let claimed = false;
  let skipped = false;
  const cache = {
    addAll: async () => {},
    match: async () => cached === null ? undefined : new Response(cached),
    put: async (_request: unknown, response: Response) => { stored.push(await response.text()); },
  };
  runInNewContext(source, {
    self: {
      location: { origin: "https://review.example" },
      addEventListener: (name: string, callback: (event: any) => void) => listeners.set(name, callback),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
    },
    caches: {
      open: async () => cache,
      match: cache.match,
      keys: async () => ["micafe-admin-v2", "micafe-admin-v3", "unrelated-cache"],
      delete: async (name: string) => { deleted.push(name); return true; },
    },
    fetch: async (...args: unknown[]) => { networkStarted = true; resolveNetwork?.(); return network(...args as []); },
    URL, Response,
  });
  return {
    stored, deleted,
    get claimed() { return claimed; },
    get skipped() { return skipped; },
    networkStarted: () => networkStarted,
    fetch(request: { url?: string; mode?: string; method?: string } = {}) {
      let response: Promise<Response> | undefined;
      const tasks: Promise<unknown>[] = [];
      listeners.get("fetch")!({
        request: { url: "https://review.example/admin/login", mode: "navigate", method: "GET", ...request },
        respondWith: (value: Promise<Response>) => { response = value; },
        waitUntil: (value: Promise<unknown>) => tasks.push(value),
      });
      return { response, finish: async () => { await response; await Promise.all(tasks); } };
    },
    lifecycle(name: "install" | "activate") {
      let task: Promise<unknown> = Promise.resolve();
      listeners.get(name)!({ waitUntil: (value: Promise<unknown>) => { task = value; } });
      return task;
    },
    started: () => new Promise<void>(resolve => { if (networkStarted) resolve(); else resolveNetwork = resolve; }),
  };
}

test("una navegación espera HTML de red aunque exista HTML de un build anterior", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const w = worker({ network: async () => { await gate; return new Response("build-new"); } });
  const request = w.fetch();
  let settled = false;
  void request.response!.then(() => { settled = true; });
  await w.started();
  assert.equal(w.networkStarted(), true);
  assert.equal(settled, false, "no debe devolver la copia vieja mientras espera la red");
  release();
  assert.equal(await (await request.response!).text(), "build-new");
  await request.finish();
  assert.deepEqual(w.stored, ["build-new"]);
});

test("solo usa HTML guardado cuando falla la conexión", async () => {
  const w = worker({ network: async () => { throw new Error("offline"); } });
  const request = w.fetch();
  assert.equal(await (await request.response!).text(), "build-old");
  assert.deepEqual(w.stored, []);
});

test("sin red ni copia responde 503; no oculta errores HTTP con HTML viejo", async () => {
  const offline = worker({ cached: null, network: async () => { throw new Error("offline"); } });
  assert.equal((await offline.fetch().response!).status, 503);
  const serverError = worker({ network: async () => new Response("error", { status: 500 }) });
  assert.equal((await serverError.fetch().response!).status, 500);
  assert.deepEqual(serverError.stored, []);
});

test("no intercepta chunks, RSC, mutaciones, otros orígenes ni otras superficies", () => {
  const w = worker();
  for (const request of [
    { url: "https://review.example/_next/static/chunks/current.js" },
    { url: "https://review.example/admin/catalogo?_rsc=fixture", mode: "cors" },
    { method: "POST" },
    { url: "https://other.example/admin/login" },
    { url: "https://review.example/backoffice" },
    { url: "https://review.example/administrator" },
  ]) assert.equal(w.fetch(request).response, undefined);
});

test("activa la corrección y retira exclusivamente cachés antiguas del shell admin", async () => {
  const w = worker();
  await w.lifecycle("install");
  await w.lifecycle("activate");
  assert.equal(w.skipped, true);
  assert.equal(w.claimed, true);
  assert.deepEqual(w.deleted, ["micafe-admin-v2"]);
});
