import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { loadCatalogXlsx } from "./catalog-xlsx-reader.js";

test("reads namespaced workbook, worksheet, and inline strings without losing row references", async () => {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="Precios tienda" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="4"><x:c r="A4" t="inlineStr"><x:is><x:t>Fila Excel fuente</x:t></x:is></x:c></x:row><x:row r="5"><x:c r="A5"><x:v>19</x:v></x:c><x:c r="B5" t="inlineStr"><x:is><x:t>Artículo</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`);

  const workbook = await loadCatalogXlsx(await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(workbook.worksheets.length, 1);
  assert.equal(workbook.worksheets[0].name, "Precios tienda");
  assert.equal(workbook.worksheets[0].rowCount, 5);
  assert.equal(workbook.worksheets[0].getRow(4).getCell(1).value, "Fila Excel fuente");
  assert.equal(workbook.worksheets[0].getRow(5).getCell(1).value, 19);
  assert.equal(workbook.worksheets[0].getRow(5).getCell(2).value, "Artículo");
});
