import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { RelacionContractual, Suscripcion } from "../../../lib/suscripciones/contrato";

/** Lee la relación contractual vigente desde el control derivado del agregado. */
export async function leerRelacionContractualVigente(
  db: Firestore,
  empresaId: string,
): Promise<RelacionContractual | null> {
  const relacionesRef = db.collection("suscripciones").doc(empresaId).collection("relaciones");
  const controlSnap = await relacionesRef.doc("_vigente").get();
  if (!controlSnap.exists) return null;
  const relacionId = controlSnap.data()?.relacionVigenteId;
  if (typeof relacionId !== "string") throw new HttpsError("failed-precondition", "RELACION_CONTRACTUAL_INVALIDA");
  const relacionSnap = await relacionesRef.doc(relacionId).get();
  if (!relacionSnap.exists) throw new HttpsError("failed-precondition", "RELACION_CONTRACTUAL_NOT_FOUND");
  const relacion = relacionSnap.data() as RelacionContractual;
  if (relacion.relacionId !== relacionId || relacion.empresaId !== empresaId || relacion.schemaVersion !== 1) {
    throw new HttpsError("failed-precondition", "RELACION_CONTRACTUAL_INVALIDA");
  }
  return relacion;
}

/** Proyecta una relación en la forma que esperan los lectores legacy de Suscripción. */
export function proyectarSuscripcionDesdeRelacion(
  raiz: Suscripcion,
  relacion: RelacionContractual,
): Suscripcion {
  const vigencia = relacion.snapshotContrato.vigencia;
  return {
    ...raiz,
    empresaId: relacion.empresaId,
    planId: relacion.planId,
    planVersion: relacion.planVersion,
    estado: relacion.estado,
    ...(relacion.estado === "trialing"
      ? { trialInicio: relacion.trialInicio ?? vigencia.inicio, trialFin: relacion.trialFin ?? vigencia.fin }
      : { trialInicio: undefined, trialFin: undefined }),
    ...(relacion.periodoInicio ? { periodoInicio: relacion.periodoInicio } : {}),
    ...(relacion.periodoFin ? { periodoFin: relacion.periodoFin } : {}),
    ...(relacion.cancelacionProgramadaPara ? { cancelacionProgramadaPara: relacion.cancelacionProgramadaPara } : {}),
    ...(relacion.canceladaEn ? { canceladaEn: relacion.canceladaEn } : {}),
    ...(relacion.ultimoPagoAnualId ? { ultimoPagoAnualId: relacion.ultimoPagoAnualId } : {}),
    snapshotContrato: relacion.snapshotContrato,
    revision: relacion.revision,
    schemaVersion: 1,
  };
}
