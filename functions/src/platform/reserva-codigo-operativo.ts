import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

const RESERVAS_CODIGOS_OPERATIVOS_COLLECTION = "reservas_codigos_operativos";
const CREDENCIALES_OPERATIVAS_COLLECTION = "credenciales_operativas";

export const CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO = "CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO";

export function idReservaCodigoOperativo(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

/**
 * Reserva permanentemente un código operativo dentro de la transacción que
 * crea la credencial. La reserva es la fuente de verdad para códigos nuevos.
 *
 * La consulta a credenciales solo protege datos históricos creados antes de
 * introducir reservas; nunca se usa para autorizar códigos nuevos.
 */
export async function reservarCodigoOperativoEnTransaccion(
  db: Firestore,
  tx: Transaction,
  codigo: string,
): Promise<void> {
  const reservaRef = db
    .collection(RESERVAS_CODIGOS_OPERATIVOS_COLLECTION)
    .doc(idReservaCodigoOperativo(codigo));
  const credencialesHistoricas = db
    .collection(CREDENCIALES_OPERATIVAS_COLLECTION)
    .where("codigo", "==", codigo)
    .limit(1);

  const [reservaSnap, credencialesHistoricasSnap] = await Promise.all([
    tx.get(reservaRef),
    tx.get(credencialesHistoricas),
  ]);
  if (reservaSnap.exists || !credencialesHistoricasSnap.empty) {
    throw new HttpsError("already-exists", CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO);
  }

  tx.create(reservaRef, {
    codigo,
    creadaEn: FieldValue.serverTimestamp(),
  });
}
