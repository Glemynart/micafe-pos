import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  crearEndpointsEmulador,
  exigirProjectIdEmulador,
  esperarEmuladoresSaludables,
} from "./emulator-preflight.mjs";

const evidenceDir = resolve(process.env.E2E_P0_01_EVIDENCE_DIR ?? "artifacts/e2e/p0-01/manual");
const projectId = exigirProjectIdEmulador(process.env.E2E_P0_01_PROJECT_ID ?? process.env.GCLOUD_PROJECT, "demo-p0-01-");
const endpoints = crearEndpointsEmulador(process.env);
await esperarEmuladoresSaludables({ projectId, endpoints });
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "-c", "playwright.p0-01.config.ts"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

writeFileSync(resolve(evidenceDir, "run-metadata.json"), JSON.stringify({
  runId: process.env.E2E_P0_01_RUN_ID,
  projectId,
  completedAt: new Date().toISOString(),
  exitCode: result.status ?? 1,
}, null, 2));

process.exitCode = result.status ?? 1;
