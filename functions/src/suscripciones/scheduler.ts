import type { Firestore } from "firebase-admin/firestore";
import { fechaComercialUtc } from "../../../lib/suscripciones/contrato";
import { suspenderPeriodoAnualVencido, suspenderTrialVencido } from "./service";

/**
 * MT-U9 expiry reconciliation. It is deliberately a bounded, repeatable
 * process; the command and Rules gates remain authoritative if the schedule is
 * delayed. No archive/delete operation is performed here.
 */
export async function reconciliarVencimientosComerciales(db: Firestore) {
  const hoy = fechaComercialUtc();
  const [trials, activos] = await Promise.all([
    db.collection("suscripciones").where("estado", "==", "trialing").limit(100).get(),
    db.collection("suscripciones").where("estado", "==", "active").limit(100).get(),
  ]);
  let trialsProcesados = 0;
  let periodosProcesados = 0;
  for (const doc of trials.docs) {
    if (doc.data()?.trialFin && doc.data().trialFin <= hoy) {
      await suspenderTrialVencido(db, doc.id, hoy);
      trialsProcesados += 1;
    }
  }
  for (const doc of activos.docs) {
    if (doc.data()?.periodoFin && doc.data().periodoFin <= hoy) {
      await suspenderPeriodoAnualVencido(db, doc.id, hoy);
      periodosProcesados += 1;
    }
  }
  return { hoy, trialsProcesados, periodosProcesados };
}
