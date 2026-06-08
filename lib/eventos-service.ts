import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Evento {
  id: string;
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
  callback: (eventos: Evento[]) => void
): Unsubscribe {
  const constraints = [orderBy("fecha", "asc")];
  if (soloActivos) constraints.unshift(where("activo", "==", true));

  const q = query(collection(db, "eventos"), ...constraints);

  return onSnapshot(q, (snap) => {
    const eventos: Evento[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Evento, "id">),
    }));
    callback(eventos);
  });
}

export async function crearEvento(
  data: EventoInput,
  creadoPor: string
): Promise<string> {
  const ref = await addDoc(collection(db, "eventos"), {
    ...data,
    activo: true,
    creadoPor,
    creadoEn: serverTimestamp(),
  });
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
