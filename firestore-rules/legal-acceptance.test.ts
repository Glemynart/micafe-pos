import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { fixtures } from "./fixtures";
import { cleanupRulesTestEnvironment, contextFor, expectDenied, rulesTestEnvironment, seedDocument } from "./test-helpers";

before(async () => { await rulesTestEnvironment(); });
after(async () => { await cleanupRulesTestEnvironment(); });

test("ADR-SAAS-099: el recibo legal es inaccesible directamente desde clientes", async () => {
  const suffix = randomUUID();
  const path = `empresas/empresa-a/aceptacionesLegales/${suffix}`;
  await seedDocument(path, { empresaId: "empresa-a", uid: fixtures.tenantA.admin.uid, bundleId: "bundle-sintetico" });
  const admin = await contextFor(fixtures.tenantA.admin);
  const seller = await contextFor(fixtures.tenantA.vendedor);
  const otherTenant = await contextFor(fixtures.tenantB.admin);
  const anonymous = await contextFor(fixtures.anonimo);
  for (const db of [admin.firestore(), seller.firestore(), otherTenant.firestore(), anonymous.firestore()]) {
    await expectDenied(db.doc(path).get());
    await expectDenied(db.doc(path).set({ empresaId: "empresa-a", bundleId: "alterado" }));
    await expectDenied(db.doc(path).delete());
    await expectDenied(db.collection("empresas/empresa-a/aceptacionesLegales").get());
  }
});
