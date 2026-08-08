import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const evidenceDir = resolve(process.env.E2E_B3_EVENTOS_EVIDENCE_DIR ?? "artifacts/e2e/b3-eventos")
const env = { ...process.env }
const tsxCli = resolve("node_modules/tsx/dist/cli.mjs")
const fixture = spawnSync(process.execPath, [tsxCli, "tests/e2e/b3-eventos/fixtures/datos.ts"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
})

if (fixture.status !== 0) {
  writeFileSync(resolve(evidenceDir, "fixture-failure.json"), `${JSON.stringify({ exitCode: fixture.status ?? 1 }, null, 2)}\n`)
  process.exitCode = fixture.status ?? 1
} else {
  const mapping = resolve(evidenceDir, "mapping.json")
  const report = resolve(evidenceDir, "legacy-inventory.json")
  const result = spawnSync(process.execPath, [
    tsxCli,
    "scripts/b3/eventos-legacy-dry-run.ts",
    "--dry-run",
    "--mapping",
    mapping,
    "--out",
    report,
  ], { cwd: process.cwd(), env, stdio: "inherit" })

  if (result.status === 0) {
    const noWriteVerification = spawnSync(process.execPath, [tsxCli, "tests/e2e/b3-eventos/fixtures/verificar-sin-escrituras.ts"], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    })
    if (noWriteVerification.status !== 0) throw new Error("La verificación post dry-run detectó escrituras inesperadas.")
    const evidence = JSON.parse(readFileSync(report, "utf8"))
    const expected = {
      totalEventos: 5,
      canonicos: 1,
      canonicosEmpresaInexistente: 1,
      legacy: 3,
      legacySinMapeo: 1,
      legacyMapeoValido: 1,
      legacyMapeoInvalido: 1,
      legacyMapeoConflictivo: 0,
      mapeosNoEncontrados: 1,
    }
    if (JSON.stringify(evidence.totales) !== JSON.stringify(expected) || evidence.productionWrites !== false || evidence.modo !== "DRY_RUN") {
      throw new Error(`Evidencia B3-A inesperada: ${JSON.stringify(evidence)}`)
    }
    writeFileSync(resolve(evidenceDir, "run-metadata.json"), `${JSON.stringify({
      goal: "G-MVP-01",
      milestone: "M4",
      epic: "E4.2",
      target: "Firebase Emulator Suite only",
      productionWrites: false,
      report,
      exitCode: 0,
      completedAt: new Date().toISOString(),
    }, null, 2)}\n`)
  }
  process.exitCode = result.status ?? 1
}
