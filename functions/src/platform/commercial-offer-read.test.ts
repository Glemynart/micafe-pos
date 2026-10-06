import assert from "node:assert/strict";
import test from "node:test";
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

test("ADR-SAAS-061: consulta solo empresa/oferta indicadas y devuelve campos permitidos", async () => {
  const db = fakeDb();
  const empresaId = "distribuidora-las-jimenez";
  const ofertaId = "oferta-distribuidora-jimenez-2026";
  db.seed(`ofertas_comerciales_tenant/${empresaId}`, { ofertaActivaId: ofertaId, revision: 3 });
  db.seed(`ofertas_comerciales_tenant/${empresaId}/ofertas/${ofertaId}`, {
    schemaVersion: 1,
    ofertaId,
    empresaIdObjetivo: empresaId,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-05",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061",
    revision: 2,
    internalCredential: "must-not-leak",
  });

  const result = await consultarOfertaComercialTenant(db as never, empresaId, ofertaId);

  assert.deepEqual(db.reads.sort(), [
    `ofertas_comerciales_tenant/${empresaId}`,
    `ofertas_comerciales_tenant/${empresaId}/ofertas/${ofertaId}`,
  ].sort());
  assert.equal(result.controlRevision, 3);
  assert.equal(result.ofertaActivaId, ofertaId);
  assert.deepEqual(result.oferta, {
    ofertaId,
    empresaIdObjetivo: empresaId,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-05",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061",
    revision: 2,
  });
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("ADR-SAAS-061: una oferta inexistente devuelve control inicial recuperable", async () => {
  const result = await consultarOfertaComercialTenant(fakeDb() as never, "empresa-1", "oferta-1");
  assert.deepEqual(result, { oferta: null, controlRevision: 1, ofertaActivaId: null });
});

test("ADR-SAAS-061: la consulta rechaza identificadores fuera del contrato", async () => {
  await assert.rejects(
    consultarOfertaComercialTenant(fakeDb() as never, "../empresa", "oferta-1"),
    /OFERTA_COMERCIAL_INVALIDA/,
  );
});

test("ADR-SAAS-061: el registro queda bloqueado si falta el control del agregado", async () => {
  const db = fakeDb();
  db.seed("ofertas_comerciales_tenant/empresa-1/ofertas/oferta-1", {});
  await assert.rejects(
    consultarOfertaComercialTenant(db as never, "empresa-1", "oferta-1"),
    /OFERTA_COMERCIAL_CONTROL_INEXISTENTE/,
  );
});
