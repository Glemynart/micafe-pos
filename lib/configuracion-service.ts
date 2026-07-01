import {
  doc,
  onSnapshot,
  setDoc,
  runTransaction,
  getDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { REGIMEN_TRIBUTARIO_DEFAULT, type RegimenTributario } from "@/lib/impuestos-service";

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
  // ADR-TRIB-001 D2/D7: régimen tributario de la Empresa. Fuente única del
  // cálculo de impuesto y del rótulo fiscal del ticket. `responsable_iva`
  // (arriba) queda vestigial: no se lee para calcular ni para el rótulo.
  regimenTributario?: RegimenTributario;
  mensaje_ticket: string;

  modulos_habilitados: string[];

  baseCajaSugerida: number;
  umbralAlertaFaltante: number;
}

const DEFAULT_MODULOS = [
  "sell", "salon", "kitchen", "inventory", "recipes", "purchases",
  "reports", "shifts", "waste", "permissions", "settings",
  "cuentas_cobro", "clientes", "consignaciones", "alquiler_dashboard",
  "gastos", "historial", "reservas", "finanzas",
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
  regimenTributario: REGIMEN_TRIBUTARIO_DEFAULT,
  mensaje_ticket: "GRACIAS POR SU COMPRA!",
  modulos_habilitados: [...DEFAULT_MODULOS],
  baseCajaSugerida: 200000,
  umbralAlertaFaltante: 20000,
};

export function suscribirConfiguracion(
  callback: (config: ConfiguracionGlobal) => void
): Unsubscribe {
  const docRef = doc(db, "configuracion", "general");

  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as ConfiguracionGlobal;
      // Documentos existentes anteriores a ADR-TRIB-001 no tienen el campo;
      // el default se aplica en este único punto de lectura (INV-7).
      callback({ ...data, regimenTributario: data.regimenTributario ?? REGIMEN_TRIBUTARIO_DEFAULT });
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
