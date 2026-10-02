import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { CredencialOperativa } from "../contracts";
export { normalizarPermisosEfectivos } from "../tenant-permissions";
export { actualizarClaimsTenant, emitirSesionTenant } from "../credential-core/emitir-sesion-tenant";

const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

/** Helpers neutrales de contexto tenant; no registran callables ni Secrets. */
export function validarSnapshotEmpresaEscribible(
  snap: { exists: boolean; id: string; data(): FirebaseFirestore.DocumentData | undefined },
): { id: string; estado: string } {
  const estado = snap.data()?.estado;
  if (!snap.exists || (estado !== "activa" && estado !== "trial")) {
    throw new HttpsError("failed-precondition", "La empresa no permite operaciones de escritura en su estado actual.");
  }
  return { id: snap.id, estado };
}

export async function registrarFallo(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  const db = ref.firestore;
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const actual = snap.data() as CredencialOperativa;
    const fallos = (actual.fallosConsecutivos ?? 0) + 1;
    const bloqueadoHasta = fallos >= MAX_FALLOS
      ? Timestamp.fromMillis(Date.now() + BLOQUEO_MS)
      : null;
    transaction.update(ref, {
      fallosConsecutivos: fallos >= MAX_FALLOS ? 0 : fallos,
      bloqueadoHasta,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
  });
}

export async function estaBloqueada(ref: FirebaseFirestore.DocumentReference): Promise<boolean> {
  const snap = await ref.get();
  const bloqueadoHasta = (snap.data() as CredencialOperativa | undefined)?.bloqueadoHasta;
  return !!bloqueadoHasta && bloqueadoHasta.toMillis() > Date.now();
}
