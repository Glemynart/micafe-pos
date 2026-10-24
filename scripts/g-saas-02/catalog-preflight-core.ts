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
type CoreSourceField = "productName" | "cost" | "salePrice";
type ModelField = "category" | "baseUnit" | "presentation" | "conversionFactor" | "initialStock";
type SourceField = CoreSourceField | ModelField;
type DecisionField = "category" | "baseUnit" | "presentation" | "conversionFactor" | "salePricePolicy" | "costUnitBasis";

export interface CatalogRowDecision {
  sourceList: CatalogKind;
  sourceSheet: string;
  sourceRow: number;
  candidateCrossListRows: number[];
  issueCodes: string[];
  decisions: Record<DecisionField, string | null>;
}

export interface CatalogDecisionTemplate {
  schemaVersion: "1.0";
  mode: "local-human-review-only";
  source: { bytes: number; sha256: string };
  importReady: false;
  writesPerformed: false;
  includesProductNamesOrPrices: false;
  globalDecisionsPending: string[];
  lists: {
    store: CatalogRowDecision[];
    consumer: CatalogRowDecision[];
  };
}

interface HeaderMap {
  rowNumber: number;
  columns: Partial<Record<SourceField, number>>;
  fields: Set<string>;
}

interface NormalizedRecord {
  rowNumber: number;
  productName: string;
  validPrice: boolean;
  validCost: boolean | null;
  hasFormula: boolean;
  missingSourceFields: string[];
  duplicateProductName: boolean;
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
  rowDecisions: CatalogRowDecision[];
  classification: {
    confirmedSourceDataIssues: string[];
    schemaMappingGaps: string[];
    humanDecisions: string[];
    deferredByPlan: string[];
  };
}

const MAX_HEADER_SEARCH_ROWS = 15;

const FIELD_ALIASES: Record<CoreSourceField, string[]> = {
  productName: ["PRODUCTO"],
  cost: ["AL COSTO"],
  salePrice: ["PRECIO VENTA", "PRECIO"],
};

const MODEL_FIELD_ALIASES: Record<ModelField, string[]> = {
  category: ["CATEGORIA", "CATEGORÍA"],
  baseUnit: ["UNIDAD BASE", "UNIDAD", "UNIDAD DE MEDIDA"],
  presentation: ["PRESENTACION", "PRESENTACIÓN", "EMPAQUE"],
  conversionFactor: ["FACTOR", "FACTOR CONVERSION", "FACTOR DE CONVERSION"],
  initialStock: ["INVENTARIO INICIAL", "STOCK", "EXISTENCIAS"],
};

const MODEL_FIELD_ISSUE_NAMES: Record<ModelField, string> = {
  category: "category",
  baseUnit: "base_unit",
  presentation: "presentation",
  conversionFactor: "conversion_factor",
  initialStock: "initial_stock",
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

function headerAliasesFor(kind: CatalogKind, field: CoreSourceField): string[] {
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
      const matches = [...new Set(aliases.flatMap((alias) => normalizedHeaders.get(alias) ?? []))];
      if (matches.length > 1) throw new Error("El esquema de encabezados es ambiguo.");
      if (matches.length === 1) {
        columns[field] = matches[0];
        fields.add(field);
      }
    }

    for (const modelField of Object.keys(MODEL_FIELD_ALIASES) as ModelField[]) {
      const aliases = MODEL_FIELD_ALIASES[modelField];
      const matches = [...new Set(aliases.flatMap((alias) => normalizedHeaders.get(normalizeText(alias)) ?? []))];
      if (matches.length > 1) throw new Error("El esquema de encabezados es ambiguo.");
      if (matches.length === 1) {
        columns[modelField as keyof typeof MODEL_FIELD_ALIASES] = matches[0];
        fields.add(modelField);
      }
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

    let validCost: boolean | null = null;
    if (header.columns.cost) {
      const costCell = row.getCell(header.columns.cost);
      const costHasFormula = isFormula(costCell);
      rowHasFormula ||= costHasFormula;
      validCost = !costHasFormula && parsePositiveInteger(costCell.value);
      if (!validCost) rowsMissingPositiveIntegerCost += 1;
      else rowsWithAmbiguousCostBasis += 1;
    }

    const missingSourceFields: string[] = [];
    for (const field of ["category", "baseUnit", "presentation", "conversionFactor"] as const) {
      const column = header.columns[field];
      if (!column) {
        missingSourceFields.push(`${MODEL_FIELD_ISSUE_NAMES[field]}_not_in_source_header`);
        continue;
      }
      const cell = row.getCell(column);
      const cellHasFormula = isFormula(cell);
      rowHasFormula ||= cellHasFormula;
      if (cellHasFormula || cellText(cell) === "") missingSourceFields.push(`${MODEL_FIELD_ISSUE_NAMES[field]}_value_missing`);
    }
    if (rowHasFormula) rowsWithFormula += 1;

    if (productName !== "") {
      const rows = nameRows.get(productName) ?? [];
      rows.push(rowNumber);
      nameRows.set(productName, rows);
    }
    records.push({ rowNumber, productName, validPrice, validCost, hasFormula: rowHasFormula, missingSourceFields, duplicateProductName: false });
  }

  const duplicateNames = new Set([...nameRows.values()].filter((rows) => rows.length > 1).flat());
  for (const record of records) record.duplicateProductName = duplicateNames.has(record.rowNumber);
  const rowsWithDuplicateProductName = duplicateNames.size;

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
  const candidateRowsByStore = new Map<number, number[]>();
  const candidateRowsByConsumer = new Map<number, number[]>();
  for (const record of store.records) {
    if (!record.productName) continue;
    for (const consumerRow of consumerRowsByName.get(record.productName) ?? []) {
      crossListMatchReferences.push({ storeSheetRow: record.rowNumber, consumerSheetRow: consumerRow });
      candidateRowsByStore.set(record.rowNumber, [...(candidateRowsByStore.get(record.rowNumber) ?? []), consumerRow]);
      candidateRowsByConsumer.set(consumerRow, [...(candidateRowsByConsumer.get(consumerRow) ?? []), record.rowNumber]);
    }
  }

  const decisionsForSheet = (sheet: SheetReport): CatalogRowDecision[] => sheet.records.map((record) => {
    const issueCodes: string[] = [];
    if (!record.productName) issueCodes.push("product_name_missing");
    if (!record.validPrice) issueCodes.push("sale_price_missing_or_invalid");
    if (record.validCost === false) issueCodes.push("cost_missing_or_invalid");
    if (record.hasFormula) issueCodes.push("formula_not_evaluated");
    if (record.duplicateProductName) issueCodes.push("duplicate_product_name_within_list");
    issueCodes.push(...record.missingSourceFields);
    if (sheet.kind === "store" && record.validCost === true) issueCodes.push("cost_unit_basis_unresolved");

    return {
      sourceList: sheet.kind,
      sourceSheet: sheet.sourceSheet,
      sourceRow: record.rowNumber,
      candidateCrossListRows: (sheet.kind === "store" ? candidateRowsByStore : candidateRowsByConsumer).get(record.rowNumber) ?? [],
      issueCodes,
      decisions: {
        category: null,
        baseUnit: null,
        presentation: null,
        conversionFactor: null,
        salePricePolicy: null,
        costUnitBasis: sheet.kind === "store" && record.validCost === true ? null : "not_applicable",
      },
    };
  });
  const rowDecisions = [...decisionsForSheet(store), ...decisionsForSheet(consumer)];

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
    rowDecisions,
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

export function createCatalogDecisionTemplate(
  report: CatalogPreflightReport,
  source: { bytes: number; sha256: string },
): CatalogDecisionTemplate {
  return {
    schemaVersion: "1.0",
    mode: "local-human-review-only",
    source,
    importReady: false,
    writesPerformed: false,
    includesProductNamesOrPrices: false,
    globalDecisionsPending: [
      "Definir cómo se conserva la distinción entre precio a tienda y precio al consumidor final, porque el modelo vigente guarda un precio actual por presentación.",
      "Confirmar si las coincidencias por nombre entre listas representan el mismo producto; las filas relacionadas son solo candidatas.",
      "Confirmar las categorías, unidades base, presentaciones y factores enteros de conversión para cada fila.",
      "Definir la unidad o presentación a la que corresponde cada valor AL COSTO marcado como ambiguo.",
    ],
    lists: {
      store: report.rowDecisions.filter((row) => row.sourceList === "store"),
      consumer: report.rowDecisions.filter((row) => row.sourceList === "consumer"),
    },
  };
}
