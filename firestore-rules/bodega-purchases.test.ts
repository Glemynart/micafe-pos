import { after, before, beforeEach, test } from "node:test";
import { fixtures } from "./fixtures";
import {
  cleanupRulesTestEnvironment,
  clearRulesData,
  contextFor,
  expectAllowed,
  expectDenied,
  rulesTestEnvironment,
  seedDocument,
  seedInt64Document,
} from "./test-helpers";

before(async () => {
  await rulesTestEnvironment();
});

beforeEach(async () => {
  await clearRulesData();
});

after(async () => {
  await cleanupRulesTestEnvironment();
});

test("ADR-072: Bodega admin conserva lectura tenant-aware pero no escribe compras directas", async () => {
  const adminBodega = await contextFor(fixtures.tenantA.admin);
  const compraExistente = "compras/bodega-existente";
  await seedDocument("configuraciones/empresa-a", {
    empresaId: "empresa-a",
    vertical: "BODEGA_MVP1",
  });
  await seedDocument(compraExistente, { empresaId: "empresa-a", total: 1200 });

  await expectAllowed(adminBodega.firestore().doc(compraExistente).get());
  await expectDenied(adminBodega.firestore().doc("compras/bodega-directa").set({
    empresaId: "empresa-a",
    total: 1200,
  }));
  await expectDenied(adminBodega.firestore().doc(compraExistente).delete());
});

test("ADR-081: compras legacy fallan cerrado sin control activo y Bodega sigue callable-only", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  const compraExistente = "compras/legacy-existente";
  await seedDocument("configuraciones/empresa-b", {
    empresaId: "empresa-b",
    vertical: "GENERAL",
  });

  await expectDenied(adminLegacy.firestore().doc("compras/legacy-sin-control").set({
    empresaId: "empresa-b",
    total: 2400,
  }));

  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "PAUSADA",
    revision: 2,
  });
  await expectDenied(adminLegacy.firestore().doc("compras/legacy-control-pausado").set({
    empresaId: "empresa-b",
    total: 2400,
  }));

  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: 0,
  });
  await expectDenied(adminLegacy.firestore().doc("compras/legacy-control-revision-cero").set({
    empresaId: "empresa-b",
    total: 2400,
  }));

  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: 1,
  });
  await seedDocument(compraExistente, { empresaId: "empresa-b", total: 2400 });

  await expectAllowed(adminLegacy.firestore().doc("compras/legacy-directa").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
  await expectAllowed(adminLegacy.firestore().doc(compraExistente).delete());

  const adminBodega = await contextFor(fixtures.tenantA.admin);
  await seedDocument("configuraciones/empresa-a", {
    empresaId: "empresa-a",
    vertical: "BODEGA_MVP1",
  });
  await seedDocument("controles_release_compras/empresa-a", {
    schemaVersion: 1,
    empresaId: "empresa-a",
    estado: "ACTIVA",
    revision: 1,
  });
  await expectDenied(adminBodega.firestore().doc("compras/bodega-aun-requiere-callable").set({
    empresaId: "empresa-a",
    total: 1200,
  }));
});

test("ADR-081: el control de otro tenant no habilita compras legacy", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await seedDocument("configuraciones/empresa-b", {
    empresaId: "empresa-b",
    vertical: "GENERAL",
  });
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-a",
    estado: "ACTIVA",
    revision: 1,
  });

  await expectDenied(adminLegacy.firestore().doc("compras/control-de-otro-tenant").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
});

test("ADR-081: la pausa canónica niega bypass directo y el cliente no puede modificarla", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "GENERAL" });
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "PAUSADA",
    revision: 7,
  });

  await expectDenied(adminLegacy.firestore().doc("compras/legacy-directa-pausada").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
  await expectDenied(adminLegacy.firestore().doc("controles_release_compras/empresa-b").update({
    estado: "ACTIVA",
    revision: 8,
  }));
});

test("ADR-081: una versión ausente o desconocida del control no habilita escrituras legacy", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "GENERAL" });

  for (const [suffix, schemaVersion] of [["sin-version", undefined], ["desconocida", 2]] as const) {
    await seedDocument(`controles_release_compras/empresa-b`, {
      ...(schemaVersion === undefined ? {} : { schemaVersion }),
      empresaId: "empresa-b",
      estado: "ACTIVA",
      revision: 1,
    });

    await expectDenied(adminLegacy.firestore().doc(`compras/control-${suffix}`).set({
      empresaId: "empresa-b",
      total: 2400,
    }));
  }
});

test("ADR-081: una revisión fuera del rango entero seguro no habilita escrituras legacy", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "GENERAL" });
  await seedInt64Document("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: BigInt("9007199254740992"),
  });

  await expectDenied(adminLegacy.firestore().doc("compras/control-revision-insegura").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
});

test("ADR-081: la revisión máxima segura sigue siendo válida para compras legacy", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "GENERAL" });
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: Number.MAX_SAFE_INTEGER,
  });

  await expectAllowed(adminLegacy.firestore().doc("compras/control-revision-maxima-segura").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
});
