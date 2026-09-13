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

test("roles: el catálogo solo puede mutarse mediante callable backend", async () => {
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const cocineroTenantA = await contextFor(fixtures.tenantA.cocinero);
  const adminTenantB = await contextFor(fixtures.tenantB.admin);
  const path = "productos/catalogo-tenant-a";
  await seedDocument(path, { empresaId: "empresa-a", nombre: "Café" });

  await expectDenied(cajeroTenantA.firestore().doc(path).update({ nombre: "Café negro" }));
  await expectDenied(cocineroTenantA.firestore().doc(path).update({ nombre: "No permitido" }));
  await expectDenied(adminTenantB.firestore().doc(path).update({ nombre: "Otro tenant" }));
});

test("roles: cocina puede leer comandas, pero ningún cliente puede escribirlas", async () => {
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const cocineroTenantA = await contextFor(fixtures.tenantA.cocinero);
  const path = "comandas_cocina/comanda-tenant-a";
  await seedDocument(path, { empresaId: "empresa-a", estado: "pendiente" });

  await expectAllowed(cocineroTenantA.firestore().doc(path).get());
  await expectDenied(cocineroTenantA.firestore().doc("comandas_cocina/nueva-cocina").set({ empresaId: "empresa-a" }));
  await expectDenied(cajeroTenantA.firestore().doc("comandas_cocina/nueva-cajero").set({ empresaId: "empresa-a" }));
  await expectDenied(cajeroTenantA.firestore().doc(path).update({ estado: "listo" }));
});

test("salón: las escrituras directas de pedidos quedan denegadas para todos los roles", async () => {
  const adminTenantA = await contextFor(fixtures.tenantA.admin);
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const path = "pedidos_activos/pedido-tenant-a";
  await seedDocument(path, { empresaId: "empresa-a", estado: "abierto", activo: true });
  await expectAllowed(cajeroTenantA.firestore().doc(path).get());
  await expectDenied(adminTenantA.firestore().doc(path).set({ empresaId: "empresa-a", estado: "abierto", activo: true }));
  await expectDenied(cajeroTenantA.firestore().doc(path).update({ estado: "pagado" }));
  await expectDenied(cajeroTenantA.firestore().doc(path).delete());
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
  await expectDenied(
    cajeroTenantA.firestore().doc(movimientoPath).set({ empresaId: "empresa-a", cantidad: 1 })
  );
  await expectAllowed(adminTenantA.firestore().doc(auditoriaPath).get());
  await expectDenied(cajeroTenantA.firestore().doc(auditoriaPath).delete());
  await expectDenied(cajeroTenantA.firestore().doc(movimientoPath).update({ cantidad: 2 }));
});

test("R1-B.1: el cliente no puede alterar saldos ni anular una venta", async () => {
  const cajeroTenantA = await contextFor(fixtures.tenantA.cajero);
  const adminTenantA = await contextFor(fixtures.tenantA.admin);
  const path = "cuentas_bancarias/caja-principal";
  await seedDocument(path, { empresaId: "empresa-a", saldo: 100, nombre: "Caja principal" });
  await seedDocument("ventas/venta-pendiente", {
    empresaId: "empresa-a", estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS", snapshotFiscal: { id: "fiscal" }, consecutivo: 1,
  });

  await expectDenied(cajeroTenantA.firestore().doc(path).update({ saldo: 150 }));
  await expectDenied(cajeroTenantA.firestore().doc(path).update({ nombre: "Cuenta alterada" }));
  await expectDenied(cajeroTenantA.firestore().doc("ventas/venta-pendiente").update({
    estadoOperativo: "COMPLETO",
  }));
  await expectDenied(cajeroTenantA.firestore().doc("ventas/venta-pendiente").update({ estado: "anulada", estadoOperativo: "ANULADA_SIN_EFECTOS" }));
  await expectDenied(adminTenantA.firestore().doc("ventas/venta-pendiente").update({ estado: "anulada", estadoOperativo: "ANULADA_SIN_EFECTOS" }));
});

test("Bodega: vendedor no salta DTO por Firestore y solo lee su turno", async () => {
  const vendedorA = await contextFor(fixtures.tenantA.vendedor);
  const vendedorB = await contextFor(fixtures.tenantB.vendedor);
  const adminA = await contextFor(fixtures.tenantA.admin);
  await seedDocument("productos/bodega-a", { empresaId: "empresa-a", costo: 8 });
  await seedDocument("ventas/bodega-a", { empresaId: "empresa-a", cajeroId: fixtures.tenantA.vendedor.uid, items: [{ costoUnitario: 8 }] });
  await seedDocument("turnos/bodega-propio", { empresaId: "empresa-a", cajeroId: fixtures.tenantA.vendedor.uid });
  await seedDocument("turnos/bodega-ajeno", { empresaId: "empresa-a", cajeroId: fixtures.tenantA.cajero.uid });
  await expectDenied(vendedorA.firestore().doc("productos/bodega-a").get());
  await expectDenied(vendedorA.firestore().doc("ventas/bodega-a").get());
  await expectAllowed(vendedorA.firestore().doc("turnos/bodega-propio").get());
  await expectDenied(vendedorA.firestore().doc("turnos/bodega-ajeno").get());
  await expectDenied(vendedorB.firestore().doc("turnos/bodega-propio").get());
  await expectAllowed(adminA.firestore().doc("productos/bodega-a").get());
  await expectAllowed(adminA.firestore().doc("ventas/bodega-a").get());
});

test("Bodega U2-A: vendedor no salta la frontera de clientes y administración conserva CRUD", async () => {
  const vendedorA = await contextFor(fixtures.tenantA.vendedor);
  const vendedorB = await contextFor(fixtures.tenantB.vendedor);
  const adminA = await contextFor(fixtures.tenantA.admin);
  const clienteA = "clientes/cliente-bodega-a";
  await seedDocument(clienteA, { empresaId: "empresa-a", nombre: "Cliente A", cedula: "9001", telefono: "3000000000", activo: true, saldo: 999 });

  await expectDenied(vendedorA.firestore().doc(clienteA).get());
  await expectDenied(vendedorB.firestore().doc(clienteA).get());
  await expectDenied(vendedorA.firestore().doc("clientes/nuevo-vendedor").set({
    empresaId: "empresa-a", nombre: "Intento directo", cedula: "9002", telefono: "3000000001", activo: true,
  }));
  await expectDenied(vendedorA.firestore().doc(clienteA).update({ telefono: "3000000002" }));
  await expectDenied(vendedorA.firestore().doc(clienteA).update({ activo: false }));

  await expectAllowed(adminA.firestore().doc(clienteA).get());
  await expectAllowed(adminA.firestore().doc(clienteA).update({ telefono: "3000000003" }));
  await expectAllowed(adminA.firestore().doc(clienteA).update({ activo: false }));
});

test("Bodega U2-B: vendedor no lee ni muta presentaciones; administración conserva lectura aislada", async () => {
  const vendedorA = await contextFor(fixtures.tenantA.vendedor);
  const vendedorB = await contextFor(fixtures.tenantB.vendedor);
  const adminA = await contextFor(fixtures.tenantA.admin);
  const adminB = await contextFor(fixtures.tenantB.admin);
  const presentacionA = "presentaciones_producto/paca-empresa-a";
  await seedDocument(presentacionA, {
    empresaId: "empresa-a", productoId: "producto-a", nombre: "Paca", factorUnidadBase: 6, precioCOP: 6000, activo: true,
  });

  await expectDenied(vendedorA.firestore().doc(presentacionA).get());
  await expectDenied(vendedorB.firestore().doc(presentacionA).get());
  await expectDenied(vendedorA.firestore().doc(presentacionA).update({ precioCOP: 1 }));
  await expectDenied(vendedorA.firestore().doc("presentaciones_producto/nueva-vendedor").set({
    empresaId: "empresa-a", productoId: "producto-a", nombre: "Falsa", factorUnidadBase: 1, precioCOP: 1, activo: true,
  }));
  await expectAllowed(adminA.firestore().doc(presentacionA).get());
  await expectDenied(adminB.firestore().doc(presentacionA).get());
  await expectDenied(adminA.firestore().doc(presentacionA).update({ precioCOP: 1 }));
});
