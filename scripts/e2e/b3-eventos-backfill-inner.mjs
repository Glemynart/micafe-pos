import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const evidenceDir = resolve(process.env.E2E_B3_EVENTOS_EVIDENCE_DIR ?? "artifacts/e2e/b3-eventos-backfill")
const env = { ...process.env }
const tsxCli = resolve("node_modules/tsx/dist/cli.mjs")
const ejecutar = (args) => spawnSync(process.execPath, [tsxCli, ...args], { cwd: process.cwd(), env, stdio: "inherit" })

const fixture = ejecutar(["tests/e2e/b3-eventos/fixtures/datos.ts"])
if (fixture.status !== 0) {
  writeFileSync(resolve(evidenceDir, "fixture-failure.json"), `${JSON.stringify({ exitCode: fixture.status ?? 1 }, null, 2)}\n`)
  process.exitCode = fixture.status ?? 1
} else {
  const mapping = resolve(evidenceDir, "mapping.json")
  const dryRunReport = resolve(evidenceDir, "backfill-dry-run.json")
  const executeReport = resolve(evidenceDir, "backfill-execute.json")
  const replayReport = resolve(evidenceDir, "backfill-replay.json")

  const dryRun = ejecutar([
    "scripts/b3/eventos-legacy-backfill.ts",
    "--dry-run",
    "--mapping",
    mapping,
    "--out",
    dryRunReport,
  ])
  const execute = dryRun.status === 0
    ? ejecutar([
      "scripts/b3/eventos-legacy-backfill.ts",
      "--execute",
      "--mapping",
      mapping,
      "--out",
      executeReport,
    ])
    : { status: dryRun.status }
  const replay = execute.status === 0
    ? ejecutar([
      "scripts/b3/eventos-legacy-backfill.ts",
      "--execute",
      "--mapping",
      mapping,
      "--out",
      replayReport,
    ])
    : { status: execute.status }

  if (replay.status === 0) {
    const dryRunEvidence = JSON.parse(readFileSync(dryRunReport, "utf8"))
    const executeEvidence = JSON.parse(readFileSync(executeReport, "utf8"))
    const replayEvidence = JSON.parse(readFileSync(replayReport, "utf8"))
    if (dryRunEvidence.modo !== "DRY_RUN"
      || dryRunEvidence.productionWrites !== false
      || dryRunEvidence.totales.candidatos !== 1
      || dryRunEvidence.totales.preparados !== 1
      || executeEvidence.modo !== "EXECUTE"
      || executeEvidence.productionWrites !== false
      || executeEvidence.emulatorWrites !== true
      || executeEvidence.totales.aplicados !== 1
      || replayEvidence.totales.aplicados !== 0
      || replayEvidence.totales.idempotentes !== 1) {
      throw new Error(`Evidencia B3-B inesperada: ${JSON.stringify({ dryRunEvidence, executeEvidence, replayEvidence })}`)
    }

    const verification = ejecutar(["tests/e2e/b3-eventos/fixtures/verificar-backfill.ts"])
    if (verification.status !== 0) throw new Error("La verificación B3-B detectó pérdida de snapshot o clasificación incorrecta.")
    writeFileSync(resolve(evidenceDir, "run-metadata.json"), `${JSON.stringify({
      goal: "G-MVP-01",
      milestone: "M4",
      epic: "E4.2",
      target: "Firebase Emulator Suite only",
      productionWrites: false,
      replayIdempotente: true,
      dryRunReport,
      executeReport,
      replayReport,
      exitCode: 0,
      completedAt: new Date().toISOString(),
    }, null, 2)}\n`)
  }
  process.exitCode = replay.status ?? 1
}
