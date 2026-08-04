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

test("P1-01: el administrador puede registrar merma y el cajero no puede crear el documento de merma", async () => {
  const admin = await contextFor(fixtures.tenantA.admin);
  const cajero = await contextFor(fixtures.tenantA.cajero);
  const merma = "mermas/p1-01-merma";

  await expectAllowed(admin.firestore().doc(merma).set({ empresaId: "empresa-a", cantidad: 1 }));
  await expectDenied(cajero.firestore().doc("mermas/p1-01-merma-cajero").set({ empresaId: "empresa-a", cantidad: 1 }));
});

test("P1-01: un rol operativo puede anexar movimientos de inventario, pero el ledger queda append-only", async () => {
  const cajero = await contextFor(fixtures.tenantA.cajero);
  const marketing = await contextFor(fixtures.tenantA.marketing);
  const movimiento = "movimientos_inventario/p1-01-movimiento";

  await expectAllowed(cajero.firestore().doc(movimiento).set({ empresaId: "empresa-a", cantidad: 1 }));
  await expectDenied(marketing.firestore().doc("movimientos_inventario/p1-01-marketing").set({ empresaId: "empresa-a", cantidad: 1 }));
  await expectDenied(cajero.firestore().doc(movimiento).update({ cantidad: 2 }));
  await expectDenied(cajero.firestore().doc(movimiento).delete());
});

test("P1-01: el tenant ajeno no puede leer el kardex de otro tenant", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);
  const tenantB = await contextFor(fixtures.tenantB.admin);
  const movimiento = "movimientos_inventario/p1-01-aislamiento";

  await seedDocument(movimiento, { empresaId: "empresa-a", cantidad: 1 });
  await expectAllowed(tenantA.firestore().doc(movimiento).get());
  await expectDenied(tenantB.firestore().doc(movimiento).get());
});
