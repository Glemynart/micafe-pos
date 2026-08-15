import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeRecoveryBackup,
  getRecoveryDatabase,
  getRecoveryDocument,
  requestRecoveryRestore,
} from "./recovery-restore-api";

test("describe backup usa REST autenticado y no expone el token", async () => {
  const originalFetch = globalThis.fetch;
  let observed: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    observed = { url: String(input), init };
    return new Response(JSON.stringify({ name: "backup-resource" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await describeRecoveryBackup(
      "projects/micafe-pos/locations/southamerica-east1/backups/BACKUP_ID",
      "token-only-in-memory",
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.body, { name: "backup-resource" });
    assert.equal(observed?.init?.method, "GET");
    assert.equal(
      (observed?.init?.headers as Record<string, string>).Authorization,
      "Bearer token-only-in-memory",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("restore REST usa databaseId aislado y backup completo", async () => {
  const originalFetch = globalThis.fetch;
  let observed: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input, init) => {
    observed = { url: String(input), init };
    return new Response(JSON.stringify({ name: "operation-resource" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await requestRecoveryRestore(
      "micafe-pos",
      "projects/micafe-pos/locations/southamerica-east1/backups/BACKUP_ID",
      "gsaas02-recovery-20260814",
      "token-only-in-memory",
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.body, { name: "operation-resource" });
    assert.equal(
      observed?.url,
      "https://firestore.googleapis.com/v1/projects/micafe-pos/databases:restore",
    );
    assert.equal(observed?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(observed?.init?.body)), {
      databaseId: "gsaas02-recovery-20260814",
      backup: "projects/micafe-pos/locations/southamerica-east1/backups/BACKUP_ID",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verificación REST consulta la base destino y documentos anidados sin exponer el token", async () => {
  const originalFetch = globalThis.fetch;
  const observed: string[] = [];
  globalThis.fetch = (async (input) => {
    observed.push(String(input));
    return new Response(JSON.stringify({ name: "resource" }), { status: 200 });
  }) as typeof fetch;

  try {
    await getRecoveryDatabase("micafe-pos", "gsaas02-recovery-20260814", "token-only-in-memory");
    await getRecoveryDocument(
      "micafe-pos",
      "gsaas02-recovery-20260814",
      "planes/mvp_comercial",
      "versiones/2",
      "token-only-in-memory",
    );
    assert.deepEqual(observed, [
      "https://firestore.googleapis.com/v1/projects/micafe-pos/databases/gsaas02-recovery-20260814",
      "https://firestore.googleapis.com/v1/projects/micafe-pos/databases/gsaas02-recovery-20260814/documents/planes/mvp_comercial/versiones/2",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("REST conserva el error y no trata un HTTP no exitoso como restore", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;

  try {
    const result = await describeRecoveryBackup(
      "projects/micafe-pos/locations/southamerica-east1/backups/MISSING",
      "token-only-in-memory",
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.error, "Firestore Admin API respondió HTTP 404.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("REST explica los permisos faltantes ante un HTTP 403", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("forbidden", { status: 403 })) as typeof fetch;

  try {
    const result = await describeRecoveryBackup(
      "projects/micafe-pos/locations/southamerica-east1/backups/PROTECTED",
      "token-only-in-memory",
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.match(result.error ?? "", /datastore\.backups\.get\/list/);
    assert.match(result.error ?? "", /roles\/datastore\.restoreAdmin/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
