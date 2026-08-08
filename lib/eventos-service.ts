import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { tenantQuery, stampEmpresaId } from "@/lib/tenant";

export interface Evento {
  id: string;
  empresaId: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  hora: string;
  imagenUrl?: string;
  categoria: string;
  activo: boolean;
  creadoPor: string;
  creadoEn?: unknown;
}

export interface EventoInput {
  titulo: string;
  descripcion: string;
  fecha: string;
  hora: string;
  imagenUrl?: string;
  categoria: string;
}

export function suscribirEventos(
  soloActivos: boolean,
  callback: (eventos: Evento[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;
  const constraints: QueryConstraint[] = [orderBy("fecha", "asc")];
  if (soloActivos) constraints.unshift(where("activo", "==", true));

  tenantQuery(collection(db, "eventos"), ...constraints).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      const eventos: Evento[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Evento, "id">),
      }));
      callback(eventos);
    }, (error) => {
      console.error("suscribirEventos error:", error.message);
      onError?.(error);
    });
  }).catch((error: unknown) => {
    const resolved = error instanceof Error ? error : new Error("No se pudieron cargar los eventos.");
    console.error("suscribirEventos tenant error:", resolved.message);
    onError?.(resolved);
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

/** Genera el ID del documento antes de subir el asset para correlacionarlo con Storage. */
export function generarEventoId(): string {
  return doc(collection(db, "eventos")).id;
}

export async function crearEvento(
  data: EventoInput,
  creadoPor: string,
  eventoId = generarEventoId(),
): Promise<string> {
  const ref = doc(db, "eventos", eventoId);
  const payload = await stampEmpresaId({
    ...data,
    activo: true,
    creadoPor,
    creadoEn: serverTimestamp(),
  });
  await setDoc(ref, payload);

  // Disparar Webhook de Make.com si está configurado
  const webhookUrl = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ref.id,
        empresaId: payload.empresaId,
        ...data,
      })
    }).catch(err => console.error("Error disparando webhook de Make:", err));
  }

  return ref.id;
}

export async function editarEvento(
  id: string,
  data: Partial<EventoInput>
): Promise<void> {
  await updateDoc(doc(db, "eventos", id), data as any);
}

export async function toggleEvento(id: string, activo: boolean): Promise<void> {
  await updateDoc(doc(db, "eventos", id), { activo });
}

export async function eliminarEvento(id: string): Promise<void> {
  await deleteDoc(doc(db, "eventos", id));
}

export const CATEGORIAS_EVENTOS = [
  "Musica en vivo",
  "Taller",
  "Conferencia",
  "Networking",
  "Arte y Cultura",
  "Gastronomia",
  "Otro",
];
