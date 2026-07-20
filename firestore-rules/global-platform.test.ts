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

describe("globales y plataforma", () => {
before(async () => {
  await rulesTestEnvironment();
});

beforeEach(async () => {
  await clearRulesData();
  await seedDocument(`usuarios/${fixtures.tenantA.cajero.uid}`, { nombre: "Cajero A" });
  await seedDocument(`usuarios/${fixtures.tenantA.admin.uid}`, { nombre: "Admin A" });
  await seedDocument("configuracion/general", { nombre_tienda: "CafÃ© A" });
  await seedDocument("eventos/evento-publico", { titulo: "Evento", activo: true });
  await seedDocument("empresas/empresa-a", { nombre: "Empresa A" });
  await seedDocument("empresas/empresa-b", { nombre: "Empresa B" });
});

after(async () => {
  await cleanupRulesTestEnvironment();
});

test("usuarios legacy: cualquier autenticado puede leer y listar el directorio global", async () => {
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  const anonimo = await contextFor(fixtures.anonimo);

  await expectAllowed(cajeroA.firestore().doc(`usuarios/${fixtures.tenantA.cajero.uid}`).get());
  await expectAllowed(cajeroA.firestore().doc(`usuarios/${fixtures.tenantA.admin.uid}`).get());
  await expectAllowed(cajeroA.firestore().collection("usuarios").get());
  await expectDenied(anonimo.firestore().collection("usuarios").get());
});

test("usuarios legacy: el admin conserva creación, edición, activación y eliminación", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  const nuevoUsuario = "usuarios/usuario-legacy-nuevo";

  await expectAllowed(adminA.firestore().doc(nuevoUsuario).set({
    nombre: "Nuevo usuario",
    rol: "cajero",
    activo: true,
    permisos: [],
  }));
  await expectAllowed(adminA.firestore().doc(`usuarios/${fixtures.tenantA.cajero.uid}`).update({
    rol: "supervisor",
    activo: false,
    permisos: ["reports"],
  }));
  await expectAllowed(adminA.firestore().doc(nuevoUsuario).delete());
  await expectDenied(cajeroA.firestore().doc("usuarios/no-autorizado").set({ rol: "cajero" }));
});

test("permisos_roles legacy: lectura autenticada y administración exclusiva del admin", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);

  await seedDocument("permisos_roles/cajero", { permisos: ["sell"] });
  await expectAllowed(cajeroA.firestore().doc("permisos_roles/cajero").get());
  await expectAllowed(adminA.firestore().doc("permisos_roles/cajero").update({ permisos: ["sell", "reports"] }));
  await expectDenied(cajeroA.firestore().doc("permisos_roles/cajero").update({ permisos: [] }));
});

test("configuraciÃ³n exige autenticaciÃ³n y eventos mantienen lectura pÃºblica", async () => {
  const anonimo = await contextFor(fixtures.anonimo);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  const marketingA = await contextFor(fixtures.tenantA.marketing);

  await expectDenied(anonimo.firestore().doc("configuracion/general").get());
  await expectAllowed(cajeroA.firestore().doc("configuracion/general").get());
  await expectAllowed(anonimo.firestore().doc("eventos/evento-publico").get());
  await expectAllowed(marketingA.firestore().doc("eventos/nuevo-evento").set({ titulo: "Nuevo" }));
  await expectDenied(anonimo.firestore().doc("eventos/no-autorizado").set({ titulo: "No" }));
});

test("un tenant solo puede leer su empresa y no puede listarlas", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const superadmin = await contextFor(fixtures.superadmin);

  await expectAllowed(adminA.firestore().doc("empresas/empresa-a").get());
  await expectDenied(adminA.firestore().doc("empresas/empresa-b").get());
  await expectDenied(adminA.firestore().collection("empresas").get());
  await expectAllowed(superadmin.firestore().collection("empresas").get());
});

test("las colecciones SaaS quedan denegadas para clientes de tenant", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const coleccionesSaas = [
    "membresias/empresa-a_usuario-a",
    "planes/basico",
    "suscripciones/empresa-a",
    "invitaciones/token-prueba",
    "consumo/empresa-a_2026-07",
    "saas_operadores/operador-1",
    "saas_auditoria/evento-1",
    "configuraciones/empresa-a",
    "numeraciones/empresa-a_factura",
  ];

  for (const path of coleccionesSaas) {
    await expectDenied(adminA.firestore().doc(path).set({ empresaId: "empresa-a" }));
  }
});
});
