import assert from "node:assert/strict";
import test from "node:test";
import { crearIdentificadorInterno } from "../../functions/src/turnos/identificadores";
import {
  crearIdInternoCatalogo,
  crearComandoProductoCatalogo,
  prepararImportacionCatalogo,
  ejecutarImportacionCatalogo,
  validarPlanImportacionCatalogo,
} from "./diana-catalog-import";

const sourceSha256 = "a".repeat(64);
const reviewSha256 = "b".repeat(64);
const row = {
  sourceRow: 4,
  reviewRow: 2,
  name: "Corona tradicional",
  category: "Cervezas importadas",
  baseUnit: "unidad",
  presentation: "Botella 330 ml",
  unitsPerPresentation: 1,
  salesPriceStoreCop: 4500,
  consumerSourceRow: 33,
  consumerFinalPriceCop: 5200,
  sourceCostCop: 3000,
  costBasis: "UNIDAD BASE" as const,
  costCopPerBaseUnit: 3000,
};
const plan = {
  planSchemaVersion: "2.0",
  mode: "offline-review-only",
  sourceSha256,
  reviewSha256,
  proposal: {
    status: "requires-human-review",
    granularity: "one-presentation-per-store-source-row",
    salesPriceSource: "PRECIOS A TIENDA.PRECIO VENTA",
    consumerPriceSource: "PRECIOS CONS FINAL.PRECIO VENTA",
    costPolicy: "AL COSTO exact per base unit; no automatic markup",
    productGroupingInferred: false,
    presentations: [row],
  },
  consumerReference: { consumerPricesApplied: true, consumerRowsDeferred: 54, crossListCandidates: 4, crossListDecisionsPending: 0, samePresentationPricesApplied: 1 },
  initialStockIncluded: false,
  safety: { firebaseAccessed: false, writesPerformed: false, importReady: false, executable: false, deploymentAuthorized: false },
};
const tenantId = "distribuidora-las-jimenez";
const spaceId = "espacio-principal";

test("accepts only a complete offline plan with the approved category taxonomy", () => {
  assert.deepEqual(validarPlanImportacionCatalogo(plan), []);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, proposal: { ...plan.proposal, presentations: [{ ...row, category: "Licores" }] } }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, initialStockIncluded: true }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, proposal: { ...plan.proposal, presentations: [{ ...row, costCopPerBaseUnit: 2000 }] } }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, proposal: { ...plan.proposal, presentations: [{ ...row, consumerFinalPriceCop: -1 }] } }).length > 0);
});

test("builds stable product identifiers and flags unrelated same-name products", () => {
  const commandId = crearComandoProductoCatalogo(sourceSha256, row.sourceRow);
  assert.equal(commandId, crearComandoProductoCatalogo(sourceSha256, row.sourceRow));
  const productId = crearIdInternoCatalogo(tenantId, `producto:${commandId}`);
  assert.equal(productId, crearIdentificadorInterno(tenantId, `producto:${commandId}`));
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [], productos: [{ id: "manual-product", nombre: row.name, categoriaId: "cat", espacioId: spaceId, unidad: "unidad", costoUnidadBaseCOP: 3000, stock: 0, stockMinimo: 0, activo: true }],
    presentaciones: [],
  });
  assert.ok(prepared.errores.some(error => error.includes("ya existe")));
  assert.match(productId, /^r1a-/);
});

test("uses server-identical IDs for categories and presentations", () => {
  const categoryCommandId = `catalogo-diana:${sourceSha256}:categoria:cervezas-importadas`;
  const productCommandId = crearComandoProductoCatalogo(sourceSha256, row.sourceRow);
  const productId = crearIdInternoCatalogo(tenantId, `producto:${productCommandId}`);
  const presentationCommandId = `catalogo-diana:${sourceSha256}:presentacion:${row.sourceRow}`;
  assert.equal(
    crearIdInternoCatalogo(tenantId, `categoria:${categoryCommandId}`),
    crearIdentificadorInterno(tenantId, `categoria:${categoryCommandId}`),
  );
  assert.equal(
    crearIdInternoCatalogo(tenantId, `presentacion:${productId}:${presentationCommandId}`),
    crearIdentificadorInterno(tenantId, `presentacion:${productId}:${presentationCommandId}`),
  );
});

test("recognizes an identical prior row and allows safe resume", () => {
  const commandId = crearComandoProductoCatalogo(sourceSha256, row.sourceRow);
  const productId = crearIdInternoCatalogo(tenantId, `producto:${commandId}`);
  const presentationCommandId = `catalogo-diana:${sourceSha256}:presentacion:${row.sourceRow}`;
  const presentationId = crearIdInternoCatalogo(tenantId, `presentacion:${productId}:${presentationCommandId}`);
  const categoryCommandId = `catalogo-diana:${sourceSha256}:categoria:cervezas-importadas`;
  const categoryId = crearIdInternoCatalogo(tenantId, `categoria:${categoryCommandId}`);
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: categoryId, nombre: row.category, espacioId: spaceId }],
    productos: [{ id: productId, nombre: row.name, categoriaId: categoryId, espacioId: spaceId, unidad: row.baseUnit, costoUnidadBaseCOP: row.costCopPerBaseUnit, stock: 0, stockMinimo: 0, activo: true }],
    presentaciones: [{ id: presentationId, productoId: productId, nombre: row.presentation, factorUnidadBase: row.unitsPerPresentation, precioCOP: row.salesPriceStoreCop, precioTiendaCOP: row.salesPriceStoreCop, precioConsumidorFinalCOP: row.consumerFinalPriceCop, activo: true }],
  });
  assert.deepEqual(prepared.errores, []);
  assert.equal(prepared.resumen.productosPorCrear, 0);
  assert.equal(prepared.resumen.presentacionesPorCrear, 0);
});

test("blocks resuming a partial category batch in a different space", () => {
  const categoryCommandId = `catalogo-diana:${sourceSha256}:categoria:cervezas-importadas`;
  const categoryId = crearIdInternoCatalogo(tenantId, `categoria:${categoryCommandId}`);
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: categoryId, nombre: row.category, espacioId: "another-space" }],
    productos: [],
    presentaciones: [],
  });
  assert.ok(prepared.errores.some(error => error.includes("espacio original")));
});

test("imports through server-authoritative commands in order and always starts stock at zero", async () => {
  const calls: Array<{ nombre: string; commandId: string; payload: Record<string, unknown> }> = [];
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, { categorias: [], productos: [], presentaciones: [] });
  const result = await ejecutarImportacionCatalogo(prepared, async (nombre, commandId, payload) => {
    calls.push({ nombre, commandId, payload });
    if (nombre === "crearCategoriaBodegaV1") return { categoriaId: "cat-created" };
    if (nombre === "crearArticuloInventarioV1") return { articuloId: "product-created" };
    return { presentacionId: "presentation-created" };
  });
  assert.deepEqual(calls.map(call => call.nombre), ["crearCategoriaBodegaV1", "crearArticuloInventarioV1", "crearPresentacionComercialV1"]);
  const productPayload = calls[1].payload as { articuloTipo: string; data: Record<string, unknown> };
  assert.equal(productPayload.articuloTipo, "producto");
  assert.equal(productPayload.data.stock, 0);
  assert.equal(productPayload.data.stockMinimo, 0);
  const presentationPayload = calls[2].payload as Record<string, unknown>;
  assert.equal(presentationPayload.precioTiendaCOP, row.salesPriceStoreCop);
  assert.equal(presentationPayload.precioConsumidorFinalCOP, row.consumerFinalPriceCop);
  assert.equal(result.productosCreados, 1);
  assert.equal(result.presentacionesCreadas, 1);
});
