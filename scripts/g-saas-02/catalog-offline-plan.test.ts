import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import JSZip from "jszip";

type Cell = string | number;
type Sheet = { name: string; rows: Cell[][] };

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function columnName(number: number): string {
  let result = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(((value - 1) % 26) + 65) + result;
  }
  return result;
}

async function workbookBuffer(sheets: Sheet[]): Promise<Buffer> {
  const zip = new JSZip();
  const workbook = `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
  const relationships = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
  zip.file("xl/workbook.xml", workbook);
  zip.file("xl/_rels/workbook.xml.rels", relationships);
  sheets.forEach((sheet, sheetIndex) => {
    const rows = sheet.rows.map((row, rowIndex) => {
      const cells = row.map((cell, columnIndex) => {
        if (cell === "") return "";
        const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
        return typeof cell === "number"
          ? `<c r="${reference}"><v>${cell}</v></c>`
          : `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

async function fixtures(incompleteStoreMapping = false): Promise<{ source: Buffer; review: Buffer }> {
  const source = await workbookBuffer([
    { name: "PRECIOS A TIENDA", rows: [["PRODUCTO", "AL COSTO", "PRECIO VENTA"], ["Cafe", 1200, 1800]] },
    { name: "PRECIOS CONS FINAL", rows: [["PRODUCTO", "PRECIO VENTA"], ["Cafe", 2100], ["Only consumer", 9000]] },
  ]);
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const review = await workbookBuffer([
    { name: "Guía", rows: [["SHA-256 del archivo", sourceHash]] },
    {
      name: "Precios tienda",
      rows: [[], [], [], ["N.º de lista", "Fila Excel fuente", "Producto (fuente)", "AL COSTO (COP)", "PRECIO VENTA POS (COP)", "Categoría", "Unidad base", "Presentación / empaque", "Unidades base por presentación", "AL COSTO corresponde a", "Fila candidata consumidor (Excel)", "Notas de Diana"], [1, 2, "Cafe", 1200, 1800, incompleteStoreMapping ? "" : "Abarrotes", "unidad", "paquete x 12", 12, "Presentación / empaque", 2, ""]],
    },
    {
      name: "Consumidor referencia",
      rows: [[], [], [], ["Fila Excel fuente", "Producto (fuente)", "Precio consumidor (COP, referencia)", "Estado", "Fila candidata tienda (Excel)", "Producto candidato tienda", "PRECIO VENTA POS (COP)", "¿Mismo producto y presentación?", "Notas de Diana"], [2, "Cafe", 2100, "Coincidencia por nombre; revisar presentación", 2, "Cafe", 1800, "Sí - misma presentación", "Confirmado"], [3, "Only consumer", 9000, "Diferido: falta asociación con producto base", "", "", "", "", ""]],
    },
  ]);
  return { source, review };
}

function runPlan(sourcePath: string, reviewPath: string, outputPath: string) {
  const cliPath = path.resolve(process.cwd(), "scripts/g-saas-02/catalog-offline-plan.ts");
  return spawnSync(process.execPath, ["--import", "tsx", cliPath, "--source", sourcePath, "--review", reviewPath, "--out", outputPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
}

test("CLI writes a review-only plan with both input hashes and the explicitly approved matching consumer tariff", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "diana-catalog-cli-"));
  try {
    const { source, review } = await fixtures();
    const sourcePath = path.join(directory, "source.xlsx");
    const reviewPath = path.join(directory, "review.xlsx");
    const outputPath = path.join(directory, "plan.json");
    writeFileSync(sourcePath, source);
    writeFileSync(reviewPath, review);
    const result = runPlan(sourcePath, reviewPath, outputPath);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout) as Record<string, unknown>;
    const plan = JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>;
    assert.equal(summary.planCreated, true);
    assert.equal(summary.firebaseAccessed, false);
    assert.equal(summary.writesPerformed, false);
    assert.equal(summary.importReady, false);
    assert.equal(result.stdout.includes("Cafe"), false);
    assert.equal("salesPriceStoreCop" in summary, false);
    assert.equal("sourceCostCop" in summary, false);
    assert.equal(plan.sourceSha256, createHash("sha256").update(source).digest("hex"));
    assert.equal(plan.reviewSha256, createHash("sha256").update(review).digest("hex"));
    const presentation = (plan.proposal as { presentations: Array<Record<string, unknown>> }).presentations[0];
    assert.equal((plan.proposal as { presentations: unknown[] }).presentations.length, 1);
    assert.equal(presentation.consumerFinalPriceCop, 2100);
    assert.equal(presentation.consumerSourceRow, 2);
    assert.equal("Only consumer" in presentation, false);
    assert.equal((summary.samePresentationPricesApplied as number), 1);
    assert.equal((summary.consumerRowsDeferred as number), 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI leaves no output when store mapping is incomplete", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "diana-catalog-cli-incomplete-"));
  try {
    const { source, review } = await fixtures(true);
    const sourcePath = path.join(directory, "source.xlsx");
    const reviewPath = path.join(directory, "review.xlsx");
    const outputPath = path.join(directory, "plan.json");
    writeFileSync(sourcePath, source);
    writeFileSync(reviewPath, review);
    const result = runPlan(sourcePath, reviewPath, outputPath);
    assert.equal(result.status, 3, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(summary.planCreated, false);
    assert.equal(summary.importReady, false);
    assert.equal(summary.writesPerformed, false);
    assert.equal("salesPriceStoreCop" in summary, false);
    assert.equal("sourceCostCop" in summary, false);
    assert.equal(existsSync(outputPath), false);
    assert.equal(result.stdout.includes("Only consumer"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
