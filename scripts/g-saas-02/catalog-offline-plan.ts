import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadCatalogXlsx } from "./catalog-xlsx-reader.js";
import {
  buildDianaCatalogOfflinePlan,
  validateDianaCatalogReview,
} from "./catalog-review-validation-core.js";
import { writeDianaCatalogOfflinePlan } from "./catalog-offline-plan-writer.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getArgument(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${name}.`);
  return path.resolve(value);
}

function readWorkbook(filePath: string): Buffer {
  if (path.extname(filePath).toLocaleLowerCase("en-US") !== ".xlsx") throw new Error("Se aceptan únicamente archivos .xlsx.");
  const bytes = statSync(filePath).size;
  if (bytes <= 0 || bytes > MAX_FILE_BYTES) throw new Error("Cada Excel debe pesar entre 1 byte y 10 MiB.");
  return readFileSync(filePath);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sourcePath = getArgument(argv, "--source");
  const reviewPath = getArgument(argv, "--review");
  const outputPath = getArgument(argv, "--out");
  if (path.extname(outputPath).toLocaleLowerCase("en-US") !== ".json") {
    throw new Error("La salida debe ser un archivo .json nuevo.");
  }

  const sourceBytes = readWorkbook(sourcePath);
  const reviewBytes = readWorkbook(reviewPath);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const reviewSha256 = createHash("sha256").update(reviewBytes).digest("hex");
  const input = {
    sourceWorkbook: await loadCatalogXlsx(sourceBytes),
    reviewWorkbook: await loadCatalogXlsx(reviewBytes),
    sourceSha256,
    reviewSha256,
  };
  const report = validateDianaCatalogReview(input);
  const plan = buildDianaCatalogOfflinePlan(input);
  if (!plan) {
    process.stdout.write(`${JSON.stringify({
      mode: "offline-review-only",
      planCreated: false,
      sourceSha256,
      reviewSha256,
      reviewValid: report.reviewValid,
      sourceMatches: report.sourceMatches,
      operationalMappingsComplete: report.operationalMappingsComplete,
      reviewDecisionsComplete: report.reviewDecisionsComplete,
      importReady: false,
      firebaseAccessed: false,
      writesPerformed: false,
      totals: report.totals,
      validationErrors: report.validationErrors,
      pendingRequirements: report.pendingRequirements,
    }, null, 2)}\n`);
    process.exitCode = !report.reviewValid || !report.sourceMatches ? 2 : 3;
    return;
  }

  const planSha256 = writeDianaCatalogOfflinePlan(plan, outputPath, [sourcePath, reviewPath]);
  process.stdout.write(`${JSON.stringify({
    mode: "offline-review-only",
    planCreated: true,
    planSchemaVersion: plan.planSchemaVersion,
    sourceSha256,
    reviewSha256,
    planSha256,
    bodegaPresentationProposals: plan.proposal.presentations.length,
    neveraPresentationProposals: plan.neveraCatalog.presentations.length,
    consumerRowsImportedSeparately: plan.consumerReference.consumerRowsInNevera,
    directStockEntriesPending: plan.consumerReference.directStockEntriesPending,
    importReady: false,
    firebaseAccessed: false,
    writesPerformed: false,
    outputCreatedExclusively: true,
  }, null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write("No se pudo generar el plan offline. Revisa las rutas, permisos locales y la estructura de los Excel.\n");
  process.exitCode = 1;
});
