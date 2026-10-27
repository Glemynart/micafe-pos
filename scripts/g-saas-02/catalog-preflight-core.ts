import { sugerirCategoriaCatalogoDiana, type SugerenciaCategoriaCatalogoDiana } from "../../lib/bodega/diana-catalog-category-suggestions.js";

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
type DecisionField = "category" | "baseUnit" | "presentation" | "conversionFactor" | "selectedPriceSource" | "costUnitBasis";
type PackagingSuggestion = {
  presentation: string | null;
  conversionFactor: number | null;
  quantityEvidence: "explicit_count" | "administrator_confirmed_individual" | "assumed_single_unit" | "ambiguous_count";
};

export interface CatalogRowDecision {
  sourceList: CatalogKind;
  sourceSheet: string;
  sourceRow: number;
  candidateCrossListRows: number[];
  issueCodes: string[];
  categorySuggestion: SugerenciaCategoriaCatalogoDiana | null;
  mappingSuggestion: {
    catalogId: "BODEGA" | "NEVERA";
    baseUnit: "unidad";
    presentation: string | null;
    conversionFactor: number | null;
    quantityEvidence: "explicit_count" | "administrator_confirmed_individual" | "assumed_single_unit" | "ambiguous_count";
  };
  decisions: Record<DecisionField, string | null>;
}

export interface CatalogDecisionTemplate {
  schemaVersion: "2.0";
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
  reportSchemaVersion: "2.0";
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
    storeRowsWithCategorySuggestion: number;
    storeRowsNeedingCategoryReview: number;
    consumerRowsWithCategorySuggestion: number;
    consumerRowsNeedingCategoryReview: number;
    storeRowsWithExplicitPackageCount: number;
    storeRowsConfirmedIndividualByPolicy: number;
    storeRowsDefaultedToOneUnit: number;
    storeRowsWithAmbiguousPackageCount: number;
    consumerRowsConfirmedIndividualByPolicy: number;
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

export function suggestPackaging(productName: string, catalog: CatalogKind = "store"): PackagingSuggestion {
  if (normalizeText(productName) === "CLUB COLOMBIA DORADA X 330") {
    return { presentation: "Botella 330 ml", conversionFactor: 1, quantityEvidence: "assumed_single_unit" };
  }
  if (normalizeText(productName) === "SPEED MAX BOTELLA 12 UNDS") {
    return { presentation: "Caja x 12", conversionFactor: 12, quantityEvidence: "explicit_count" };
  }
  const explicitCounts = [...productName.matchAll(/(?:^|\s)(?:x|×)\s*(\d{1,3})(?:\s*(?:unds?|unidades?|u\b))?(?=\s|$)/giu)]
    .map((match) => Number(match[1]));
  const sixPackCount = /\b(?:six\s*[- ]?pack|sixpak|6\s*[- ]?pack)\b/iu.test(productName) ? [6] : [];
  const counts = [...explicitCounts, ...sixPackCount];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 1)) {
    return { presentation: null, conversionFactor: null, quantityEvidence: "ambiguous_count" };
  }
  const uniqueCounts = [...new Set(counts.filter((count) => Number.isSafeInteger(count) && count > 0))];
  if (uniqueCounts.length > 1) {
    return { presentation: null, conversionFactor: null, quantityEvidence: "ambiguous_count" };
  }
  if (uniqueCounts.length === 1) {
    const count = uniqueCounts[0];
    return {
      presentation: sixPackCount.length > 0 && explicitCounts.length === 0 ? "Six pack" : `Empaque x ${count}`,
      conversionFactor: count,
      quantityEvidence: "explicit_count",
    };
  }
  if (catalog === "store" && /\b(?:aguardiente|ron|vodka|smirnoff)\b/iu.test(productName)) {
    return { presentation: "Unidad individual", conversionFactor: 1, quantityEvidence: "administrator_confirmed_individual" };
  }
  if (catalog === "consumer") {
    return { presentation: "Unidad individual", conversionFactor: 1, quantityEvidence: "administrator_confirmed_individual" };
  }
  return { presentation: "Unidad individual", conversionFactor: 1, quantityEvidence: "assumed_single_unit" };
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
      // Diana confirmed AL COSTO is the full package/presentation purchase cost.
    }

    const missingSourceFields: string[] = [];
    if (kind === "store") {
      for (const field of ["category", "baseUnit", "presentation", "conversionFactor"] as const) {
        const column = header.columns[field];
        if (!column) {
          missingSourceFields.push(`${MODEL_FIELD_ISSUE_NAMES[field]}_not_in_source_header`);
          continue;
        }
        const cell = row.getCell(column);
        const cellHasFormula = isFormula(cell);
        rowHasFormula ||= cellHasFormula;
        if (cellHasFormula) continue;
        if (cellText(cell) === "") {
          missingSourceFields.push(`${MODEL_FIELD_ISSUE_NAMES[field]}_value_missing`);
        } else if (field === "conversionFactor" && !parsePositiveInteger(cell.value)) {
          missingSourceFields.push("conversion_factor_invalid");
        }
      }
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
    // The approved source semantics fix AL COSTO to the full package cost.
    decisionReferences: { rowsWithAmbiguousCostBasis: 0 },
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
    const candidateCrossListRows = (sheet.kind === "store" ? candidateRowsByStore : candidateRowsByConsumer).get(record.rowNumber) ?? [];
    if (!record.productName) issueCodes.push("product_name_missing");
    if (!record.validPrice) issueCodes.push("sale_price_missing_or_invalid");
    if (record.validCost === false) issueCodes.push("cost_missing_or_invalid");
    if (record.hasFormula) issueCodes.push("formula_not_evaluated");
    if (record.duplicateProductName) issueCodes.push("duplicate_product_name_within_list");
    issueCodes.push(...record.missingSourceFields);
    const packaging = suggestPackaging(record.productName, sheet.kind === "store" ? "store" : "consumer");
    const catalogId = sheet.kind === "store" ? "BODEGA" : "NEVERA";
    const categorySuggestion = sugerirCategoriaCatalogoDiana(record.productName, catalogId);
    return {
      sourceList: sheet.kind,
      sourceSheet: sheet.sourceSheet,
      sourceRow: record.rowNumber,
      candidateCrossListRows,
      issueCodes,
      categorySuggestion,
      mappingSuggestion: {
        catalogId,
        baseUnit: "unidad",
        ...packaging,
      },
      decisions: {
        category: categorySuggestion.estado === "SUGERIDA" ? categorySuggestion.categoria : null,
        baseUnit: "unidad",
        presentation: packaging.presentation,
        conversionFactor: String(packaging.conversionFactor ?? ""),
        selectedPriceSource: sheet.kind === "store" ? "store" : "consumer",
        costUnitBasis: sheet.kind === "store" && record.validCost === true ? "PRESENTACION / EMPAQUE" : "not_applicable",
      },
    };
  });
  const rowDecisions = [...decisionsForSheet(store), ...decisionsForSheet(consumer)];
  const consumerOnlyRows = rowDecisions.filter(
    (row) => row.sourceList === "consumer" && row.candidateCrossListRows.length === 0,
  );

  const reports = [store, consumer];
  const sourceRows = reports.reduce((sum, report) => sum + report.sourceRows, 0);
  const rowsMissingProductName = reports.reduce((sum, report) => sum + report.rowsMissingProductName, 0);
  const rowsMissingPositiveIntegerCost = store.rowsMissingPositiveIntegerCost;
  const rowsMissingPositiveIntegerPrice = reports.reduce((sum, report) => sum + report.rowsMissingPositiveIntegerPrice, 0);
  const rowsWithFormula = reports.reduce((sum, report) => sum + report.rowsWithFormula, 0);
  const rowsWithDuplicateProductName = reports.reduce((sum, report) => sum + report.rowsWithDuplicateProductName, 0);

  return {
    reportSchemaVersion: "2.0",
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
      // Diana confirmed AL COSTO is the full package/presentation purchase cost.
      storeCostRowsWithUnresolvedUnitBasis: 0,
      storeRowsWithCategorySuggestion: rowDecisions.filter((row) => row.sourceList === "store" && row.categorySuggestion?.estado === "SUGERIDA").length,
      storeRowsNeedingCategoryReview: rowDecisions.filter((row) => row.sourceList === "store" && row.categorySuggestion?.estado !== "SUGERIDA").length,
      consumerRowsWithCategorySuggestion: rowDecisions.filter((row) => row.sourceList === "consumer" && row.categorySuggestion?.estado === "SUGERIDA").length,
      consumerRowsNeedingCategoryReview: rowDecisions.filter((row) => row.sourceList === "consumer" && row.categorySuggestion?.estado !== "SUGERIDA").length,
      storeRowsWithExplicitPackageCount: rowDecisions.filter((row) => row.sourceList === "store" && row.mappingSuggestion.quantityEvidence === "explicit_count").length,
      storeRowsConfirmedIndividualByPolicy: rowDecisions.filter((row) => row.sourceList === "store" && row.mappingSuggestion.quantityEvidence === "administrator_confirmed_individual").length,
      storeRowsDefaultedToOneUnit: rowDecisions.filter((row) => row.sourceList === "store" && row.mappingSuggestion.quantityEvidence === "assumed_single_unit").length,
      storeRowsWithAmbiguousPackageCount: rowDecisions.filter((row) => row.sourceList === "store" && row.mappingSuggestion.quantityEvidence === "ambiguous_count").length,
      consumerRowsConfirmedIndividualByPolicy: rowDecisions.filter((row) => row.sourceList === "consumer" && row.mappingSuggestion.quantityEvidence === "administrator_confirmed_individual").length,
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
        ...(!store.fieldAvailability.category ? ["La lista operativa PRECIOS A TIENDA no aporta categoría."] : []),
        ...(!store.fieldAvailability.baseUnit ? ["La lista operativa PRECIOS A TIENDA no aporta unidad base."] : []),
        ...(!store.fieldAvailability.presentation || !store.fieldAvailability.conversionFactor
          ? ["La lista operativa PRECIOS A TIENDA no permite mapear presentación y factor de conversión requeridos por el modelo Bodega."]
          : []),
      ],
      humanDecisions: [
        "PRECIOS A TIENDA.PRECIO VENTA y AL COSTO alimentan, respectivamente, el precio de venta y el costo exacto del empaque en el catálogo Bodega. PRECIOS CONS FINAL.PRECIO VENTA alimenta un catálogo Nevera independiente; no es un segundo canal de Bodega.",
        "Las cantidades explícitas del nombre (por ejemplo, x 38, x 12 o sixpak) generan un factor sugerido. Si el nombre no especifica cantidad, se propone una unidad individual y Diana podrá corregirla después; solo los conteos ambiguos requieren revisión antes de importar.",
        "Las categorías con regla local se prellenan por catálogo. Las filas sin coincidencia inequívoca quedan pendientes de revisión; no se inventa una categoría.",
        ...(crossListMatchReferences.length > 0
          ? ["Los nombres coincidentes entre listas son informativos; no crean identidad, asociación ni movimiento entre catálogos."]
          : []),
      ],
      deferredByPlan: [
        "El inventario inicial se excluye de este preflight y lo registrará Diana posteriormente según el plan vigente.",
        ...(consumerOnlyRows.length > 0
          ? [`Las ${consumerOnlyRows.length} filas exclusivas de PRECIOS CONS FINAL pertenecen a Nevera, sin costo ni asociación Bodega; Diana registrará costo y existencias después, directamente en ese catálogo.`]
          : []),
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
    schemaVersion: "2.0",
    mode: "local-human-review-only",
    source,
    importReady: false,
    writesPerformed: false,
    includesProductNamesOrPrices: false,
    globalDecisionsPending: [
      "Revisar las filas cuya categoría no tuvo coincidencia local y las cantidades de empaque ambiguas; las filas sin cantidad explícita se proponen como unidad individual para que Diana pueda corregirlas después.",
      "Validar que el archivo de revisión corresponde al SHA-256 de la fuente vigente antes de generar el plan offline.",
      "Las coincidencias entre Bodega y Nevera son referencias informativas y nunca se importan como asociaciones; ambos catálogos se administran por separado.",
    ],
    lists: {
      store: report.rowDecisions.filter((row) => row.sourceList === "store"),
      consumer: report.rowDecisions.filter((row) => row.sourceList === "consumer"),
    },
  };
}
