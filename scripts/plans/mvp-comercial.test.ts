import assert from "node:assert/strict";
import test from "node:test";
import { MODULOS_CONFIGURACION } from "../../lib/configuracion/catalogos";
import { construirEntradaCrearPlanMvp, MVP_COMERCIAL_CAPACIDADES, MVP_COMERCIAL_PLAN, validarPlanMvp } from "./mvp-comercial";

test("mvp_comercial define exactamente las capacidades aprobadas del MVP", () => {
  assert.deepEqual(MVP_COMERCIAL_CAPACIDADES, [
    "sell",
    "inventory",
    "purchases",
    "clientes",
    "finanzas",
    "reservas",
    "waste",
    "shifts",
  ]);
  assert.equal(MVP_COMERCIAL_PLAN.planId, "mvp_comercial");
  assert.equal(MVP_COMERCIAL_PLAN.codigo, "MVP_COMERCIAL");
  assert.equal(MVP_COMERCIAL_PLAN.planVersion, 1);
  assert.equal(MVP_COMERCIAL_PLAN.periodicidad, "MENSUAL");
  assert.equal(MVP_COMERCIAL_PLAN.grandfathered, false);
  assert.deepEqual(MVP_COMERCIAL_PLAN.limites, {});
  assert.ok(MVP_COMERCIAL_CAPACIDADES.every((capacidad) => MODULOS_CONFIGURACION.includes(capacidad)));
  assert.equal(MVP_COMERCIAL_CAPACIDADES.includes("shifts"), true);
});

test("mvp_comercial pasa el gate local de consistencia", () => {
  assert.deepEqual(validarPlanMvp(MVP_COMERCIAL_PLAN), { valid: true, errors: [] });
});

test("el constructor genera el payload del comando CrearPlan sin estado persistido", () => {
  const entrada = construirEntradaCrearPlanMvp({
    commandId: "BACKOFFICE_PLAN_MVP_CREAR",
    idempotencyKey: "BACKOFFICE_PLAN_MVP_CREAR_001",
    correlationId: "BACKOFFICE_PLAN_MVP",
    causationId: "BACKOFFICE_PLAN_MVP_SOLICITUD",
    motivoCodigo: "PLAN_MVP_COMERCIAL_APROBADO",
  });

  assert.deepEqual(entrada, {
    commandId: "BACKOFFICE_PLAN_MVP_CREAR",
    idempotencyKey: "BACKOFFICE_PLAN_MVP_CREAR_001",
    correlationId: "BACKOFFICE_PLAN_MVP",
    causationId: "BACKOFFICE_PLAN_MVP_SOLICITUD",
    motivoCodigo: "PLAN_MVP_COMERCIAL_APROBADO",
    expectedRevision: 1,
    planId: "mvp_comercial",
    codigo: "MVP_COMERCIAL",
    capacidades: [...MVP_COMERCIAL_CAPACIDADES],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
  });
  assert.equal("estado" in entrada, false);
  assert.equal("revision" in entrada, false);
});

test("el gate rechaza una variante tenant-specific o capacidades no aprobadas", () => {
  const tenantSpecific = { ...MVP_COMERCIAL_PLAN, planId: "cafe_atrato_mvp" };
  assert.deepEqual(validarPlanMvp(tenantSpecific), { valid: false, errors: ["PLAN_ID_NO_GENERICO"] });

  const withoutApprovedShift = { ...MVP_COMERCIAL_PLAN, capacidades: MVP_COMERCIAL_CAPACIDADES.filter((capacidad) => capacidad !== "shifts") };
  assert.deepEqual(validarPlanMvp(withoutApprovedShift), {
    valid: false,
    errors: ["PLAN_CAPACIDADES_NO_APROBADAS"],
  });

  const withUnknownCapability = { ...MVP_COMERCIAL_PLAN, capacidades: [...MVP_COMERCIAL_CAPACIDADES, "future_module"] };
  assert.deepEqual(validarPlanMvp(withUnknownCapability), {
    valid: false,
    errors: ["PLAN_CAPACIDAD_FUERA_DE_B1", "PLAN_CAPACIDADES_NO_APROBADAS"],
  });
});
