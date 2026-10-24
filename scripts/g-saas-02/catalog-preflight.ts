import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { analyzeCatalogWorkbook } from "./catalog-preflight-core.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function getInputPath(argv: string[]): string {
  const fileArgumentIndex = argv.indexOf("--file");
  const inputPath = fileArgumentIndex >= 0 ? argv[fileArgumentIndex + 1] : undefined;
  if (!inputPath || inputPath.startsWith("--")) {
    throw new Error("Uso: npm run g-saas-02:catalog-preflight -- --file <ruta.xlsx>");
  }
  if (path.extname(inputPath).toLocaleLowerCase("en-US") !== ".xlsx") {
    throw new Error("El preflight acepta únicamente archivos .xlsx.");
  }
  return path.resolve(inputPath);
}

async function main(): Promise<void> {
  const inputPath = getInputPath(process.argv.slice(2));
  const fileSize = statSync(inputPath).size;
  if (fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
    throw new Error("El archivo debe pesar entre 1 byte y 10 MiB.");
  }

  const bytes = readFileSync(inputPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const report = analyzeCatalogWorkbook(workbook);

  process.stdout.write(`${JSON.stringify({
    ...report,
    source: { bytes: fileSize, sha256 },
  }, null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write("No se pudo completar el preflight. Revisa la ruta, el formato y los encabezados del libro.\n");
  process.exitCode = 1;
});
