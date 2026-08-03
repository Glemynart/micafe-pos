import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const E2E_P0_01_PROJECT_ID = process.env.E2E_P0_01_PROJECT_ID ?? "demo-p0-01-e2e";
export const E2E_P0_01_RUN_ID = process.env.E2E_P0_01_RUN_ID ?? `manual-${Date.now()}`;

function exigirEmulador(nombre: string, valor: string | undefined): string {
  if (!valor?.startsWith("127.0.0.1:")) {
    throw new Error(`P0-01 E2E requiere ${nombre} en localhost; se rechazó un destino no emulado.`);
  }
  return valor;
}

export function adminP001() {
  process.env.GCLOUD_PROJECT = E2E_P0_01_PROJECT_ID;
  process.env.FIRESTORE_EMULATOR_HOST = exigirEmulador(
    "FIRESTORE_EMULATOR_HOST",
    process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085",
  );
  process.env.FIREBASE_AUTH_EMULATOR_HOST = exigirEmulador(
    "FIREBASE_AUTH_EMULATOR_HOST",
    process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  );

  if (!getApps().length) initializeApp({ projectId: E2E_P0_01_PROJECT_ID });
  return { auth: getAuth(), db: getFirestore() };
}

export async function verificarSaludP001(): Promise<void> {
  const { auth, db } = adminP001();
  await auth.listUsers(1);
  const ping = db.collection("_e2e_p0_01_health").doc(E2E_P0_01_RUN_ID);
  await ping.set({ at: new Date().toISOString() });
  await ping.delete();
}
