import { after, before, beforeEach, describe, test } from "node:test";
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

const availabilityPath = "empresas/empresa-a/bodega_senales/disponibilidad";
const adminRequestsPath = "empresas/empresa-a/bodega_senales/solicitudes_admin";
const sellerSignalPath = "empresas/empresa-a/bodega_senales_vendedor/tenant-a-vendedor";

describe("señales Bodega", () => {
  before(async () => { await rulesTestEnvironment(); });
  beforeEach(async () => {
    await clearRulesData();
    await seedDocument("configuraciones/empresa-a", { empresaId: "empresa-a", vertical: "BODEGA_MVP1" });
    await seedDocument("configuraciones/empresa-b", { empresaId: "empresa-b", vertical: "BODEGA_MVP1" });
    await seedDocument("membresias/empresa-a_tenant-a-vendedor", {
      empresaId: "empresa-a", uid: "tenant-a-vendedor", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true,
    });
    await seedDocument("membresias/empresa-a_tenant-a-admin", {
      empresaId: "empresa-a", uid: "tenant-a-admin", rol: "admin", permisos: ["sell"], estado: "activa", activo: true,
    });
    await seedDocument("membresias/empresa-b_tenant-b-vendedor", {
      empresaId: "empresa-b", uid: "tenant-b-vendedor", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true,
    });
    await seedDocument(availabilityPath, { empresaId: "empresa-a", version: 1, actualizadoEn: new Date() });
    await seedDocument(adminRequestsPath, { empresaId: "empresa-a", version: 1, actualizadoEn: new Date() });
    await seedDocument(sellerSignalPath, { empresaId: "empresa-a", uid: "tenant-a-vendedor", version: 1, actualizadoEn: new Date() });
  });
  after(async () => { await cleanupRulesTestEnvironment(); });

  test("vendedor y admin leen únicamente su canal permitido", async () => {
    const seller = await contextFor(fixtures.tenantA.vendedor);
    const admin = await contextFor(fixtures.tenantA.admin);

    await expectAllowed(seller.firestore().doc(availabilityPath).get());
    await expectDenied(seller.firestore().doc(adminRequestsPath).get());
    await expectAllowed(admin.firestore().doc(adminRequestsPath).get());
    await expectDenied(admin.firestore().doc(availabilityPath).get());
    await expectDenied(seller.firestore().doc(sellerSignalPath).set({ version: 99 }));
  });

  test("señal propia del vendedor solo se consulta con uid propio y membresía vigente", async () => {
    const seller = await contextFor(fixtures.tenantA.vendedor);
    const otherSeller = await contextFor(fixtures.tenantB.vendedor);

    await expectAllowed(seller.firestore().doc(sellerSignalPath).get());
    await expectDenied(otherSeller.firestore().doc(sellerSignalPath).get());
    await expectDenied(seller.firestore().collection("empresas/empresa-a/bodega_senales_vendedor").get());
    await expectDenied(seller.firestore().doc("empresas/empresa-a/bodega_senales_vendedor/signal-a")
      .update({ version: 2 }));

    await seedDocument("membresias/empresa-a_tenant-a-vendedor", {
      empresaId: "empresa-a", uid: "tenant-a-vendedor", rol: "vendedor", permisos: ["sell"], estado: "inactiva", activo: false,
    });
    await expectDenied(seller.firestore().doc(sellerSignalPath).get());
  });

  test("vendedor puede suscribirse a su señal aunque todavía no exista", async () => {
    const seller = await contextFor(fixtures.tenantA.vendedor);
    await (await rulesTestEnvironment()).withSecurityRulesDisabled(context => context.firestore().doc(sellerSignalPath).delete());
    await expectAllowed(seller.firestore().doc(sellerSignalPath).get());
  });
});
