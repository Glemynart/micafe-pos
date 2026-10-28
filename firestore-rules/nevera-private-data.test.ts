import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { fixtures } from "./fixtures";
import {
  cleanupRulesTestEnvironment,
  contextFor,
  expectDenied,
  rulesTestEnvironment,
  seedDocument,
} from "./test-helpers";

before(async () => { await rulesTestEnvironment(); });
after(async () => { await cleanupRulesTestEnvironment(); });

test("ADR-SAAS-097: capas FIFO y cuenta de control Nevera son privadas al backend", async () => {
  const adminA = await contextFor(fixtures.tenantA.admin);
  const adminB = await contextFor(fixtures.tenantB.admin);
  const suffix = randomUUID();
  const documents = [
    [`capas_fifo_nevera/capa-privada-${suffix}`, { empresaId: "empresa-a", catalogoId: "NEVERA" }],
    [`cuentas_control_nevera/empresa-a-${suffix}`, { empresaId: "empresa-a", catalogoId: "NEVERA", saldoCOP: 1000 }],
    [`cuentas_control_nevera_movimientos/evento-privado-${suffix}`, { empresaId: "empresa-a", catalogoId: "NEVERA" }],
  ] as const;
  for (const [path, data] of documents) {
    await seedDocument(path, data);
    await expectDenied(adminA.firestore().doc(path).get());
    await expectDenied(adminB.firestore().doc(path).get());
    await expectDenied(adminA.firestore().doc(path).set({ ...data, saldoCOP: 999_999 }));
    await expectDenied(adminA.firestore().doc(path).delete());
  }
});
