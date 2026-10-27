import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyzeCatalogWorkbook, createCatalogDecisionTemplate, type CatalogDecisionTemplate, type CatalogRowDecision } from "./catalog-preflight-core.js";
import { loadCatalogXlsx } from "./catalog-xlsx-reader.js";

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

function getOptionalOutputDirectory(argv: string[]): string | null {
  const outputArgumentIndex = argv.indexOf("--decisions-output");
  if (outputArgumentIndex < 0) return null;
  const outputDirectory = argv[outputArgumentIndex + 1];
  if (!outputDirectory || outputDirectory.startsWith("--")) {
    throw new Error("--decisions-output requiere una carpeta nueva para los archivos de decisión.");
  }
  return path.resolve(outputDirectory);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeDecisionRows(rows: CatalogRowDecision[]): string {
  const header = [
    "source_sheet",
    "source_row",
    "candidate_cross_list_rows",
    "issue_codes",
    "category_suggestion",
    "category_suggestion_status",
    "category_suggestion_reason",
    "suggested_catalog_id",
    "suggested_base_unit",
    "suggested_presentation",
    "suggested_conversion_factor",
    "quantity_evidence",
    "category",
    "base_unit",
    "presentation",
    "conversion_factor",
    "selected_price_source",
    "cost_unit_basis",
    "review_status",
  ];
  const body = rows.map((row) => [
    row.sourceSheet,
    row.sourceRow,
    row.candidateCrossListRows.join(";"),
    row.issueCodes.join(";"),
    row.categorySuggestion?.categoria ?? "",
    row.categorySuggestion?.estado ?? "",
    row.categorySuggestion?.razon ?? "",
    row.mappingSuggestion.catalogId,
    row.mappingSuggestion.baseUnit,
    row.mappingSuggestion.presentation ?? "",
    row.mappingSuggestion.conversionFactor ?? "",
    row.mappingSuggestion.quantityEvidence,
    row.decisions.category ?? "",
    row.decisions.baseUnit ?? "",
    row.decisions.presentation ?? "",
    row.decisions.conversionFactor ?? "",
    row.decisions.selectedPriceSource ?? "",
    row.decisions.costUnitBasis ?? "",
    "",
  ].map(csvCell).join(","));
  return `${header.map(csvCell).join(",")}\r\n${body.join("\r\n")}${body.length ? "\r\n" : ""}`;
}

function writeDecisionTemplate(outputDirectory: string, template: CatalogDecisionTemplate): string[] {
  const storeFile = "precios-a-tienda.csv";
  const consumerFile = "precios-consumidor-final.csv";
  const manifestFile = "manifest.json";
  const manifest = {
    schemaVersion: template.schemaVersion,
    mode: template.mode,
    source: template.source,
    importReady: template.importReady,
    writesPerformed: template.writesPerformed,
    includesProductNamesOrPrices: template.includesProductNamesOrPrices,
    separateLists: true,
    rowCounts: {
      store: template.lists.store.length,
      consumer: template.lists.consumer.length,
    },
    files: { store: storeFile, consumer: consumerFile },
    globalDecisionsPending: template.globalDecisionsPending,
  };

  // A new output directory is required so a prior review artifact is never overwritten.
  mkdirSync(outputDirectory);
  writeFileSync(path.join(outputDirectory, storeFile), serializeDecisionRows(template.lists.store), { encoding: "utf8", flag: "wx" });
  writeFileSync(path.join(outputDirectory, consumerFile), serializeDecisionRows(template.lists.consumer), { encoding: "utf8", flag: "wx" });
  writeFileSync(path.join(outputDirectory, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return [storeFile, consumerFile, manifestFile];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputPath = getInputPath(argv);
  const decisionsOutputDirectory = getOptionalOutputDirectory(argv);
  const fileSize = statSync(inputPath).size;
  if (fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
    throw new Error("El archivo debe pesar entre 1 byte y 10 MiB.");
  }

  const bytes = readFileSync(inputPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const report = analyzeCatalogWorkbook(await loadCatalogXlsx(bytes));
  const { rowDecisions: _rowDecisions, ...summaryReport } = report;
  const templateFiles = decisionsOutputDirectory
    ? writeDecisionTemplate(decisionsOutputDirectory, createCatalogDecisionTemplate(report, { bytes: fileSize, sha256 }))
    : undefined;

  process.stdout.write(`${JSON.stringify({
    ...summaryReport,
    source: { bytes: fileSize, sha256 },
    ...(decisionsOutputDirectory ? { decisionsTemplate: { generated: true, files: templateFiles } } : {}),
  }, null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write("No se pudo completar el preflight. Revisa la ruta, el formato y los encabezados del libro.\n");
  process.exitCode = 1;
});
