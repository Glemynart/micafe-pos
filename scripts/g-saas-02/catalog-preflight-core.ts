export interface CatalogCellLike {
  value?: unknown;
  text?: string;
}

export interface CatalogRowLike {
  cellCount: number;
  getCell(columnNumber: number): CatalogCellLike;
}

export interface CatalogWorksheetLike {
  name: string;
  rowCount: number;
  getRow(rowNumber: number): CatalogRowLike;
}

export interface CatalogWorkbookLike {
  worksheets: CatalogWorksheetLike[];
}

type CatalogKind = "store" | "consumer";
type SourceField = "productName" | "cost" | "salePrice";

interface HeaderMap {
  rowNumber: number;
  columns: Partial<Record<SourceField, number>>;
  fields: Set<string>;
}

interface NormalizedRecord {
  rowNumber: number;
  productName: string;
  validPrice: boolean;
}

interface SheetReport {
  kind: CatalogKind;
  sourceSheet: string;
  headerRow: number;
  sourceRows: number;
  rowsMissingProductName: number;
  rowsMissingPositiveIntegerCost: number;
  rowsMissingPositiveIntegerPrice: number;
  rowsWithFormula: number;
  rowsWithDuplicateProductName: number;
  fieldAvailability: {
    productName: boolean;
    cost: boolean;
    salePrice: boolean;
    category: boolean;
    baseUnit: boolean;
    presentation: boolean;
    conversionFactor: boolean;
    initialStock: boolean;
  };
  decisionReferences: {
    rowsWithAmbiguousCostBasis: number;
  };
  records: NormalizedRecord[];
}

export interface CatalogPreflightReport {
  reportSchemaVersion: "1.0";
  mode: "read-only-local-preflight";
  importReady: false;
  writesPerformed: false;
  sheets: Array<Omit<SheetReport, "records">>;
  totals: {
    sourceRows: number;
    rowsMissingProductName: number;
    rowsMissingPositiveIntegerCost: number;
    rowsMissingPositiveIntegerPrice: number;
    rowsWithFormula: number;
    rowsWithDuplicateProductName: number;
    crossListExactNameMatches: number;
    storeCostRowsWithUnresolvedUnitBasis: number;
  };
  crossListMatchReferences: Array<{
    storeSheetRow: number;
    consumerSheetRow: number;
  }>;
  classification: {
    confirmedSourceDataIssues: string[];
    schemaMappingGaps: string[];
    humanDecisions: string[];
    deferredByPlan: string[];
  };
}

const MAX_HEADER_SEARCH_ROWS = 15;

const FIELD_ALIASES: Record<SourceField, string[]> = {
  productName: ["PRODUCTO"],
  cost: ["AL COSTO"],
  salePrice: ["PRECIO VENTA", "PRECIO"],
};

const MODEL_FIELD_ALIASES: Record<string, string[]> = {
  category: ["CATEGORIA", "CATEGORÍA"],
  baseUnit: ["UNIDAD BASE", "UNIDAD", "UNIDAD DE MEDIDA"],
  presentation: ["PRESENTACION", "PRESENTACIÓN", "EMPAQUE"],
  conversionFactor: ["FACTOR", "FACTOR CONVERSION", "FACTOR DE CONVERSION"],
  initialStock: ["INVENTARIO INICIAL", "STOCK", "EXISTENCIAS"],
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es-CO");
}

function cellText(cell: CatalogCellLike): string {
  if (typeof cell.value === "string" || typeof cell.value === "number") {
    return String(cell.value).trim();
  }
  if (cell.value && typeof cell.value === "object") {
    const value = cell.value as Record<string, unknown>;
    if (typeof value.formula === "string" || typeof value.sharedFormula === "string") return "";
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((part) => (part && typeof part === "object" ? String((part as Record<string, unknown>).text ?? "") : ""))
        .join("")
        .trim();
    }
    if (typeof value.text === "string") return value.text.trim();
  }
  return "";
}

function isFormula(cell: CatalogCellLike): boolean {
  if (!cell.value || typeof cell.value !== "object") return false;
  const value = cell.value as Record<string, unknown>;
  return typeof value.formula === "string" || typeof value.sharedFormula === "string";
}

function isNonEmptyRow(row: CatalogRowLike): boolean {
  for (let column = 1; column <= row.cellCount; column += 1) {
    const cell = row.getCell(column);
    if (isFormula(cell) || cellText(cell) !== "") return true;
  }
  return false;
}

function parsePositiveInteger(value: unknown): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function kindFromSheetName(sheetName: string): CatalogKind | null {
  const normalized = normalizeText(sheetName);
  if (normalized === "PRECIOS A TIENDA") return "store";
  if (normalized === "PRECIOS CONS FINAL") return "consumer";
  return null;
}

function headerAliasesFor(kind: CatalogKind, field: SourceField): string[] {
  if (kind === "consumer" && field === "cost") return [];
  return FIELD_ALIASES[field];
}

function findHeader(worksheet: CatalogWorksheetLike, kind: CatalogKind): HeaderMap {
  const lastCandidate = Math.min(worksheet.rowCount, MAX_HEADER_SEARCH_ROWS);
  for (let rowNumber = 1; rowNumber <= lastCandidate; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const normalizedHeaders = new Map<string, number[]>();
    for (let column = 1; column <= row.cellCount; column += 1) {
      const header = normalizeText(cellText(row.getCell(column)));
      if (header === "") continue;
      const columns = normalizedHeaders.get(header) ?? [];
      columns.push(column);
      normalizedHeaders.set(header, columns);
    }

    const fields = new Set<string>();
    const columns: HeaderMap["columns"] = {};
    for (const field of ["productName", "cost", "salePrice"] as const) {
      const aliases = headerAliasesFor(kind, field).map(normalizeText);
      const matches = aliases.flatMap((alias) => normalizedHeaders.get(alias) ?? []);
      if (matches.length > 1) throw new Error("El esquema de encabezados es ambiguo.");
      if (matches.length === 1) {
        columns[field] = matches[0];
        fields.add(field);
      }
    }

    for (const [modelField, aliases] of Object.entries(MODEL_FIELD_ALIASES)) {
      if (aliases.some((alias) => normalizedHeaders.has(normalizeText(alias)))) fields.add(modelField);
    }

    if (columns.productName && columns.salePrice) {
      return { rowNumber, columns, fields };
    }
  }
  throw new Error("No se encontró un encabezado de producto y precio reconocido.");
}

function analyzeSheet(worksheet: CatalogWorksheetLike, kind: CatalogKind): SheetReport {
  const header = findHeader(worksheet, kind);
  const productColumn = header.columns.productName;
  const priceColumn = header.columns.salePrice;
  if (!productColumn || !priceColumn) throw new Error("Faltan columnas requeridas para el preflight.");

  const records: NormalizedRecord[] = [];
  let sourceRows = 0;
  let rowsMissingProductName = 0;
  let rowsMissingPositiveIntegerCost = 0;
  let rowsMissingPositiveIntegerPrice = 0;
  let rowsWithFormula = 0;
  let rowsWithAmbiguousCostBasis = 0;
  const nameRows = new Map<string, number[]>();

  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (!isNonEmptyRow(row)) continue;
    sourceRows += 1;

    const productCell = row.getCell(productColumn);
    const priceCell = row.getCell(priceColumn);
    const productHasFormula = isFormula(productCell);
    const priceHasFormula = isFormula(priceCell);
    let rowHasFormula = productHasFormula || priceHasFormula;
    const productName = productHasFormula ? "" : normalizeText(cellText(productCell));
    const validPrice = !priceHasFormula && parsePositiveInteger(priceCell.value);
    if (productName === "") rowsMissingProductName += 1;
    if (!validPrice) rowsMissingPositiveIntegerPrice += 1;

    if (header.columns.cost) {
      const costCell = row.getCell(header.columns.cost);
      const costHasFormula = isFormula(costCell);
      rowHasFormula ||= costHasFormula;
      const validCost = !costHasFormula && parsePositiveInteger(costCell.value);
      if (!validCost) rowsMissingPositiveIntegerCost += 1;
      else rowsWithAmbiguousCostBasis += 1;
    }
    if (rowHasFormula) rowsWithFormula += 1;

    if (productName !== "") {
      const rows = nameRows.get(productName) ?? [];
      rows.push(rowNumber);
      nameRows.set(productName, rows);
    }
    records.push({ rowNumber, productName, validPrice });
  }

  const rowsWithDuplicateProductName = [...nameRows.values()]
    .filter((rows) => rows.length > 1)
    .reduce((count, rows) => count + rows.length, 0);

  return {
    kind,
    sourceSheet: kind === "store" ? "PRECIOS A TIENDA" : "PRECIOS CONS FINAL",
    headerRow: header.rowNumber,
    sourceRows,
    rowsMissingProductName,
    rowsMissingPositiveIntegerCost,
    rowsMissingPositiveIntegerPrice,
    rowsWithFormula,
    rowsWithDuplicateProductName,
    fieldAvailability: {
      productName: header.fields.has("productName"),
      cost: header.fields.has("cost"),
      salePrice: header.fields.has("salePrice"),
      category: header.fields.has("category"),
      baseUnit: header.fields.has("baseUnit"),
      presentation: header.fields.has("presentation"),
      conversionFactor: header.fields.has("conversionFactor"),
      initialStock: header.fields.has("initialStock"),
    },
    decisionReferences: { rowsWithAmbiguousCostBasis },
    records,
  };
}

function publicSheetReport(report: SheetReport): Omit<SheetReport, "records"> {
  const { records: _records, ...safeReport } = report;
  return safeReport;
}

export function analyzeCatalogWorkbook(workbook: CatalogWorkbookLike): CatalogPreflightReport {
  const recognized = workbook.worksheets
    .map((worksheet) => ({ worksheet, kind: kindFromSheetName(worksheet.name) }))
    .filter((item): item is { worksheet: CatalogWorksheetLike; kind: CatalogKind } => item.kind !== null);

  const storeSheets = recognized.filter((item) => item.kind === "store");
  const consumerSheets = recognized.filter((item) => item.kind === "consumer");
  if (storeSheets.length !== 1 || consumerSheets.length !== 1) {
    throw new Error("El libro debe contener una lista de tienda y una lista de consumidor final.");
  }

  const store = analyzeSheet(storeSheets[0].worksheet, "store");
  const consumer = analyzeSheet(consumerSheets[0].worksheet, "consumer");
  const consumerRowsByName = new Map<string, number[]>();
  for (const record of consumer.records) {
    if (!record.productName) continue;
    const rows = consumerRowsByName.get(record.productName) ?? [];
    rows.push(record.rowNumber);
    consumerRowsByName.set(record.productName, rows);
  }
  const crossListMatchReferences: CatalogPreflightReport["crossListMatchReferences"] = [];
  for (const record of store.records) {
    if (!record.productName) continue;
    for (const consumerRow of consumerRowsByName.get(record.productName) ?? []) {
      crossListMatchReferences.push({ storeSheetRow: record.rowNumber, consumerSheetRow: consumerRow });
    }
  }

  const reports = [store, consumer];
  const sourceRows = reports.reduce((sum, report) => sum + report.sourceRows, 0);
  const rowsMissingProductName = reports.reduce((sum, report) => sum + report.rowsMissingProductName, 0);
  const rowsMissingPositiveIntegerCost = store.rowsMissingPositiveIntegerCost;
  const rowsMissingPositiveIntegerPrice = reports.reduce((sum, report) => sum + report.rowsMissingPositiveIntegerPrice, 0);
  const rowsWithFormula = reports.reduce((sum, report) => sum + report.rowsWithFormula, 0);
  const rowsWithDuplicateProductName = reports.reduce((sum, report) => sum + report.rowsWithDuplicateProductName, 0);

  return {
    reportSchemaVersion: "1.0",
    mode: "read-only-local-preflight",
    importReady: false,
    writesPerformed: false,
    sheets: reports.map(publicSheetReport),
    totals: {
      sourceRows,
      rowsMissingProductName,
      rowsMissingPositiveIntegerCost,
      rowsMissingPositiveIntegerPrice,
      rowsWithFormula,
      rowsWithDuplicateProductName,
      crossListExactNameMatches: crossListMatchReferences.length,
      storeCostRowsWithUnresolvedUnitBasis: store.decisionReferences.rowsWithAmbiguousCostBasis,
    },
    crossListMatchReferences,
    classification: {
      confirmedSourceDataIssues: [
        ...(rowsMissingProductName > 0 ? [`${rowsMissingProductName} filas sin nombre de producto.`] : []),
        ...(rowsMissingPositiveIntegerCost > 0 ? [`${rowsMissingPositiveIntegerCost} filas de la lista de tienda sin AL COSTO entero positivo.`] : []),
        ...(rowsMissingPositiveIntegerPrice > 0 ? [`${rowsMissingPositiveIntegerPrice} filas sin precio numérico entero positivo.`] : []),
        ...(rowsWithFormula > 0 ? [`${rowsWithFormula} filas contienen fórmulas relevantes que no se evaluaron.`] : []),
        ...(rowsWithDuplicateProductName > 0 ? [`${rowsWithDuplicateProductName} filas repiten nombres normalizados dentro de su lista.`] : []),
      ],
      schemaMappingGaps: [
        ...(reports.some((report) => !report.fieldAvailability.category) ? ["La fuente no aporta categoría para todas las listas."] : []),
        ...(reports.some((report) => !report.fieldAvailability.baseUnit) ? ["La fuente no aporta unidad base para todas las listas."] : []),
        ...(reports.some((report) => !report.fieldAvailability.presentation || !report.fieldAvailability.conversionFactor)
          ? ["La fuente no permite mapear presentación y factor de conversión requeridos por el modelo Bodega."]
          : []),
        ...(store.decisionReferences.rowsWithAmbiguousCostBasis > 0
          ? ["AL COSTO tiene valores, pero la fuente no identifica si corresponden a unidad base o presentación."]
          : []),
      ],
      humanDecisions: [
        "Las dos listas deben conservarse separadas: el modelo Bodega vigente guarda un precio actual por presentación; Diana debe definir cuál lista aplica a cada operación o solicitar una decisión de producto/arquitectura.",
        ...(crossListMatchReferences.length > 0
          ? ["Las coincidencias por nombre entre listas son referencias candidatas; requieren confirmación y no se fusionan automáticamente."]
          : []),
      ],
      deferredByPlan: [
        "El inventario inicial se excluye de este preflight y lo registrará Diana posteriormente según el plan vigente.",
        "Este informe no genera carga útil de importación ni afirma que el catálogo esté listo para importar.",
      ],
    },
  };
}
