import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { MODULOS_CONFIGURACION } from "../../../lib/configuracion";
import { fechaComercialUtc } from "../../../lib/suscripciones/contrato";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { ejecutarBootstrapEmpresarial } from "./service";
import { ofertaComercialActivaRef, ofertaComercialRef, resolverOfertaComercialBootstrapEnTransaccion } from "../suscripciones/ofertas-tenant";
import { revocarOfertaComercialTenant } from "../suscripciones/service";

const EMULATOR_PROJECT_ID = "demo-e2-2-bootstrap-offer-emulator";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const hasLoopbackEmulator = typeof emulatorHost === "string" && /^127\.0\.0\.1:\d+$/.test(emulatorHost);

if (emulatorHost && !hasLoopbackEmulator) {
  throw new Error("Bootstrap Emulator tests require Firestore on 127.0.0.1; remote hosts are forbidden.");
}
if (hasLoopbackEmulator && process.env.GCLOUD_PROJECT !== EMULATOR_PROJECT_ID) {
  throw new Error(`Bootstrap Emulator tests require GCLOUD_PROJECT=${EMULATOR_PROJECT_ID}.`);
}
if (hasLoopbackEmulator && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Bootstrap Emulator tests reject application credentials.");
}

function createEmulatorDb(): { app: ReturnType<typeof initializeApp>; db: Firestore } {
  if (!hasLoopbackEmulator) throw new Error("Firestore Emulator is not running on loopback.");
  const app = initializeApp(
    { projectId: EMULATOR_PROJECT_ID },
    `bootstrap-offer-emulator-${randomUUID()}`,
  );
  return { app, db: getFirestore(app) };
}

function bootstrapInput(empresaId: string, suffix: string, trialDias = 30): EntradaBootstrapEmpresarial {
  return {
    commandId: `cmd_emulator_${suffix}`,
    idempotencyKey: `idem_emulator_${suffix}`,
    correlationId: `corr_emulator_${suffix}`,
    causationId: `cause_emulator_${suffix}`,
    ownerUid: `owner_${suffix}`,
    empresaId,
    nombreComercial: "Tenant sintético Emulator",
    paisFiscal: "CO",
    planId: "mvp_comercial",
    planVersion: 2,
    vertical: "BODEGA_MVP1",
    trialDias,
  };
}

async function seedPlanAndAdmin(db: Firestore): Promise<void> {
  await Promise.all([
    db.collection("permisos_roles").doc("admin").set({ permisos: ["configuracion", "pos"] }),
    db.collection("planes").doc("mvp_comercial").collection("versiones").doc("2").set({
      planId: "mvp_comercial",
      planVersion: 2,
      estado: "PUBLICADA",
      codigo: "MVP_COMERCIAL",
      capacidades: [...MODULOS_CONFIGURACION],
      limites: {},
      periodicidad: "ANUAL",
      precio: { importe: 1_800_000, moneda: "COP" },
      grandfathered: false,
      revision: 2,
      schemaVersion: 1,
    }),
  ]);
}

async function seedApprovedOffer(db: Firestore, empresaId: string, ofertaId: string): Promise<void> {
  await Promise.all([
    ofertaComercialActivaRef(db, empresaId).set({
      empresaId,
      ofertaActivaId: ofertaId,
      revision: 1,
    }),
    ofertaComercialRef(db, empresaId, ofertaId).set({
      schemaVersion: 1,
      ofertaId,
      empresaIdObjetivo: empresaId,
      planIdBase: "mvp_comercial",
      planVersionBase: 2,
      periodicidad: "ANUAL",
      precioAcordado: { importe: 1_600_000, moneda: "COP" },
      estado: "APROBADA",
      iniciaEn: fechaComercialUtc(),
      expiraEn: null,
      motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
      referenciaAprobacion: "ADR-SAAS-061-EMULATOR-TEST",
      revision: 1,
    }),
  ]);
}

test("ADR-SAAS-061 Firestore Emulator: revocar rechaza ID persistido distinto sin modificar oferta, control, comando ni auditoría", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  const suffix = randomUUID().replaceAll("-", "_");
  const empresaId = `emulator_offer_id_${suffix}`;
  const ofertaIdSolicitada = `oferta_requested_${suffix}`;
  const commandId = `cmd_revoke_mismatch_${suffix}`;
  const idempotencyKey = `idem_revoke_mismatch_${suffix}`;
  const correlationId = `corr_revoke_mismatch_${suffix}`;
  const controlRef = ofertaComercialActivaRef(db, empresaId);
  const ofertaRef = ofertaComercialRef(db, empresaId, ofertaIdSolicitada);
  const controlInicial = { empresaId, ofertaActivaId: ofertaIdSolicitada, revision: 3 };
  const ofertaInicial = {
    schemaVersion: 1,
    ofertaId: `oferta_embedded_${suffix}`,
    empresaIdObjetivo: empresaId,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1_600_000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-16",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061-EMULATOR-TEST",
    revision: 2,
  };
  await Promise.all([controlRef.set(controlInicial), ofertaRef.set(ofertaInicial)]);

  await assert.rejects(
    revocarOfertaComercialTenant(db, {
      commandId,
      idempotencyKey,
      correlationId,
      causationId: `cause_${suffix}`,
      expectedRevision: ofertaInicial.revision,
      motivo: "OFERTA_COMERCIAL_TENANT_REVOCAR",
      empresaId,
      ofertaId: ofertaIdSolicitada,
    }, { actorId: "operator_emulator", origen: "PLATFORM" }),
    /OFERTA_COMERCIAL_INVALIDA/,
  );

  const [controlDespues, ofertaDespues, comandos, commandIds, auditorias, eventos] = await Promise.all([
    controlRef.get(),
    ofertaRef.get(),
    db.collection("comandos_comerciales").where("commandId", "==", commandId).get(),
    db.collection("configuracion_command_ids").where("commandId", "==", commandId).get(),
    db.collection("auditoria_logs").where("commandId", "==", commandId).get(),
    db.collection("eventos_dominio").where("commandId", "==", commandId).get(),
  ]);
  assert.deepEqual(controlDespues.data(), controlInicial);
  assert.deepEqual(ofertaDespues.data(), ofertaInicial);
  assert.equal(comandos.size, 0);
  assert.equal(commandIds.size, 0);
  assert.equal(auditorias.size, 0);
  assert.equal(eventos.size, 0);
});

test("ADR-SAAS-061 Firestore Emulator: Bootstrap rechaza incrementar una revisión agotada sin crear el tenant", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  await seedPlanAndAdmin(db);

  for (const caso of ["oferta", "control"] as const) {
    await t.test(`no escribe si se agota la revisión de ${caso}`, async () => {
      const suffix = randomUUID().replaceAll("-", "_");
      const empresaId = `emulator_revision_${caso}_${suffix}`;
      const ofertaId = `oferta_revision_${caso}_${suffix}`;
      const controlRef = ofertaComercialActivaRef(db, empresaId);
      const ofertaRef = ofertaComercialRef(db, empresaId, ofertaId);
      await seedApprovedOffer(db, empresaId, ofertaId);
      if (caso === "oferta") {
        await ofertaRef.update({ revision: Number.MAX_SAFE_INTEGER });
      } else {
        await controlRef.update({ revision: Number.MAX_SAFE_INTEGER });
      }
      const controlInicial = (await controlRef.get()).data();
      const ofertaInicial = (await ofertaRef.get()).data();

      await assert.rejects(
        ejecutarBootstrapEmpresarial(
          db,
          bootstrapInput(empresaId, suffix),
          claimsEmitter,
          ownerVerifier,
          undefined,
          undefined,
          credentialIssuerSucceeds(empresaId),
        ),
        /OFERTA_COMERCIAL_TRANSITION_INVALIDA/,
      );

      const [empresa, suscripcion, provisionamientos, controlDespues, ofertaDespues] = await Promise.all([
        db.collection("empresas").doc(empresaId).get(),
        db.collection("suscripciones").doc(empresaId).get(),
        db.collection("provisionamientos_empresariales").where("empresaId", "==", empresaId).get(),
        controlRef.get(),
        ofertaRef.get(),
      ]);
      assert.equal(empresa.exists, false);
      assert.equal(suscripcion.exists, false);
      assert.equal(provisionamientos.size, 0);
      assert.deepEqual(controlDespues.data(), controlInicial);
      assert.deepEqual(ofertaDespues.data(), ofertaInicial);
    });
  }
});

const ownerVerifier = async () => {};
const claimsEmitter = async () => {};
function credentialIssuerSucceeds(empresaId: string) {
  return async () => ({
    incorporacionId: `inc_${empresaId}`,
    codigo: `codigo_${empresaId}`,
    pinTemporal: null,
    estado: "EMITIDA" as const,
  });
}

test("ADR-SAAS-061 Firestore Emulator: oferta se consume con Trial anual exacto y replay conserva el resultado", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  const suffix = randomUUID().replaceAll("-", "_");
  const empresaId = `emulator_bodega_${suffix}`;
  const ofertaId = `oferta_emulator_${suffix}`;
  await seedPlanAndAdmin(db);
  await seedApprovedOffer(db, empresaId, ofertaId);
  const input = bootstrapInput(empresaId, suffix);

  const first = await ejecutarBootstrapEmpresarial(
    db, input, claimsEmitter, ownerVerifier, undefined, undefined, credentialIssuerSucceeds(empresaId),
  );

  const [empresa, subscription, offer, control, provisioning] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    db.collection("suscripciones").doc(empresaId).get(),
    ofertaComercialRef(db, empresaId, ofertaId).get(),
    ofertaComercialActivaRef(db, empresaId).get(),
    db.collection("provisionamientos_empresariales")
      .where("empresaId", "==", empresaId)
      .get(),
  ]);
  const trial = subscription.data();
  assert.equal(first.estado, "COMPLETED");
  assert.equal(empresa.data()?.estado, "trial");
  assert.equal(trial?.estado, "trialing");
  assert.equal(trial?.snapshotContrato?.precio?.importe, 1_600_000);
  assert.equal(
    Date.parse(`${trial?.trialFin}T00:00:00.000Z`) - Date.parse(`${trial?.trialInicio}T00:00:00.000Z`),
    30 * 24 * 60 * 60 * 1000,
  );
  assert.equal(offer.data()?.estado, "CONSUMIDA");
  assert.equal(offer.data()?.consumidaPor?.empresaId, empresaId);
  assert.equal(control.data()?.ofertaActivaId, null);
  assert.equal(control.data()?.revision, 2);
  assert.equal(provisioning.size, 1);
  assert.equal((await db.collection("productos").where("empresaId", "==", empresaId).get()).empty, true);
  assert.equal((await db.collection("presentaciones_producto").where("empresaId", "==", empresaId).get()).empty, true);

  const replay = await ejecutarBootstrapEmpresarial(
    db, input, claimsEmitter, ownerVerifier, undefined, undefined, credentialIssuerSucceeds(empresaId),
  );
  const trialAfterReplay = (await db.collection("suscripciones").doc(empresaId).get()).data();
  assert.equal(replay.estado, "COMPLETED");
  assert.equal(replay.idempotente, true);
  assert.equal(replay.provisionamientoId, first.provisionamientoId);
  assert.deepEqual(
    { inicio: trialAfterReplay?.trialInicio, fin: trialAfterReplay?.trialFin, revision: trialAfterReplay?.revision },
    { inicio: trial?.trialInicio, fin: trial?.trialFin, revision: trial?.revision },
  );
  assert.equal((await ofertaComercialRef(db, empresaId, ofertaId).get()).data()?.revision, 2);
});

test("ADR-SAAS-061 Firestore Emulator: el fallo de credencial posterior al commit se recupera sin consumir oferta ni Trial dos veces", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  const suffix = randomUUID().replaceAll("-", "_");
  const empresaId = `emulator_retry_${suffix}`;
  const ofertaId = `oferta_retry_${suffix}`;
  await seedPlanAndAdmin(db);
  await seedApprovedOffer(db, empresaId, ofertaId);
  const input = bootstrapInput(empresaId, suffix);
  let issuerCalls = 0;
  const issuer = async () => {
    issuerCalls += 1;
    if (issuerCalls === 1) throw new Error("SYNTHETIC_CREDENTIAL_ISSUER_FAILURE");
    return {
      incorporacionId: `inc_${empresaId}`,
      codigo: `codigo_${empresaId}`,
      pinTemporal: null,
      estado: "EMITIDA" as const,
    };
  };

  const first = await ejecutarBootstrapEmpresarial(db, input, claimsEmitter, ownerVerifier, undefined, undefined, issuer);
  assert.equal(first.estado, "RETRYABLE_FAILURE");
  assert.equal((await db.collection("empresas").doc(empresaId).get()).exists, true);
  assert.equal((await db.collection("suscripciones").doc(empresaId).get()).data()?.estado, "trialing");
  assert.equal((await ofertaComercialRef(db, empresaId, ofertaId).get()).data()?.estado, "CONSUMIDA");

  const retry = await ejecutarBootstrapEmpresarial(db, input, claimsEmitter, ownerVerifier, undefined, undefined, issuer);
  const [provisioning, subscription, offer] = await Promise.all([
    db.collection("provisionamientos_empresariales").doc(first.provisionamientoId).get(),
    db.collection("suscripciones").doc(empresaId).get(),
    ofertaComercialRef(db, empresaId, ofertaId).get(),
  ]);
  assert.equal(retry.estado, "COMPLETED");
  assert.equal(retry.idempotente, true);
  assert.equal(issuerCalls, 2);
  assert.equal(provisioning.data()?.estado, "COMPLETED");
  assert.equal(subscription.data()?.revision, 1);
  assert.equal(offer.data()?.estado, "CONSUMIDA");
  assert.equal(offer.data()?.revision, 2);
  assert.equal((await db.collection("suscripciones").where("empresaId", "==", empresaId).get()).size, 1);
});

test("ADR-SAAS-061 Firestore Emulator: un tenant preexistente rechaza Bootstrap sin consumir la oferta", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  const suffix = randomUUID().replaceAll("-", "_");
  const empresaId = `emulator_duplicate_${suffix}`;
  const ofertaId = `oferta_duplicate_${suffix}`;
  await seedPlanAndAdmin(db);
  await seedApprovedOffer(db, empresaId, ofertaId);
  await db.collection("empresas").doc(empresaId).set({ empresaId, id: empresaId, estado: "trial", paisFiscal: "CO" });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db, bootstrapInput(empresaId, suffix), claimsEmitter, ownerVerifier,
      undefined, undefined, credentialIssuerSucceeds(empresaId),
    ),
    /EMPRESA_ALREADY_EXISTS/,
  );
  assert.equal((await ofertaComercialRef(db, empresaId, ofertaId).get()).data()?.estado, "APROBADA");
  assert.equal((await ofertaComercialActivaRef(db, empresaId).get()).data()?.ofertaActivaId, ofertaId);
  assert.equal((await db.collection("suscripciones").doc(empresaId).get()).exists, false);
  assert.equal((await db.collection("provisionamientos_empresariales").where("empresaId", "==", empresaId).get()).empty, true);
});

test("ADR-SAAS-061 Firestore Emulator: control de oferta malformado falla antes de cualquier commit de Bootstrap", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  const suffix = randomUUID().replaceAll("-", "_");
  const empresaId = `emulator_bad_control_${suffix}`;
  await seedPlanAndAdmin(db);
  await ofertaComercialActivaRef(db, empresaId).set({
    empresaId,
    ofertaActivaId: "invalid/offer-id",
    revision: 1,
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db, bootstrapInput(empresaId, suffix), claimsEmitter, ownerVerifier,
      undefined, undefined, credentialIssuerSucceeds(empresaId),
    ),
    /OFERTA_COMERCIAL_CONTROL_INVALIDO/,
  );
  assert.equal((await db.collection("empresas").doc(empresaId).get()).exists, false);
  assert.equal((await db.collection("suscripciones").doc(empresaId).get()).exists, false);
  assert.equal((await db.collection("provisionamientos_empresariales").where("empresaId", "==", empresaId).get()).empty, true);
});

test("ADR-SAAS-061 Firestore Emulator: Trial anual de 29 o 31 días no escribe ni consume oferta", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  t.after(async () => deleteApp(app));
  const suffix = randomUUID().replaceAll("-", "_");
  await seedPlanAndAdmin(db);

  for (const trialDias of [29, 31]) {
    const caso = `${suffix}_${trialDias}`;
    const empresaId = `emulator_trial_boundary_${caso}`;
    const ofertaId = `oferta_trial_boundary_${caso}`;
    await seedApprovedOffer(db, empresaId, ofertaId);
    await assert.rejects(
      ejecutarBootstrapEmpresarial(
        db, bootstrapInput(empresaId, caso, trialDias), claimsEmitter, ownerVerifier,
        undefined, undefined, credentialIssuerSucceeds(empresaId),
      ),
      /TRIAL_ANUAL_DEBE_SER_30_DIAS/,
    );
    assert.equal((await db.collection("empresas").doc(empresaId).get()).exists, false);
    assert.equal((await db.collection("suscripciones").doc(empresaId).get()).exists, false);
    assert.equal((await ofertaComercialRef(db, empresaId, ofertaId).get()).data()?.estado, "APROBADA");
    assert.equal((await ofertaComercialActivaRef(db, empresaId).get()).data()?.ofertaActivaId, ofertaId);
  }
});

test("ADR-SAAS-087 Firestore Emulator: consume la oferta v2 aprobada con vigencia UTC exacta y replay del puntero", {
  timeout: 30_000,
  skip: !hasLoopbackEmulator,
}, async (t) => {
  const { app, db } = createEmulatorDb();
  const empresaId = "distribuidora-las-jimenez";
  const ofertaId = "oferta-distribuidora-jimenez-2026";
  const controlRef = ofertaComercialActivaRef(db, empresaId);
  const ofertaRef = ofertaComercialRef(db, empresaId, ofertaId);
  t.after(async () => {
    await Promise.all([controlRef.delete(), ofertaRef.delete()]);
    await deleteApp(app);
  });

  await seedPlanAndAdmin(db);
  await Promise.all([
    controlRef.set({ empresaId, ofertaActivaId: ofertaId, revision: 1 }),
    ofertaRef.set({
      schemaVersion: 2,
      ofertaId,
      empresaIdObjetivo: empresaId,
      planIdBase: "mvp_comercial",
      planVersionBase: 2,
      periodicidad: "ANUAL",
      precioAcordado: { importe: 1_600_000, moneda: "COP" },
      estado: "APROBADA",
      iniciaEn: "2026-10-16",
      expiraEn: null,
      motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
      referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
      trialDias: 15,
      referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23",
      revision: 1,
    }),
  ]);

  const reloj = new Date("2026-12-24T23:45:00.000Z");
  const consumida = await db.runTransaction((tx) => resolverOfertaComercialBootstrapEnTransaccion(db, tx, {
    empresaId,
    planId: "mvp_comercial",
    planVersion: 2,
    planBase: {
      planId: "mvp_comercial",
      codigo: "MVP_COMERCIAL",
      planVersion: 2,
      estado: "PUBLICADA",
      capacidades: [...MODULOS_CONFIGURACION],
      limites: {},
      periodicidad: "ANUAL",
      precio: { importe: 1_800_000, moneda: "COP" },
      grandfathered: false,
      revision: 2,
      schemaVersion: 1,
    },
    provisionamientoId: "prov_diana_trial_15_emulator",
  }, reloj));

  assert.deepEqual({
    schemaVersion: consumida?.schemaVersion,
    trialDias: consumida?.trialDias,
    inicio: consumida?.trialInicio,
    fin: consumida?.trialFin,
  }, { schemaVersion: 2, trialDias: 15, inicio: "2026-12-24", fin: "2027-01-08" });
  const ofertaPersistida = (await ofertaRef.get()).data();
  assert.deepEqual({
    schemaVersion: ofertaPersistida?.schemaVersion,
    ofertaId: ofertaPersistida?.ofertaId,
    empresaIdObjetivo: ofertaPersistida?.empresaIdObjetivo,
    estado: ofertaPersistida?.estado,
    revision: ofertaPersistida?.revision,
    consumidaPor: ofertaPersistida?.consumidaPor,
    trialInicio: ofertaPersistida?.trialInicio,
    trialFin: ofertaPersistida?.trialFin,
  }, {
    schemaVersion: 2,
    ofertaId,
    empresaIdObjetivo: empresaId,
    estado: "CONSUMIDA",
    revision: 2,
    consumidaPor: { empresaId, provisionamientoId: "prov_diana_trial_15_emulator" },
    trialInicio: "2026-12-24",
    trialFin: "2027-01-08",
  });
  assert.ok(ofertaPersistida?.consumidaEn);
  assert.ok(ofertaPersistida?.actualizadaEn);
  const control = (await controlRef.get()).data();
  assert.equal(control?.ofertaActivaId, null);
  assert.equal(control?.revision, 2);
});
