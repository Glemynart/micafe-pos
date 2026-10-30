import { FieldValue } from "firebase-admin/firestore";

const COLLECTION = "secuencias_documentales";
const DOCUMENT = "recibo-interno-venta-bodega";

export interface SecuenciaReciboInternoPendiente {
  ref: any;
  existe: boolean;
  ultimoConsecutivo: number;
  consecutivo: number;
  folioInterno: string;
}

/** Lee la secuencia tenant-scoped antes de que la transacción empiece a escribir. */
export async function leerSiguienteSecuenciaReciboInterno(tx: any, db: any, empresaId: string): Promise<SecuenciaReciboInternoPendiente> {
  const ref = db.collection("empresas").doc(empresaId).collection(COLLECTION).doc(DOCUMENT);
  const snapshot = await tx.get(ref);
  const ultimoConsecutivo = snapshot.exists ? snapshot.data()?.ultimoConsecutivo : 0;
  if (!Number.isSafeInteger(ultimoConsecutivo) || ultimoConsecutivo < 0 || ultimoConsecutivo >= Number.MAX_SAFE_INTEGER) {
    throw new Error("SECUENCIA_RECIBO_INTERNO_INVALIDA");
  }
  const consecutivo = ultimoConsecutivo + 1;
  return {
    ref,
    existe: snapshot.exists,
    ultimoConsecutivo,
    consecutivo,
    folioInterno: `BOD-${String(consecutivo).padStart(6, "0")}`,
  };
}

/** Persiste la secuencia en la misma transacción que confirma la venta. */
export function guardarSecuenciaReciboInterno(tx: any, empresaId: string, secuencia: SecuenciaReciboInternoPendiente): void {
  const data = {
    empresaId,
    tipoDocumento: "RECIBO_INTERNO_VENTA_BODEGA",
    ultimoConsecutivo: secuencia.consecutivo,
    actualizadoEn: FieldValue.serverTimestamp(),
  };
  if (secuencia.existe) tx.update(secuencia.ref, data);
  else tx.create(secuencia.ref, { ...data, creadoEn: FieldValue.serverTimestamp() });
}
