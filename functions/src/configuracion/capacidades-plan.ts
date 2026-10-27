import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { esSnapshotContratoCompatible, fechaComercialUtc, type PlanVersion, type Suscripcion } from "../../../lib/suscripciones/contrato";
import { resolverModulosHabilitados } from "../../../lib/configuracion/modulos-plan";
import { leerRelacionContractualVigente } from "../suscripciones/relacion-vigente";
import { CONCESION_REPORTES_DIANA, esConcesionReportesEfectiva, type VinculoContratoReportes } from "../suscripciones/capacidad-concesion";

async function resolverCapacidadesContrato(
  db: Firestore,
  empresaId: string,
  suscripcion: Suscripcion,
  contratoVigente: VinculoContratoReportes,
): Promise<ReturnType<typeof resolverModulosHabilitados>> {
  const snapshot = suscripcion.snapshotContrato;
  const capacidades = Array.isArray(snapshot?.capacidades) ? [...snapshot.capacidades] : [];
  if (capacidades.length === 0) throw new HttpsError("failed-precondition", "CONTRATO_SIN_CAPACIDADES");

  if (!capacidades.includes(CONCESION_REPORTES_DIANA.capacidad)
    && empresaId === CONCESION_REPORTES_DIANA.empresaId
    && suscripcion.planId === CONCESION_REPORTES_DIANA.planId
    && suscripcion.planVersion === CONCESION_REPORTES_DIANA.planVersion) {
    const suscripcionRef = db.collection("suscripciones").doc(empresaId);
    const concesionRef = suscripcionRef.collection("concesionesCapacidad")
      .doc(CONCESION_REPORTES_DIANA.concesionId);
    const revocacionRef = concesionRef.collection("revocaciones").doc("adr-saas-095");
    const [empresaSnap, concesionSnap, revocacionSnap] = await Promise.all([
      db.collection("empresas").doc(empresaId).get(),
      concesionRef.get(),
      revocacionRef.get(),
    ]);
    if (esConcesionReportesEfectiva(
      concesionSnap.data(),
      empresaId,
      empresaSnap.data()?.estado,
      suscripcion,
      contratoVigente,
      revocacionSnap.exists,
      fechaComercialUtc(),
    )) {
      capacidades.push(CONCESION_REPORTES_DIANA.capacidad);
    }
  }
  return resolverModulosHabilitados(capacidades, capacidades);
}

/** Resuelve la versión de Plan contratada, no la versión actualmente visible. */
export async function resolverModulosInicialesDelPlan(
  db: Firestore,
  empresaId: string,
): Promise<ReturnType<typeof resolverModulosHabilitados>> {
  const relacionVigente = await leerRelacionContractualVigente(db, empresaId);
  if (relacionVigente) {
    if (relacionVigente.estado !== "trialing" && relacionVigente.estado !== "active") {
      throw new HttpsError("failed-precondition", "RELACION_CONTRACTUAL_NO_OPERATIVA");
    }
    const suscripcionRelacion: Suscripcion = relacionVigente;
    return resolverCapacidadesContrato(db, empresaId, suscripcionRelacion, {
      tipoContrato: "RELACION_CONTRACTUAL",
      contratoId: relacionVigente.relacionId,
      revision: relacionVigente.revision,
    });
  }

  const suscripcionSnap = await db.collection("suscripciones").doc(empresaId).get();
  if (!suscripcionSnap.exists) throw new HttpsError("failed-precondition", "SUSCRIPCION_NOT_FOUND");

  const suscripcion = suscripcionSnap.data() as Suscripcion;
  if (suscripcion.snapshotContrato) {
    if (!esSnapshotContratoCompatible(suscripcion.snapshotContrato)
      || suscripcion.snapshotContrato.planId !== suscripcion.planId
      || suscripcion.snapshotContrato.planVersion !== suscripcion.planVersion) {
      throw new HttpsError("failed-precondition", "SNAPSHOT_CONTRATO_VERSION_UNSUPPORTED");
    }
    return resolverCapacidadesContrato(db, empresaId, suscripcion, {
      tipoContrato: "SUSCRIPCION",
      contratoId: empresaId,
      revision: suscripcion.revision,
    });
  }

  const planSnap = await db.collection("planes").doc(suscripcion.planId)
    .collection("versiones").doc(String(suscripcion.planVersion)).get();
  if (!planSnap.exists) throw new HttpsError("failed-precondition", "PLAN_VERSION_NOT_FOUND");

  const plan = planSnap.data() as PlanVersion;
  const capacidades = Array.isArray(plan.capacidades) ? plan.capacidades : [];
  // B1 no define una selección de módulos adicional durante el onboarding:
  // el Plan seleccionado es la selección inicial del tenant.
  return resolverModulosHabilitados(capacidades, capacidades);
}
