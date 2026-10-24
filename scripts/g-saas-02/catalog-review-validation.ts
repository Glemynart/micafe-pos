import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadCatalogXlsx } from "./catalog-xlsx-reader.js";
import { validateDianaCatalogReview } from "./catalog-review-validation-core.js";

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
  const sourceBytes = readWorkbook(sourcePath);
  const reviewBytes = readWorkbook(reviewPath);
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const report = validateDianaCatalogReview({
    sourceWorkbook: await loadCatalogXlsx(sourceBytes),
    reviewWorkbook: await loadCatalogXlsx(reviewBytes),
    sourceSha256,
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.reviewValid || !report.sourceMatches) process.exitCode = 2;
  else if (!report.reviewDecisionsComplete) process.exitCode = 3;
}

main().catch(() => {
  process.stderr.write("No se pudo validar la plantilla de Diana. Revisa las rutas, el formato y la estructura de los Excel.\n");
  process.exitCode = 1;
});
