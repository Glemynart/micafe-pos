import { MODULOS_CONFIGURACION } from "../../lib/configuracion/catalogos";
import { esIdComercial, type PlanVersion } from "../../lib/suscripciones/contrato";

/**
 * Especificación reutilizable del Plan SaaS del MVP.
 *
 * Este archivo no persiste datos ni se ejecuta contra Firebase. Es el blueprint
 * que debe convertirse en una entrada de `CrearPlan` mediante la autoridad
 * comercial existente y publicarse con `PublicarPlan` después del gate aprobado.
 */
export const MVP_COMERCIAL_CAPACIDADES = [
  "sell",
  "inventory",
  "purchases",
  "clientes",
  "finanzas",
  "reservas",
  "waste",
  "shifts",
] as const;

export const MVP_COMERCIAL_PLAN = {
  planId: "mvp_comercial",
  codigo: "MVP_COMERCIAL",
  planVersion: 1,
  capacidades: [...MVP_COMERCIAL_CAPACIDADES],
  limites: {},
  periodicidad: "MENSUAL" as const,
  grandfathered: false,
  schemaVersion: 1 as const,
};

type EnvelopeCrearPlanMvp = {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  motivoCodigo: string;
};

type DatosCrearPlanMvp = Omit<PlanVersion, "planVersion" | "estado" | "revision" | "schemaVersion">;

export type EntradaCrearPlanMvp = EnvelopeCrearPlanMvp & DatosCrearPlanMvp & {
  expectedRevision: 1;
};

export function construirEntradaCrearPlanMvp(envelope: EnvelopeCrearPlanMvp): EntradaCrearPlanMvp {
  return {
    ...envelope,
    expectedRevision: 1,
    planId: MVP_COMERCIAL_PLAN.planId,
    codigo: MVP_COMERCIAL_PLAN.codigo,
    capacidades: [...MVP_COMERCIAL_PLAN.capacidades],
    limites: {},
    periodicidad: MVP_COMERCIAL_PLAN.periodicidad,
    grandfathered: MVP_COMERCIAL_PLAN.grandfathered,
  };
}

export type ResultadoValidacionPlanMvp = {
  valid: boolean;
  errors: string[];
};

export type PlanMvpSpec = {
  planId: string;
  codigo: string;
  planVersion: number;
  capacidades: readonly string[];
  limites: PlanVersion["limites"];
  periodicidad: string;
  grandfathered: boolean;
  schemaVersion: number;
};

/**
 * Gate local de consistencia para evitar publicar accidentalmente una oferta
 * tenant-specific o capacidades fuera del catálogo B1.
 */
export function validarPlanMvp(plan: PlanMvpSpec): ResultadoValidacionPlanMvp {
  const errors: string[] = [];
  const capacidades = Array.isArray(plan.capacidades) ? plan.capacidades : [];
  const capacidadesEsperadas = [...MVP_COMERCIAL_CAPACIDADES];
  const modulosB1 = new Set<string>(MODULOS_CONFIGURACION);

  if (plan.planId !== "mvp_comercial") errors.push("PLAN_ID_NO_GENERICO");
  if (plan.codigo !== "MVP_COMERCIAL") errors.push("PLAN_CODIGO_INVALIDO");
  if (plan.planVersion !== 1) errors.push("PLAN_VERSION_INICIAL_INVALIDA");
  if (plan.periodicidad !== "MENSUAL") errors.push("PLAN_PERIODICIDAD_INVALIDA");
  if (plan.grandfathered !== false) errors.push("PLAN_GRANDFATHERING_NO_APROBADO");
  if (!esIdComercial(plan.planId) || !esIdComercial(plan.codigo)) errors.push("PLAN_IDENTIDAD_INVALIDA");
  if (new Set(capacidades).size !== capacidades.length) errors.push("PLAN_CAPACIDADES_DUPLICADAS");
  if (capacidades.some((capacidad) => !modulosB1.has(capacidad))) errors.push("PLAN_CAPACIDAD_FUERA_DE_B1");
  if (JSON.stringify(capacidades) !== JSON.stringify(capacidadesEsperadas)) errors.push("PLAN_CAPACIDADES_NO_APROBADAS");
  if (Object.keys(plan.limites).length !== 0) errors.push("PLAN_LIMITES_NO_APROBADOS");

  return { valid: errors.length === 0, errors };
}
