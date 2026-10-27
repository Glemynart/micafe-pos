import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCatalogWorkbook, createCatalogDecisionTemplate, type CatalogCellLike, type CatalogWorkbookLike } from "./catalog-preflight-core.js";

function worksheet(name: string, rows: unknown[][]): CatalogWorkbookLike["worksheets"][number] {
  return {
    name,
    rowCount: rows.length,
    getRow(rowNumber) {
      const row = rows[rowNumber - 1] ?? [];
      return {
        cellCount: row.length,
        getCell(columnNumber) {
          const value = row[columnNumber - 1];
          if (value && typeof value === "object" && "value" in value) return value as CatalogCellLike;
          return { value, text: value === undefined || value === null ? "" : String(value) };
        },
      };
    },
  };
}

function workbook(storeRows: unknown[][], consumerRows: unknown[][]): CatalogWorkbookLike {
  return {
    worksheets: [
      worksheet("PRECIOS A TIENDA ", storeRows),
      worksheet("PRECIOS CONS FINAL", consumerRows),
    ],
  };
}

test("keeps price lists separate and reports cross-list matches without product data", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["#", "PRODUCTO", "AL COSTO", "PRECIO VENTA"], [1, "Café molido", 1000, 1500]],
    [["PRECIOS CONS FINAL"], ["Producto", "Precio"], ["Cafe molido", 1800]],
  ));

  assert.equal(report.sheets[0].kind, "store");
  assert.equal(report.sheets[1].kind, "consumer");
  assert.equal(report.totals.crossListExactNameMatches, 1);
  assert.deepEqual(report.crossListMatchReferences, [{ storeSheetRow: 2, consumerSheetRow: 3 }]);
  assert.equal(JSON.stringify(report).includes("Café molido"), false);
  assert.equal(JSON.stringify(report).includes("1500"), false);
  assert.equal(report.importReady, false);
  assert.equal(report.writesPerformed, false);
});

test("reports schema gaps and does not treat missing inventory as an error", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Producto A", 20, 30]],
    [["Producto", "Precio"], ["Producto B", 40]],
  ));

  assert.equal(report.sheets[0].fieldAvailability.category, false);
  assert.equal(report.sheets[0].fieldAvailability.baseUnit, false);
  assert.equal(report.sheets[0].fieldAvailability.presentation, false);
  assert.equal(report.sheets[0].fieldAvailability.conversionFactor, false);
  assert.equal(report.sheets[0].fieldAvailability.initialStock, false);
  assert.equal(report.totals.rowsMissingProductName, 0);
  assert.equal(report.totals.rowsMissingPositiveIntegerPrice, 0);
  assert.equal(report.totals.storeRowsNeedingCategoryReview, 1);
  assert.equal(report.totals.storeRowsDefaultedToOneUnit, 1);
  assert.equal(report.classification.deferredByPlan.some((item) => item.includes("inventario inicial")), true);
  assert.match(report.classification.humanDecisions[0], /canal tienda/);
  assert.match(report.classification.humanDecisions[0], /consumidor final/);
  assert.match(report.classification.humanDecisions[0], /ADR-SAAS-092/);
});

test("flags missing or ambiguous prices and formula cells without evaluating them", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Producto A", 20, { value: { formula: "1+2", result: 3 }, text: "3" }], ["", 20, "1.500"], ["Producto C", null, 10]],
    [["Producto", "Precio"], ["Producto B", null]],
  ));

  assert.equal(report.totals.rowsWithFormula, 1);
  assert.equal(report.totals.rowsMissingProductName, 1);
  assert.equal(report.totals.rowsMissingPositiveIntegerCost, 1);
  assert.equal(report.totals.rowsMissingPositiveIntegerPrice, 3);
  assert.equal(report.totals.storeCostRowsWithUnresolvedUnitBasis, 2);
  assert.equal(report.classification.confirmedSourceDataIssues.some((item) => item.includes("fórmulas")), true);
  assert.ok(report.rowDecisions.find((row) => row.sourceList === "store" && row.sourceRow === 2)?.issueCodes.includes("formula_not_evaluated"));
  assert.ok(report.rowDecisions.find((row) => row.sourceList === "store" && row.sourceRow === 2)?.issueCodes.includes("sale_price_missing_or_invalid"));
});

test("fails closed if a price list is missing or duplicated", () => {
  assert.throws(() => analyzeCatalogWorkbook({ worksheets: [worksheet("PRECIOS A TIENDA", [])] }));
  assert.throws(() => analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"]],
    [["Producto", "Producto", "Precio"], ["Producto A", "Producto B", 10]],
  )));
});

test("creates a row decision template that preserves separate lists without exposing names or prices", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Café molido", 1000, 1500], ["Corona Cero", 1300, 1700]],
    [["Producto", "Precio"], ["Cafe molido", 1800]],
  ));
  const template = createCatalogDecisionTemplate(report, { bytes: 2048, sha256: "a".repeat(64) });

  assert.equal(template.schemaVersion, "1.1");
  assert.equal(template.importReady, false);
  assert.equal(template.writesPerformed, false);
  assert.equal(template.includesProductNamesOrPrices, false);
  assert.deepEqual(template.lists.store.map((row) => row.sourceRow), [2, 3]);
  assert.deepEqual(template.lists.consumer.map((row) => row.sourceRow), [2]);
  assert.deepEqual(template.lists.store[0].candidateCrossListRows, [2]);
  assert.equal(template.lists.store[0].decisions.category, null);
  assert.equal(template.lists.store[0].decisions.costUnitBasis, null);
  assert.equal(template.lists.store[0].categorySuggestion?.estado, "REVISAR");
  assert.equal(template.lists.store[1].decisions.category, null);
  assert.equal(template.lists.store[1].categorySuggestion?.categoria, "Cervezas sin alcohol");
  assert.equal(template.lists.store[0].mappingSuggestion.priceChannel, "tienda");
  assert.equal(template.lists.consumer[0].mappingSuggestion.priceChannel, "consumidor_final");
  assert.doesNotMatch(JSON.stringify(template), /Corona/i);
  assert.equal(template.lists.consumer[0].decisions.costUnitBasis, "not_applicable");
  assert.equal(template.lists.store[0].decisions.selectedPriceSource, "store");
  assert.equal(template.lists.consumer[0].decisions.selectedPriceSource, "consumer");
  assert.ok(template.lists.store[0].issueCodes.includes("cost_unit_basis_unresolved"));
  assert.ok(template.lists.store[0].issueCodes.includes("category_not_in_source_header"));
  assert.equal(template.globalDecisionsPending.some((item) => /seleccionar una única fuente/.test(item)), false);
  assert.match(template.globalDecisionsPending.join(" "), /Asociar explícitamente cada fila PRECIOS CONS FINAL/);
  assert.equal(JSON.stringify(template).includes("Café molido"), false);
  assert.equal(JSON.stringify(template).includes("1500"), false);
  assert.equal(JSON.stringify(template).includes("1800"), false);
});

test("defers consumer-only products until their product association is explicitly reviewed", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Producto tienda", 100, 150]],
    [["Producto", "Precio"], ["Producto consumidor", 180]],
  ));
  const consumerRow = report.rowDecisions.find((row) => row.sourceList === "consumer");
  const template = createCatalogDecisionTemplate(report, { bytes: 2048, sha256: "b".repeat(64) });

  assert.ok(consumerRow);
  assert.ok(consumerRow.issueCodes.includes("consumer_only_requires_explicit_product_mapping"));
  assert.equal(consumerRow.decisions.selectedPriceSource, "consumer");
  assert.ok(!consumerRow.issueCodes.some((code) => /^(category|base_unit|presentation|conversion_factor)_/.test(code)));
  assert.ok(report.classification.deferredByPlan.some((item) => /asociación explícita/.test(item)));
  assert.ok(!report.classification.humanDecisions.some((item) => /Confirmar si las .*PRECIOS CONS FINAL/.test(item)));
  assert.ok(!template.globalDecisionsPending.some((item) => /solo aparecen en PRECIOS CONS FINAL/.test(item)));
  assert.ok(template.globalDecisionsPending.some((item) => /cada fila de PRECIOS A TIENDA/.test(item)));
});

test("suggests explicit package factors and marks names without quantity as unit defaults", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [
      ["PRODUCTO", "AL COSTO", "PRECIO VENTA"],
      ["Costeñita x 38 unds", 1000, 1500],
      ["Smirnoff Lata sixpak", 1000, 1500],
      ["Águila negra 330", 1000, 1500],
      ["Club Colombia Dorada x 330", 1000, 1500],
      ["Speed Max Botella 12 unds", 1000, 1500],
    ],
    [["Producto", "Precio"], ["Águila negra 330", 1800]],
  ));
  const rows = report.rowDecisions.filter((row) => row.sourceList === "store");
  assert.deepEqual(rows.map((row) => row.mappingSuggestion), [
    { priceChannel: "tienda", baseUnit: "unidad", presentation: "Empaque x 38", conversionFactor: 38, quantityEvidence: "explicit_count" },
    { priceChannel: "tienda", baseUnit: "unidad", presentation: "Six pack", conversionFactor: 6, quantityEvidence: "explicit_count" },
    { priceChannel: "tienda", baseUnit: "unidad", presentation: "Unidad individual", conversionFactor: 1, quantityEvidence: "assumed_single_unit" },
    { priceChannel: "tienda", baseUnit: "unidad", presentation: "Botella 330 ml", conversionFactor: 1, quantityEvidence: "assumed_single_unit" },
    { priceChannel: "tienda", baseUnit: "unidad", presentation: "Caja x 12", conversionFactor: 12, quantityEvidence: "explicit_count" },
  ]);
  assert.equal(report.totals.storeRowsWithExplicitPackageCount, 3);
  assert.equal(report.totals.storeRowsDefaultedToOneUnit, 2);
  assert.equal(report.totals.storeRowsWithAmbiguousPackageCount, 0);
});

test("distinguishes absent schema columns from blank row values", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA", "CATEGORIA", "UNIDAD", "PRESENTACION", "FACTOR"], ["Producto A", 20, 30, "", "UNIDAD", "", 1]],
    [["Producto", "Precio"], ["Producto B", 40]],
  ));

  const row = report.rowDecisions.find((decision) => decision.sourceList === "store");
  assert.ok(row);
  assert.ok(row.issueCodes.includes("category_value_missing"));
  assert.ok(row.issueCodes.includes("presentation_value_missing"));
  assert.ok(!row.issueCodes.includes("base_unit_value_missing"));
  assert.ok(!row.issueCodes.includes("conversion_factor_value_missing"));
  assert.ok(!row.issueCodes.includes("conversion_factor_invalid"));
});

test("rejects non-positive, fractional, and non-numeric conversion factors", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [
      ["PRODUCTO", "AL COSTO", "PRECIO VENTA", "CATEGORIA", "UNIDAD", "PRESENTACION", "FACTOR"],
      ["Producto cero", 20, 30, "Bebidas", "unidad", "unidad", 0],
      ["Producto fraccion", 20, 30, "Bebidas", "unidad", "paca", 1.5],
      ["Producto texto", 20, 30, "Bebidas", "unidad", "caja", "abc"],
      ["Producto válido", 20, 30, "Bebidas", "unidad", "caja", 12],
    ],
    [["Producto", "Precio"], ["Producto B", 40]],
  ));

  const storeRows = report.rowDecisions.filter((row) => row.sourceList === "store");
  assert.deepEqual(storeRows.map((row) => row.issueCodes.includes("conversion_factor_invalid")), [true, true, true, false]);
  assert.ok(!storeRows[3].issueCodes.includes("conversion_factor_value_missing"));
});

test("marks every duplicated normalized name within its own list", () => {
  const report = analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Gaseosa", 20, 30], [" gaseosa ", 21, 31]],
    [["Producto", "Precio"], ["Otro", 40]],
  ));

  const duplicateRows = report.rowDecisions.filter((row) => row.sourceList === "store");
  assert.equal(report.sheets[0].rowsWithDuplicateProductName, 2);
  assert.deepEqual(duplicateRows.map((row) => row.sourceRow), [2, 3]);
  assert.ok(duplicateRows.every((row) => row.issueCodes.includes("duplicate_product_name_within_list")));
  assert.ok(!report.rowDecisions.find((row) => row.sourceList === "consumer")?.issueCodes.includes("duplicate_product_name_within_list"));
});
