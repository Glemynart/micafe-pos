import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, getFirebaseFunctions } from "@/lib/firebase";
import { tenantQuery } from "@/lib/tenant";

export const ESTADOS_PROVEEDOR = ["ACTIVO", "INACTIVO"] as const;
export type EstadoProveedor = typeof ESTADOS_PROVEEDOR[number];

export interface Proveedor {
  id: string;
  empresaId: string;
  nombre: string;
  nit?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  estado: EstadoProveedor;
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export interface ProveedorInput {
  nombre: string;
  nit?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

function ordenar(proveedores: Proveedor[]): Proveedor[] {
  return proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

export function suscribirProveedores(callback: (proveedores: Proveedor[]) => void): Unsubscribe {
  let unsubscribe = () => {};
  let cancelado = false;
  tenantQuery(collection(db, "proveedores")).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snap) => {
      callback(ordenar(snap.docs.map((documento) => ({
        id: documento.id,
        ...(documento.data() as Omit<Proveedor, "id">),
      }))));
    }, (error) => console.error("suscribirProveedores error:", error.message));
  });
  return () => {
    cancelado = true;
    unsubscribe();
  };
}

export async function crearProveedor(input: ProveedorInput): Promise<string> {
  const result = await httpsCallable<ProveedorInput, { proveedorId: string }>(getFirebaseFunctions(), "crearProveedorOperativoV1")(input);
  return result.data.proveedorId;
}

export async function actualizarProveedor(proveedorId: string, input: ProveedorInput): Promise<void> {
  await httpsCallable<ProveedorInput & { proveedorId: string }, unknown>(getFirebaseFunctions(), "actualizarProveedorOperativoV1")({ proveedorId, ...input });
}

export async function desactivarProveedor(proveedorId: string): Promise<void> {
  await httpsCallable<{ proveedorId: string }, unknown>(getFirebaseFunctions(), "desactivarProveedorOperativoV1")({ proveedorId });
}
