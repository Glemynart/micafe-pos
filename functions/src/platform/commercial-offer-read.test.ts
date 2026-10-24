import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { validarOfertaComercialEntrada } from "../suscripciones/ofertas-tenant";
import { consultarOfertaComercialTenant } from "./commercial-offer-read";

function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const reads: string[] = [];
  const reference = (path: string) => ({
    get: async () => {
      reads.push(path);
      return { exists: docs.has(path), data: () => docs.get(path) };
    },
    collection: (name: string) => ({ doc: (id: string) => reference(`${path}/${name}/${id}`) }),
  });
  return {
    reads,
    seed(path: string, data: Record<string, unknown>) { docs.set(path, data); },
    collection(name: string) { return { doc: (id: string) => reference(`${name}/${id}`) }; },
  };
}

test("ADR-SAAS-061: consulta solo la oferta del tenant aprobado y devuelve campos permitidos", async () => {
  const db = fakeDb();
  const empresaId = "distribuidora-las-jimenez";
  const ofertaId = "oferta-distribuidora-jimenez-2026";
  const codigoAprobacion = "GATE_I_OFFER_1";
  const referenciaAprobacion = "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06";
  db.seed(`ofertas_comerciales_tenant/${empresaId}`, {
    empresaId,
    ofertaActivaId: ofertaId,
    revision: 3,
  });
  db.seed(`ofertas_comerciales_tenant/${empresaId}/ofertas/${ofertaId}`, {
    schemaVersion: 2,
    ofertaId,
    empresaIdObjetivo: empresaId,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-16",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion,
    trialDias: 15,
    referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23",
    revision: 2,
    internalCredential: "must-not-leak",
  });
  db.seed("ofertas_comerciales_tenant/tenant-vecino-sintetico", {
    empresaId: "tenant-vecino-sintetico",
    ofertaActivaId: "oferta-vecina",
    secretSentinel: "must-not-read-neighbor-control",
  });
  db.seed("ofertas_comerciales_tenant/tenant-vecino-sintetico/ofertas/oferta-vecina", {
    empresaIdObjetivo: "tenant-vecino-sintetico",
    secretSentinel: "must-not-read-neighbor-offer",
  });

  const result = await consultarOfertaComercialTenant(db as never, codigoAprobacion);

  assert.deepEqual(db.reads.sort(), [
    `ofertas_comerciales_tenant/${empresaId}`,
    `ofertas_comerciales_tenant/${empresaId}/ofertas/${ofertaId}`,
  ].sort());
  assert.equal(result.controlRevision, 3);
  assert.equal(result.ofertaActivaId, ofertaId);
  assert.deepEqual(result.autorizacion, {
    schemaVersion: 2,
    ofertaId,
    empresaIdObjetivo: empresaId,
    nombreEmpresaObjetivo: "Distribuidora Las Jiménez",
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion,
    trialDias: 15,
    referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23",
  });
  assert.deepEqual(result.oferta, {
    schemaVersion: 2,
    ofertaId,
    empresaIdObjetivo: empresaId,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-16",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion,
    trialDias: 15,
    referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23",
    revision: 2,
  });
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("ADR-SAAS-061: una oferta inexistente devuelve la aprobación y control inicial recuperable", async () => {
  const codigoAprobacion = "GATE_I_OFFER_1";
  const referenciaAprobacion = "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06";
  const result = await consultarOfertaComercialTenant(fakeDb() as never, codigoAprobacion);
  assert.equal(result.autorizacion.referenciaAprobacion, referenciaAprobacion);
  assert.deepEqual({ oferta: result.oferta, controlRevision: result.controlRevision, ofertaActivaId: result.ofertaActivaId }, {
    oferta: null,
    controlRevision: 1,
    ofertaActivaId: null,
  });
});

test("ADR-SAAS-061: la consulta rechaza referencias de aprobación desconocidas", async () => {
  const db = fakeDb();
  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "codigo-no-aprobado"),
    /OFERTA_COMERCIAL_APROBACION_NOT_FOUND/,
  );
  assert.deepEqual(db.reads, []);
});

test("ADR-SAAS-061: el registro queda bloqueado si falta el control del agregado", async () => {
  const db = fakeDb();
  const codigoAprobacion = "GATE_I_OFFER_1";
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026", {});
  await assert.rejects(
    consultarOfertaComercialTenant(db as never, codigoAprobacion),
    /OFERTA_COMERCIAL_CONTROL_INEXISTENTE/,
  );
});

test("ADR-SAAS-061: la consulta rechaza un control existente sin puntero activo canónico", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", { revision: 1 });

  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1"),
    /OFERTA_COMERCIAL_CONTROL_INVALIDO/,
  );
});

test("ADR-SAAS-061: la consulta rechaza un control sin empresaId persistida", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", {
    ofertaActivaId: null,
    revision: 1,
  });

  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1"),
    /OFERTA_COMERCIAL_CONTROL_INVALIDO/,
  );
});

test("ADR-SAAS-061: la consulta rechaza un puntero que no puede ser un ID canónico", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", {
    empresaId: "distribuidora-las-jimenez",
    ofertaActivaId: "../ofertas/oferta-ajena",
    revision: 1,
  });

  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1"),
    /OFERTA_COMERCIAL_CONTROL_INVALIDO/,
  );
});

test("ADR-SAAS-061: la consulta rechaza un control cuyo tenant embebido contradice la ruta", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", {
    empresaId: "otro_tenant",
    ofertaActivaId: null,
    revision: 1,
  });

  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1"),
    /OFERTA_COMERCIAL_CONTROL_INVALIDO/,
  );
});

test("la entrada de una oferta nueva conserva invalid-argument para un precio inválido", () => {
  assert.throws(
    () => validarOfertaComercialEntrada({
      empresaId: "distribuidora-las-jimenez",
      ofertaId: "oferta-distribuidora-jimenez-2026",
      planIdBase: "mvp_comercial",
      planVersionBase: 2,
      precioAcordado: { importe: 0, moneda: "COP" },
      iniciaEn: "2026-10-16",
      expiraEn: null,
      referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
    }),
    (error: unknown) => error instanceof HttpsError
      && error.code === "invalid-argument"
      && error.message === "OFERTA_COMERCIAL_PRECIO_INVALIDO",
  );
});

test("ADR-SAAS-061: precio persistido inválido es una precondición inconsistente", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", {
    empresaId: "distribuidora-las-jimenez", ofertaActivaId: null, revision: 1,
  });
  db.seed(
    "ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026",
    {
      schemaVersion: 1,
      ofertaId: "oferta-distribuidora-jimenez-2026",
      empresaIdObjetivo: "distribuidora-las-jimenez",
      planIdBase: "mvp_comercial",
      planVersionBase: 2,
      periodicidad: "ANUAL",
      precioAcordado: { importe: 0, moneda: "COP" },
      estado: "APROBADA",
      iniciaEn: "2026-10-16",
      expiraEn: null,
      motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
      referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
      revision: 2,
    },
  );

  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1"),
    (error: unknown) => error instanceof HttpsError
      && error.code === "failed-precondition"
      && error.message === "OFERTA_COMERCIAL_PRECIO_INVALIDO",
  );
});

test("ADR-SAAS-061: Bootstrap y consulta usan el mismo schemaVersion de oferta persistida", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", {
    empresaId: "distribuidora-las-jimenez", ofertaActivaId: null, revision: 1,
  });
  db.seed(
    "ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026",
    { schemaVersion: 2 },
  );

  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1"),
    /OFERTA_COMERCIAL_INVALIDA/,
  );
});

test("ADR-SAAS-087: consulta conserva una oferta v1 existente con Trial de 30 días", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez", {
    empresaId: "distribuidora-las-jimenez", ofertaActivaId: "oferta-distribuidora-jimenez-2026", revision: 1,
  });
  db.seed("ofertas_comerciales_tenant/distribuidora-las-jimenez/ofertas/oferta-distribuidora-jimenez-2026", {
    schemaVersion: 1,
    ofertaId: "oferta-distribuidora-jimenez-2026",
    empresaIdObjetivo: "distribuidora-las-jimenez",
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1_600_000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-16",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
    revision: 2,
  });
  const result = await consultarOfertaComercialTenant(db as never, "GATE_I_OFFER_1");
  assert.equal(result.autorizacion.trialDias, 15);
  assert.equal(result.oferta?.schemaVersion, 1);
  assert.equal(result.oferta?.trialDias, 30);
  assert.equal(result.oferta?.referenciaAceptacionCliente, undefined);
});
