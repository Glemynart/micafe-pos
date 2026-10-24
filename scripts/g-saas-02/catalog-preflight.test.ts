import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCatalogWorkbook, type CatalogCellLike, type CatalogWorkbookLike } from "./catalog-preflight-core.js";

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
  assert.equal(report.classification.deferredByPlan.some((item) => item.includes("inventario inicial")), true);
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
});

test("fails closed if a price list is missing or duplicated", () => {
  assert.throws(() => analyzeCatalogWorkbook({ worksheets: [worksheet("PRECIOS A TIENDA", [])] }));
  assert.throws(() => analyzeCatalogWorkbook(workbook(
    [["PRODUCTO", "AL COSTO", "PRECIO VENTA"]],
    [["Producto", "Producto", "Precio"], ["Producto A", "Producto B", 10]],
  )));
});
