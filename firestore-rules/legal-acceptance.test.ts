import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { fixtures } from "./fixtures";
import { cleanupRulesTestEnvironment, clearRulesData, contextFor, expectDenied, rulesTestEnvironment, seedDocument } from "./test-helpers";

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

test("ADR-SAAS-102: el expediente y el indicador quedan bajo autoridad de servidor", async () => {
  await clearRulesData();
  const suffix = randomUUID();
  const path = `privacidad_reclamos/${suffix}`;
  const inquiryPath = `privacidad_consultas/${suffix}`;
  const customer = `clientes/${suffix}`;
  const privateAnnotation = `${customer}/anotaciones_privacidad/case-${suffix}`;
  await seedDocument(path, { empresaId: "empresa-a", motivo: "Sintético" });
  await seedDocument(inquiryPath, { empresaId: "empresa-a", estado: "ABIERTA" });
  await seedDocument(`${inquiryPath}/reasignaciones/evento`, { origenUid: "synthetic" });
  await seedDocument(customer, { empresaId: "empresa-a", reclamosPrivacidadAbiertos: 1 });
  await seedDocument(privateAnnotation, { empresaId: "empresa-a", clienteId: suffix, motivo: "Motivo privado sintético" });
  const admin = (await contextFor(fixtures.tenantA.admin)).firestore();
  const seller = (await contextFor(fixtures.tenantA.vendedor)).firestore();
  const otherTenant = (await contextFor(fixtures.tenantB.admin)).firestore();
  const anonymous = (await contextFor(fixtures.anonimo)).firestore();
  for (const db of [admin, seller, otherTenant, anonymous]) {
    await expectDenied(db.doc(path).get());
    await expectDenied(db.doc(path).update({ motivo: "alterado" }));
    await expectDenied(db.doc(inquiryPath).get());
    await expectDenied(db.doc(inquiryPath).set({ empresaId: "empresa-a" }));
    await expectDenied(db.doc(inquiryPath).delete());
    await expectDenied(db.collection("privacidad_consultas").get());
    await expectDenied(db.doc(`${inquiryPath}/reasignaciones/evento`).get());
    await expectDenied(db.doc(`${inquiryPath}/reasignaciones/evento`).delete());
  }
  await admin.doc(customer).update({ nombre: "Corrección sintética" });
  await expectDenied(admin.doc(customer).update({ reclamosPrivacidadAbiertos: 0 }));
  await expectDenied(admin.doc(customer).delete());
  await expectDenied(admin.doc(privateAnnotation).get());
  await expectDenied(admin.doc(privateAnnotation).set({ motivo: "Intento de escritura" }));
  await expectDenied(admin.doc(`clientes/nuevo-${suffix}`).set({
    empresaId: "empresa-a", reclamosPrivacidadAbiertos: 1,
  }));
});
