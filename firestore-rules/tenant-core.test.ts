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

const COLECCIONES_OPERATIVAS = [
  "espacios",
  "categorias",
  "productos",
  "insumos",
  "recetas",
  "mesas",
  "pedidos_activos",
  "comandas_cocina",
  "ventas",
  "turnos",
  "turnos_activos",
  "reservas",
  "agendas",
  "compras",
  "proveedores",
  "mermas",
  "egresos",
  "clientes",
  "cuentas_bancarias",
  "transacciones_financieras",
  "liquidaciones",
  "consignadores",
  "movimientos_inventario",
  "auditoria_logs",
  "modificador_grupos",
  "producto_modificador_grupos",
] as const;

before(async () => {
  await rulesTestEnvironment();
});

beforeEach(async () => {
  await clearRulesData();
});

after(async () => {
  await cleanupRulesTestEnvironment();
});

test("núcleo tenant-aware: las colecciones permiten leer solo el tenant propio", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);
  const tenantB = await contextFor(fixtures.tenantB.admin);

  for (const collection of COLECCIONES_OPERATIVAS) {
    const path = `${collection}/doc-empresa-a`;
    await seedDocument(path, { empresaId: "empresa-a", marcador: collection });

    await expectAllowed(tenantA.firestore().doc(path).get());
    await expectDenied(tenantB.firestore().doc(path).get());
  }
});

test("núcleo tenant-aware: creación exige el empresaId del claim", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);

  await expectAllowed(
    tenantA.firestore().doc("productos/creacion-correcta").set({ empresaId: "empresa-a" })
  );
  await expectDenied(
    tenantA.firestore().doc("ventas/creacion-otro-tenant").set({ empresaId: "empresa-b" })
  );
});

test("núcleo tenant-aware: actualización conserva el empresaId", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);
  const path = "turnos/actualizacion-empresa-a";
  await seedDocument(path, { empresaId: "empresa-a", estado: "abierto" });

  await expectAllowed(tenantA.firestore().doc(path).update({ estado: "cerrado" }));
  await expectDenied(tenantA.firestore().doc(path).update({ empresaId: "empresa-b" }));
});

test("núcleo tenant-aware: eliminación se limita al tenant propietario", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);
  await seedDocument("modificador_grupos/eliminar-propio", { empresaId: "empresa-a" });
  await seedDocument("producto_modificador_grupos/eliminar-ajeno", { empresaId: "empresa-b" });

  await expectAllowed(tenantA.firestore().doc("modificador_grupos/eliminar-propio").delete());
  await expectDenied(
    tenantA.firestore().doc("producto_modificador_grupos/eliminar-ajeno").delete()
  );
});

test("R1-A: command receipts, idempotency index, and critical audit are backend-only", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);
  const coleccionesBackendOnly = [
    "operaciones_comandos",
    "operaciones_command_idempotency",
    "operaciones_auditoria",
  ];

  for (const collection of coleccionesBackendOnly) {
    const existente = `${collection}/existente`;
    const nuevo = `${collection}/nuevo`;
    await seedDocument(existente, { empresaId: "empresa-a" });

    await expectDenied(tenantA.firestore().doc(existente).get());
    await expectDenied(tenantA.firestore().doc(nuevo).set({ empresaId: "empresa-a" }));
    await expectDenied(tenantA.firestore().doc(existente).update({ marcador: "cliente" }));
    await expectDenied(tenantA.firestore().doc(existente).delete());
  }
});

test("P1-03: el catalogo de proveedores solo se escribe mediante callable backend", async () => {
  const tenantA = await contextFor(fixtures.tenantA.admin);
  const tenantB = await contextFor(fixtures.tenantB.admin);
  const path = "proveedores/backend-only";
  const pathTenantB = "proveedores/backend-only-b";
  await seedDocument(path, { empresaId: "empresa-a", nombre: "Proveedor", estado: "ACTIVO" });
  await seedDocument(pathTenantB, { empresaId: "empresa-b", nombre: "Proveedor", estado: "ACTIVO" });

  await expectAllowed(tenantA.firestore().doc(path).get());
  await expectDenied(tenantA.firestore().doc(pathTenantB).get());
  await expectAllowed(tenantB.firestore().doc(pathTenantB).get());
  await expectDenied(tenantA.firestore().doc("proveedores/directo").set({ empresaId: "empresa-a", nombre: "No permitido", estado: "ACTIVO" }));
  await expectDenied(tenantA.firestore().doc(path).update({ estado: "INACTIVO" }));
  await expectDenied(tenantA.firestore().doc(path).delete());
});
