import {
  doc,
  onSnapshot,
  setDoc,
  runTransaction,
  getDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ConfiguracionGlobal {
  nombre_tienda: string;
  nit_tienda: string;
  direccion_tienda: string;
  telefono: string;
  email: string;
  logoUrl?: string;

  prefijo_factura: string;
  consecutivo_actual: number;
  resolucion_dian: string;
  tipo_contribuyente: string;
  responsable_iva: string;
  mensaje_ticket: string;

  modulos_habilitados: string[];
}

const DEFAULT_MODULOS = [
  "sell", "kitchen", "inventory", "recipes", "purchases",
  "reports", "shifts", "waste", "permissions", "settings",
  "cuentas_cobro", "clientes", "consignaciones", "alquiler_dashboard",
  "gastos", "historial",
];

const DEFAULT_CONFIG: ConfiguracionGlobal = {
  nombre_tienda: "Mi Cafe Especial",
  nit_tienda: "900.123.456-7",
  direccion_tienda: "Calle 123 #45-67, Bogota",
  telefono: "+57 300 123 4567",
  email: "demo@example.com",
  prefijo_factura: "POS",
  consecutivo_actual: 0,
  resolucion_dian: "",
  tipo_contribuyente: "Regimen Simplificado",
  responsable_iva: "0",
  mensaje_ticket: "GRACIAS POR SU COMPRA!",
  modulos_habilitados: [...DEFAULT_MODULOS],
};

export function suscribirConfiguracion(
  callback: (config: ConfiguracionGlobal) => void
): Unsubscribe {
  const docRef = doc(db, "configuracion", "general");

  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as ConfiguracionGlobal);
    } else {
      callback(DEFAULT_CONFIG);
    }
  });
}

export async function guardarConfiguracion(config: Partial<ConfiguracionGlobal>): Promise<void> {
  const docRef = doc(db, "configuracion", "general");
  await setDoc(docRef, config, { merge: true });
}

export async function incrementarConsecutivoTicket(): Promise<number> {
  const docRef = doc(db, "configuracion", "general");

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    let nuevoConsecutivo = 1;

    if (snap.exists()) {
      const data = snap.data() as ConfiguracionGlobal;
      nuevoConsecutivo = (data.consecutivo_actual || 0) + 1;
    }

    transaction.set(docRef, { consecutivo_actual: nuevoConsecutivo }, { merge: true });

    return nuevoConsecutivo;
  });
}

export { DEFAULT_MODULOS };
