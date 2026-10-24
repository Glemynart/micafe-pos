import assert from "node:assert/strict";
import test from "node:test";
import * as catalogReviewValidation from "./catalog-review-validation-core.js";
import { validateDianaCatalogReview } from "./catalog-review-validation-core.js";
import type { CatalogCellLike, CatalogWorkbookLike } from "./catalog-preflight-core.js";

const SOURCE_HASH = "a".repeat(64);

function worksheet(name: string, rows: unknown[][]): CatalogWorkbookLike["worksheets"][number] {
  return {
    name,
    rowCount: rows.length,
    getRow(rowNumber) {
      const cells = rows[rowNumber - 1] ?? [];
      return {
        cellCount: cells.length,
        getCell(column) {
          const value = cells[column - 1];
          if (value && typeof value === "object" && "value" in value) return value as CatalogCellLike;
          return { value };
        },
      };
    },
  };
}

function sourceWorkbook(cost = 1200): CatalogWorkbookLike {
  return {
    worksheets: [
      worksheet("PRECIOS A TIENDA", [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Café", cost, 1800]]),
      worksheet("PRECIOS CONS FINAL", [["PRODUCTO", "PRECIO VENTA"], ["Cafe", 2100]]),
    ],
  };
}

function reviewWorkbook(options: {
  hash?: string;
  storeCost?: number;
  storePrice?: number;
  storeProduct?: string;
  category?: string;
  factor?: number | string;
  costBasis?: string;
  consumerCandidate?: number | string;
  candidateProduct?: string;
  candidatePrice?: number;
  sameProduct?: string;
  includeConsumerCandidate?: boolean;
  addConsumerOnly?: boolean;
} = {}): CatalogWorkbookLike {
  const hash = options.hash ?? SOURCE_HASH;
  const storeHeader = [
    "N.º de lista", "Fila Excel fuente", "Producto (fuente)", "AL COSTO (COP)",
    "PRECIO VENTA POS (COP)", "Categoría", "Unidad base", "Presentación / empaque",
    "Unidades base por presentación", "AL COSTO corresponde a", "Fila candidata consumidor (Excel)", "Notas de Diana",
  ];
  const consumerHeader = [
    "Fila Excel fuente", "Producto (fuente)", "Precio consumidor (COP, referencia)", "Estado",
    "Fila candidata tienda (Excel)", "Producto candidato tienda", "PRECIO VENTA POS (COP)",
    "¿Mismo producto y presentación?", "Notas de Diana",
  ];
  const storeRow: unknown[] = [1, 2, options.storeProduct ?? "Café", options.storeCost ?? 1200, options.storePrice ?? 1800,
    options.category ?? "Abarrotes", "unidad", "paquete x 12", options.factor ?? 12,
    options.costBasis ?? "Presentación / empaque", options.consumerCandidate ?? 2, ""];
  const consumerRows: unknown[][] = [[2, "Cafe", 2100, "Coincidencia por nombre; revisar presentación",
    options.includeConsumerCandidate === false ? "" : 2, options.includeConsumerCandidate === false ? "" : options.candidateProduct ?? "Café",
    options.includeConsumerCandidate === false ? "" : options.candidatePrice ?? 1800,
    options.includeConsumerCandidate === false ? "" : options.sameProduct ?? "Sí - misma presentación", ""]];
  if (options.addConsumerOnly) consumerRows.push([3, "Producto referencia", 2400,
    "Diferido: falta precio aprobado en lista de tienda", "", "", "", "", ""]);

  return {
    worksheets: [
      worksheet("Guía", [[""], [""], [""], ["SHA-256 del archivo", hash]]),
      worksheet("Precios tienda", [[""], [""], [""], storeHeader, storeRow]),
      worksheet("Consumidor referencia", [[""], [""], [""], consumerHeader, ...consumerRows]),
    ],
  };
}

test("validates the current Diana workbook without exposing prices or preparing an import", () => {
  const report = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook(),
    sourceSha256: SOURCE_HASH,
  });

  assert.equal(report.reviewValid, true);
  assert.equal(report.sourceMatches, true);
  assert.equal(report.operationalMappingsComplete, true);
  assert.equal(report.reviewDecisionsComplete, true);
  assert.equal(report.totals.storeRowsMatchedToSource, 1);
  assert.equal(report.totals.storeRowsMapped, 1);
  assert.equal(report.totals.candidateCrossListPairs, 1);
  assert.equal(report.totals.candidateDecisionsPending, 0);
  assert.equal(report.importReady, false);
  assert.equal(report.writesPerformed, false);
  assert.equal(JSON.stringify(report).includes("Café"), false);
  assert.equal(JSON.stringify(report).includes("1800"), false);
});

test("requires source identity and exact source values to remain unchanged", () => {
  const report = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ hash: "b".repeat(64), storePrice: 1801 }),
    sourceSha256: SOURCE_HASH,
  });

  assert.equal(report.sourceMatches, false);
  assert.equal(report.reviewValid, false);
  assert.equal(report.totals.mismatchedSourceValues, 1);
  assert.ok(report.validationErrors.some((error) => /SHA-256/.test(error)));
  assert.ok(report.validationErrors.some((error) => /no coinciden/.test(error)));
  assert.equal(report.importReady, false);
});

test("rejects non-positive source prices and costs instead of treating them as valid integers", () => {
  const invalid = validateDianaCatalogReview({
    sourceWorkbook: {
      worksheets: [
        worksheet("PRECIOS A TIENDA", [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Café", 0, 0]]),
        worksheet("PRECIOS CONS FINAL", [["PRODUCTO", "PRECIO VENTA"], ["Cafe", 2100]]),
      ],
    },
    reviewWorkbook: reviewWorkbook({ storeCost: 0, storePrice: 0 }),
    sourceSha256: SOURCE_HASH,
  });
  assert.equal(invalid.reviewValid, false);
  assert.ok(invalid.validationErrors.some((error) => /inválidos/.test(error)));
});

test("keeps incomplete mappings pending and refuses fractional cost conversion", () => {
  const missingMapping = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ category: "", factor: "", costBasis: "Por confirmar" }),
    sourceSha256: SOURCE_HASH,
  });
  assert.equal(missingMapping.operationalMappingsComplete, false);
  assert.equal(missingMapping.reviewDecisionsComplete, false);
  assert.equal(missingMapping.totals.storeRowsPending, 1);
  assert.equal(missingMapping.importReady, false);

  const fractionalCost = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(1201),
    reviewWorkbook: reviewWorkbook(),
    sourceSha256: SOURCE_HASH,
  });
  assert.equal(fractionalCost.operationalMappingsComplete, false);
  assert.equal(fractionalCost.totals.costsNotExactlyConvertibleToBaseUnit, 1);
  assert.ok(fractionalCost.validationErrors.some((error) => /sin redondeo/.test(error)));

  const unsupportedBasis = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ costBasis: "Otra base (describir)", factor: 0 }),
    sourceSha256: SOURCE_HASH,
  });
  assert.equal(unsupportedBasis.operationalMappingsComplete, false);
  assert.equal(unsupportedBasis.totals.storeRowsPending, 1);
  assert.ok(unsupportedBasis.validationErrors.some((error) => /entero positivo/.test(error)));
});

test("counts consumer-only rows as deferred and leaves unresolved matches for Diana", () => {
  const report = validateDianaCatalogReview({
    sourceWorkbook: {
      worksheets: [
        worksheet("PRECIOS A TIENDA", [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Café", 1200, 1800]]),
        worksheet("PRECIOS CONS FINAL", [["PRODUCTO", "PRECIO VENTA"], ["Cafe", 2100], ["Producto referencia", 2400]]),
      ],
    },
    reviewWorkbook: reviewWorkbook({ sameProduct: "Por confirmar", addConsumerOnly: true }),
    sourceSha256: SOURCE_HASH,
  });

  assert.equal(report.totals.consumerRowsDeferred, 1);
  assert.equal(report.totals.candidateDecisionsPending, 1);
  assert.equal(report.operationalMappingsComplete, true);
  assert.equal(report.reviewDecisionsComplete, false);
  assert.equal(report.importReady, false);
});

test("detects broken candidate references and consumer data that is not source-backed", () => {
  const wrongCandidate = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ consumerCandidate: 3, candidateProduct: "Otro", candidatePrice: 1900 }),
    sourceSha256: SOURCE_HASH,
  });
  assert.equal(wrongCandidate.reviewValid, false);
  assert.ok(wrongCandidate.validationErrors.some((error) => /referencia a consumidor/.test(error)));
  assert.ok(wrongCandidate.validationErrors.some((error) => /referencia candidata/.test(error)));

  const noCandidate = validateDianaCatalogReview({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ includeConsumerCandidate: false }),
    sourceSha256: SOURCE_HASH,
  });
  assert.equal(noCandidate.reviewValid, false);
});

test("rejects missing source rows, duplicate rows, and formulas in review decisions", () => {
  const duplicateRows = reviewWorkbook();
  const store = duplicateRows.worksheets[1];
  const originalGetRow = store.getRow.bind(store);
  const originalRow = originalGetRow(5);
  (store as { rowCount: number }).rowCount = 6;
  store.getRow = (rowNumber) => rowNumber === 6 ? originalRow : originalGetRow(rowNumber);
  const duplicate = validateDianaCatalogReview({ sourceWorkbook: sourceWorkbook(), reviewWorkbook: duplicateRows, sourceSha256: SOURCE_HASH });
  assert.equal(duplicate.reviewValid, false);
  assert.ok(duplicate.validationErrors.some((error) => /repite una referencia/.test(error)));

  const formulaReview = reviewWorkbook();
  const sheet = formulaReview.worksheets[1];
  const getRow = sheet.getRow.bind(sheet);
  sheet.getRow = (rowNumber) => {
    const row = getRow(rowNumber);
    if (rowNumber !== 5) return row;
    return { ...row, getCell: (column) => column === 6 ? { value: { formula: "\"Abarrotes\"", result: "Abarrotes" } } : row.getCell(column) };
  };
  const formula = validateDianaCatalogReview({ sourceWorkbook: sourceWorkbook(), reviewWorkbook: formulaReview, sourceSha256: SOURCE_HASH });
  assert.equal(formula.reviewValid, false);
  assert.ok(formula.validationErrors.some((error) => /fórmula/.test(error)));
});



type PlanInput = Parameters<typeof validateDianaCatalogReview>[0] & { reviewSha256: string };
type ExpectedPlan = {
  planSchemaVersion: string;
  sourceSha256: string;
  reviewSha256: string;
  proposal: {
    granularity: string;
    salesPriceSource: string;
    presentations: Array<{
      sourceRow: number;
      reviewRow: number;
      name: string;
      category: string;
      baseUnit: string;
      presentation: string;
      unitsPerPresentation: number;
      salesPriceCop: number;
      sourceCostCop: number;
      costBasis: string;
      costCopPerBaseUnit: number;
    }>;
  };
  consumerReference: {
    salesPricesApplied: boolean;
    consumerOnlyRowsDeferred: number;
    crossListCandidates: number;
    crossListDecisionsPending: number;
    crossListCandidatesMerged: boolean;
  };
  initialStockIncluded: boolean;
  safety: { firebaseAccessed: boolean; writesPerformed: boolean; importReady: boolean; executable: boolean; deploymentAuthorized: boolean };
};
function buildPlan(input: PlanInput): ExpectedPlan | null {
  const builder = Reflect.get(catalogReviewValidation, "buildDianaCatalogOfflinePlan");
  assert.equal(typeof builder, "function", "offline catalog plan builder is not implemented");
  return (builder as (value: PlanInput) => ExpectedPlan | null)(input);
}

test("builds a local review-only plan from the approved store price and exact unit cost", () => {
  const plan = buildPlan({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ addConsumerOnly: true }),
    sourceSha256: SOURCE_HASH,
    reviewSha256: "b".repeat(64),
  });

  assert.ok(plan);
  assert.equal(plan.planSchemaVersion, "1.0");
  assert.equal(plan.sourceSha256, SOURCE_HASH);
  assert.equal(plan.reviewSha256, "b".repeat(64));
  assert.equal(plan.proposal.granularity, "one-presentation-per-store-source-row");
  assert.equal(plan.proposal.salesPriceSource, "PRECIOS A TIENDA.PRECIO VENTA");
  assert.equal(plan.proposal.presentations.length, 1);
  assert.deepEqual(plan.proposal.presentations[0], {
    sourceRow: 2,
    reviewRow: 5,
    name: "Café",
    category: "Abarrotes",
    baseUnit: "unidad",
    presentation: "paquete x 12",
    unitsPerPresentation: 12,
    salesPriceCop: 1800,
    sourceCostCop: 1200,
    costBasis: "PRESENTACION / EMPAQUE",
    costCopPerBaseUnit: 100,
  });
  assert.equal(plan.consumerReference.salesPricesApplied, false);
  assert.equal(plan.consumerReference.consumerOnlyRowsDeferred, 1);
  assert.equal(plan.consumerReference.crossListCandidatesMerged, false);
  assert.equal(plan.initialStockIncluded, false);
  assert.equal(plan.safety.firebaseAccessed, false);
  assert.equal(plan.safety.writesPerformed, false);
  assert.equal(plan.safety.importReady, false);
  assert.equal(plan.safety.executable, false);
  assert.equal(plan.safety.deploymentAuthorized, false);
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes("2100"), false);
  assert.equal(serialized.includes("2400"), false);
  assert.equal(serialized.includes("Producto referencia"), false);
});

test("keeps unresolved consumer-list matches as reference-only and does not block a complete store plan", () => {
  const plan = buildPlan({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ sameProduct: "Por confirmar", addConsumerOnly: true }),
    sourceSha256: SOURCE_HASH,
    reviewSha256: "c".repeat(64),
  });

  assert.ok(plan);
  assert.equal(plan.consumerReference.crossListCandidates, 1);
  assert.equal(plan.consumerReference.crossListDecisionsPending, 1);
  assert.equal(plan.proposal.presentations.length, 1);
  assert.equal(plan.proposal.presentations[0].salesPriceCop, 1800);
});

test("does not build a plan when any operational store mapping is incomplete or source identity differs", () => {
  assert.equal(buildPlan({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ category: "", factor: "", costBasis: "Por confirmar" }),
    sourceSha256: SOURCE_HASH,
    reviewSha256: "d".repeat(64),
  }), null);
  assert.equal(buildPlan({
    sourceWorkbook: sourceWorkbook(),
    reviewWorkbook: reviewWorkbook({ hash: "e".repeat(64) }),
    sourceSha256: SOURCE_HASH,
    reviewSha256: "f".repeat(64),
  }), null);
});
