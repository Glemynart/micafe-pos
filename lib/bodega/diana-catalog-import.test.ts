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
  packagingQuantityEvidence: "assumed_single_unit" as const,
  salesPriceStoreCop: 4500,
  consumerSourceRow: null,
  consumerFinalPriceCop: null,
  sourceCostCop: 3000,
  costBasis: "PRESENTACION / EMPAQUE" as const,
  costCopPerPresentation: 3000,
};
const neveraRow = {
  sourceRow: 33,
  reviewRow: 12,
  name: row.name,
  category: row.category,
  baseUnit: "unidad",
  presentation: "Unidad",
  unitsPerPresentation: 1,
  packagingQuantityEvidence: "assumed_single_unit" as const,
  salesPriceConsumerFinalCop: 5200,
  sourceCostCop: null,
  costCopPerPresentation: null,
  bodegaAssociation: null,
};
const plan = {
  planSchemaVersion: "3.0",
  mode: "offline-review-only",
  sourceSha256,
  reviewSha256,
  proposal: {
    catalogId: "BODEGA",
    status: "requires-human-review",
    granularity: "one-presentation-per-store-source-row",
    salesPriceSource: "PRECIOS A TIENDA.PRECIO VENTA",
    consumerPriceSource: null,
    costPolicy: "AL COSTO exact per presentation; no automatic markup",
    productGroupingInferred: false,
    presentations: [row],
  },
  neveraCatalog: {
    catalogId: "NEVERA",
    status: "requires-human-review",
    granularity: "one-presentation-per-consumer-source-row",
    salesPriceSource: "PRECIOS CONS FINAL.PRECIO VENTA",
    costPolicy: "pending direct Nevera inventory intake",
    stockInitial: 0,
    productGroupingInferred: false,
    presentations: [neveraRow],
  },
  consumerReference: { consumerRowsInNevera: 1, crossListCandidates: 1, directStockEntriesPending: 1 },
  initialStockIncluded: false,
  safety: { firebaseAccessed: false, writesPerformed: false, importReady: false, executable: false, deploymentAuthorized: false },
};
const tenantId = "distribuidora-las-jimenez";
const spaceId = "espacio-principal";

test("accepts only a complete offline dual-catalog plan with the approved category taxonomy", () => {
  assert.deepEqual(validarPlanImportacionCatalogo(plan), []);
  assert.deepEqual(validarPlanImportacionCatalogo({
    ...plan,
    proposal: { ...plan.proposal, presentations: [{ ...row, packagingQuantityEvidence: "administrator_confirmed_individual", unitsPerPresentation: 1 }] },
    neveraCatalog: { ...plan.neveraCatalog, presentations: [{ ...neveraRow, packagingQuantityEvidence: "administrator_confirmed_individual", unitsPerPresentation: 1 }] },
  }), []);
  assert.ok(validarPlanImportacionCatalogo({
    ...plan,
    proposal: { ...plan.proposal, presentations: [{ ...row, packagingQuantityEvidence: "administrator_confirmed_individual", unitsPerPresentation: 12 }] },
  }).some(error => error.includes("unidad individual confirmada")));
  assert.ok(validarPlanImportacionCatalogo({ ...plan, proposal: { ...plan.proposal, presentations: [{ ...row, category: "Licores" }] } }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, initialStockIncluded: true }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, proposal: { ...plan.proposal, presentations: [{ ...row, costCopPerPresentation: 2000 }] } }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, proposal: { ...plan.proposal, presentations: [{ ...row, consumerFinalPriceCop: 5200 }] } }).length > 0);
  assert.ok(validarPlanImportacionCatalogo({ ...plan, planSchemaVersion: "2.0" }).length > 0);
});

test("preserves a unique existing product ID and blocks an incompatible base unit", () => {
  const commandId = crearComandoProductoCatalogo(sourceSha256, row.sourceRow, "BODEGA");
  assert.equal(commandId, crearComandoProductoCatalogo(sourceSha256, row.sourceRow, "BODEGA"));
  assert.notEqual(commandId, crearComandoProductoCatalogo(sourceSha256, row.sourceRow, "NEVERA"));
  const productId = crearIdInternoCatalogo(tenantId, `producto:${commandId}`);
  assert.equal(productId, crearIdentificadorInterno(tenantId, `producto:${commandId}`));
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [], productos: [{ id: "manual-product", nombre: row.name, categoriaId: "cat", espacioId: spaceId, unidad: "unidad", costoUnidadBaseCOP: 0, stock: 0, stockMinimo: 0, activo: true }],
    presentaciones: [],
  });
  assert.deepEqual(prepared.errores, []);
  assert.equal(prepared.filas[0].productoId, "manual-product");
  assert.equal(prepared.filas[0].productoExistente, true);
  assert.equal(prepared.filas[0].productoActualizar, true);
  assert.equal(prepared.resumen.productosPorCrear, 0);
  const incompatible = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [], productos: [{ id: "manual-product", nombre: row.name, categoriaId: "cat", espacioId: spaceId, unidad: "caja", costoUnidadBaseCOP: 0, stock: 0, stockMinimo: 0, activo: true }],
    presentaciones: [],
  });
  assert.ok(incompatible.errores.some(error => error.includes("datos distintos")));
  assert.match(productId, /^r1a-/);
});

test("uses server-identical IDs for categories and presentations", () => {
  const categoryCommandId = `catalogo-diana:${sourceSha256}:BODEGA:categoria:cervezas-importadas`;
  const productCommandId = crearComandoProductoCatalogo(sourceSha256, row.sourceRow, "BODEGA");
  const productId = crearIdInternoCatalogo(tenantId, `producto:${productCommandId}`);
  const presentationCommandId = `catalogo-diana:${sourceSha256}:BODEGA:presentacion:${row.sourceRow}`;
  assert.equal(
    crearIdInternoCatalogo(tenantId, `categoria:${categoryCommandId}`),
    crearIdentificadorInterno(tenantId, `categoria:${categoryCommandId}`),
  );
  assert.equal(
    crearIdInternoCatalogo(tenantId, `presentacion:${productId}:${presentationCommandId}`),
    crearIdentificadorInterno(tenantId, `presentacion:${productId}:${presentationCommandId}`),
  );
});

test("recognizes an identical prior Bodega row and allows safe resume", () => {
  const commandId = crearComandoProductoCatalogo(sourceSha256, row.sourceRow, "BODEGA");
  const productId = crearIdInternoCatalogo(tenantId, `producto:${commandId}`);
  const presentationCommandId = `catalogo-diana:${sourceSha256}:BODEGA:presentacion:${row.sourceRow}`;
  const presentationId = crearIdInternoCatalogo(tenantId, `presentacion:${productId}:${presentationCommandId}`);
  const categoryCommandId = `catalogo-diana:${sourceSha256}:BODEGA:categoria:cervezas-importadas`;
  const categoryId = crearIdInternoCatalogo(tenantId, `categoria:${categoryCommandId}`);
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: categoryId, nombre: row.category, espacioId: spaceId }],
    productos: [{ id: productId, nombre: row.name, categoriaId: categoryId, espacioId: spaceId, unidad: row.baseUnit, costoUnidadBaseCOP: 0, stock: 0, stockMinimo: 0, activo: true }],
    presentaciones: [{ id: presentationId, productoId: productId, nombre: row.presentation, factorUnidadBase: row.unitsPerPresentation, precioCOP: row.salesPriceStoreCop, precioTiendaCOP: row.salesPriceStoreCop, precioConsumidorFinalCOP: null, costoPresentacionCOP: row.costCopPerPresentation, activo: true, catalogoId: "BODEGA" }],
  });
  assert.deepEqual(prepared.errores, []);
  assert.equal(prepared.resumen.productosPorCrear, 0);
  assert.equal(prepared.resumen.presentacionesPorCrear, 0);
});

test("reuses existing product and presentation IDs and updates reviewed price and package cost", async () => {
  const calls: Array<{ nombre: string; commandId: string; payload: Record<string, unknown> }> = [];
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: "existing-category", nombre: row.category, espacioId: spaceId }],
    productos: [{ id: "existing-product", nombre: row.name, categoriaId: "existing-category", espacioId: spaceId, unidad: row.baseUnit, costoUnidadBaseCOP: 0, stock: 0, stockReservado: 0, stockMinimo: 0, activo: true }],
    presentaciones: [{ id: "existing-presentation", productoId: "existing-product", nombre: row.presentation, factorUnidadBase: row.unitsPerPresentation, precioCOP: 4000, precioTiendaCOP: 4000, precioConsumidorFinalCOP: null, costoPresentacionCOP: null, activo: true }],
  });
  assert.deepEqual(prepared.errores, []);
  assert.equal(prepared.filas[0].productoId, "existing-product");
  assert.equal(prepared.filas[0].presentacionId, "existing-presentation");
  assert.equal(prepared.resumen.productosPorCrear, 0);
  assert.equal(prepared.resumen.presentacionesPorCrear, 0);
  assert.equal(prepared.resumen.presentacionesPorActualizar, 1);

  const result = await ejecutarImportacionCatalogo(prepared, async (nombre, commandId, payload) => {
    calls.push({ nombre, commandId, payload });
    return { presentacionId: "existing-presentation" };
  });
  assert.deepEqual(calls.map(call => call.nombre), ["actualizarPresentacionComercialV1"]);
  assert.equal(calls[0].commandId, prepared.filas[0].presentacionCommandId);
  assert.equal(calls[0].payload.presentacionId, "existing-presentation");
  assert.equal(calls[0].payload.precioTiendaCOP, row.salesPriceStoreCop);
  assert.equal(calls[0].payload.costoPresentacionCOP, row.costCopPerPresentation);
  assert.equal(result.productosCreados, 0);
  assert.equal(result.presentacionesActualizadas, 1);
});

test("preserves a legacy Bodega consumer price and warns without blocking the store import", async () => {
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: "existing-category", nombre: row.category, espacioId: spaceId }],
    productos: [{ id: "existing-product", nombre: row.name, categoriaId: "existing-category", espacioId: spaceId, unidad: row.baseUnit, costoUnidadBaseCOP: 0, stock: 0, stockMinimo: 0, activo: true }],
    presentaciones: [{ id: "existing-presentation", productoId: "existing-product", nombre: row.presentation, factorUnidadBase: 1, precioCOP: 4000, precioTiendaCOP: 4000, precioConsumidorFinalCOP: 5200, costoPresentacionCOP: row.costCopPerPresentation, activo: true }],
  });
  assert.deepEqual(prepared.errores, []);
  assert.ok(prepared.advertencias.some(error => error.includes("tarifa consumidor heredada")));
  const calls: Array<{ nombre: string; payload: Record<string, unknown> }> = [];
  await ejecutarImportacionCatalogo(prepared, async (nombre, _commandId, payload) => {
    calls.push({ nombre, payload });
    return { presentacionId: "existing-presentation" };
  });
  const update = calls.find(call => call.nombre === "actualizarPresentacionComercialV1");
  assert.ok(update);
  assert.equal("precioConsumidorFinalCOP" in update.payload, false);
});

test("blocks resuming a partial category batch in a different space", () => {
  const categoryCommandId = `catalogo-diana:${sourceSha256}:BODEGA:categoria:cervezas-importadas`;
  const categoryId = crearIdInternoCatalogo(tenantId, `categoria:${categoryCommandId}`);
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: categoryId, nombre: row.category, espacioId: "another-space" }],
    productos: [],
    presentaciones: [],
  });
  assert.ok(prepared.errores.some(error => error.includes("espacio original")));
});

test("imports Bodega through server-authoritative commands and leaves consumer price empty", async () => {
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
  assert.equal(productPayload.data.catalogoId, "BODEGA");
  assert.equal(productPayload.data.stock, 0);
  assert.equal(productPayload.data.stockMinimo, 0);
  const presentationPayload = calls[2].payload as Record<string, unknown>;
  assert.equal(presentationPayload.precioTiendaCOP, row.salesPriceStoreCop);
  assert.equal(presentationPayload.precioConsumidorFinalCOP, null);
  assert.equal(productPayload.data.costo, 0);
  assert.equal(calls[2].payload.costoPresentacionCOP, row.costCopPerPresentation);
  assert.equal(result.productosCreados, 1);
  assert.equal(result.presentacionesCreadas, 1);
});

test("imports Nevera with independent IDs, retail price and no inferred cost or Bodega association", async () => {
  const calls: Array<{ nombre: string; commandId: string; payload: Record<string, unknown> }> = [];
  const prepared = prepararImportacionCatalogo(plan, tenantId, spaceId, {
    categorias: [{ id: "bodega-category", nombre: neveraRow.category, espacioId: spaceId, catalogoId: "BODEGA" }],
    productos: [{ id: "bodega-product", nombre: neveraRow.name, categoriaId: "bodega-category", espacioId: spaceId, unidad: "unidad", costoUnidadBaseCOP: 0, stock: 0, stockMinimo: 0, activo: true, catalogoId: "BODEGA" }],
    presentaciones: [],
  }, "NEVERA");
  assert.deepEqual(prepared.errores, []);
  assert.equal(prepared.catalogoId, "NEVERA");
  await ejecutarImportacionCatalogo(prepared, async (nombre, commandId, payload) => {
    calls.push({ nombre, commandId, payload });
    if (nombre === "crearCategoriaBodegaV1") return { categoriaId: "nevera-category-created" };
    if (nombre === "crearArticuloInventarioV1") return { articuloId: "nevera-product-created" };
    return { presentacionId: "nevera-presentation-created" };
  });
  assert.deepEqual(calls.map(call => call.nombre), ["crearCategoriaBodegaV1", "crearArticuloInventarioV1", "crearPresentacionComercialV1"]);
  assert.ok(calls.every(call => call.commandId.includes(":NEVERA:")));
  assert.equal(calls[0].payload.catalogoId, "NEVERA");
  const productData = (calls[1].payload as { data: Record<string, unknown> }).data;
  assert.equal(productData.catalogoId, "NEVERA");
  assert.equal(productData.stock, 0);
  assert.equal("costo" in productData, false);
  const presentationData = calls[2].payload;
  assert.equal(presentationData.precioCOP, neveraRow.salesPriceConsumerFinalCop);
  assert.equal(presentationData.precioTiendaCOP, neveraRow.salesPriceConsumerFinalCop);
  assert.equal(presentationData.precioConsumidorFinalCOP, null);
  assert.equal("costoPresentacionCOP" in presentationData, false);
});

test("preserves a source package cost that cannot divide into whole COP base units", () => {
  const packageRow = { ...row, unitsPerPresentation: 12, sourceCostCop: 19_000, costBasis: "PRESENTACION / EMPAQUE" as const, costCopPerPresentation: 19_000 };
  const packagePlan = { ...plan, proposal: { ...plan.proposal, presentations: [packageRow] } };
  assert.deepEqual(validarPlanImportacionCatalogo(packagePlan), []);
  const prepared = prepararImportacionCatalogo(packagePlan, tenantId, spaceId, { categorias: [], productos: [], presentaciones: [] });
  assert.deepEqual(prepared.errores, []);
});
