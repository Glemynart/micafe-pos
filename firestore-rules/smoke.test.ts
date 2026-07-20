import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fixtures } from "./fixtures";
import {
  cleanupRulesTestEnvironment,
  clearRulesData,
  contextFor,
  expectAllowed,
  expectDenied,
  rulesTestEnvironment,
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

test("smoke: una solicitud anónima usa las Rules locales del Emulator", async () => {
  const anonimo = await contextFor(fixtures.anonimo);

  // Las Rules actuales mantienen eventos como lectura pública. Este caso fija
  // únicamente que el runner carga firestore.rules; no adelanta MT-U4.
  await expectAllowed(anonimo.firestore().doc("eventos/smoke-publico").get());
});

test("smoke: una denegación de las Rules actuales se observa desde el runner", async () => {
  const anonimo = await contextFor(fixtures.anonimo);

  await expectDenied(
    anonimo.firestore().doc("productos/smoke-anonimo").set({ nombre: "No permitido" })
  );
});

test("smoke: los fixtures autenticados crean contextos aislados por token", async () => {
  const adminTenantA = await contextFor(fixtures.tenantA.admin);
  const adminTenantB = await contextFor(fixtures.tenantB.admin);
  const superadmin = await contextFor(fixtures.superadmin);

  assert.notEqual(adminTenantA, adminTenantB);
  assert.notEqual(adminTenantA, superadmin);
});
