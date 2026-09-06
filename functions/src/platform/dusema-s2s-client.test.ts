import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import {
  createDusemaS2sClient,
  DUSEMA_S2S_SCOPE,
  DUSEMA_S2S_SUBJECT,
  DUSEMA_S2S_TTL_SECONDS,
  emitirJwtDusema,
  type DusemaFetch,
  type DusemaS2sConfig,
  type DusemaS2sContext,
} from "./dusema-s2s-client";

const context: DusemaS2sContext = {
  actorUid: "operador-1",
  empresaPosId: "empresa-a",
  correlationId: "correlation-1",
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const config: DusemaS2sConfig = {
  baseUrl: "https://dusema.example.test/",
  issuer: "pos-staging",
  audience: "dusema-platform-admin-staging",
  kid: "pos-staging-2026-01",
  privateKeyPem,
  timeoutMs: 100,
};

function response(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}

function capture(result = response({
  id: "tenant-1", nombre: "Tenant Uno", razonSocial: null, nit: null, activo: true,
  plan: "basic", createdAt: "2026-08-31T12:00:00.000Z", updatedAt: "2026-08-31T12:00:00.000Z",
})) {
  let request: { url: string; init: Parameters<DusemaFetch>[1] } | undefined;
  const fetcher: DusemaFetch = async (url, init) => {
    request = { url, init };
    return result;
  };
  return { fetcher, request: () => request };
}

test("emite JWT RS256 verificable con los claims S2S requeridos", async () => {
  const iat = 1_756_632_000;
  const token = await emitirJwtDusema(config, context, iat);
  const key = await importSPKI(publicKeyPem, "RS256");
  const verified = await jwtVerify(token, key, {
    algorithms: ["RS256"], issuer: config.issuer, audience: config.audience, currentDate: new Date(iat * 1_000),
  });
  const header = decodeProtectedHeader(token);
  const payload = verified.payload;
  assert.equal(header.alg, "RS256");
  assert.equal(header.kid, config.kid);
  assert.equal(header.typ, "JWT");
  assert.equal(payload.scope, DUSEMA_S2S_SCOPE);
  assert.equal(payload.sub, DUSEMA_S2S_SUBJECT);
  assert.equal(payload.actorUid, context.actorUid);
  assert.equal(payload.empresaPosId, context.empresaPosId);
  assert.equal(payload.correlationId, context.correlationId);
  assert.equal(payload.iat, iat);
  assert.equal(payload.exp, iat + DUSEMA_S2S_TTL_SECONDS);
  assert.match(payload.jti ?? "", /^[0-9a-f-]{36}$/);
});

test("emite jti único e issuer, audience y kid configurables", async () => {
  const custom = { ...config, issuer: "issuer-custom", audience: "audience-custom", kid: "kid-custom" };
  const first = decodeJwt(await emitirJwtDusema(custom, context, 1_756_632_000));
  const second = decodeJwt(await emitirJwtDusema(custom, context, 1_756_632_000));
  assert.notEqual(first.jti, second.jti);
  assert.equal(first.iss, "issuer-custom");
  assert.equal(first.aud, "audience-custom");
  assert.equal(decodeProtectedHeader(await emitirJwtDusema(custom, context, 1_756_632_000)).kid, "kid-custom");
});

test("getTenant usa solo endpoint HTTPS configurado, redirect error y contexto explícito", async () => {
  const captured = capture();
  const client = createDusemaS2sClient(config, { fetch: captured.fetcher, now: () => 1_756_632_000 });
  const result = await client.getTenant("tenant-1", { ...context, baseUrl: "https://attacker.test/" } as never);
  const request = captured.request();
  assert.equal(result.id, "tenant-1");
  assert.ok(request);
  assert.equal(request.url, "https://dusema.example.test/platform/admin/v1/tenants/tenant-1");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers["X-Correlation-Id"], context.correlationId);
  assert.match(request.init.headers.Authorization, /^Bearer ey/);
});

test("proyecta solo metadata permitida", async () => {
  const captured = capture(response({
    id: "tenant-1", nombre: "Tenant Uno", razonSocial: "Razón Uno", nit: "900000000-1", activo: false,
    plan: { code: "basic" }, createdAt: "2026-08-31T12:00:00.000Z", updatedAt: "2026-08-31T12:00:00.000Z",
    passwordHash: "must-not-escape", users: [{ id: "user-1" }],
  }));
  const result = await createDusemaS2sClient(config, { fetch: captured.fetcher }).getTenant("tenant-1", context);
  assert.deepEqual(Object.keys(result).sort(), ["activo", "createdAt", "id", "nit", "nombre", "plan", "razonSocial", "updatedAt"]);
  assert.equal("passwordHash" in result, false);
  assert.equal("users" in result, false);
});

test("no registra token ni clave privada", async () => {
  const captured = capture();
  const logs: unknown[][] = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = (...args: unknown[]) => logs.push(args);
  console.info = (...args: unknown[]) => logs.push(args);
  console.warn = (...args: unknown[]) => logs.push(args);
  console.error = (...args: unknown[]) => logs.push(args);
  try {
    await createDusemaS2sClient(config, { fetch: captured.fetcher }).getTenant("tenant-1", context);
  } finally {
    console.log = original.log; console.info = original.info; console.warn = original.warn; console.error = original.error;
  }
  assert.equal(logs.length, 0);
  assert.equal(JSON.stringify(logs).includes(privateKeyPem), false);
  assert.equal(JSON.stringify(logs).includes("Bearer"), false);
});

test("normaliza errores HTTP sin exponer bodies y conserva 401/403/404", async () => {
  const secreto = "material-privado-no-visible";
  await assert.rejects(
    createDusemaS2sClient(config, { fetch: capture(response({ secreto }, 500)).fetcher }).getTenant("tenant-1", context),
    (error: unknown) => error instanceof Error && error.message === "DUSEMA_UNAVAILABLE" && !error.message.includes(secreto),
  );
  for (const [status, code] of [[401, "DUSEMA_UNAUTHORIZED"], [403, "DUSEMA_FORBIDDEN"], [404, "DUSEMA_TENANT_NOT_FOUND"]] as const) {
    await assert.rejects(createDusemaS2sClient(config, { fetch: capture(response({}, status)).fetcher }).getTenant("tenant-1", context), new RegExp(code));
  }
});

test("normaliza red y timeout mediante AbortController", async () => {
  await assert.rejects(createDusemaS2sClient(config, { fetch: async () => { throw new Error("network"); } }).getTenant("tenant-1", context), /DUSEMA_UNAVAILABLE/);
  let aborted = false;
  const fetcher: DusemaFetch = async (_url, init) => new Promise<never>((_resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
  });
  await assert.rejects(createDusemaS2sClient({ ...config, timeoutMs: 10 }, { fetch: fetcher }).getTenant("tenant-1", context), /DUSEMA_TIMEOUT/);
  assert.equal(aborted, true);
});

test("rechaza configuración insegura e inputs inválidos sin llamar al upstream", async () => {
  assert.throws(() => createDusemaS2sClient({ ...config, baseUrl: "http://dusema.example.test/" }), /DUSEMA_CONFIG_INVALIDA/);
  let calls = 0;
  const fetcher: DusemaFetch = async () => { calls += 1; return response({}); };
  const client = createDusemaS2sClient(config, { fetch: fetcher });
  await assert.rejects(client.getTenant("tenant/ajeno", context), /DUSEMA_TENANT_ID_INVALIDO/);
  await assert.rejects(client.getTenant("tenant-1", { ...context, actorUid: "" }), /DUSEMA_CONTEXT_INVALIDO/);
  assert.equal(calls, 0);
});
