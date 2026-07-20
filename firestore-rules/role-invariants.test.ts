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

test("roles: el tenant correcto no basta para mutar catálogos", async () => {
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const cocineroTenantA = await contextFor(fixtures.tenantA.cocinero);
  const adminTenantB = await contextFor(fixtures.tenantB.admin);
  const path = "productos/catalogo-tenant-a";
  await seedDocument(path, { empresaId: "empresa-a", nombre: "Café" });

  await expectAllowed(cajeroTenantA.firestore().doc(path).update({ nombre: "Café negro" }));
  await expectDenied(cocineroTenantA.firestore().doc(path).update({ nombre: "No permitido" }));
  await expectDenied(adminTenantB.firestore().doc(path).update({ nombre: "Otro tenant" }));
});

test("roles: cocina puede leer comandas, pero no crearlas", async () => {
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const cocineroTenantA = await contextFor(fixtures.tenantA.cocinero);
  const path = "comandas_cocina/comanda-tenant-a";
  await seedDocument(path, { empresaId: "empresa-a", estado: "pendiente" });

  await expectAllowed(cocineroTenantA.firestore().doc(path).get());
  await expectDenied(
    cocineroTenantA.firestore().doc("comandas_cocina/nueva-cocina").set({ empresaId: "empresa-a" })
  );
  await expectAllowed(
    cajeroTenantA.firestore().doc("comandas_cocina/nueva-cajero").set({ empresaId: "empresa-a" })
  );
});

test("roles: superadmin no obtiene acceso implícito a un tenant", async () => {
  const superadmin = await contextFor(fixtures.superadmin);
  await seedDocument("ventas/venta-tenant-a", { empresaId: "empresa-a", estado: "pagada" });

  await expectDenied(superadmin.firestore().doc("ventas/venta-tenant-a").get());
});

test("roles: una actualización no puede convertir un recurso de otro tenant", async () => {
  const adminTenantA = await contextFor(fixtures.tenantA.admin);
  const path = "espacios/espacio-tenant-b";
  await seedDocument(path, { empresaId: "empresa-b", nombre: "Espacio B" });

  await expectDenied(
    adminTenantA.firestore().doc(path).update({ empresaId: "empresa-a", nombre: "Intento de captura" })
  );
});

test("invariantes: auditoría y movimientos son append-only", async () => {
  const adminTenantA = await contextFor(fixtures.tenantA.admin);
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const auditoriaPath = "auditoria_logs/evento-propio";
  const movimientoPath = "movimientos_inventario/movimiento-1";

  await expectAllowed(
    cajeroTenantA.firestore().doc(auditoriaPath).set({
      empresaId: "empresa-a",
      uid: fixtures.tenantA.cajero.uid,
    })
  );
  await expectDenied(
    cajeroTenantA.firestore().doc("auditoria_logs/evento-ajeno").set({
      empresaId: "empresa-a",
      uid: fixtures.tenantA.admin.uid,
    })
  );
  await expectAllowed(
    cajeroTenantA.firestore().doc(movimientoPath).set({ empresaId: "empresa-a", cantidad: 1 })
  );
  await expectAllowed(adminTenantA.firestore().doc(auditoriaPath).get());
  await expectDenied(cajeroTenantA.firestore().doc(auditoriaPath).delete());
  await expectDenied(cajeroTenantA.firestore().doc(movimientoPath).update({ cantidad: 2 }));
});

test("invariantes: un operativo solo actualiza el saldo bancario", async () => {
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const path = "cuentas_bancarias/caja-principal";
  await seedDocument(path, { empresaId: "empresa-a", saldo: 100, nombre: "Caja principal" });

  await expectAllowed(cajeroTenantA.firestore().doc(path).update({ saldo: 150 }));
  await expectDenied(cajeroTenantA.firestore().doc(path).update({ nombre: "Cuenta alterada" }));
});
