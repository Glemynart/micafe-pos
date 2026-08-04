import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const PROJECT_ID = process.env.E2E_P0_10_PROJECT_ID ?? "demo-p0-10-e2e";
export const RUN_ID = process.env.E2E_P0_10_RUN_ID ?? `p0-10-${Date.now()}`;
export const EVIDENCE_DIR = process.env.E2E_P0_10_EVIDENCE_DIR ?? `artifacts/e2e/p0-10/${RUN_ID}`;
export const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
export const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

export const PASSWORD = "P0-10-restore-password-123";
export const TENANT_COLLECTIONS = [
  "empresas",
  "configuraciones",
  "membresias",
  "espacios",
  "categorias",
  "cuentas_bancarias",
  "productos",
  "turnos",
  "ventas",
  "transacciones_financieras",
  "operaciones_auditoria",
] as const;

export interface TenantSpec {
  empresaId: string;
  ownerUid: string;
  email: string;
  espacioId: string;
  categoriaId: string;
  cuentaId: string;
  productoId: string;
  turnoId: string;
  ventaId: string;
  movimientoId: string;
  auditoriaId: string;
  nombre: string;
  totalVenta: number;
}

export function tenantSpecs(): TenantSpec[] {
  const safeRunId = RUN_ID.replace(/[^a-zA-Z0-9-]/g, "-");
  return ["a", "b"].map((letra, index) => {
    const empresaId = `e2e-p0-10-${safeRunId}-${letra}`;
    return {
      empresaId,
      ownerUid: `p010-owner-${safeRunId}-${letra}`,
      email: `p010-owner-${safeRunId}-${letra}@e2e.local`,
      espacioId: `${empresaId}-espacio`,
      categoriaId: `${empresaId}-categoria`,
      cuentaId: `${empresaId}-cuenta-principal`,
      productoId: `${empresaId}-producto-cafe`,
      turnoId: `${empresaId}-turno-1`,
      ventaId: `${empresaId}-venta-demo-1`,
      movimientoId: `${empresaId}-movimiento-1`,
      auditoriaId: `${empresaId}-auditoria-1`,
      nombre: `Tenant P0-10 ${index === 0 ? "A" : "B"}`,
      totalVenta: index === 0 ? 6000 : 9000,
    };
  });
}

export function exigirEmuladores(): void {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:")) {
    throw new Error("P0-10 exige FIRESTORE_EMULATOR_HOST en 127.0.0.1.");
  }
  if (!AUTH_EMULATOR_HOST?.startsWith("127.0.0.1:")) {
    throw new Error("P0-10 exige FIREBASE_AUTH_EMULATOR_HOST en 127.0.0.1.");
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("P0-10 rechaza credenciales de aplicación para evitar cualquier escritura productiva.");
  }
}

export function adminEmuladores() {
  exigirEmuladores();
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return { auth: getAuth(), db: getFirestore() };
}

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordenar(entry)]));
  }
  return value;
}

export function huella(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(ordenar(value))).digest("hex");
}

export async function snapshotTenant(db: FirebaseFirestore.Firestore, spec: TenantSpec): Promise<unknown[]> {
  const documents: unknown[] = [];
  for (const collection of TENANT_COLLECTIONS) {
    const snapshot = await db.collection(collection).where("empresaId", "==", spec.empresaId).get();
    for (const document of snapshot.docs.sort((a, b) => a.id.localeCompare(b.id))) {
      documents.push({ path: `${collection}/${document.id}`, data: document.data() });
    }
  }
  const usuario = await db.collection("usuarios").doc(spec.ownerUid).get();
  if (usuario.exists) documents.push({ path: `usuarios/${spec.ownerUid}`, data: usuario.data() });
  return documents;
}

export async function snapshotCompleto(db: FirebaseFirestore.Firestore, specs: TenantSpec[]): Promise<unknown[]> {
  const all: unknown[] = [];
  for (const spec of specs) all.push(...await snapshotTenant(db, spec));
  return all.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function leerManifest<T>(): T {
  return JSON.parse(readFileSync(`${EVIDENCE_DIR}/seed-manifest.json`, "utf8")) as T;
}

export function asegurarDirectorioEvidencia(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}
