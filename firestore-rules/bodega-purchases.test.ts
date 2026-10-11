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

test("ADR-072: otro vertical conserva la creación y eliminación legacy de compras", async () => {
  const adminLegacy = await contextFor(fixtures.tenantB.admin);
  const compraExistente = "compras/legacy-existente";
  await seedDocument("configuraciones/empresa-b", {
    empresaId: "empresa-b",
    vertical: "GENERAL",
  });
  await seedDocument(compraExistente, { empresaId: "empresa-b", total: 2400 });

  await expectAllowed(adminLegacy.firestore().doc("compras/legacy-directa").set({
    empresaId: "empresa-b",
    total: 2400,
  }));
  await expectAllowed(adminLegacy.firestore().doc(compraExistente).delete());
});
