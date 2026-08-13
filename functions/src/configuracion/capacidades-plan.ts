import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import type { PlanVersion, Suscripcion } from "../../../lib/suscripciones/contrato";
import { resolverModulosHabilitados } from "../../../lib/configuracion/modulos-plan";
import { leerRelacionContractualVigente } from "../suscripciones/relacion-vigente";

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
    const capacidades = Array.isArray(relacionVigente.snapshotContrato.capacidades)
      ? relacionVigente.snapshotContrato.capacidades
      : [];
    if (capacidades.length === 0) throw new HttpsError("failed-precondition", "RELACION_CONTRACTUAL_INVALIDA");
    return resolverModulosHabilitados(capacidades, capacidades);
  }

  const suscripcionSnap = await db.collection("suscripciones").doc(empresaId).get();
  if (!suscripcionSnap.exists) throw new HttpsError("failed-precondition", "SUSCRIPCION_NOT_FOUND");

  const suscripcion = suscripcionSnap.data() as Suscripcion;
  const planSnap = await db.collection("planes").doc(suscripcion.planId)
    .collection("versiones").doc(String(suscripcion.planVersion)).get();
  if (!planSnap.exists) throw new HttpsError("failed-precondition", "PLAN_VERSION_NOT_FOUND");

  const plan = planSnap.data() as PlanVersion;
  const capacidades = Array.isArray(plan.capacidades) ? plan.capacidades : [];
  // B1 no define una selección de módulos adicional durante el onboarding:
  // el Plan seleccionado es la selección inicial del tenant.
  return resolverModulosHabilitados(capacidades, capacidades);
}
