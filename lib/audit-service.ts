import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  orderBy,
  limit,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import { tenantQuery, stampEmpresaId } from "@/lib/tenant";

export type AccionAuditable =
  | "login"
  | "logout"
  | "cambio_rol"
  | "creacion_usuario"
  | "toggle_usuario"
  | "cambio_permisos"
  | "creacion_producto"
  | "edicion_producto"
  | "creacion_compra"
  | "creacion_merma"
  | "creacion_evento"
  | "edicion_evento"
  | "creacion_espacio"
  | "edicion_espacio"
  | "cambio_modulos"
  | "configuracion";

export interface RegistroAuditoria {
  accion: AccionAuditable;
  detalle: string;
  uid: string;
  timestamp: Timestamp;
}

export async function registrarAuditoria(
  accion: AccionAuditable,
  detalle: string
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;

  try {
    await addDoc(collection(db, "auditoria_logs"), await stampEmpresaId({
      accion,
      detalle,
      uid: user.uid,
      timestamp: serverTimestamp(),
    }));
  } catch {
    // fallback silencioso: la auditoría no debe bloquear la app
  }
}

export async function obtenerLogsAuditoria(
  maxRegistros = 100
): Promise<RegistroAuditoria[]> {
  const q = await tenantQuery(
    collection(db, "auditoria_logs"),
    orderBy("timestamp", "desc"),
    limit(maxRegistros)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
}
