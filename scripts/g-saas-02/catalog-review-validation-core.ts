import type { CatalogCellLike, CatalogWorkbookLike, CatalogWorksheetLike } from "./catalog-preflight-core.js";
import { suggestPackaging } from "./catalog-preflight-core.js";
import { CATEGORIAS_CATALOGO_DIANA, CATEGORIAS_CATALOGO_NEVERA } from "../../lib/bodega/diana-catalog-category-suggestions.js";

export interface DianaCatalogReviewValidationInput {
  sourceWorkbook: CatalogWorkbookLike;
  reviewWorkbook: CatalogWorkbookLike;
  sourceSha256: string;
}

export interface DianaCatalogReviewValidationReport {
  reportSchemaVersion: "1.0";
  mode: "read-only-local-review-validation";
  reviewValid: boolean;
  sourceMatches: boolean;
  operationalMappingsComplete: boolean;
  reviewDecisionsComplete: boolean;
  importReady: false;
  writesPerformed: false;
  totals: {
    storeSourceRows: number;
    storeRowsMatchedToSource: number;
    storeRowsMapped: number;
    storeRowsPending: number;
    consumerSourceRows: number;
    consumerRowsMatchedToSource: number;
    consumerRowsWithoutStoreCandidate: number;
    consumerRowsMapped: number;
    consumerRowsPending: number;
    candidateCrossListPairs: number;
    candidateDecisionsPending: number;
    costsNotExactlyConvertibleToBaseUnit: number;
    mismatchedSourceValues: number;
  };
  validationErrors: string[];
  pendingRequirements: string[];
}

type SourceKind = "store" | "consumer";
type HeaderMap<T extends string> = { rowNumber: number; columns: Record<T, number> };

interface SourceRecord {
  rowNumber: number;
  name: string;
  normalizedName: string;
  price: number | null;
  cost: number | null;
  formula: boolean;
}

interface SourceList {
  sheet: CatalogWorksheetLike;
  header: { rowNumber: number; columns: { product: number; price: number; cost?: number } };
  records: Map<number, SourceRecord>;
}

interface TemplateRow {
  rowNumber: number;
  sourceRow: number | null;
  fields: Record<string, { text: string; number: number | null; formula: boolean }>;
}

const STORE_HEADERS = {
  sourceRow: ["FILA EXCEL FUENTE"],
  product: ["PRODUCTO (FUENTE)"],
  cost: ["AL COSTO (COP)"],
  price: ["PRECIO VENTA POS (COP)"],
  category: ["CATEGORIA"],
  baseUnit: ["UNIDAD BASE"],
  presentation: ["PRESENTACION / EMPAQUE"],
  conversionFactor: ["UNIDADES BASE POR PRESENTACION"],
  costBasis: ["AL COSTO CORRESPONDE A"],
  consumerCandidate: ["FILA CANDIDATA CONSUMIDOR (EXCEL)"],
  notes: ["NOTAS DE DIANA"],
} as const;

const CONSUMER_HEADERS = {
  sourceRow: ["FILA EXCEL FUENTE"],
  product: ["PRODUCTO (FUENTE)"],
  price: ["PRECIO CONSUMIDOR (COP, REFERENCIA)"],
  category: ["CATEGORIA"],
  baseUnit: ["UNIDAD BASE"],
  presentation: ["PRESENTACION / EMPAQUE"],
  conversionFactor: ["UNIDADES BASE POR PRESENTACION"],
  status: ["ESTADO"],
  storeCandidate: ["FILA CANDIDATA TIENDA (EXCEL)"],
  candidateProduct: ["PRODUCTO CANDIDATO TIENDA"],
  storePrice: ["PRECIO VENTA POS (COP)"],
  sameProduct: ["¿MISMO PRODUCTO Y PRESENTACION?", "MISMO PRODUCTO Y PRESENTACION?"],
  notes: ["NOTAS DE DIANA"],
} as const;

const CANDIDATE_DECISIONS = new Set([
  "SI - MISMA PRESENTACION",
  "MISMO PRODUCTO - PRESENTACION DISTINTA",
  "NO ES EL MISMO PRODUCTO",
]);

function normalizeText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleUpperCase("es-CO");
}

function cellValue(cell: CatalogCellLike): { text: string; number: number | null; formula: boolean } {
  const value = cell.value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.formula === "string" || typeof record.sharedFormula === "string") {
      return { text: "", number: null, formula: true };
    }
    if (typeof record.text === "string") return { text: record.text.trim(), number: null, formula: false };
    return { text: "", number: null, formula: false };
  }
  if (typeof value === "number") return { text: String(value), number: Number.isSafeInteger(value) ? value : null, formula: false };
  if (typeof value === "string") {
    const text = value.trim();
    const number = /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
    return { text, number, formula: false };
  }
  return { text: "", number: null, formula: false };
}

function findSheet(workbook: CatalogWorkbookLike, expectedName: string): CatalogWorksheetLike | null {
  const matches = workbook.worksheets.filter((sheet) => normalizeText(sheet.name) === normalizeText(expectedName));
  return matches.length === 1 ? matches[0] : null;
}

function findHeader<T extends string>(
  worksheet: CatalogWorksheetLike,
  expected: Partial<Record<T, readonly string[]>>,
): HeaderMap<T> | null {
  const lastHeaderRow = Math.min(worksheet.rowCount, 20);
  for (let rowNumber = 1; rowNumber <= lastHeaderRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const matches = {} as Partial<Record<T, number>>;
    let complete = true;
    const fields = Object.keys(expected) as T[];
    for (const field of fields) {
      const aliases = new Set((expected[field] ?? []).map(normalizeText));
      const columns: number[] = [];
      for (let column = 1; column <= row.cellCount; column += 1) {
        if (aliases.has(normalizeText(cellValue(row.getCell(column)).text))) columns.push(column);
      }
      if (columns.length !== 1) {
        complete = false;
        break;
      }
      matches[field] = columns[0];
    }
    if (complete) return { rowNumber, columns: matches as Record<T, number> };
  }
  return null;
}

function sourceList(workbook: CatalogWorkbookLike, kind: SourceKind, errors: string[]): SourceList | null {
  const sheetName = kind === "store" ? "PRECIOS A TIENDA" : "PRECIOS CONS FINAL";
  const sheet = findSheet(workbook, sheetName);
  if (!sheet) {
    errors.push(`No se encontró una única hoja fuente para la lista ${kind}.`);
    return null;
  }
  const expected = kind === "store"
    ? { product: ["PRODUCTO"], price: ["PRECIO VENTA", "PRECIO"], cost: ["AL COSTO"] }
    : { product: ["PRODUCTO"], price: ["PRECIO VENTA", "PRECIO"] };
  const foundHeader = findHeader(sheet, expected);
  if (!foundHeader || !foundHeader.columns.product || !foundHeader.columns.price || (kind === "store" && !("cost" in foundHeader.columns))) {
    errors.push(`No se reconocieron los encabezados de la lista fuente ${kind}.`);
    return null;
  }
  const header = foundHeader as { rowNumber: number; columns: { product: number; price: number; cost?: number } };

  const records = new Map<number, SourceRecord>();
  const nameRows = new Map<string, number[]>();
  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const product = cellValue(row.getCell(header.columns.product));
    const price = cellValue(row.getCell(header.columns.price));
    const cost = kind === "store" ? cellValue(row.getCell(header.columns.cost!)) : { text: "", number: null, formula: false };
    if (![product, price, cost].some((value) => value.text !== "" || value.formula)) continue;
    const normalizedName = product.formula ? "" : normalizeText(product.text);
    if (normalizedName === "" || price.formula || price.number === null || price.number <= 0
      || (kind === "store" && (cost.formula || cost.number === null || cost.number <= 0))) {
      errors.push(`La lista fuente ${kind} contiene una fila con nombre, precio, costo o fórmula inválidos.`);
    }
    if (normalizedName) nameRows.set(normalizedName, [...(nameRows.get(normalizedName) ?? []), rowNumber]);
    records.set(rowNumber, {
      rowNumber,
      name: product.formula ? "" : product.text.trim(),
      normalizedName,
      price: price.formula ? null : price.number,
      cost: kind === "store" && !cost.formula ? cost.number : null,
      formula: product.formula || price.formula || cost.formula,
    });
  }
  if ([...nameRows.values()].some((rows) => rows.length > 1)) errors.push(`La lista fuente ${kind} contiene nombres normalizados duplicados.`);
  return { sheet, header, records };
}

function templateRows<T extends string>(
  sheet: CatalogWorksheetLike,
  header: HeaderMap<T>,
  fields: Record<T, readonly string[]>,
): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries((Object.keys(fields) as T[]).map((field) => [field, cellValue(row.getCell(header.columns[field]))])) as Record<T, ReturnType<typeof cellValue>>;
    if (!(Object.keys(fields) as T[]).some((field) => values[field].text !== "" || values[field].formula)) continue;
    const sourceRow = (values as Record<string, ReturnType<typeof cellValue>>).sourceRow;
    rows.push({ rowNumber, sourceRow: sourceRow?.number ?? null, fields: values });
  }
  return rows;
}

function normalizedName(value: string): string {
  return normalizeText(value);
}

function positiveInteger(value: { number: number | null; text: string; formula: boolean }): number | null {
  if (value.formula) return null;
  if (value.number !== null && Number.isSafeInteger(value.number) && value.number > 0) return value.number;
  if (!/^[1-9]\d*$/.test(value.text)) return null;
  const parsed = Number(value.text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function compareImmutableSourceFields(
  rows: TemplateRow[],
  source: SourceList,
  kind: SourceKind,
  errors: string[],
): { matchedRows: number; mismatchedCount: number } {
  const seen = new Set<number>();
  const mismatchedRows = new Set<number>();
  let matchedRows = 0;
  for (const row of rows) {
    const fields = row.fields;
    if (row.sourceRow === null) {
      errors.push(`La hoja de revisión ${kind} contiene una fila sin referencia de origen.`);
      mismatchedRows.add(row.rowNumber);
      continue;
    }
    if (seen.has(row.sourceRow)) {
      errors.push(`La hoja de revisión ${kind} repite una referencia de origen.`);
      mismatchedRows.add(row.rowNumber);
      continue;
    }
    seen.add(row.sourceRow);
    const original = source.records.get(row.sourceRow);
    if (!original) {
      errors.push(`La hoja de revisión ${kind} contiene una referencia que no existe en el Excel fuente.`);
      mismatchedRows.add(row.rowNumber);
      continue;
    }

    const product = fields.product;
    const price = fields.price;
    const cost = kind === "store" ? fields.cost : null;
    const changed = product.formula || price.formula || Boolean(cost?.formula)
      || product.text.trim() !== original.name
      || positiveInteger(price) !== original.price
      || (kind === "store" && positiveInteger(cost!) !== original.cost);
    if (original.formula || changed) {
      errors.push(`Los datos fuente de una fila de revisión ${kind} no coinciden con el Excel original.`);
      mismatchedRows.add(row.rowNumber);
    } else {
      matchedRows += 1;
    }
  }

  const missingSourceRows = [...source.records.keys()].filter((sourceRow) => !seen.has(sourceRow)).length;
  if (missingSourceRows > 0) {
    errors.push(`La hoja de revisión ${kind} no conserva exactamente las filas de la lista fuente.`);
  }
  return { matchedRows, mismatchedCount: mismatchedRows.size + missingSourceRows };
}

function guideSourceHash(workbook: CatalogWorkbookLike, errors: string[]): string | null {
  const guide = findSheet(workbook, "Guía");
  if (!guide) {
    errors.push("No se encontró la hoja Guía de la plantilla de revisión.");
    return null;
  }
  const matches: string[] = [];
  for (let rowNumber = 1; rowNumber <= guide.rowCount; rowNumber += 1) {
    const row = guide.getRow(rowNumber);
    for (let column = 1; column < row.cellCount; column += 1) {
      if (normalizeText(cellValue(row.getCell(column)).text) === "SHA-256 DEL ARCHIVO") {
        matches.push(cellValue(row.getCell(column + 1)).text.toLocaleLowerCase("en-US"));
      }
    }
  }
  if (matches.length !== 1 || !/^[a-f0-9]{64}$/.test(matches[0] ?? "")) {
    errors.push("La plantilla no tiene una única huella SHA-256 válida de su archivo fuente.");
    return null;
  }
  return matches[0];
}

function expectedCandidates(store: SourceList, consumer: SourceList): { storeToConsumer: Map<number, number[]>; consumerToStore: Map<number, number[]> } {
  const consumersByName = new Map<string, number[]>();
  for (const [row, record] of consumer.records) {
    if (record.normalizedName !== "") consumersByName.set(record.normalizedName, [...(consumersByName.get(record.normalizedName) ?? []), row]);
  }
  const storeToConsumer = new Map<number, number[]>();
  const consumerToStore = new Map<number, number[]>();
  for (const [storeRow, record] of store.records) {
    const candidates = record.normalizedName === "" ? [] : consumersByName.get(record.normalizedName) ?? [];
    storeToConsumer.set(storeRow, candidates);
    for (const consumerRow of candidates) consumerToStore.set(consumerRow, [...(consumerToStore.get(consumerRow) ?? []), storeRow]);
  }
  return { storeToConsumer, consumerToStore };
}

function equalOptionalRowReference(value: { number: number | null; text: string; formula: boolean }, expected: number | undefined): boolean {
  if (value.formula) return false;
  if (expected === undefined) return value.text === "";
  return positiveInteger(value) === expected;
}

function validateStoreRows(
  rows: TemplateRow[],
  source: SourceList,
  candidates: Map<number, number[]>,
  errors: string[],
): { mapped: number; pending: number; costsNotExactlyConvertible: number } {
  let mapped = 0;
  let pending = 0;
  let costsNotExactlyConvertible = 0;
  for (const row of rows) {
    const fields = row.fields;
    const sourceRow = row.sourceRow;
    const expected = sourceRow === null ? [] : candidates.get(sourceRow) ?? [];
    const candidate = fields.consumerCandidate;
    if (expected.length > 1 || !equalOptionalRowReference(candidate, expected[0])) {
      errors.push("La referencia a consumidor de una fila tienda no coincide con los candidatos del Excel fuente.");
    }

    const category = fields.category;
    const baseUnit = fields.baseUnit;
    const presentation = fields.presentation;
    const factor = positiveInteger(fields.conversionFactor);
    const basis = normalizeText(fields.costBasis.text);
    const notes = fields.notes.text.trim();
    if (Object.keys(fields).some((field) => fields[field].formula)) errors.push("Una decisión de tienda contiene una fórmula y requiere revisión manual.");
    const coreMappingComplete = [category, baseUnit, presentation].every((value) => !value.formula && value.text.trim() !== "") && factor !== null;
    if (fields.conversionFactor.text !== "" && factor === null) errors.push("El factor de conversión debe ser un entero positivo seguro.");
    const basisIsPresentation = basis === "PRESENTACION / EMPAQUE";
    const basisOther = basis === "OTRA BASE (DESCRIBIR)";
    const original = sourceRow === null ? undefined : source.records.get(sourceRow);
    const costSourceValid = basisIsPresentation && original?.cost !== null && original?.cost !== undefined;
    if (!basisIsPresentation) errors.push("AL COSTO debe conservarse exactamente como costo total de la presentación/empaque, según la confirmación de Diana.");
    if (category.text.trim() && !(Object.values(CATEGORIAS_CATALOGO_DIANA) as string[]).includes(category.text.trim())) {
      errors.push("La categoría de Bodega no pertenece a las 17 categorías aprobadas.");
    }

    const basisComplete = costSourceValid;
    if (basisOther && notes === "") errors.push("Una base de AL COSTO marcada como otra requiere una nota descriptiva.");
    const fieldFormula = Object.keys(fields).some((field) => fields[field].formula);
    if (coreMappingComplete && basisComplete && !fieldFormula) mapped += 1;
    else pending += 1;
  }
  return { mapped, pending, costsNotExactlyConvertible };
}

function validateConsumerRows(
  rows: TemplateRow[],
  source: SourceList,
  store: SourceList,
  candidates: Map<number, number[]>,
  errors: string[],
): { deferred: number; candidatePairs: number; candidateDecisionsPending: number } {
  let deferred = 0;
  let candidatePairs = 0;
  let candidateDecisionsPending = 0;
  for (const row of rows) {
    const fields = row.fields;
    if (Object.keys(fields).some((field) => fields[field].formula)) errors.push("Una decisión de consumidor contiene una fórmula y requiere revisión manual.");
    const sourceRow = row.sourceRow;
    const expected = sourceRow === null ? [] : candidates.get(sourceRow) ?? [];
    const candidateRow = positiveInteger(fields.storeCandidate);
    const storeCandidate = fields.storeCandidate;

    if (candidateRow === null) {
      deferred += 1;
      if (fields.candidateProduct.text !== "" || fields.storePrice.text !== "" || fields.sameProduct.text !== "") {
        errors.push("Una fila sin candidato tienda contiene una asociación o tarifa operativa.");
      }
      continue;
    }

    candidatePairs += 1;
    const isNameCandidate = expected.includes(candidateRow);
    const expectedStatus = isNameCandidate
      ? "Coincidencia por nombre; revisar presentación"
      : "Asociación manual; revisar presentación";
    if (fields.status.text !== expectedStatus) errors.push("La fila asociada no conserva la etiqueta de coincidencia o asociación manual esperada.");
    const storeRecord = store.records.get(candidateRow);
    const productMatches = storeRecord?.name === fields.candidateProduct.text.trim();
    const priceMatches = storeRecord?.price !== null && storeRecord?.price !== undefined
      && positiveInteger(fields.storePrice) === storeRecord.price;
    if (!storeRecord || !productMatches || !priceMatches || storeCandidate.formula || fields.candidateProduct.formula || fields.storePrice.formula) {
      errors.push("Los datos de una referencia candidata no coinciden con la fila tienda del Excel fuente.");
    }
    const decision = normalizeText(fields.sameProduct.text);
    if (fields.sameProduct.formula) errors.push("La referencia informativa contiene una fórmula y requiere revisión manual.");
    else if (decision !== "" && decision !== "POR CONFIRMAR" && !CANDIDATE_DECISIONS.has(decision)) errors.push("La referencia informativa no corresponde a una opción admitida.");
  }
  return { deferred, candidatePairs, candidateDecisionsPending };
}

function validateConsumerCatalogRows(rows: TemplateRow[], errors: string[]): { mapped: number; pending: number } {
  let mapped = 0;
  let pending = 0;
  const categories = new Set<string>(Object.values(CATEGORIAS_CATALOGO_NEVERA));
  for (const row of rows) {
    const fields = row.fields;
    const category = fields.category;
    const unit = fields.baseUnit;
    const presentation = fields.presentation;
    const factor = positiveInteger(fields.conversionFactor);
    if ([category, unit, presentation, fields.conversionFactor].some(value => value.formula)) {
      errors.push("Una decisión de Nevera contiene una fórmula y requiere revisión manual.");
      pending += 1;
      continue;
    }
    if (category.text.trim() && !categories.has(category.text.trim())) errors.push("La categoría de Nevera no pertenece a las categorías permitidas para ese catálogo.");
    if (fields.conversionFactor.text.trim() && factor === null) errors.push("El factor de conversión de Nevera debe ser un entero positivo seguro.");
    if (categories.has(category.text.trim()) && unit.text.trim() !== "" && presentation.text.trim() !== "" && factor !== null) mapped += 1;
    else pending += 1;
  }
  return { mapped, pending };
}

export interface DianaCatalogOfflinePlanInput extends DianaCatalogReviewValidationInput {
  reviewSha256: string;
}

export interface DianaCatalogOfflinePlan {
  planSchemaVersion: "3.0";
  mode: "offline-review-only";
  sourceSha256: string;
  reviewSha256: string;
  proposal: {
    catalogId: "BODEGA";
    status: "requires-human-review";
    granularity: "one-presentation-per-store-source-row";
    salesPriceSource: "PRECIOS A TIENDA.PRECIO VENTA";
    consumerPriceSource: null;
    costPolicy: "AL COSTO exact per presentation; no automatic markup";
    productGroupingInferred: false;
    presentations: Array<{
      sourceRow: number;
      reviewRow: number;
      name: string;
      category: string;
      baseUnit: string;
      presentation: string;
      unitsPerPresentation: number;
      packagingQuantityEvidence: "explicit_count" | "administrator_confirmed_individual" | "assumed_single_unit" | "ambiguous_count";
      salesPriceStoreCop: number;
      consumerSourceRow: null;
      consumerFinalPriceCop: null;
      sourceCostCop: number;
      costBasis: "PRESENTACION / EMPAQUE";
      costCopPerPresentation: number;
    }>;
  };
  neveraCatalog: {
    catalogId: "NEVERA";
    status: "requires-human-review";
    granularity: "one-presentation-per-consumer-source-row";
    salesPriceSource: "PRECIOS CONS FINAL.PRECIO VENTA";
    costPolicy: "pending direct Nevera inventory intake";
    stockInitial: 0;
    productGroupingInferred: false;
    presentations: Array<{
      sourceRow: number;
      reviewRow: number;
      name: string;
      category: string;
      baseUnit: string;
      presentation: string;
      unitsPerPresentation: number;
      packagingQuantityEvidence: "explicit_count" | "administrator_confirmed_individual" | "assumed_single_unit" | "ambiguous_count";
      salesPriceConsumerFinalCop: number;
      sourceCostCop: null;
      costCopPerPresentation: null;
      bodegaAssociation: null;
    }>;
  };
  consumerReference: {
    consumerRowsInNevera: number;
    crossListCandidates: number;
    directStockEntriesPending: number;
  };
  initialStockIncluded: false;
  safety: {
    firebaseAccessed: false;
    writesPerformed: false;
    importReady: false;
    executable: false;
    deploymentAuthorized: false;
  };
}

export function validateDianaCatalogReview(input: DianaCatalogReviewValidationInput): DianaCatalogReviewValidationReport {
  const validationErrors: string[] = [];
  const guideHash = guideSourceHash(input.reviewWorkbook, validationErrors);
  const sourceMatches = guideHash !== null && guideHash === input.sourceSha256.toLocaleLowerCase("en-US");
  if (guideHash !== null && !sourceMatches) validationErrors.push("El Excel fuente no coincide con el SHA-256 registrado en la plantilla de Diana.");

  const sourceStore = sourceList(input.sourceWorkbook, "store", validationErrors);
  const sourceConsumer = sourceList(input.sourceWorkbook, "consumer", validationErrors);
  const reviewStoreSheet = findSheet(input.reviewWorkbook, "Precios tienda");
  const reviewConsumerSheet = findSheet(input.reviewWorkbook, "Consumidor referencia");
  if (!reviewStoreSheet) validationErrors.push("No se encontró una única hoja Precios tienda en la plantilla.");
  if (!reviewConsumerSheet) validationErrors.push("No se encontró una única hoja Consumidor referencia en la plantilla.");

  const storeHeader = reviewStoreSheet ? findHeader(reviewStoreSheet, STORE_HEADERS) : null;
  const consumerHeader = reviewConsumerSheet ? findHeader(reviewConsumerSheet, CONSUMER_HEADERS) : null;
  if (reviewStoreSheet && !storeHeader) validationErrors.push("No se reconocieron todos los encabezados de Precios tienda.");
  if (reviewConsumerSheet && !consumerHeader) validationErrors.push("No se reconocieron todos los encabezados de Consumidor referencia.");

  const storeRows = reviewStoreSheet && storeHeader ? templateRows(reviewStoreSheet, storeHeader, STORE_HEADERS) : [];
  const consumerRows = reviewConsumerSheet && consumerHeader ? templateRows(reviewConsumerSheet, consumerHeader, CONSUMER_HEADERS) : [];
  let storeMatched = 0;
  let consumerMatched = 0;
  let mismatchedSourceValues = 0;
  let mapping = { mapped: 0, pending: storeRows.length, costsNotExactlyConvertible: 0 };
  let consumerReview = { deferred: 0, candidatePairs: 0, candidateDecisionsPending: 0 };
  let consumerMapping = { mapped: 0, pending: consumerRows.length };

  if (sourceStore && storeRows.length > 0) {
    const result = compareImmutableSourceFields(storeRows, sourceStore, "store", validationErrors);
    storeMatched = result.matchedRows;
    mismatchedSourceValues += result.mismatchedCount;
  }
  if (sourceConsumer && consumerRows.length > 0) {
    const result = compareImmutableSourceFields(consumerRows, sourceConsumer, "consumer", validationErrors);
    consumerMatched = result.matchedRows;
    mismatchedSourceValues += result.mismatchedCount;
  }

  if (sourceStore && sourceConsumer && storeRows.length > 0 && consumerRows.length > 0) {
    const expected = expectedCandidates(sourceStore, sourceConsumer);
    mapping = validateStoreRows(storeRows, sourceStore, expected.storeToConsumer, validationErrors);
    consumerReview = validateConsumerRows(consumerRows, sourceConsumer, sourceStore, expected.consumerToStore, validationErrors);
    consumerMapping = validateConsumerCatalogRows(consumerRows, validationErrors);
    if (expected.storeToConsumer.size !== storeRows.length) validationErrors.push("La plantilla no conserva la lista de candidatos de consumidor por fila tienda.");
  }

  const reviewValid = validationErrors.length === 0;
  const operationalMappingsComplete = reviewValid && sourceMatches && storeRows.length > 0 && mapping.pending === 0
    && consumerRows.length > 0 && consumerMapping.pending === 0;
  // Cross-catalog name matches are informational only; ADR-SAAS-094 forbids
  // inferring identity from them and does not require a transfer mapping to import.
  const reviewDecisionsComplete = operationalMappingsComplete;
  return {
    reportSchemaVersion: "1.0",
    mode: "read-only-local-review-validation",
    reviewValid,
    sourceMatches,
    operationalMappingsComplete,
    reviewDecisionsComplete,
    importReady: false,
    writesPerformed: false,
    totals: {
      storeSourceRows: sourceStore?.records.size ?? 0,
      storeRowsMatchedToSource: storeMatched,
      storeRowsMapped: mapping.mapped,
      storeRowsPending: mapping.pending,
      consumerSourceRows: sourceConsumer?.records.size ?? 0,
      consumerRowsMatchedToSource: consumerMatched,
      consumerRowsWithoutStoreCandidate: consumerReview.deferred,
      consumerRowsMapped: consumerMapping.mapped,
      consumerRowsPending: consumerMapping.pending,
      candidateCrossListPairs: consumerReview.candidatePairs,
      candidateDecisionsPending: consumerReview.candidateDecisionsPending,
      costsNotExactlyConvertibleToBaseUnit: mapping.costsNotExactlyConvertible,
      mismatchedSourceValues,
    },
    validationErrors: [...new Set(validationErrors)],
    pendingRequirements: [
      ...(mapping.pending > 0 ? ["Resolver con Diana las categorías, unidades base, presentaciones y factores positivos de las filas tienda."] : []),
      ...(mapping.pending > 0 ? ["Conservar AL COSTO exactamente como costo total de la presentación/empaque; no dividirlo entre unidades base."] : []),
      ...(consumerMapping.pending > 0 ? ["Resolver por separado las categorías, unidades, presentaciones y factores positivos de las filas Nevera."] : []),
      ...(consumerReview.deferred > 0 ? ["Las filas Nevera se importan como catálogo independiente sin costo ni asociación; el costo y el inventario se registran después directamente en Nevera."] : []),
      "Este validador no produce payload de importación. La carga de catálogo e inventario exige el flujo aprobado, datos completos y Gate I.",
    ],
  };
}

export function buildDianaCatalogOfflinePlan(input: DianaCatalogOfflinePlanInput): DianaCatalogOfflinePlan | null {
  if (!/^[a-f0-9]{64}$/i.test(input.reviewSha256)) return null;
  const report = validateDianaCatalogReview(input);
  if (!report.reviewValid || !report.sourceMatches || !report.operationalMappingsComplete) return null;

  const errors: string[] = [];
  const source = sourceList(input.sourceWorkbook, "store", errors);
  const sourceConsumer = sourceList(input.sourceWorkbook, "consumer", errors);
  const reviewSheet = findSheet(input.reviewWorkbook, "Precios tienda");
  const reviewConsumerSheet = findSheet(input.reviewWorkbook, "Consumidor referencia");
  const header = reviewSheet ? findHeader(reviewSheet, STORE_HEADERS) : null;
  const consumerHeader = reviewConsumerSheet ? findHeader(reviewConsumerSheet, CONSUMER_HEADERS) : null;
  if (!source || !sourceConsumer || !reviewSheet || !header || !reviewConsumerSheet || !consumerHeader || errors.length > 0) return null;

  const rows = templateRows(reviewSheet, header, STORE_HEADERS);
  const consumerRows = templateRows(reviewConsumerSheet, consumerHeader, CONSUMER_HEADERS);
  const presentations: DianaCatalogOfflinePlan["proposal"]["presentations"] = [];
  for (const row of rows) {
    const sourceRow = row.sourceRow;
    if (sourceRow === null) return null;
    const original = source.records.get(sourceRow);
    const factor = positiveInteger(row.fields.conversionFactor);
    const costBasis = normalizeText(row.fields.costBasis.text);
    if (!original || original.price === null || original.cost === null || factor === null) return null;
    if (costBasis !== "PRESENTACION / EMPAQUE") return null;
    const costCopPerPresentation = original.cost;
    if (!Number.isSafeInteger(costCopPerPresentation) || costCopPerPresentation <= 0) return null;
    presentations.push({
      sourceRow,
      reviewRow: row.rowNumber,
      name: original.name,
      category: row.fields.category.text.trim(),
      baseUnit: row.fields.baseUnit.text.trim(),
      presentation: row.fields.presentation.text.trim(),
      unitsPerPresentation: factor,
      packagingQuantityEvidence: suggestPackaging(original.name, "store").quantityEvidence,
      salesPriceStoreCop: original.price,
      consumerSourceRow: null,
      consumerFinalPriceCop: null,
      sourceCostCop: original.cost,
      costBasis,
      costCopPerPresentation,
    });
  }
  if (presentations.length === 0 || presentations.length !== report.totals.storeRowsMapped) return null;
  const neveraPresentations: DianaCatalogOfflinePlan["neveraCatalog"]["presentations"] = [];
  for (const row of consumerRows) {
    const sourceRow = row.sourceRow;
    if (sourceRow === null) return null;
    const original = sourceConsumer.records.get(sourceRow);
    const factor = positiveInteger(row.fields.conversionFactor);
    if (!original || original.price === null || factor === null) return null;
    neveraPresentations.push({
      sourceRow,
      reviewRow: row.rowNumber,
      name: original.name,
      category: row.fields.category.text.trim(),
      baseUnit: row.fields.baseUnit.text.trim(),
      presentation: row.fields.presentation.text.trim(),
      unitsPerPresentation: factor,
      packagingQuantityEvidence: suggestPackaging(original.name, "consumer").quantityEvidence,
      salesPriceConsumerFinalCop: original.price,
      sourceCostCop: null,
      costCopPerPresentation: null,
      bodegaAssociation: null,
    });
  }
  if (neveraPresentations.length === 0 || neveraPresentations.length !== report.totals.consumerRowsMapped) return null;

  return {
    planSchemaVersion: "3.0",
    mode: "offline-review-only",
    sourceSha256: input.sourceSha256.toLocaleLowerCase("en-US"),
    reviewSha256: input.reviewSha256.toLocaleLowerCase("en-US"),
    proposal: {
      catalogId: "BODEGA",
      status: "requires-human-review",
      granularity: "one-presentation-per-store-source-row",
      salesPriceSource: "PRECIOS A TIENDA.PRECIO VENTA",
      consumerPriceSource: null,
      costPolicy: "AL COSTO exact per presentation; no automatic markup",
      productGroupingInferred: false,
      presentations,
    },
    neveraCatalog: {
      catalogId: "NEVERA",
      status: "requires-human-review",
      granularity: "one-presentation-per-consumer-source-row",
      salesPriceSource: "PRECIOS CONS FINAL.PRECIO VENTA",
      costPolicy: "pending direct Nevera inventory intake",
      stockInitial: 0,
      productGroupingInferred: false,
      presentations: neveraPresentations,
    },
    consumerReference: {
      consumerRowsInNevera: neveraPresentations.length,
      crossListCandidates: report.totals.candidateCrossListPairs,
      directStockEntriesPending: neveraPresentations.length,
    },
    initialStockIncluded: false,
    safety: {
      firebaseAccessed: false,
      writesPerformed: false,
      importReady: false,
      executable: false,
      deploymentAuthorized: false,
    },
  };
}
