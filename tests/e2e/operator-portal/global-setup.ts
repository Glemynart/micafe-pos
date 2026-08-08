import { execFileSync } from "node:child_process";

export default function globalSetup(): void {
  try {
    execFileSync(process.execPath, ["scripts/seed-emulador-capa4.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GCLOUD_PROJECT: process.env.OPERATOR_PORTAL_PROJECT_ID ?? "demo-operator-portal",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      },
      stdio: "inherit",
    });
  } catch (cause) {
    throw new Error(`No fue posible sembrar el entorno E2E: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
