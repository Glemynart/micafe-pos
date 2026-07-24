import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FACULTADES_PLATAFORMA, esFacultadPlataforma } from "./contracts";
import { bootstrapOperadorInicial } from "./initial-bootstrap";

async function main() {
  const uid = process.env.SAAS_BOOTSTRAP_UID;
  const requested = (process.env.SAAS_BOOTSTRAP_FACULTADES ?? FACULTADES_PLATAFORMA.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!uid || !requested.every(esFacultadPlataforma)) {
    throw new Error("Defina SAAS_BOOTSTRAP_UID y facultades canónicas válidas.");
  }
  if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
  const result = await bootstrapOperadorInicial(
    getFirestore(),
    { uid, facultades: requested },
    getAuth(),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "BOOTSTRAP_FAILED"}\n`);
  process.exitCode = 1;
});

