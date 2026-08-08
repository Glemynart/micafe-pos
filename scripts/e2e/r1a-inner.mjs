import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const evidenceDir = resolve(process.env.E2E_R1A_EVIDENCE_DIR ?? "artifacts/e2e/r1a/manual");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
let playwrightArgs = [];
try {
  const parsed = JSON.parse(process.env.E2E_R1A_PLAYWRIGHT_ARGS ?? "[]");
  if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) playwrightArgs = parsed;
} catch { /* Un filtro inválido se ignora y mantiene la corrida completa. */ }
const result = spawnSync(command, ["playwright", "test", "-c", "playwright.r1a.config.ts", ...playwrightArgs], {
  cwd: process.cwd(), env: process.env, stdio: "inherit", shell: process.platform === "win32",
});

writeFileSync(resolve(evidenceDir, "run-metadata.json"), JSON.stringify({
  runId: process.env.E2E_R1A_RUN_ID,
  projectId: process.env.E2E_R1A_PROJECT_ID,
  completedAt: new Date().toISOString(),
  exitCode: result.status ?? 1,
}, null, 2));
process.exitCode = result.status ?? 1;
