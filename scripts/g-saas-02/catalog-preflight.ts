import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { analyzeCatalogWorkbook, createCatalogDecisionTemplate, type CatalogCellLike, type CatalogDecisionTemplate, type CatalogRowDecision, type CatalogRowLike, type CatalogWorkbookLike, type CatalogWorksheetLike } from "./catalog-preflight-core.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: false,
});

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlRecord : {};
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function xmlText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(xmlText).join("");
  const record = asRecord(value);
  if (typeof record["#text"] === "string") return record["#text"];
  if (record.t !== undefined) return xmlText(record.t);
  return "";
}

function richString(value: unknown): string {
  const record = asRecord(value);
  if (record.t !== undefined) return xmlText(record.t);
  if (record.r !== undefined) {
    return asArray(record.r).map((run) => xmlText(asRecord(run).t)).join("");
  }
  return xmlText(value);
}

function parseXml(source: string): XmlRecord {
  if (XMLValidator.validate(source) !== true) throw new Error("XML inválido dentro del libro.");
  return asRecord(parser.parse(source));
}

function columnNumber(reference: string): number | null {
  const letters = reference.match(/^[A-Z]+/i)?.[0];
  if (!letters) return null;
  return [...letters.toUpperCase()].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
}

function decodeCellValue(cell: XmlRecord, sharedStrings: string[]): unknown {
  const type = String(cell["@_t"] ?? "");
  const raw = xmlText(cell.v);
  if (cell.f !== undefined) {
    const result = raw === "" ? undefined : type === "s" ? sharedStrings[Number(raw)] : raw;
    return { formula: xmlText(cell.f), result };
  }
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "inlineStr") return richString(cell.is);
  if (type === "str" || type === "e") return raw;
  if (type === "b") return raw === "1";
  if (raw === "") return undefined;
  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? numericValue : raw;
}

function worksheetFromXml(name: string, source: string, sharedStrings: string[]): CatalogWorksheetLike {
  const worksheet = parseXml(source).worksheet;
  const rows = asArray(asRecord(asRecord(worksheet).sheetData).row);
  const rowCells = new Map<number, Map<number, CatalogCellLike>>();
  let rowCount = 0;

  for (const rowValue of rows) {
    const row = asRecord(rowValue);
    const rowNumber = Number(row["@_r"]);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) continue;
    rowCount = Math.max(rowCount, rowNumber);
    const cells = new Map<number, CatalogCellLike>();
    for (const cellValue of asArray(row.c)) {
      const cell = asRecord(cellValue);
      const reference = String(cell["@_r"] ?? "");
      const cellRow = Number(reference.match(/\d+$/)?.[0]);
      const column = columnNumber(reference);
      if (cellRow !== rowNumber || column === null) continue;
      cells.set(column, { value: decodeCellValue(cell, sharedStrings) });
    }
    rowCells.set(rowNumber, cells);
  }

  return {
    name,
    rowCount,
    getRow(rowNumber): CatalogRowLike {
      const cells = rowCells.get(rowNumber) ?? new Map<number, CatalogCellLike>();
      const cellCount = Math.max(0, ...cells.keys());
      return {
        cellCount,
        getCell(column): CatalogCellLike {
          return cells.get(column) ?? { value: undefined };
        },
      };
    },
  };
}

async function loadXlsx(buffer: Buffer): Promise<CatalogWorkbookLike> {
  const archive = await JSZip.loadAsync(buffer);
  const readXml = async (filePath: string): Promise<XmlRecord> => {
    const file = archive.file(filePath);
    if (!file) throw new Error("Falta un componente requerido del libro.");
    return parseXml(await file.async("string"));
  };

  const workbook = await readXml("xl/workbook.xml");
  const relationships = await readXml("xl/_rels/workbook.xml.rels");
  const workbookDefinition = asRecord(workbook.workbook);
  const sheetDefinitions = asArray(asRecord(workbookDefinition.sheets).sheet).map(asRecord);
  const relationshipDefinitions = asArray(asRecord(asRecord(relationships).Relationships).Relationship).map(asRecord);
  const relationshipById = new Map(relationshipDefinitions.map((relationship) => [
    String(relationship["@_Id"] ?? ""),
    String(relationship["@_Target"] ?? ""),
  ]));

  const sharedStringXml = archive.file("xl/sharedStrings.xml");
  const sharedStrings: string[] = sharedStringXml
    ? asArray(asRecord((await readXml("xl/sharedStrings.xml")).sst).si).map(richString)
    : [];

  const worksheets: CatalogWorksheetLike[] = [];
  for (const sheet of sheetDefinitions) {
    const relationIdEntry = Object.entries(sheet).find(([key]) => key === "@_r:id" || key.endsWith(":id"));
    const relationId = String(relationIdEntry?.[1] ?? "");
    const target = relationshipById.get(relationId);
    if (!target) throw new Error("La hoja no tiene una relación reconocida.");
    const normalizedTarget = target.startsWith("/")
      ? target.slice(1)
      : path.posix.normalize(path.posix.join("xl", target));
    const sheetXml = await archive.file(normalizedTarget)?.async("string");
    if (!sheetXml) throw new Error("Falta una hoja del libro.");
    worksheets.push(worksheetFromXml(String(sheet["@_name"] ?? ""), sheetXml, sharedStrings));
  }
  return { worksheets };
}

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
  const report = analyzeCatalogWorkbook(await loadXlsx(bytes));
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
