import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { crearPlantillaConfiguracionRevision1, evaluarReadinessConfiguracion, perfilComercialCompleto } from "../../lib/configuracion";
import { leerConfiguracionEmpresa } from "../../functions/src/configuracion/reader";
import { ejecutarRegistrarPerfilComercialBodegaV1 } from "../../functions/src/tenant-profile/handler";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const runId = randomUUID();
const empresaId = `tenant-profile-emulator-${runId}`;

test("Emulator: perfil Bodega escribe atómicamente, conserva DEMO y replay no duplica", { skip: !emulatorHost }, async () => {
  if (!emulatorHost?.startsWith("127.0.0.1:") || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("La prueba requiere Firestore Emulator local sin credenciales reales.");
  }
  const app = initializeApp({ projectId: "demo-tenant-profile" }, `tenant-profile-${runId}`);
  const db = getFirestore(app);
  const companyRef = db.collection("empresas").doc(empresaId);
  const configRef = db.collection("configuraciones").doc(empresaId);
  const company = { id: empresaId, empresaId, estado: "trial", paisFiscal: "CO", revision: 1, nombre: "Bodega de prueba", nombreComercial: "Bodega de prueba" };
  const config = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: "Bodega de prueba",
    creadaEn: new Date(),
    actualizadaEn: new Date(),
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "bootstrap", origen: "BOOTSTRAP", commandId: "bootstrap-emulator", correlationId: "bootstrap-emulator-corr" },
    vertical: "BODEGA_MVP1",
  });
  const pii = { nit: "900373913", digitoVerificacion: "4", email: "synthetic@example.com", direccion: "Calle Sintética 1" };
  const request = {
    auth: { uid: "admin-synthetic", token: { empresaId, rol: "admin" } },
    data: {
      nombreComercial: "Distribuidora Sintética",
      razonSocial: "Distribuidora Sintética S.A.S.",
      tipoPersona: "JURIDICA",
      ...pii,
      telefono: "+573001234567",
      departamentoCodigo: "11",
      departamentoNombre: "Bogotá D.C.",
      municipioCodigo: "11001",
      municipioNombre: "Bogotá",
      expectedRevision: 1,
      commandId: `profile-command-${runId}`,
      idempotencyKey: `profile-idempotency-${runId}`,
      correlationId: `profile-correlation-${runId}`,
    },
  };
  try {
    await companyRef.set(company);
    await configRef.set(config);
    const dependencies = {
      db,
      exigirTenant: async () => ({ id: empresaId, estado: "trial", rol: "admin" as const, permisos: [], paisFiscal: "CO" }),
      leerConfiguracion: leerConfiguracionEmpresa,
    };
    const result = await ejecutarRegistrarPerfilComercialBodegaV1(request, dependencies);
    assert.deepEqual(result, { revision: 2, idempotente: false });

    const [savedCompany, savedConfig] = await Promise.all([companyRef.get(), configRef.get()]);
    const actualConfig = savedConfig.data()!;
    assert.equal(savedCompany.data()?.nombre, "Distribuidora Sintética");
    assert.equal(savedCompany.data()?.estado, "trial");
    assert.equal(perfilComercialCompleto(actualConfig as any), true);
    assert.equal(evaluarReadinessConfiguracion(actualConfig as any).fiscal.lista, false);

    const replay = await ejecutarRegistrarPerfilComercialBodegaV1(request, dependencies);
    assert.deepEqual(replay, { revision: 2, idempotente: true });
    assert.equal((await companyRef.get()).data()?.revision, 2);

    const [audits, events, commands] = await Promise.all([
      db.collection("auditoria_logs").where("empresaId", "==", empresaId).get(),
      db.collection("eventos_dominio").where("empresaId", "==", empresaId).get(),
      db.collection("configuracion_comandos").where("empresaId", "==", empresaId).get(),
    ]);
    assert.equal(audits.size, 1);
    assert.equal(events.size, 1);
    assert.equal(commands.size, 1);
    const auditText = JSON.stringify(audits.docs[0].data());
    for (const value of [pii.nit, pii.email, pii.direccion]) assert.equal(auditText.includes(value), false);
    assert.equal(auditText.includes(`${pii.nit}-${pii.digitoVerificacion}`), false);
  } finally {
    const collections = ["empresas", "configuraciones", "configuracion_comandos", "configuracion_command_ids", "auditoria_logs", "eventos_dominio"];
    await Promise.all(collections.map(async (name) => {
      const collection = db.collection(name);
      const docs = name === "empresas" || name === "configuraciones"
        ? [await collection.doc(empresaId).get()]
        : (await collection.where("empresaId", "==", empresaId).get()).docs;
      await Promise.all(docs.filter((snap) => snap.exists).map((snap) => snap.ref.delete()));
    }));
    await deleteApp(app);
  }
});
