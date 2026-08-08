import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const evidenceDir = resolve(process.env.E2E_B2_EVENTOS_EVIDENCE_DIR ?? "artifacts/e2e/b2-eventos")
mkdirSync(evidenceDir, { recursive: true })
const command = process.platform === "win32" ? "npx.cmd" : "npx"
const env = { ...process.env }

const fixture = spawnSync(command, ["tsx", "tests/e2e/b2-eventos/fixtures/datos.ts"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
})
if (fixture.status !== 0) {
  writeFileSync(resolve(evidenceDir, "fixture-failure.json"), `${JSON.stringify({ exitCode: fixture.status ?? 1 }, null, 2)}\n`)
  process.exitCode = fixture.status ?? 1
} else {
  const result = spawnSync(command, ["playwright", "test", "-c", "playwright.b2-eventos.config.ts"], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  })
  writeFileSync(resolve(evidenceDir, "run-metadata.json"), `${JSON.stringify({
    projectId: process.env.E2E_B2_EVENTOS_PROJECT_ID,
    runId: process.env.E2E_B2_EVENTOS_RUN_ID,
    target: "Firebase Emulator Suite",
    productionWrites: false,
    exitCode: result.status ?? 1,
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  process.exitCode = result.status ?? 1
}
