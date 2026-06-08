import {
  collection,
  doc,
  getDoc,
  runTransaction,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

export interface Merma {
  id: string;
  fecha: unknown;
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  unidadMedida: string;
  motivo: string;
  costo: number;
  notas?: string;
  espacioId: string;
  registradoPor: string;
  registradoPorNombre: string;
}

export interface RegistrarMermaParams {
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  unidadMedida: string;
  motivo: string;
  costo: number;
  notas?: string;
  espacioId: string;
}

async function getCurrentUserInfo(): Promise<{ uid: string; nombre: string }> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Debe iniciar sesión para registrar una merma");

  const userSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
  const nombre = userSnap.exists() ? userSnap.data().nombre : currentUser.uid;

  return { uid: currentUser.uid, nombre };
}

export async function registrarMerma(params: RegistrarMermaParams): Promise<string> {
  const { uid, nombre } = await getCurrentUserInfo();
  const mermasRef = collection(db, "mermas");
  const nuevaMermaDoc = doc(mermasRef);

  await runTransaction(db, async (transaction) => {
    const insumoRef = doc(db, "insumos", params.insumoId);
    const insumoSnap = await transaction.get(insumoRef);

    if (insumoSnap.exists()) {
      const stockActual = insumoSnap.data().stock || 0;
      const nuevoStock = Math.max(0, stockActual - params.cantidad);
      transaction.update(insumoRef, { stock: nuevoStock, actualizadoEn: serverTimestamp() });
    }

    transaction.set(nuevaMermaDoc, {
      insumoId: params.insumoId,
      insumoNombre: params.insumoNombre,
      cantidad: params.cantidad,
      unidadMedida: params.unidadMedida,
      motivo: params.motivo,
      costo: params.costo,
      notas: params.notas,
      espacioId: params.espacioId,
      registradoPor: uid,
      registradoPorNombre: nombre,
      fecha: serverTimestamp(),
    });
  });

  return nuevaMermaDoc.id;
}

export function suscribirMermas(
  espacioId: string,
  callback: (mermas: Merma[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "mermas"),
    where("espacioId", "==", espacioId),
    orderBy("fecha", "desc")
  );

  return onSnapshot(q, (snap) => {
    const mermas: Merma[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Merma, "id">),
    }));
    callback(mermas);
  });
}
