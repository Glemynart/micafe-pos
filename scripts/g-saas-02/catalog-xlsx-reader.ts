import path from "node:path";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { CatalogCellLike, CatalogRowLike, CatalogWorkbookLike, CatalogWorksheetLike } from "./catalog-preflight-core.js";

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

function member(recordValue: unknown, localName: string): unknown {
  const record = asRecord(recordValue);
  if (record[localName] !== undefined) return record[localName];
  const match = Object.entries(record).find(([key]) => key.split(":").at(-1) === localName);
  return match?.[1];
}

function xmlText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(xmlText).join("");
  const record = asRecord(value);
  if (typeof record["#text"] === "string") return record["#text"];
  if (member(record, "t") !== undefined) return xmlText(member(record, "t"));
  return "";
}

function richString(value: unknown): string {
  const record = asRecord(value);
  if (member(record, "t") !== undefined) return xmlText(member(record, "t"));
  if (member(record, "r") !== undefined) return asArray(member(record, "r")).map((run) => xmlText(member(run, "t"))).join("");
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
  const raw = xmlText(member(cell, "v"));
  if (member(cell, "f") !== undefined) {
    const result = raw === "" ? undefined : type === "s" ? sharedStrings[Number(raw)] : raw;
    return { formula: xmlText(member(cell, "f")), result };
  }
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "inlineStr") return richString(member(cell, "is"));
  if (type === "str" || type === "e") return raw;
  if (type === "b") return raw === "1";
  if (raw === "") return undefined;
  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? numericValue : raw;
}

function worksheetFromXml(name: string, source: string, sharedStrings: string[]): CatalogWorksheetLike {
  const worksheet = member(parseXml(source), "worksheet");
  const rows = asArray(member(member(worksheet, "sheetData"), "row"));
  const rowCells = new Map<number, Map<number, CatalogCellLike>>();
  let rowCount = 0;

  for (const rowValue of rows) {
    const row = asRecord(rowValue);
    const rowNumber = Number(row["@_r"]);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) continue;
    rowCount = Math.max(rowCount, rowNumber);
    const cells = new Map<number, CatalogCellLike>();
    for (const cellValue of asArray(member(row, "c"))) {
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

export async function loadCatalogXlsx(buffer: Buffer): Promise<CatalogWorkbookLike> {
  const archive = await JSZip.loadAsync(buffer);
  const readXml = async (filePath: string): Promise<XmlRecord> => {
    const file = archive.file(filePath);
    if (!file) throw new Error("Falta un componente requerido del libro.");
    return parseXml(await file.async("string"));
  };

  const workbook = await readXml("xl/workbook.xml");
  const relationships = await readXml("xl/_rels/workbook.xml.rels");
  const workbookDefinition = asRecord(member(workbook, "workbook"));
  const sheetDefinitions = asArray(member(member(workbookDefinition, "sheets"), "sheet")).map(asRecord);
  const relationshipDefinitions = asArray(member(member(relationships, "Relationships"), "Relationship")).map(asRecord);
  const relationshipById = new Map(relationshipDefinitions.map((relationship) => [
    String(relationship["@_Id"] ?? ""),
    String(relationship["@_Target"] ?? ""),
  ]));

  const sharedStringXml = archive.file("xl/sharedStrings.xml");
  const sharedStrings: string[] = sharedStringXml
    ? asArray(member(member(await readXml("xl/sharedStrings.xml"), "sst"), "si")).map(richString)
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
