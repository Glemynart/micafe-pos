import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { verificarSaludE2E } from "./entorno";

export default async function globalSetup(): Promise<void> {
  await verificarSaludE2E();
  const directory = resolve(process.env.E2E_R1A_EVIDENCE_DIR ?? "artifacts/e2e/r1a/manual");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "environment.json"), JSON.stringify({
    runId: process.env.E2E_R1A_RUN_ID,
    projectId: process.env.E2E_R1A_PROJECT_ID,
    node: process.version,
    platform: process.platform,
    startedAt: new Date().toISOString(),
  }, null, 2));
}
