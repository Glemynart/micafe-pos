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
  writeAsBackend,
} from "./test-helpers";

const reservaA = "reservas/reserva-empresa-a";
const agendaA = "agendas/sala-a_2026-07-20";

before(async () => {
  await rulesTestEnvironment();
});

beforeEach(async () => {
  await clearRulesData();
  await seedDocument(reservaA, { empresaId: "empresa-a", estadoReserva: "activa" });
  await seedDocument(agendaA, { empresaId: "empresa-a", bloques: {} });
});

after(async () => {
  await cleanupRulesTestEnvironment();
});

test("reservas y agendas: el cliente anónimo no puede leer ni escribir directamente", async () => {
  const anonimo = await contextFor(fixtures.anonimo);

  await expectDenied(anonimo.firestore().doc(reservaA).get());
  await expectDenied(anonimo.firestore().doc("reservas/nueva-publica").set({ empresaId: "empresa-a" }));
  await expectDenied(anonimo.firestore().doc(agendaA).get());
  await expectDenied(anonimo.firestore().doc(agendaA).update({ bloques: { "08": {} } }));
});

test("reservas y agendas: el rol y el tenant siguen siendo obligatorios para clientes autenticados", async () => {
  const cajeroA = await contextFor(fixtures.tenantA.cajero);
  const cocineroA = await contextFor(fixtures.tenantA.cocinero);
  const adminB = await contextFor(fixtures.tenantB.admin);

  await expectAllowed(cajeroA.firestore().doc(reservaA).get());
  await expectAllowed(cajeroA.firestore().doc(reservaA).update({ estadoReserva: "completada" }));
  await expectDenied(cocineroA.firestore().doc(reservaA).update({ estadoReserva: "completada" }));
  await expectDenied(adminB.firestore().doc(reservaA).get());
  await expectAllowed(cajeroA.firestore().doc(agendaA).update({ bloques: { "08": { reservaId: "r1" } } }));
  await expectDenied(cajeroA.firestore().doc("agendas/nueva").set({ empresaId: "empresa-a", bloques: {} }));
});

test("reservas y agendas: las rutas backend pueden escribir mediante Admin SDK", async () => {
  await writeAsBackend("reservas/reserva-publica", { empresaId: "empresa-a", estadoReserva: "activa" });
  await writeAsBackend("agendas/sala-publica_2026-07-20", { empresaId: "empresa-a", bloques: {} });
});
