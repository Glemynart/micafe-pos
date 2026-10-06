import assert from "node:assert/strict";
import test from "node:test";
import {
  exigirRuntimeOfertaTenantStaging,
  resolverTerminosOfertaTenantAprobada,
} from "./approved-tenant-offers";

const codigoAprobacion = "GATE_I_OFFER_1";
const referencia = "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06";

test("ADR-SAAS-061: resuelve los términos aprobados en servidor desde su referencia", () => {
  const terminos = resolverTerminosOfertaTenantAprobada(codigoAprobacion, {
    codigoAprobacion,
    iniciaEn: "2026-10-06",
    expiraEn: null,
    expectedRevision: 1,
  });

  assert.deepEqual(terminos, {
    ofertaId: "oferta-distribuidora-jimenez-2026",
    empresaIdObjetivo: "distribuidora-las-jimenez",
    nombreEmpresaObjetivo: "Distribuidora Las Jiménez",
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1_600_000, moneda: "COP" },
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: referencia,
  });

  terminos.precioAcordado.importe = 1;
  assert.equal(resolverTerminosOfertaTenantAprobada(codigoAprobacion).precioAcordado.importe, 1_600_000);
});

test("ADR-SAAS-061: rechaza campos comerciales aportados o manipulados por la UI", () => {
  for (const intento of [
    { empresaId: "otra-empresa" },
    { ofertaId: "otra-oferta" },
    { referenciaAprobacion: referencia },
    { planIdBase: "otro-plan" },
    { planVersionBase: 99 },
    { precioAcordado: { importe: 1, moneda: "COP" } },
    { moneda: "USD" },
    { importe: 1 },
    { periodicidad: "MENSUAL" },
    { motivo: "PRECIO_DISTINTO" },
  ]) {
    assert.throws(
      () => resolverTerminosOfertaTenantAprobada(codigoAprobacion, { codigoAprobacion, ...intento }),
      /OFERTA_COMERCIAL_TERMINOS_CLIENTE_NO_ADMITIDOS/,
    );
  }
});

test("ADR-SAAS-061: no resuelve referencias de aprobación desconocidas", () => {
  for (const codigo of ["codigo-no-aprobado", "toString", "constructor"]) {
    assert.throws(
      () => resolverTerminosOfertaTenantAprobada(codigo),
      /OFERTA_COMERCIAL_APROBACION_NOT_FOUND/,
    );
  }
});

test("ADR-SAAS-061: la oferta aprobada inicial solo está habilitada en staging", () => {
  assert.doesNotThrow(() => exigirRuntimeOfertaTenantStaging("micafe-pos-staging"));
  assert.throws(
    () => exigirRuntimeOfertaTenantStaging("micafe-pos"),
    /OFERTA_COMERCIAL_RUNTIME_DENIED/,
  );
  assert.throws(
    () => exigirRuntimeOfertaTenantStaging(undefined),
    /OFERTA_COMERCIAL_RUNTIME_DENIED/,
  );
});
