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
const SNAPSHOT_CONTRATO = {
  schemaVersion: 1,
  planId: "mvp_comercial",
  planVersion: 2,
  codigoPlan: "MVP_COMERCIAL",
  periodicidad: "ANUAL" as const,
  precio: { importe: 1800000, moneda: "COP" },
  capacidades: ["sell", "inventory"],
  limites: {},
  sedeConceptual: { cantidad: 1 as const },
  fiscalidad: null,
  vigencia: { inicio: "2026-11-23", fin: "2027-11-23" },
};
const REFERENCIA_CONTRATO = "suscripcion:r1";

function harness(options: { rol?: string; active?: boolean; bundle?: BundleLegal; revoked?: boolean } = {}) {
  const records = new Map<string, Stored>();
  const writes: Array<{ path: string; data: Stored }> = [];
  const docRef = (collection: string, id: string) => {
    const path = `${collection}/${id}`;
    return {
      path,
      get: async () => snapshot(records.get(path)),
      collection: (child: string) => ({
        doc: (childId: string) => docRef(`${path}/${child}`, childId),
        limit: (limit: number) => ({ get: async () => ({ docs: [...records.entries()]
          .filter(([key]) => key.startsWith(`${path}/${child}/`) && !key.slice(`${path}/${child}/`.length).includes("/"))
          .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)
          .map(([key, value]) => ({ id: key.split("/").at(-1), data: () => value })) }) }),
      }),
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
  records.set("suscripciones/tenant-a", { empresaId: "tenant-a", revision: 1, snapshotContrato: SNAPSHOT_CONTRATO });
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
    data: { bundleId: READY_BUNDLE.id, aceptoTerminos: true, aceptoAnexo: true, declaroFacultad: true, correlationId: "legal-correlation-01", referenciaContrato: REFERENCIA_CONTRATO, ...data },
    ...overrides,
  };
}

test("el bundle en borrador se muestra, pero no se presenta como aceptación exigible", async () => {
  const h = harness();
  const state = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(state.estado, "PREPARACION");
  assert.equal(state.requiereAceptacion, false);
  assert.equal(state.aceptado, false);
  assert.equal(state.condicionesComerciales?.precio.importe, 1800000);
  assert.equal(state.condicionesComerciales?.trialDias, null);
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
  assert.equal(saved.referenciaContrato, REFERENCIA_CONTRATO);
  assert.equal(saved.condicionesComerciales.precio.importe, 1800000);
  assert.match(saved.sha256CondicionesComerciales, /^[a-f0-9]{64}$/);
  assert.equal(saved.documentos.length, 2);
  assert.ok(saved.documentos.every((doc: Stored) => READY_BUNDLE.documentos.find((item) => item.id === doc.id)?.sha256 === doc.sha256));
  assert.equal("pin" in saved || "password" in saved || "token" in saved, false);
  assert.equal("autorizacionPersonal" in saved, false);
  const state = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(state.aceptado, true);
  assert.equal(state.aceptacionId, result.aceptacionId);
  assert.equal(state.documentosAceptados?.length, 2);
  assert.equal(state.sha256CondicionesComerciales, saved.sha256CondicionesComerciales);
  assert.equal(state.historial.length, 1);
  assert.equal(state.historial[0].uid, "admin-a");
  assert.equal(state.historial[0].aceptacionId, result.aceptacionId);
  assert.equal(state.historialLimitado, false);
});

test("rechaza rol distinto de admin y membresía inactiva", async () => {
  const seller = harness({ rol: "vendedor", bundle: READY_BUNDLE });
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), seller.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
  const inactive = harness({ active: false, bundle: READY_BUNDLE });
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), inactive.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
  for (const rol of ["marketing", "saas_operador"]) {
    const nonAdmin = harness({ bundle: READY_BUNDLE });
    const auth = request().auth!;
    await assert.rejects(
      aceptarDocumentosLegalesTenant(request({}, { auth: { ...auth, token: { ...auth.token, rol } } }), nonAdmin.dependencies),
      (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
    );
    assert.equal(nonAdmin.writes.length, 0);
  }
  const mismatch = harness({ bundle: READY_BUNDLE });
  const adminAuth = request().auth!;
  await assert.rejects(
    aceptarDocumentosLegalesTenant(request({}, { auth: { ...adminAuth, token: { ...adminAuth.token, empresaId: "tenant-b" } } }), mismatch.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
  const operatorWithoutMembership = harness({ bundle: READY_BUNDLE });
  await assert.rejects(
    aceptarDocumentosLegalesTenant(request({}, { auth: { uid: "operator-a", token: { empresaId: "tenant-a", rol: "admin", auth_time: 1_700_000_000 } } }), operatorWithoutMembership.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
  assert.equal(operatorWithoutMembership.writes.length, 0);
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

test("no permite aceptar sin snapshot contractual ni con una referencia desactualizada", async () => {
  const missing = harness({ bundle: READY_BUNDLE });
  missing.records.delete("suscripciones/tenant-a");
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), missing.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition");
  assert.equal(missing.writes.length, 0);

  const stale = harness({ bundle: READY_BUNDLE });
  stale.records.set("suscripciones/tenant-a", { empresaId: "tenant-a", revision: 2, snapshotContrato: SNAPSHOT_CONTRATO });
  await assert.rejects(aceptarDocumentosLegalesTenant(request(), stale.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition");
  assert.equal(stale.writes.length, 0);
});

test("usa la relación contractual vigente por encima del snapshot raíz histórico", async () => {
  const h = harness({ bundle: READY_BUNDLE });
  const snapshotActual = { ...SNAPSHOT_CONTRATO, precio: { importe: 1900000, moneda: "COP" } };
  h.records.set("suscripciones/tenant-a/relaciones/_vigente", { relacionVigenteId: "contrato-actual" });
  h.records.set("suscripciones/tenant-a/relaciones/contrato-actual", {
    relacionId: "contrato-actual", empresaId: "tenant-a", schemaVersion: 1, revision: 4, snapshotContrato: snapshotActual,
  });

  const state = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(state.condicionesComerciales?.precio.importe, 1900000);
  assert.equal(state.condicionesComerciales?.referenciaContrato, "relacion:contrato-actual");

  await assert.rejects(aceptarDocumentosLegalesTenant(request(), h.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition");
  const accepted = await aceptarDocumentosLegalesTenant(request({ referenciaContrato: "relacion:contrato-actual" }), h.dependencies);
  assert.equal(accepted.idempotente, false);
  assert.equal(h.writes.length, 1);
});


test("una relación contractual nueva exige una aceptación y un recibo nuevos", async () => {
  const h = harness({ bundle: READY_BUNDLE });
  const first = await aceptarDocumentosLegalesTenant(request(), h.dependencies);
  const renewedReference = "relacion:contrato-renovado";
  h.records.set("suscripciones/tenant-a/relaciones/_vigente", { relacionVigenteId: "contrato-renovado" });
  h.records.set("suscripciones/tenant-a/relaciones/contrato-renovado", {
    relacionId: "contrato-renovado", empresaId: "tenant-a", schemaVersion: 1, revision: 2,
    snapshotContrato: { ...SNAPSHOT_CONTRATO, precio: { importe: 1900000, moneda: "COP" } },
  });

  const state = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(state.aceptado, false);
  assert.equal(state.requiereAceptacion, true);
  const renewed = await aceptarDocumentosLegalesTenant(request({ referenciaContrato: renewedReference }), h.dependencies);
  assert.notEqual(renewed.aceptacionId, first.aceptacionId);
  assert.equal(h.writes.length, 2);
  h.records.set("empresas/tenant-b/aceptacionesLegales/foreign", { empresaId: "tenant-b", uid: "foreign-user" });
  const history = await consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies);
  assert.equal(history.historial.length, 2);
  assert.ok(history.historial.every((entry: { uid: string }) => entry.uid === "admin-a"));
});

test("rechaza reutilizar un recibo si cambió el snapshot bajo la misma referencia", async () => {
  const h = harness({ bundle: READY_BUNDLE });
  h.records.set("suscripciones/tenant-a/relaciones/_vigente", { relacionVigenteId: "contrato-actual" });
  h.records.set("suscripciones/tenant-a/relaciones/contrato-actual", {
    relacionId: "contrato-actual", empresaId: "tenant-a", schemaVersion: 1, revision: 4,
    snapshotContrato: SNAPSHOT_CONTRATO,
  });
  const reference = "relacion:contrato-actual";
  await aceptarDocumentosLegalesTenant(request({ referenciaContrato: reference }), h.dependencies);
  h.records.set("suscripciones/tenant-a/relaciones/contrato-actual", {
    relacionId: "contrato-actual", empresaId: "tenant-a", schemaVersion: 1, revision: 4,
    snapshotContrato: { ...SNAPSHOT_CONTRATO, precio: { importe: 2000000, moneda: "COP" } },
  });
  await assert.rejects(
    consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "data-loss",
  );
});

test("rechaza un recibo alterado aunque conserve la huella original", async () => {
  const h = harness({ bundle: READY_BUNDLE });
  await aceptarDocumentosLegalesTenant(request(), h.dependencies);
  const path = h.writes[0].path;
  const receipt = h.records.get(path)!;
  h.records.set(path, {
    ...receipt,
    condicionesComerciales: { ...receipt.condicionesComerciales, precio: { importe: 1, moneda: "COP" } },
  });

  await assert.rejects(
    consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "data-loss",
  );
});

test("rechaza recibos sin identidad o fecha verificable en consulta y reintento", async () => {
  for (const cambio of [{ aceptacionId: "otro" }, { aceptadoEn: null }, { aceptadoEn: { toDate: () => new Date("invalid") } }]) {
    const h = harness({ bundle: READY_BUNDLE });
    await aceptarDocumentosLegalesTenant(request(), h.dependencies);
    const path = h.writes[0].path;
    h.records.set(path, { ...h.records.get(path), ...cambio });
    const isDataLoss = (error: unknown) => error instanceof HttpsError && error.code === "data-loss";
    await assert.rejects(consultarEstadoLegalTenant(request(undefined as never, { data: undefined }), h.dependencies), isDataLoss);
    await assert.rejects(aceptarDocumentosLegalesTenant(request(), h.dependencies), isDataLoss);
    assert.equal(h.writes.length, 1);
  }
});
