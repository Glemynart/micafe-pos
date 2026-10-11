import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "bodega_senales";
const SELLER_COLLECTION = "bodega_senales_vendedor";

function signalRef(db: any, empresaId: string, channel: string) {
  return db.collection(`empresas/${empresaId}/${COLLECTION}`).doc(channel);
}

function writeSignal(tx: any, ref: any, empresaId: string, uid?: string) {
  tx.set(ref, {
    empresaId,
    ...(uid ? { uid } : {}),
    version: FieldValue.increment(1),
    actualizadoEn: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** Bump availability only after the canonical transaction has changed catalog/stock. */
export function marcarSenalDisponibilidadBodega(tx: any, db: any, empresaId: string) {
  writeSignal(tx, signalRef(db, empresaId, "disponibilidad"), empresaId);
}

/** Bump the protected admin inbox after a canonical request transition. */
export function marcarSenalSolicitudesAdminBodega(tx: any, db: any, empresaId: string) {
  writeSignal(tx, signalRef(db, empresaId, "solicitudes_admin"), empresaId);
}

/** A seller can query only this technical signal; request data remains callable-only. */
export function marcarSenalSolicitudesVendedorBodega(tx: any, db: any, empresaId: string, uid: string) {
  if (!uid.trim() || uid.includes("/")) throw new Error("UID de vendedor inválido para actualizar la señal Bodega.");
  const ref = db.collection(`empresas/${empresaId}/${SELLER_COLLECTION}`).doc(uid);
  writeSignal(tx, ref, empresaId, uid);
}
