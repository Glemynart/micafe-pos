import assert from "node:assert/strict";
import test from "node:test";
import { collectAppHostingReleaseEvidence } from "./apphosting-release";

const projectId = "micafe-pos";
const locationId = "us-central1";
const backendId = "micafe-pos";
const backendName = `projects/${projectId}/locations/${locationId}/backends/${backendId}`;
const buildName = `projects/882525811433/locations/${locationId}/backends/${backendId}/builds/build-2026-10-25-001`;
const canonicalBuildName = `${backendName}/builds/build-2026-10-25-001`;
const rolloutName = `${backendName}/rollouts/rollout-2026-10-25-001`;
const sourceSha = "a".repeat(40);
const accessToken = "test-access-token";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function standardResponses() {
  return [
    response({ name: backendName, uri: "https://micafe-pos--micafe-pos.us-central1.hosted.app", reconciling: false }),
    response({
      name: `${backendName}/traffic`,
      current: { splits: [{ build: buildName, percent: 100 }] },
      reconciling: false,
      updateTime: "2026-10-25T01:00:00Z",
    }),
    response({ rollouts: [{ name: rolloutName, build: canonicalBuildName, state: "SUCCEEDED" }] }),
    response({
      name: canonicalBuildName,
      source: { codebase: { hash: sourceSha } },
      state: "READY",
      image: "us-central1-docker.pkg.dev/project/apphosting/app@sha256:" + "f".repeat(64),
      config: { effectiveEnv: [{ variable: "SECRET_SENTINEL", value: "never-return-this" }] },
    }),
  ];
}

test("recoge únicamente la cadena backend → tráfico → rollout → SHA del build con GET", async () => {
  const responses = standardResponses();
  const requested: Array<{ url: URL; method: string; authorization: string | null }> = [];
  const result = await collectAppHostingReleaseEvidence({
    projectId,
    locationId,
    backendId,
    accessToken,
    fetcher: async (input, init) => {
      requested.push({
        url: new URL(input),
        method: String(init?.method),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      const item = responses.shift();
      if (!item) throw new Error("unexpected additional request");
      return item;
    },
  });

  assert.equal(result.error, undefined);
  assert.equal(result.observation?.backendUri, "https://micafe-pos--micafe-pos.us-central1.hosted.app");
  assert.equal(result.observation?.currentTrafficSplits[0]?.percent, 100);
  assert.equal(result.observation?.currentTrafficSplits[0]?.canonicalBuild, canonicalBuildName);
  assert.equal(result.observation?.builds[0]?.sourceSha, sourceSha);
  assert.equal(result.observation?.builds[0]?.name, canonicalBuildName);
  assert.equal(result.observation?.builds[0]?.resourceName, canonicalBuildName);
  assert.equal(result.observation?.builds[0]?.rolloutState, "SUCCEEDED");
  assert.equal(result.observation?.builds[0]?.imageDigest, "f".repeat(64));
  assert.equal(requested.length, 4);
  for (const request of requested) {
    assert.equal(request.method, "GET");
    assert.equal(request.authorization, `Bearer ${accessToken}`);
    const fields = request.url.searchParams.get("fields") ?? "";
    assert.doesNotMatch(fields, /effectiveEnv|overrideEnv|secret|value/i);
  }
  assert.equal(JSON.stringify(result).includes("never-return-this"), false);
  assert.equal(JSON.stringify(result).includes(accessToken), false);
});

test("sigue la paginación read-only hasta encontrar el rollout del build servido", async () => {
  const responses = standardResponses();
  responses[2] = response({ rollouts: [], nextPageToken: "next-page" });
  responses.splice(3, 0, response({ rollouts: [{ name: rolloutName, build: canonicalBuildName, state: "SUCCEEDED" }] }));
  const requested: URL[] = [];
  const result = await collectAppHostingReleaseEvidence({
    projectId,
    locationId,
    backendId,
    accessToken,
    fetcher: async (input) => {
      requested.push(new URL(input));
      const item = responses.shift();
      if (!item) throw new Error("unexpected additional request");
      return item;
    },
  });
  assert.equal(result.observation?.builds[0]?.rolloutState, "SUCCEEDED");
  assert.equal(requested[3]?.searchParams.get("pageToken"), "next-page");
});

test("rechaza una referencia de build a otro ID de proyecto", async () => {
  let requestCount = 0;
  const result = await collectAppHostingReleaseEvidence({
    projectId,
    locationId,
    backendId,
    accessToken,
    fetcher: async () => {
      requestCount += 1;
      if (requestCount === 1) return response({ name: backendName, uri: "https://example.test", reconciling: false });
      return response({
        name: `${backendName}/traffic`,
        current: { splits: [{ build: "projects/other-project/locations/us-central1/backends/micafe-pos/builds/build-1", percent: 100 }] },
        reconciling: false,
      });
    },
  });
  assert.equal(result.observation, null);
  assert.match(result.error ?? "", /fuera del backend solicitado/);
  assert.equal(requestCount, 2);
});

test("un error de permisos no incluye cuerpo ni credencial en la evidencia", async () => {
  const result = await collectAppHostingReleaseEvidence({
    projectId,
    locationId,
    backendId,
    accessToken,
    fetcher: async () => response({ message: "secret payload" }, 403),
  });
  assert.equal(result.observation, null);
  assert.match(result.error ?? "", /403/);
  assert.doesNotMatch(result.error ?? "", /secret payload|test-access-token/);
});

test("no consulta Firebase App Hosting si no existe token en el entorno", async () => {
  let requested = false;
  const result = await collectAppHostingReleaseEvidence({
    projectId,
    locationId,
    backendId,
    accessToken: "",
    fetcher: async () => {
      requested = true;
      return response({});
    },
  });
  assert.equal(result.observation, null);
  assert.equal(result.error, undefined);
  assert.equal(requested, false);
});
