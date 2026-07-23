import assert from "node:assert/strict";
import test from "node:test";
import { crearPlantillaConfiguracionRevision1 } from "../configuracion/plantilla";
import { evaluarReadinessTotal } from "../onboarding/contrato";
import type { Asignacion, Numeracion } from "../fiscal/contrato";

const baseConfig = () =>
  crearPlantillaConfiguracionRevision1({
    empresaId: "empresa_b6_test",
    nombreComercial: "Café Onboarding Test",
    creadaEn: {},
    actualizadaEn: {},
    ultimaMutacion: {
      actorTipo: "SYSTEM",
      actorId: "system",
      origen: "BOOTSTRAP",
      commandId: "cmd_init",
      correlationId: "corr_init",
    },
  });

function configCompleta() {
  const c = baseConfig();
  c.identidadFiscal = {
    nombreComercial: "Café Onboarding Test S.A.S.",
    razonSocial: "Café Onboarding Test S.A.S.",
    tipoPersona: "JURIDICA",
    tipoDocumento: "NIT",
    numeroDocumento: "900123456",
    digitoVerificacion: "8",
    regimenTributario: "responsable_iva",
    actividadEconomicaPrincipal: "5611",
    responsabilidadesFiscales: ["R-99-PN"],
    contacto: {
      email: "contacto@cafeonboarding.test",
      telefono: "+576015551234",
    },
  };
  c.localizacion = {
    paisFiscal: "CO",
    moneda: "COP",
    idioma: "es-CO",
    zonaHoraria: "America/Bogota",
    direccion: {
      linea1: "Calle 100 # 15-20",
      departamentoCodigo: "11",
      departamentoNombre: "Bogotá D.C.",
      municipioCodigo: "11001",
      municipioNombre: "Bogotá",
    },
  };
  c.modulos = { habilitados: ["sell"] };
  return c;
}

const numeracionHabilitada: Numeracion = {
  empresaId: "empresa_b6_test",
  numeracionId: "num_pos_1",
  paisFiscal: "CO",
  tipoDocumento: "pos",
  scope: "EMPRESA",
  prefijo: "POS",
  resolucion: "18760000001",
  rangoInicio: 1,
  rangoFin: 1000,
  ultimoAsignado: 0,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2099-12-31",
  estado: "HABILITADA",
  revision: 2,
  schemaVersion: 1,
  creadaEn: {},
  actualizadaEn: {},
};

const asignacionVigente: Asignacion = {
  empresaId: "empresa_b6_test",
  scope: "EMPRESA",
  tipoDocumento: "pos",
  numeracionId: "num_pos_1",
  estado: "VIGENTE",
  revision: 1,
  schemaVersion: 1,
  actualizadaEn: {},
};

test("B6 Onboarding — evaluarReadinessTotal retorna listo=false cuando la configuración está incompleta", () => {
  const c = baseConfig(); // Identidad fiscal y domicilio vacíos (estilo Bootstrap)
  const res = evaluarReadinessTotal(c, [numeracionHabilitada], [asignacionVigente], {
    empresaId: "empresa_b6_test",
    paisFiscalEmpresa: "CO",
    fechaActualUtc: "2026-07-22",
  });

  assert.equal(res.listo, false);
  assert.ok(res.causas.includes("CONFIGURACION_FISCAL_INCOMPLETA"));
  assert.equal(res.detalles.configuracion.fiscal.lista, false);
  assert.equal(res.detalles.numeracion.lista, true);
});

test("B6 Onboarding — evaluarReadinessTotal retorna listo=false cuando falta la numeración asignada", () => {
  const c = configCompleta();
  const res = evaluarReadinessTotal(c, [], [], {
    empresaId: "empresa_b6_test",
    paisFiscalEmpresa: "CO",
    fechaActualUtc: "2026-07-22",
  });

  assert.equal(res.listo, false);
  assert.ok(res.causas.includes("NUMERACION_SIN_ASIGNACION_VIGENTE"));
  assert.equal(res.detalles.numeracion.lista, false);
});

test("B6 Onboarding — evaluarReadinessTotal retorna listo=false cuando la numeración está en BORRADOR", () => {
  const c = configCompleta();
  const numBorrador: Numeracion = { ...numeracionHabilitada, estado: "BORRADOR" };
  const res = evaluarReadinessTotal(c, [numBorrador], [asignacionVigente], {
    empresaId: "empresa_b6_test",
    paisFiscalEmpresa: "CO",
    fechaActualUtc: "2026-07-22",
  });

  assert.equal(res.listo, false);
  assert.ok(res.causas.includes("NUMERACION_NO_HABILITADA"));
});

test("B6 Onboarding — evaluarReadinessTotal retorna listo=true con configuración e identidad completas y numeración asignada habilitada", () => {
  const c = configCompleta();
  const res = evaluarReadinessTotal(c, [numeracionHabilitada], [asignacionVigente], {
    empresaId: "empresa_b6_test",
    paisFiscalEmpresa: "CO",
    fechaActualUtc: "2026-07-22",
  });

  assert.equal(res.listo, true);
  assert.equal(res.causas.length, 0);
  assert.equal(res.detalles.configuracion.operativa.lista, true);
  assert.equal(res.detalles.configuracion.fiscal.lista, true);
  assert.equal(res.detalles.numeracion.lista, true);
});
