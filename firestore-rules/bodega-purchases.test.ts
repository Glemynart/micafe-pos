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

test("ADR-085: GENERAL conserva su control efectivo y Bodega permanece callable-only", async () => {
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
    estado: "ACTIVA",
    revision: 1,
  });
  await expectAllowed(adminLegacy.firestore().doc("compras/legacy-control-activo").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
  await seedDocument(compraExistente, { empresaId: "empresa-b", total: 2400 });
  await expectAllowed(adminLegacy.firestore().doc(compraExistente).delete());

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

  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b" });
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: 3,
  });
  await expectAllowed(adminLegacy.firestore().doc("compras/legacy-sin-vertical-con-control-activo").set({
    empresaId: "empresa-b",
    total: 2400,
  }));

  const adminBodega = await contextFor(fixtures.tenantA.admin);
  await seedDocument("configuraciones/empresa-a", {
    empresaId: "empresa-a",
    vertical: "BODEGA_MVP1",
  });
  await expectDenied(adminBodega.firestore().doc("compras/bodega-sin-control").set({
    empresaId: "empresa-a",
    total: 1200,
  }));
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
  await expectDenied(adminBodega.firestore().doc("controles_release_compras/empresa-a").update({ estado: "PAUSADA" }));
});

test("ADR-085: vertical o configuración no verificables no habilitan compra directa", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await expectDenied(adminLegacy.firestore().doc("compras/config-sin-configuracion").set({ empresaId: "empresa-b", total: 2400 }));
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: 1,
  });
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-a", vertical: "GENERAL" });
  await expectDenied(adminLegacy.firestore().doc("compras/config-tenant-cruzado").set({ empresaId: "empresa-b", total: 2400 }));
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "VERTICAL_DESCONOCIDO" });
  await expectDenied(adminLegacy.firestore().doc("compras/control-de-otro-tenant").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
});

test("ADR-085: la ruta legacy de GENERAL consulta el control y el cliente no puede modificarlo", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "GENERAL" });
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "ACTIVA",
    revision: 7,
  });

  await expectAllowed(adminLegacy.firestore().doc("compras/legacy-directa-activa").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
  await seedDocument("controles_release_compras/empresa-b", {
    schemaVersion: 1,
    empresaId: "empresa-b",
    estado: "PAUSADA",
    revision: 8,
  });
  await expectDenied(adminLegacy.firestore().doc("compras/legacy-directa-pausada").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
  await expectDenied(adminLegacy.firestore().doc("controles_release_compras/empresa-b").update({
    estado: "ACTIVA",
    revision: 9,
  }));
});
