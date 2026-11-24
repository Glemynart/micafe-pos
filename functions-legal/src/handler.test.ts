import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { aceptarDocumentosLegalesTenant, consultarEstadoLegalTenant } from "../../functions/src/legal/handler";
import { BUNDLE_LEGAL_ACTUAL, type BundleLegal } from "../../functions/src/legal/catalog";

type Stored = Record<string, any>;
const READY_BUNDLE: BundleLegal = {
  ...BUNDLE_LEGAL_ACTUAL,
  estado: "EXIGIBLE",
  documentos: BUNDLE_LEGAL_ACTUAL.documentos.map((doc) => ({ ...doc, estado: "PUBLICADO" })),
};
const SERVER_DATE = new Date("2026-11-23T18:00:00.000Z");

function harness(options: { rol?: string; active?: boolean; bundle?: BundleLegal; revoked?: boolean } = {}) {
  const records = new Map<string, Stored>();
  const writes: Array<{ path: string; data: Stored }> = [];
  const docRef = (collection: string, id: string) => {
    const path = `${collection}/${id}`;
    return {
      path,
      get: async () => snapshot(records.get(path)),
      collection: (child: string) => ({ doc: (childId: string) => docRef(`${path}/${child}`, childId) }),
    };
  };
  const db: any = {
    collection: (name: string) => ({ doc: (id: string) => docRef(name, id) }),
    runTransaction: async (work: (tx: any) => Promise<unknown>) => {
      const pending: Array<{ path: string; data: Stored }> = [];
      const result = await work({
        get: async (ref: { path: string }) => snapshot(records.get(ref.path)),
        create: (ref: { path: string }, data: Stored) => { pending.push({ path: ref.path, data }); },
      });
      for (const write of pending) {
        if (records.has(write.path)) throw new Error("ALREADY_EXISTS");
        records.set(write.path, write.data);
        writes.push(write);
      }
      return result;
    },
  };
  records.set("empresas/tenant-a", { estado: "trial", nombreComercial: "Empresa de prueba" });
  records.set("membresias/tenant-a_admin-a", {
    empresaId: "tenant-a", uid: "admin-a", rol: options.rol ?? "admin",
    estado: options.active === false ? "inactiva" : "activa", activo: options.active !== false,
  });
  const dependencies = {
    db,
    bundle: options.bundle ?? BUNDLE_LEGAL_ACTUAL,
    exigirTenant: async () => ({ id: "tenant-a", estado: "trial", rol: options.rol ?? "admin", permisos: [], paisFiscal: "CO" }) as any,
    getUser: async () => ({ disabled: false, ...(options.revoked ? { tokensValidAfterTime: "2026-11-23T18:00:00.000Z" } : {}) }),
    serverTimestamp: () => ({ toDate: () => SERVER_DATE }),
  } as any;
  return { records, writes, dependencies };
}

function snapshot(data: Stored | undefined) {
  return { exists: data !== undefined, data: () => data };
}

function request(data: Stored = {}, overrides: Stored = {}) {
  return {
    auth: { uid: "admin-a", token: { empresaId: "tenant-a", rol: "admin", auth_time: 1_700_000_000 } },
    data: { bundleId: READY_BUNDLE.id, aceptoTerminos: true, aceptoAnexo: true, declaroFacultad: true, correlationId: "legal-correlation-01", ...data },
    ...overrides,
  };
}

test("el bundle en borrador se muestra, pero no se presenta como aceptación exigible", async () => {
  const h = harness();
  const state = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(state.estado, "PREPARACION");
  assert.equal(state.requiereAceptacion, false);
  assert.equal(state.aceptado, false);
  assert.ok(state.documentos.every((doc) => doc.estado === "BORRADOR"));
  assert.equal(h.writes.length, 0);
});

test("impide registrar una aceptación mientras los documentos sigan en revisión", async () => {
  const h = harness();
  await assert.rejects(
    aceptarDocumentosLegalesTenant(request(), h.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition",
  );
  assert.equal(h.writes.length, 0);
});

test("aceptación contractual se registra una vez, con actor, tenant, bundle, hash y fecha servidor", async () => {
  const h = harness({ bundle: READY_BUNDLE });
  const result = await aceptarDocumentosLegalesTenant(request(), h.dependencies);
  const replay = await aceptarDocumentosLegalesTenant(request({ correlationId: "retry-correlation" }), h.dependencies);
  const write = h.writes[0];
  const saved = h.records.get(write.path)!;
  assert.equal(h.writes.length, 1);
  assert.equal(result.idempotente, false);
  assert.equal(replay.idempotente, true);
  assert.equal(result.aceptacionId, replay.aceptacionId);
  assert.equal(result.aceptadoEn, SERVER_DATE.toISOString());
  assert.equal(saved.empresaId, "tenant-a");
  assert.equal(saved.uid, "admin-a");
  assert.equal(saved.facultadRepresentacionDeclarada, true);
  assert.equal(saved.documentos.length, 2);
  assert.ok(saved.documentos.every((doc: Stored) => READY_BUNDLE.documentos.find((item) => item.id === doc.id)?.sha256 === doc.sha256));
  assert.equal("pin" in saved || "password" in saved || "token" in saved, false);
  assert.equal("autorizacionPersonal" in saved, false);
  const state = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(state.aceptado, true);
  assert.equal(state.aceptacionId, result.aceptacionId);
});

test("rechaza rol distinto de admin y membresía inactiva", async () => {
  const seller = harness({ rol: "vendedor", bundle: READY_BUNDLE });
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), seller.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
  const inactive = harness({ active: false, bundle: READY_BUNDLE });
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), inactive.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
});

test("rechaza el payload con autoridad o versiones enviadas por el cliente", async () => {
  const h = harness({ bundle: READY_BUNDLE });
  await assert.rejects(aceptarDocumentosLegalesTenant(request({ empresaId: "tenant-b" }), h.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument");
  await assert.rejects(aceptarDocumentosLegalesTenant(request({ sha256: "0".repeat(64) }), h.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument");
  await assert.rejects(aceptarDocumentosLegalesTenant(request({ declaroFacultad: false }), h.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument");
  assert.equal(h.writes.length, 0);
});

test("rechaza sesiones revocadas", async () => {
  const h = harness({ bundle: READY_BUNDLE, revoked: true });
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), h.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated");
  assert.equal(h.writes.length, 0);
});
