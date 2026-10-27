import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { fechaComercialUtc, type SnapshotContrato, type Suscripcion } from "../../../lib/suscripciones/contrato";
import { resolverModulosInicialesDelPlan } from "../configuracion/capacidades-plan";
import { proyectarModulosConCapacidadesVigentes } from "../tenant-configuration/shared";
import {
  CONCESION_REPORTES_DIANA,
  esConcesionReportesEfectiva,
  esContratoActualElegibleParaReportes,
  huellaSnapshotContrato,
  type ConcesionCapacidadReportes,
} from "./capacidad-concesion";
import { concederCapacidadReportesDiana, revocarCapacidadReportesDiana } from "./service";

class Ref {
  constructor(public path: string) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`); }
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
}

class Snap {
  constructor(private readonly value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return structuredClone(this.value); }
}

class Db {
  docs = new Map<string, any>();
  collection(name: string) { return new Ref(name); }
  seed(path: string, value: unknown) { this.docs.set(path, structuredClone(value)); }
  read(path: string) { return this.docs.get(path); }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const working = new Map([...this.docs].map(([path, value]) => [path, structuredClone(value)]));
    const tx = {
      get: async (ref: Ref) => new Snap(working.get(ref.path)),
      create: (ref: Ref, value: unknown) => {
        if (working.has(ref.path)) throw new Error("EXISTS");
        working.set(ref.path, structuredClone(value));
      },
    };
    const result = await callback(tx);
    this.docs = working;
    return result;
  }
}

const fechaEn = (dias: number) => fechaComercialUtc(new Date(Date.now() + dias * 86_400_000));
const trialInicio = fechaEn(0);
const trialFin = fechaEn(15);
const finPeriodoAnual = fechaEn(380);
const snapshot: SnapshotContrato = {
  schemaVersion: 2,
  planId: CONCESION_REPORTES_DIANA.planId,
  planVersion: CONCESION_REPORTES_DIANA.planVersion,
  codigoPlan: "MVP_COMERCIAL",
  periodicidad: "ANUAL",
  precio: { importe: CONCESION_REPORTES_DIANA.precioCop, moneda: "COP" },
  capacidades: ["sell", "inventory", "purchases", "shifts", "waste", "clientes", "finanzas"],
  limites: {},
  sedeConceptual: { cantidad: 1 },
  fiscalidad: null,
  vigencia: { inicio: trialInicio, fin: trialFin },
  trialDias: CONCESION_REPORTES_DIANA.trialDias,
  ofertaComercialId: CONCESION_REPORTES_DIANA.ofertaComercialId,
  referenciaAceptacionCliente: CONCESION_REPORTES_DIANA.referenciaAceptacionCliente,
};

function suscripcion(overrides: Partial<Suscripcion> = {}): Suscripcion {
  return {
    empresaId: CONCESION_REPORTES_DIANA.empresaId,
    planId: CONCESION_REPORTES_DIANA.planId,
    planVersion: CONCESION_REPORTES_DIANA.planVersion,
    estado: "trialing",
    trialInicio,
    trialFin,
    snapshotContrato: structuredClone(snapshot),
    revision: 1,
    schemaVersion: 1,
    ...overrides,
  };
}

const env = (name: string, expectedRevision = 1) => ({
  commandId: `cmd_reports_${name}`,
  idempotencyKey: `idem_reports_${name}`,
  correlationId: `corr_reports_${name}`,
  causationId: `cause_reports_${name}`,
  expectedRevision,
  motivo: "ADR-SAAS-095: capacidad operativa aprobada",
});
const ctx = { actorId: "operator_1", origen: "PLATFORM" as const };

function seedEligible(db: Db) {
  db.seed(`empresas/${CONCESION_REPORTES_DIANA.empresaId}`, {
    empresaId: CONCESION_REPORTES_DIANA.empresaId,
    estado: "trial",
    revision: 1,
  });
  db.seed(`suscripciones/${CONCESION_REPORTES_DIANA.empresaId}`, suscripcion());
}

test("la concesión solo acepta el contrato anual vigente y operativo de Diana", () => {
  assert.equal(esContratoActualElegibleParaReportes(
    CONCESION_REPORTES_DIANA.empresaId, "trial", suscripcion(), trialInicio,
  ), true);
  assert.equal(esContratoActualElegibleParaReportes(
    "otro-tenant", "trial", suscripcion(), trialInicio,
  ), false);
  assert.equal(esContratoActualElegibleParaReportes(
    CONCESION_REPORTES_DIANA.empresaId, "suspendida", suscripcion(), trialInicio,
  ), false);
  assert.equal(esContratoActualElegibleParaReportes(
    CONCESION_REPORTES_DIANA.empresaId, "trial", suscripcion({ estado: "suspended" }), trialInicio,
  ), false);
  assert.equal(esContratoActualElegibleParaReportes(
    CONCESION_REPORTES_DIANA.empresaId, "trial", suscripcion(), trialFin,
  ), false);
  assert.equal(esContratoActualElegibleParaReportes(
    CONCESION_REPORTES_DIANA.empresaId, "trial", suscripcion({ planVersion: 3 }), trialInicio,
  ), false);
});

test("la concesión queda ligada a la huella y al ciclo de vida del mismo snapshot", () => {
  const inicio = suscripcion();
  const concesion: ConcesionCapacidadReportes = {
    schemaVersion: 1,
    concesionId: CONCESION_REPORTES_DIANA.concesionId,
    empresaId: CONCESION_REPORTES_DIANA.empresaId,
    capacidad: "reports",
    planId: CONCESION_REPORTES_DIANA.planId,
    planVersion: CONCESION_REPORTES_DIANA.planVersion,
    revisionSuscripcionAlConceder: 1,
    huellaSnapshotContrato: huellaSnapshotContrato(snapshot),
    concedidaPor: "operator_1",
    commandId: "cmd_reports_grant",
    creadaEn: null,
  };
  assert.equal(esConcesionReportesEfectiva(concesion, inicio.empresaId, "trial", inicio, false, trialInicio), true);
  assert.equal(esConcesionReportesEfectiva(concesion, inicio.empresaId, "trial", inicio, true, trialInicio), false);

  const sameContractActive = suscripcion({
    estado: "active",
    trialInicio: undefined,
    trialFin: undefined,
    periodoInicio: trialFin,
    periodoFin: finPeriodoAnual,
    revision: 4,
  });
  assert.equal(esConcesionReportesEfectiva(concesion, sameContractActive.empresaId, "activa", sameContractActive, false, trialFin), true);

  const renewedSnapshot = structuredClone(snapshot);
  renewedSnapshot.fiscalidad = { pais: "CO" };
  const renewed = suscripcion({
    estado: "active",
    trialInicio: undefined,
    trialFin: undefined,
    periodoInicio: finPeriodoAnual,
    periodoFin: fechaEn(745),
    revision: 5,
    snapshotContrato: renewedSnapshot,
  });
  assert.equal(esConcesionReportesEfectiva(concesion, renewed.empresaId, "activa", renewed, false, fechaEn(381)), false);
});

test("la concesión es transaccional, idempotente, tenant-bound y no muta el snapshot ni la suscripción", async () => {
  const db = new Db();
  seedEligible(db);
  const before = JSON.stringify(db.read(`suscripciones/${CONCESION_REPORTES_DIANA.empresaId}`));
  const entrada = { ...env("grant"), empresaId: CONCESION_REPORTES_DIANA.empresaId };
  const granted = await concederCapacidadReportesDiana(db as unknown as Firestore, entrada, ctx);
  assert.equal(granted.idempotente, false);
  assert.equal(granted.capacidad, "reports");
  assert.equal(JSON.stringify(db.read(`suscripciones/${CONCESION_REPORTES_DIANA.empresaId}`)), before);

  const path = `suscripciones/${CONCESION_REPORTES_DIANA.empresaId}/concesionesCapacidad/${CONCESION_REPORTES_DIANA.concesionId}`;
  const concession = db.read(path) as ConcesionCapacidadReportes;
  assert.equal(concession.huellaSnapshotContrato, huellaSnapshotContrato(snapshot));
  const retried = await concederCapacidadReportesDiana(db as unknown as Firestore, entrada, ctx);
  assert.equal(retried.idempotente, true);

  await assert.rejects(
    concederCapacidadReportesDiana(db as unknown as Firestore, { ...env("other-tenant"), empresaId: "otro-tenant" }, ctx),
    (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
  );
  await assert.rejects(
    concederCapacidadReportesDiana(db as unknown as Firestore, { ...env("duplicate"), empresaId: CONCESION_REPORTES_DIANA.empresaId }, ctx),
    (error: unknown) => error instanceof HttpsError && error.message === "CONCESION_REPORTS_YA_EXISTE",
  );

  const staleDb = new Db();
  seedEligible(staleDb);
  await assert.rejects(
    concederCapacidadReportesDiana(staleDb as unknown as Firestore, { ...env("stale", 2), empresaId: CONCESION_REPORTES_DIANA.empresaId }, ctx),
    (error: unknown) => error instanceof HttpsError && error.message === "SUSCRIPCION_REVISION_CONFLICT",
  );
});

test("la revocación agrega un marcador, es idempotente y no borra la concesión", async () => {
  const db = new Db();
  seedEligible(db);
  const empresaId = CONCESION_REPORTES_DIANA.empresaId;
  await concederCapacidadReportesDiana(db as unknown as Firestore, { ...env("grant-for-revoke"), empresaId }, ctx);
  const concesionPath = `suscripciones/${empresaId}/concesionesCapacidad/${CONCESION_REPORTES_DIANA.concesionId}`;
  const revocar = { ...env("revoke"), empresaId };
  const result = await revocarCapacidadReportesDiana(db as unknown as Firestore, revocar, ctx);
  assert.equal(result.idempotente, false);
  assert.ok(db.read(concesionPath));
  const revocationPath = `${concesionPath}/revocaciones/adr-saas-095`;
  assert.ok(db.read(revocationPath));
  const repeated = await revocarCapacidadReportesDiana(db as unknown as Firestore, revocar, ctx);
  assert.equal(repeated.idempotente, true);
});

test("el resolver solo suma reports con concesión no revocada y contrato raíz vigente", async () => {
  const db = new Db();
  seedEligible(db);
  db.seed(`planes/${CONCESION_REPORTES_DIANA.planId}/versiones/${CONCESION_REPORTES_DIANA.planVersion}`, {
    capacidades: snapshot.capacidades,
  });
  const companyId = CONCESION_REPORTES_DIANA.empresaId;
  const concessionPath = `suscripciones/${companyId}/concesionesCapacidad/${CONCESION_REPORTES_DIANA.concesionId}`;
  const sub = suscripcion();
  const reference = (path: string): any => ({
    collection: (child: string) => reference(`${path}/${child}`),
    doc: (child: string) => reference(`${path}/${child}`),
    get: async () => new Snap(db.read(path)),
  });
  const resolverDb = {
    collection: (name: string) => reference(name),
  };
  const withoutConcession = await resolverModulosInicialesDelPlan(resolverDb as unknown as Firestore, companyId);
  assert.equal(withoutConcession.includes("reports"), false);

  db.seed(concessionPath, {
    schemaVersion: 1,
    concesionId: CONCESION_REPORTES_DIANA.concesionId,
    empresaId: companyId,
    capacidad: "reports",
    planId: sub.planId,
    planVersion: sub.planVersion,
    revisionSuscripcionAlConceder: 1,
    huellaSnapshotContrato: huellaSnapshotContrato(snapshot),
  });
  const allowed = await resolverModulosInicialesDelPlan(resolverDb as unknown as Firestore, companyId);
  assert.ok(allowed.includes("reports"));

  db.seed(`${concessionPath}/revocaciones/adr-saas-095`, { revocacionId: "adr-saas-095" });
  const revoked = await resolverModulosInicialesDelPlan(resolverDb as unknown as Firestore, companyId);
  assert.equal(revoked.includes("reports"), false);
});

test("la lectura de configuración filtra una capacidad guardada cuando ya no pertenece al contrato", () => {
  const configuracion = {
    empresaId: CONCESION_REPORTES_DIANA.empresaId,
    revision: 7,
    modulos: { habilitados: ["sell", "reports"] },
  } as any;
  const before = JSON.stringify(configuracion);
  const filtered = proyectarModulosConCapacidadesVigentes(configuracion, ["sell"]);
  assert.deepEqual(filtered.modulos.habilitados, ["sell"]);
  assert.deepEqual(configuracion.modulos.habilitados, ["sell", "reports"]);
  assert.equal(JSON.stringify(configuracion), before);
  assert.deepEqual(
    proyectarModulosConCapacidadesVigentes(configuracion, ["sell", "reports"]).modulos.habilitados,
    ["sell", "reports"],
  );
});
