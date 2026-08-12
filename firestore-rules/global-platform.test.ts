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
  await seedDocument("eventos/evento-publico-a", { empresaId: "empresa-a", titulo: "Evento A", activo: true, fecha: "2026-08-10" });
  await seedDocument("eventos/evento-publico-b", { empresaId: "empresa-b", titulo: "Evento B", activo: true, fecha: "2026-08-11" });
  await seedDocument("eventos/evento-legacy", { titulo: "Evento legacy", activo: true, fecha: "2026-08-12" });
  await seedDocument("empresas/empresa-a", { nombre: "Empresa A", estado: "trial" });
  await seedDocument("empresas/empresa-b", { nombre: "Empresa B", estado: "trial" });
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

test("usuarios: el perfil no admite mutaciones de autoridad desde clientes", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  await expectDenied(adminA.firestore().doc("usuarios/usuario-nuevo").set({ nombre: "Nuevo usuario" }));
  await expectDenied(adminA.firestore().doc(`usuarios/${fixtures.tenantA.cajero.uid}`).update({ rol: "supervisor" }));
  await expectDenied(adminA.firestore().doc(`usuarios/${fixtures.tenantA.cajero.uid}`).delete());
  await expectDenied(cajeroA.firestore().doc("usuarios/no-autorizado").set({ rol: "cajero" }));
});

test("permisos_roles: las plantillas no son una superficie cliente de autorización", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);

  await seedDocument("permisos_roles/cajero", { permisos: ["sell"] });
  await expectDenied(cajeroA.firestore().doc("permisos_roles/cajero").get());
  await expectDenied(adminA.firestore().doc("permisos_roles/cajero").update({ permisos: ["sell", "reports"] }));
  await expectDenied(cajeroA.firestore().doc("permisos_roles/cajero").update({ permisos: [] }));
});

test("membresias: cada miembro lee la propia y el admin lista su tenant sin poder escribir", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  const propia = `membresias/empresa-a_${fixtures.tenantA.cajero.uid}`;
  await seedDocument(propia, { empresaId: "empresa-a", uid: fixtures.tenantA.cajero.uid, rol: "cajero", permisos: ["sell"], estado: "activa", activo: true });
  await expectAllowed(cajeroA.firestore().doc(propia).get());
  await expectAllowed(adminA.firestore().collection("membresias").where("empresaId", "==", "empresa-a").get());
  await expectDenied(cajeroA.firestore().doc(propia).update({ permisos: [] }));
  await expectDenied(adminA.firestore().doc(propia).update({ rol: "admin" }));
});

test("eventos: la lectura pública usa servidor y la administración queda aislada por tenant", async () => {
  const anonimo = await contextFor(fixtures.anonimo);
  const adminA = await contextFor(fixtures.tenantA.admin);
  const adminB = await contextFor(fixtures.tenantB.admin);
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  const marketingA = await contextFor(fixtures.tenantA.marketing);

  await expectDenied(anonimo.firestore().doc("configuracion/general").get());
  await expectDenied(cajeroA.firestore().doc("configuracion/general").get());
  await expectDenied(anonimo.firestore().doc("eventos/evento-publico-a").get());
  await expectDenied(anonimo.firestore().collection("eventos").get());
  await expectAllowed(adminA.firestore().doc("eventos/evento-publico-a").get());
  await expectDenied(adminA.firestore().doc("eventos/evento-publico-b").get());
  await expectAllowed(adminB.firestore().doc("eventos/evento-publico-b").get());
  await expectAllowed(adminA.firestore().collection("eventos").where("empresaId", "==", "empresa-a").get());
  await expectDenied(adminA.firestore().collection("eventos").get());

  await expectAllowed(marketingA.firestore().doc("eventos/nuevo-evento").set({ empresaId: "empresa-a", titulo: "Nuevo", activo: true }));
  await expectDenied(marketingA.firestore().doc("eventos/evento-ajeno").set({ empresaId: "empresa-b", titulo: "No", activo: true }));
  await expectDenied(marketingA.firestore().doc("eventos/evento-sin-tenant").set({ titulo: "No", activo: true }));
  await expectDenied(anonimo.firestore().doc("eventos/no-autorizado").set({ empresaId: "empresa-a", titulo: "No" }));

  await expectAllowed(marketingA.firestore().doc("eventos/evento-publico-a").update({ titulo: "Actualizado A" }));
  await expectDenied(marketingA.firestore().doc("eventos/evento-publico-a").update({ empresaId: "empresa-b" }));
  await expectDenied(marketingA.firestore().doc("eventos/evento-publico-b").update({ titulo: "No" }));
  await expectDenied(marketingA.firestore().doc("eventos/evento-legacy").update({ titulo: "No" }));
});

test("un tenant solo puede leer su empresa y no puede listarlas", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const claimLegado = await contextFor(fixtures.superadmin);

  await expectAllowed(adminA.firestore().doc("empresas/empresa-a").get());
  await expectDenied(adminA.firestore().doc("empresas/empresa-b").get());
  await expectDenied(adminA.firestore().collection("empresas").get());
  await expectDenied(claimLegado.firestore().collection("empresas").get());
});

test("las colecciones SaaS quedan denegadas para todo cliente, incluso claims legados", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const claimLegado = await contextFor(fixtures.superadmin);
  const coleccionesSaas = [
    "membresias/empresa-a_usuario-a",
    "planes/basico",
    "suscripciones/empresa-a",
    "pagos_saas/pago-prueba",
    "invitaciones/token-prueba",
    "incorporaciones/incorporacion-prueba",
    "consumo/empresa-a_2026-07",
    "saas_operadores/operador-1",
    "saas_auditoria/evento-1",
    "saas_auditoria_obligaciones/obligacion-1",
    "saas_soporte_autorizaciones/autorizacion-1",
    "saas_comandos/comando-1",
    "provisionamientos_empresariales/provisionamiento-1",
    "configuraciones/empresa-a",
    "numeraciones/empresa-a_factura",
  ];

  for (const path of coleccionesSaas) {
    await expectDenied(adminA.firestore().doc(path).set({ empresaId: "empresa-a" }));
    await expectDenied(claimLegado.firestore().doc(path).get());
    await expectDenied(claimLegado.firestore().doc(path).set({ empresaId: "empresa-a" }));
  }
});

test("incorporaciones: ningun tenant puede leer o escribir incorporaciones de otra empresa", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const adminB = await contextFor(fixtures.tenantB.admin);
  const path = "incorporaciones/incorporacion-a";
  await seedDocument(path, { empresaId: "empresa-a", estado: "INVITED" });

  await expectDenied(adminA.firestore().doc(path).get());
  await expectDenied(adminB.firestore().doc(path).get());
  await expectDenied(adminB.firestore().doc(path).update({ estado: "CANCELLED" }));
});

test("la sesion DIRECTA_TEMP no puede leer perfiles ni datos tenant aunque conserve claims antiguos", async () => {
  const temporal = await contextFor({
    uid: "uid-directa-temporal",
    claims: { authStage: "DIRECTA_TEMP", empresaId: "empresa-a", rol: "admin" },
  });

  await expectDenied(temporal.firestore().doc("usuarios/uid-directa-temporal").get());
  await expectDenied(temporal.firestore().doc("configuracion/general").get());
  await expectDenied(temporal.firestore().doc("membresias/empresa-a_uid-directa-temporal").get());
});
});
