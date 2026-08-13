import assert from "node:assert/strict";
import test from "node:test";
import {
  ANNUAL_CAPABILITIES,
  evaluarTrialTransitionPreflight,
  HISTORIC_CAPABILITIES,
  type TrialTransitionSnapshot,
} from "./trial-transition-preflight-core";

function snapshot(overrides: Partial<TrialTransitionSnapshot> = {}): TrialTransitionSnapshot {
  return {
    projectId: "micafe-pos",
    tenantId: "1ae0rD9H8t3ZFSBKrrHR",
    asOf: "2026-08-13",
    empresa: { nombre: "Cafe Atrato", estado: "activa", paisFiscal: "CO", revision: 2 },
    suscripcionRaiz: {
      estado: "trialing",
      planId: "mvp_comercial",
      planVersion: 1,
      trialInicio: "2026-08-03",
      trialFin: "2026-09-02",
      revision: 1,
    },
    planAnual: {
      estado: "PUBLICADA",
      periodicidad: "ANUAL",
      precio: { importe: 1_800_000, moneda: "COP" },
      capacidades: [...ANNUAL_CAPABILITIES],
    },
    configuracion: { revision: 3, modulos: { habilitados: [...HISTORIC_CAPABILITIES] } },
    relaciones: [],
    operador: { estado: "ACTIVO", facultades: ["COMERCIAL_GOBERNAR", "LIFECYCLE_GOBERNAR"] },
    release: {
      mainSha: "91e75b6e34e9892e3227a808ccd02c75408d74ef",
      ciGreen: true,
      functionsHash: "ce73f42fa704c461257e87a809f45a264a7cbfc3",
      rulesVerified: true,
      storageVerified: true,
      vercelVerified: true,
    },
    recoveryEvidenceRef: "recovery://g-saas-02/cafe-atrato/2026-09-02",
    ...overrides,
  };
}

test("preflight mantiene la transición bloqueada antes del cierre histórico", () => {
  const result = evaluarTrialTransitionPreflight(snapshot());
  assert.equal(result.status, "ESPERAR_VENTANA");
  assert.equal(result.readyForCanonicalCommands, false);
  assert.equal(result.productionWrites, false);
  assert.ok(result.findings.some((finding) => finding.code === "HISTORIC_TRIAL_STILL_OPEN"));
});

test("preflight exige suspensión canónica después del cierre, sin mutar la raíz", () => {
  const result = evaluarTrialTransitionPreflight(snapshot({ asOf: "2026-09-03" }));
  assert.equal(result.status, "BLOQUEADO");
  assert.ok(result.findings.some((finding) => finding.code === "ROOT_NOT_CANONICALLY_SUSPENDED"));
});

test("preflight autoriza únicamente la secuencia canónica cuando todos los gates pasan", () => {
  const result = evaluarTrialTransitionPreflight(snapshot({
    asOf: "2026-09-03",
    empresa: { nombre: "Cafe Atrato", estado: "suspendida", paisFiscal: "CO", revision: 3 },
    suscripcionRaiz: {
      estado: "suspended",
      planId: "mvp_comercial",
      planVersion: 1,
      trialInicio: "2026-08-03",
      trialFin: "2026-09-02",
      revision: 2,
    },
  }));
  assert.equal(result.status, "LISTO_PARA_COMANDOS");
  assert.equal(result.readyForCanonicalCommands, true);
  assert.equal(result.commandExecutionAllowed, false);
});

test("preflight bloquea drift contractual y relaciones previas", () => {
  const result = evaluarTrialTransitionPreflight(snapshot({
    asOf: "2026-09-03",
    relaciones: [{ id: "rel-existing", estado: "trialing" }],
    planAnual: { estado: "PUBLICADA", periodicidad: "ANUAL", precio: { importe: 1_700_000, moneda: "COP" }, capacidades: [...ANNUAL_CAPABILITIES] },
    recoveryEvidenceRef: null,
  }));
  assert.equal(result.status, "BLOQUEADO");
  assert.ok(result.findings.some((finding) => finding.code === "ANNUAL_PLAN_INVALID"));
  assert.ok(result.findings.some((finding) => finding.code === "CONTRACTUAL_RELATION_ALREADY_EXISTS"));
  assert.ok(result.findings.some((finding) => finding.code === "RECOVERY_EVIDENCE_MISSING"));
});
