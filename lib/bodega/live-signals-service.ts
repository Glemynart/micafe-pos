import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type CanalSenalBodega = "disponibilidad" | "solicitudes_admin" | "solicitudes_vendedor";
export type EstadoSenalBodega = { version: number | null; conectada: boolean };

const segmentoValido = (value: string) => value.trim().length > 0 && !value.includes("/");

export function rutaSenalBodega(empresaId: string, canal: CanalSenalBodega, uid?: string): string {
  if (!segmentoValido(empresaId)) throw new Error("Tenant inválido para escuchar señales Bodega.");
  if (canal === "solicitudes_vendedor") {
    if (!uid || !segmentoValido(uid)) throw new Error("La señal de solicitudes requiere el UID propio del vendedor.");
    return `empresas/${empresaId}/bodega_senales_vendedor/${uid}`;
  }
  if (uid !== undefined || (canal !== "disponibilidad" && canal !== "solicitudes_admin")) {
    throw new Error("Canal inválido para escuchar señales Bodega.");
  }
  return `empresas/${empresaId}/bodega_senales/${canal}`;
}

export function interpretarSnapshotSenalBodega(snapshot: any, empresaId: string): EstadoSenalBodega {
  if (snapshot.metadata?.fromCache) {
    const cached = snapshot.exists() ? snapshot.data() : null;
    const cachedVersion = cached?.empresaId === empresaId && Number.isSafeInteger(cached.version) && cached.version >= 0
      ? cached.version as number
      : null;
    return { version: cachedVersion, conectada: false };
  }
  if (!snapshot.exists()) return { version: 0, conectada: true };
  const value = snapshot.data();
  if (value?.empresaId !== empresaId || !Number.isSafeInteger(value.version) || value.version < 0) {
    return { version: null, conectada: false };
  }
  return { version: value.version as number, conectada: true };
}

/** Listens only to an authorized technical signal; callers must re-read canonical state via callable. */
export function suscribirSenalBodega(
  empresaId: string,
  canal: CanalSenalBodega,
  uid: string | undefined,
  callback: (state: EstadoSenalBodega) => void,
): Unsubscribe {
  const path = rutaSenalBodega(empresaId, canal, uid);
  return onSnapshot(
    doc(db, path),
    { includeMetadataChanges: true },
    snapshot => callback(interpretarSnapshotSenalBodega(snapshot, empresaId)),
    () => callback({ version: null, conectada: false }),
  );
}
