import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const E2E_R1A_PROJECT_ID = process.env.E2E_R1A_PROJECT_ID ?? "demo-r1a-e2e";
export const E2E_R1A_RUN_ID = process.env.E2E_R1A_RUN_ID ?? `manual-${Date.now()}`;
export const E2E_R1A_FUNCTIONS_URL = `http://127.0.0.1:5001/${E2E_R1A_PROJECT_ID}/us-central1`;

function exigirEmulador(nombre: string, valor: string | undefined): string {
  if (!valor?.startsWith("127.0.0.1:")) {
    throw new Error(`R1-A E2E requiere ${nombre} en localhost; se rechazó un destino no emulado.`);
  }
  return valor;
}

export function adminE2E() {
  process.env.GCLOUD_PROJECT = E2E_R1A_PROJECT_ID;
  process.env.FIRESTORE_EMULATOR_HOST = exigirEmulador("FIRESTORE_EMULATOR_HOST", process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = exigirEmulador("FIREBASE_AUTH_EMULATOR_HOST", process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099");
  if (!getApps().length) initializeApp({ projectId: E2E_R1A_PROJECT_ID });
  return { auth: getAuth(), db: getFirestore() };
}

/** Health checks funcionales, no solo de procesos: Auth, Firestore y Callable. */
export async function verificarSaludE2E(): Promise<void> {
  const { auth, db } = adminE2E();
  await auth.listUsers(1);
  const ping = db.collection("_e2e_r1a_health").doc(E2E_R1A_RUN_ID);
  await ping.set({ at: new Date().toISOString() });
  await ping.delete();

  const respuesta = await fetch(`${E2E_R1A_FUNCTIONS_URL}/abrirTurnoOperativoV1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: {} }),
  });
  // Una Callable accesible rechaza esta llamada anónima; un 5xx indica función no disponible.
  if (respuesta.status >= 500 || ![400, 401, 403].includes(respuesta.status)) {
    throw new Error(`Health check de abrirTurnoOperativoV1 falló (HTTP ${respuesta.status}).`);
  }
}
