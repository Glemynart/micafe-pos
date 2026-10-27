import { CATEGORIAS_CATALOGO_DIANA, CATEGORIAS_CATALOGO_NEVERA } from "./diana-catalog-category-suggestions";

export interface DianaCatalogImportRow {
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
  /** Exact purchase cost of the sold package. Never rounded to base units. */
  costCopPerPresentation: number;
}

export interface DianaCatalogNeveraRow {
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
}

export interface DianaCatalogImportPlan {
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
    presentations: DianaCatalogImportRow[];
  };
  neveraCatalog: {
    catalogId: "NEVERA";
    status: "requires-human-review";
    granularity: "one-presentation-per-consumer-source-row";
    salesPriceSource: "PRECIOS CONS FINAL.PRECIO VENTA";
    costPolicy: "pending explicit Bodega transfer mapping";
    stockInitial: 0;
    productGroupingInferred: false;
    presentations: DianaCatalogNeveraRow[];
  };
  consumerReference: {
    consumerRowsInNevera: number;
    crossListCandidates: number;
    transferMappingsPending: number;
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

export interface CatalogImportCategory {
  id: string;
  nombre: string;
  espacioId: string;
  catalogoId?: "BODEGA" | "NEVERA";
}

export interface CatalogImportProduct {
  id: string;
  nombre: string;
  categoriaId: string;
  espacioId: string;
  unidad: string;
  costoUnidadBaseCOP: number;
  stock: number;
  stockReservado?: number;
  stockMinimo: number;
  activo: boolean;
  catalogoId?: "BODEGA" | "NEVERA";
}

export interface CatalogImportPresentation {
  id: string;
  productoId: string;
  nombre: string;
  factorUnidadBase: number;
  precioCOP: number;
  precioTiendaCOP: number;
  precioConsumidorFinalCOP: number | null;
  costoPresentacionCOP: number | null;
  activo: boolean;
  catalogoId?: "BODEGA" | "NEVERA";
}

export type CatalogoImportId = "BODEGA" | "NEVERA";

export interface CatalogImportRow {
  sourceRow: number;
  reviewRow: number;
  name: string;
  category: string;
  baseUnit: string;
  presentation: string;
  unitsPerPresentation: number;
  packagingQuantityEvidence: "explicit_count" | "administrator_confirmed_individual" | "assumed_single_unit" | "ambiguous_count";
  salesPriceCop: number;
  costCopPerPresentation: number | null;
}

export interface CatalogImportSnapshot {
  categorias: CatalogImportCategory[];
  productos: CatalogImportProduct[];
  presentaciones: CatalogImportPresentation[];
}

export interface ImportacionCatalogoPreparada {
  plan: DianaCatalogImportPlan;
  tenantId: string;
  espacioId: string;
  catalogoId: CatalogoImportId;
  errores: string[];
  advertencias: string[];
  categorias: Array<{ nombre: string; commandId: string; categoriaId: string | null }>;
  filas: Array<{
    row: CatalogImportRow;
    categoriaId: string;
    productoCommandId: string;
    productoId: string;
    productoExistente: boolean;
    productoActualizar: boolean;
    productoActual: CatalogImportProduct | null;
    productoCategoriaActualNombre: string | null;
    presentacionCommandId: string;
    presentacionId: string;
    presentacionExistente: boolean;
    presentacionActualizar: boolean;
    presentacionActual: CatalogImportPresentation | null;
  }>;
  resumen: {
    productosTotales: number;
    categoriasTotales: number;
    categoriasPorCrear: number;
    productosPorCrear: number;
    productosPorActualizar: number;
    presentacionesPorCrear: number;
    presentacionesPorActualizar: number;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-CO");
}

function slug(value: string): string {
  return normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function base64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Mirrors the canonical server-side `crearIdentificadorInterno` encoding. */
export function crearIdInternoCatalogo(tenantId: string, segmento: string): string {
  return `r1a-${base64UrlUtf8(JSON.stringify([tenantId, segmento]))}`;
}

export function crearComandoProductoCatalogo(sourceSha256: string, sourceRow: number, catalogoId: CatalogoImportId = "BODEGA"): string {
  return `catalogo-diana:${sourceSha256}:${catalogoId}:producto:${sourceRow}`;
}

function crearComandoCategoria(sourceSha256: string, category: string, catalogoId: CatalogoImportId): string {
  return `catalogo-diana:${sourceSha256}:${catalogoId}:categoria:${slug(category)}`;
}

function crearComandoPresentacion(sourceSha256: string, sourceRow: number, catalogoId: CatalogoImportId): string {
  return `catalogo-diana:${sourceSha256}:${catalogoId}:presentacion:${sourceRow}`;
}

export function validarPlanImportacionCatalogo(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ["El archivo no contiene un plan JSON válido."];
  const plan = value as unknown as Partial<DianaCatalogImportPlan>;
  if (plan.planSchemaVersion !== "3.0" || plan.mode !== "offline-review-only") errors.push("El archivo no es un plan offline de catálogo versión 3.0; los planes anteriores mezclaban las listas.");
  if (!/^[a-f0-9]{64}$/i.test(String(plan.sourceSha256 ?? "")) || !/^[a-f0-9]{64}$/i.test(String(plan.reviewSha256 ?? ""))) errors.push("Falta el SHA-256 válido del origen o de la revisión.");
  if (plan.proposal?.status !== "requires-human-review"
    || plan.proposal.catalogId !== "BODEGA"
    || plan.proposal.granularity !== "one-presentation-per-store-source-row"
    || plan.proposal.salesPriceSource !== "PRECIOS A TIENDA.PRECIO VENTA"
    || plan.proposal.consumerPriceSource !== null
    || plan.proposal.costPolicy !== "AL COSTO exact per presentation; no automatic markup"
    || plan.proposal.productGroupingInferred !== false) {
    errors.push("El plan no conserva las decisiones comerciales de catálogo aprobadas.");
  }
  if (plan.initialStockIncluded !== false) errors.push("El importador no acepta existencias iniciales dentro del catálogo.");
  if (plan.safety?.firebaseAccessed !== false || plan.safety?.writesPerformed !== false
    || plan.safety?.importReady !== false || plan.safety?.executable !== false || plan.safety?.deploymentAuthorized !== false) {
    errors.push("El archivo debe provenir del generador offline y no contener banderas de ejecución o autorización.");
  }
  if (!plan.consumerReference || !Number.isSafeInteger(plan.consumerReference.consumerRowsInNevera) || plan.consumerReference.consumerRowsInNevera <= 0
    || !Number.isSafeInteger(plan.consumerReference.crossListCandidates) || plan.consumerReference.crossListCandidates < 0
    || !Number.isSafeInteger(plan.consumerReference.transferMappingsPending) || plan.consumerReference.transferMappingsPending !== plan.consumerReference.consumerRowsInNevera) {
    errors.push("El plan no conserva las dos listas como catálogos separados.");
  }
  const rows = plan.proposal?.presentations;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 107) errors.push("El plan debe contener entre 1 y 107 filas de tienda.");
  if (Array.isArray(rows)) {
    const seenSourceRows = new Set<number>();
    const seenNames = new Set<string>();
    for (const [index, item] of rows.entries()) {
      if (!isObject(item)) {
        errors.push(`La fila ${index + 1} no tiene una estructura válida.`);
        continue;
      }
      const row = item as unknown as DianaCatalogImportRow;
      if (!positiveInteger(row.sourceRow) || !positiveInteger(row.reviewRow)) errors.push(`La fila ${index + 1} no tiene referencias de origen válidas.`);
      if (seenSourceRows.has(row.sourceRow)) errors.push(`La fila de origen ${row.sourceRow} está duplicada.`);
      seenSourceRows.add(row.sourceRow);
      if (typeof row.name !== "string" || row.name.trim() === "" || row.name.trim().length > 120) errors.push(`La fila ${index + 1} no tiene un nombre de producto válido.`);
      const nameKey = typeof row.name === "string" ? normalized(row.name) : "";
      if (nameKey && seenNames.has(nameKey)) errors.push(`El producto «${row.name}» aparece más de una vez en el plan.`);
      if (nameKey) seenNames.add(nameKey);
      if (!(Object.values(CATEGORIAS_CATALOGO_DIANA) as string[]).includes(row.category)) errors.push(`La categoría Bodega de la fila ${index + 1} no pertenece a las 17 categorías aprobadas.`);
      if (typeof row.baseUnit !== "string" || row.baseUnit.trim() === "" || row.baseUnit.trim().length > 32) errors.push(`La unidad base de la fila ${index + 1} no es válida.`);
      if (typeof row.presentation !== "string" || row.presentation.trim() === "" || row.presentation.trim().length > 120) errors.push(`La presentación de la fila ${index + 1} no es válida.`);
      if (row.packagingQuantityEvidence !== "explicit_count" && row.packagingQuantityEvidence !== "administrator_confirmed_individual" && row.packagingQuantityEvidence !== "assumed_single_unit" && row.packagingQuantityEvidence !== "ambiguous_count") errors.push(`La fila ${index + 1} no registra evidencia válida de unidades por empaque.`);
      if (row.packagingQuantityEvidence === "administrator_confirmed_individual" && row.unitsPerPresentation !== 1) errors.push(`La fila ${index + 1} contradice la decisión de unidad individual confirmada por administración.`);
      if (!positiveInteger(row.unitsPerPresentation) || !positiveInteger(row.salesPriceStoreCop) || !positiveInteger(row.sourceCostCop) || !positiveInteger(row.costCopPerPresentation)) errors.push(`La fila ${index + 1} contiene precio, costo o factor inválido.`);
      if (row.consumerSourceRow !== null || row.consumerFinalPriceCop !== null) errors.push(`La fila Bodega ${index + 1} no puede incluir una tarifa del catálogo Nevera.`);
      if (row.costBasis !== "PRESENTACION / EMPAQUE") errors.push(`El costo de la fila ${index + 1} debe ser el valor exacto del empaque según la confirmación de Diana.`);
      else if (row.sourceCostCop !== row.costCopPerPresentation) {
        errors.push(`El costo del empaque de la fila ${index + 1} no coincide exactamente con la fuente.`);
      }
    }
  }
  if (plan.neveraCatalog?.catalogId !== "NEVERA" || plan.neveraCatalog.status !== "requires-human-review"
    || plan.neveraCatalog.granularity !== "one-presentation-per-consumer-source-row"
    || plan.neveraCatalog.salesPriceSource !== "PRECIOS CONS FINAL.PRECIO VENTA"
    || plan.neveraCatalog.costPolicy !== "pending explicit Bodega transfer mapping"
    || plan.neveraCatalog.stockInitial !== 0 || plan.neveraCatalog.productGroupingInferred !== false) {
    errors.push("El plan no define un catálogo Nevera independiente con costo/stock pendientes.");
  }
  const neveraRows = plan.neveraCatalog?.presentations;
  if (!Array.isArray(neveraRows) || neveraRows.length === 0 || neveraRows.length > 55
    || neveraRows.length !== plan.consumerReference?.consumerRowsInNevera) errors.push("El catálogo Nevera debe incluir entre 1 y 55 filas propias.");
  if (Array.isArray(neveraRows)) {
    const seenSourceRows = new Set<number>();
    const seenNames = new Set<string>();
    for (const [index, item] of neveraRows.entries()) {
      if (!isObject(item)) { errors.push(`La fila Nevera ${index + 1} no tiene una estructura válida.`); continue; }
      const row = item as unknown as DianaCatalogNeveraRow;
      const key = typeof row.name === "string" ? normalized(row.name) : "";
      if (!positiveInteger(row.sourceRow) || !positiveInteger(row.reviewRow) || seenSourceRows.has(row.sourceRow)) errors.push(`La fila Nevera ${index + 1} tiene referencia de origen inválida o duplicada.`);
      seenSourceRows.add(row.sourceRow);
      if (!key || key.length > 120 || seenNames.has(key)) errors.push(`La fila Nevera ${index + 1} tiene nombre vacío, largo o duplicado dentro de ese catálogo.`);
      seenNames.add(key);
      if (!(Object.values(CATEGORIAS_CATALOGO_NEVERA) as string[]).includes(row.category)) errors.push(`La categoría Nevera ${index + 1} no pertenece a las categorías permitidas para ese catálogo.`);
      if (typeof row.baseUnit !== "string" || !row.baseUnit.trim() || row.baseUnit.length > 32) errors.push(`La unidad base Nevera ${index + 1} es inválida.`);
      if (typeof row.presentation !== "string" || !row.presentation.trim() || row.presentation.length > 120) errors.push(`La presentación Nevera ${index + 1} es inválida.`);
      if (row.packagingQuantityEvidence !== "explicit_count" && row.packagingQuantityEvidence !== "administrator_confirmed_individual" && row.packagingQuantityEvidence !== "assumed_single_unit" && row.packagingQuantityEvidence !== "ambiguous_count") errors.push(`La fila Nevera ${index + 1} no registra evidencia válida de unidades por empaque.`);
      if (row.packagingQuantityEvidence === "administrator_confirmed_individual" && row.unitsPerPresentation !== 1) errors.push(`La fila Nevera ${index + 1} contradice la decisión de unidad individual confirmada por administración.`);
      if (!positiveInteger(row.unitsPerPresentation) || !positiveInteger(row.salesPriceConsumerFinalCop)) errors.push(`La fila Nevera ${index + 1} tiene precio o factor inválido.`);
      if (row.sourceCostCop !== null || row.costCopPerPresentation !== null || row.bodegaAssociation !== null) errors.push(`La fila Nevera ${index + 1} contiene costo o asociación Bodega inferidos automáticamente.`);
    }
  }
  return [...new Set(errors)];
}

function productCommandId(plan: DianaCatalogImportPlan, sourceRow: number, catalogoId: CatalogoImportId): string {
  return crearComandoProductoCatalogo(plan.sourceSha256, sourceRow, catalogoId);
}

export function prepararImportacionCatalogo(
  value: unknown,
  tenantId: string,
  espacioId: string,
  snapshot: CatalogImportSnapshot,
  catalogoId: CatalogoImportId = "BODEGA",
): ImportacionCatalogoPreparada {
  const errores = validarPlanImportacionCatalogo(value);
  const advertencias: string[] = [];
  if (!tenantId.trim()) errores.push("No se pudo verificar el tenant activo.");
  if (!espacioId.trim()) errores.push("Selecciona un espacio operativo.");
  if (errores.length > 0) {
    return {
      plan: value as DianaCatalogImportPlan,
      tenantId,
      espacioId,
      catalogoId,
      errores: [...new Set(errores)],
      advertencias,
      categorias: [],
      filas: [],
      resumen: { productosTotales: 0, categoriasTotales: 0, categoriasPorCrear: 0, productosPorCrear: 0, productosPorActualizar: 0, presentacionesPorCrear: 0, presentacionesPorActualizar: 0 },
    };
  }
  const plan = value as DianaCatalogImportPlan;
  const sourceRows: CatalogImportRow[] = catalogoId === "BODEGA"
    ? plan.proposal.presentations.map(row => ({
      sourceRow: row.sourceRow, reviewRow: row.reviewRow, name: row.name, category: row.category,
      baseUnit: row.baseUnit, presentation: row.presentation, unitsPerPresentation: row.unitsPerPresentation,
      packagingQuantityEvidence: row.packagingQuantityEvidence, salesPriceCop: row.salesPriceStoreCop,
      costCopPerPresentation: row.costCopPerPresentation,
    }))
    : plan.neveraCatalog.presentations.map(row => ({
      sourceRow: row.sourceRow, reviewRow: row.reviewRow, name: row.name, category: row.category,
      baseUnit: row.baseUnit, presentation: row.presentation, unitsPerPresentation: row.unitsPerPresentation,
      packagingQuantityEvidence: row.packagingQuantityEvidence, salesPriceCop: row.salesPriceConsumerFinalCop,
      costCopPerPresentation: null,
    }));
  const catalogoEfectivo = (value: "BODEGA" | "NEVERA" | undefined) => value ?? "BODEGA";
  const names = [...new Set(sourceRows.map(row => row.category))];
  const categorias = names.map(nombre => {
    const commandId = crearComandoCategoria(plan.sourceSha256, nombre, catalogoId);
    const expectedId = crearIdInternoCatalogo(tenantId, `categoria:${commandId}`);
    const expectedCategory = snapshot.categorias.find(category => category.id === expectedId && catalogoEfectivo(category.catalogoId) === catalogoId);
    if (expectedCategory && (expectedCategory.espacioId !== espacioId || normalized(expectedCategory.nombre) !== normalized(nombre))) {
      errores.push(`La categoría «${nombre}» de este lote ya existe en otro espacio o con otro nombre; reanuda en el espacio original y no cambies el plan.`);
    }
    const matches = snapshot.categorias.filter(category => catalogoEfectivo(category.catalogoId) === catalogoId && category.espacioId === espacioId && normalized(category.nombre) === normalized(nombre));
    if (matches.length > 1) errores.push(`La categoría «${nombre}» está duplicada en el catálogo y espacio seleccionados.`);
    return {
      nombre,
      commandId,
      categoriaId: matches.length === 1 ? matches[0].id : null,
    };
  });
  const categoryIds = new Map(categorias.map(category => [normalized(category.nombre), category.categoriaId
    ?? crearIdInternoCatalogo(tenantId, `categoria:${category.commandId}`)]));
  const filas = sourceRows.map(row => {
    const commandId = productCommandId(plan, row.sourceRow, catalogoId);
    let productoId = crearIdInternoCatalogo(tenantId, `producto:${commandId}`);
    const categoriaId = categoryIds.get(normalized(row.category)) ?? "";
    const existingProducts = snapshot.productos.filter(product => catalogoEfectivo(product.catalogoId) === catalogoId && normalized(product.nombre) === normalized(row.name));
    let productoExistente = false;
    let productoActualizar = false;
    let existingProduct: CatalogImportProduct | undefined;
    if (existingProducts.length > 1) errores.push(`Hay varios productos existentes llamados «${row.name}»; resuelve la duplicidad antes de importar.`);
    if (existingProducts.length === 1) {
      const existing = existingProducts[0];
      if (existing.espacioId !== espacioId || existing.unidad !== row.baseUnit
        || existing.costoUnidadBaseCOP !== 0 || !existing.activo) {
        errores.push(`El producto «${row.name}» ya existe con datos distintos al plan; requiere revisión manual.`);
      } else {
        productoId = existing.id;
        existingProduct = existing;
        productoExistente = true;
        productoActualizar = existing.categoriaId !== categoriaId;
      }
    }
    const presentacionCommandId = crearComandoPresentacion(plan.sourceSha256, row.sourceRow, catalogoId);
    let presentacionId = crearIdInternoCatalogo(tenantId, `presentacion:${productoId}:${presentacionCommandId}`);
    const existingPresentations = snapshot.presentaciones.filter(presentation => presentation.productoId === productoId && catalogoEfectivo(presentation.catalogoId) === catalogoId && normalized(presentation.nombre) === normalized(row.presentation));
    let presentacionExistente = false;
    let presentacionActualizar = false;
    let presentacionActual: CatalogImportPresentation | null = null;
    if (existingPresentations.length > 1) errores.push(`La presentación «${row.presentation}» está duplicada para «${row.name}».`);
    if (existingPresentations.length === 1) {
      const existing = existingPresentations[0];
      presentacionActual = existing;
      presentacionId = existing.id;
      presentacionExistente = true;
      const costoObjetivo = catalogoId === "BODEGA" ? row.costCopPerPresentation : null;
      if (!existing.activo) errores.push(`La presentación «${row.presentation}» de «${row.name}» está inactiva; no se reactivará automáticamente.`);
      if (catalogoId === "BODEGA" && existing.precioConsumidorFinalCOP !== null) {
        advertencias.push(`La presentación «${row.presentation}» de «${row.name}» conserva una tarifa consumidor heredada en Bodega. Se preservará sin usarla; debe reconciliarse antes de activar ventas Nevera.`);
      }
      if (catalogoId === "NEVERA" && existing.costoPresentacionCOP !== null) {
        errores.push(`La presentación «${row.presentation}» de «${row.name}» conserva un costo sin transferencia aprobada; resuélvelo antes de importar Nevera.`);
      }
      const cambiaFactor = existing.factorUnidadBase !== row.unitsPerPresentation;
      const cambiaCosto = existing.costoPresentacionCOP !== costoObjetivo;
      if ((cambiaFactor || cambiaCosto) && ((existingProduct?.stock ?? 0) > 0 || (existingProduct?.stockReservado ?? 0) > 0)) {
        errores.push(`La presentación «${row.presentation}» de «${row.name}» cambiaría factor o costo con inventario existente; requiere conciliación manual.`);
      }
      if ((existingProduct?.stockReservado ?? 0) > 0 && (existing.precioCOP !== row.salesPriceCop || existing.precioTiendaCOP !== row.salesPriceCop)) {
        errores.push(`La presentación «${row.presentation}» de «${row.name}» tiene unidades reservadas y un cambio de precio pendiente; revalida las solicitudes antes de importar.`);
      }
      presentacionActualizar = existing.nombre !== row.presentation || cambiaFactor
        || existing.precioCOP !== row.salesPriceCop || existing.precioTiendaCOP !== row.salesPriceCop
        || cambiaCosto;
    } else {
      const sameFactor = snapshot.presentaciones.some(presentation => presentation.productoId === productoId
        && catalogoEfectivo(presentation.catalogoId) === catalogoId
        && presentation.factorUnidadBase === row.unitsPerPresentation);
      if (sameFactor) errores.push(`«${row.name}» ya tiene una presentación con factor ${row.unitsPerPresentation}; confirma manualmente si la fila fuente corresponde a esa presentación.`);
    }
    const productoCategoriaActualNombre = existingProduct
      ? snapshot.categorias.find(category => category.id === existingProduct.categoriaId)?.nombre ?? existingProduct.categoriaId
      : null;
    return { row, categoriaId, productoCommandId: commandId, productoId, productoExistente, productoActualizar, productoActual: existingProduct ?? null, productoCategoriaActualNombre, presentacionCommandId, presentacionId, presentacionExistente, presentacionActualizar, presentacionActual };
  });
  const categoriasPorCrear = categorias.filter(category => category.categoriaId === null).length;
  return {
    plan,
    tenantId,
    espacioId,
    catalogoId,
    errores: [...new Set(errores)],
    advertencias: [...new Set(advertencias)],
    categorias,
    filas,
    resumen: {
      productosTotales: filas.length,
      categoriasTotales: categorias.length,
      categoriasPorCrear,
      productosPorCrear: filas.filter(row => !row.productoExistente).length,
      productosPorActualizar: filas.filter(row => row.productoActualizar).length,
      presentacionesPorCrear: filas.filter(row => !row.presentacionExistente).length,
      presentacionesPorActualizar: filas.filter(row => row.presentacionActualizar).length,
    },
  };
}

export type CatalogImportProgress = { fase: "categorias" | "productos" | "presentaciones"; completadas: number; total: number };
export type CatalogImportCommand = (nombre: string, commandId: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

export async function ejecutarImportacionCatalogo(
  preparado: ImportacionCatalogoPreparada,
  ejecutarComando: CatalogImportCommand,
  onProgress?: (progress: CatalogImportProgress) => void,
): Promise<{ categoriasCreadas: number; productosCreados: number; productosActualizados: number; presentacionesCreadas: number; presentacionesActualizadas: number }> {
  if (preparado.errores.length > 0) throw new Error("El preflight del catálogo contiene bloqueos y no permite importar.");
  const idsCategorias = new Map<string, string>();
  let categoriasCreadas = 0;
  let productosCreados = 0;
  let productosActualizados = 0;
  let presentacionesCreadas = 0;
  let presentacionesActualizadas = 0;
  let done = 0;
  for (const category of preparado.categorias) {
    let id = category.categoriaId;
    if (!id) {
      const result = await ejecutarComando("crearCategoriaBodegaV1", category.commandId, { espacioId: preparado.espacioId, catalogoId: preparado.catalogoId, nombre: category.nombre });
      if (typeof result.categoriaId !== "string" || result.categoriaId === "") throw new Error(`No se confirmó la categoría «${category.nombre}».`);
      id = result.categoriaId;
      categoriasCreadas += 1;
    }
    idsCategorias.set(normalized(category.nombre), id);
    done += 1;
    onProgress?.({ fase: "categorias", completadas: done, total: preparado.categorias.length });
  }

  done = 0;
  for (const item of preparado.filas) {
    let productoId = item.productoId;
    if (!item.productoExistente) {
      const result = await ejecutarComando("crearArticuloInventarioV1", item.productoCommandId, {
        articuloTipo: "producto",
        data: {
          nombre: item.row.name,
          categoriaId: idsCategorias.get(normalized(item.row.category)) ?? item.categoriaId,
          catalogoId: preparado.catalogoId,
          espacioId: preparado.espacioId,
          unidad: item.row.baseUnit,
          // The exact Bodega source cost belongs to its package presentation.
          // Nevera has no assigned cost until an approved transfer exists.
          ...(preparado.catalogoId === "BODEGA" ? { costo: 0 } : {}),
          stock: 0,
          stockMinimo: 0,
          activo: true,
        },
      });
      if (typeof result.articuloId !== "string" || result.articuloId === "") throw new Error(`No se confirmó el producto de la fila de origen ${item.row.sourceRow}.`);
      productoId = result.articuloId;
      productosCreados += 1;
    } else if (item.productoActualizar) {
      await ejecutarComando("actualizarArticuloInventarioV1", item.productoCommandId, {
        articuloTipo: "producto",
        articuloId: productoId,
        data: { catalogoId: preparado.catalogoId, categoriaId: idsCategorias.get(normalized(item.row.category)) ?? item.categoriaId },
      });
      productosActualizados += 1;
    }
    done += 1;
    onProgress?.({ fase: "productos", completadas: done, total: preparado.filas.length });
    if (!item.presentacionExistente) {
      const result = await ejecutarComando("crearPresentacionComercialV1", item.presentacionCommandId, {
        productoId,
        nombre: item.row.presentation,
        factorUnidadBase: item.row.unitsPerPresentation,
        precioCOP: item.row.salesPriceCop,
        precioTiendaCOP: item.row.salesPriceCop,
        precioConsumidorFinalCOP: null,
        ...(item.row.costCopPerPresentation === null ? {} : { costoPresentacionCOP: item.row.costCopPerPresentation }),
        activo: true,
      });
      if (typeof result.presentacionId !== "string" || result.presentacionId === "") throw new Error(`No se confirmó la presentación de la fila de origen ${item.row.sourceRow}.`);
      presentacionesCreadas += 1;
      onProgress?.({ fase: "presentaciones", completadas: presentacionesCreadas, total: preparado.resumen.presentacionesPorCrear });
    } else if (item.presentacionActualizar) {
      await ejecutarComando("actualizarPresentacionComercialV1", item.presentacionCommandId, {
        presentacionId: item.presentacionId,
        nombre: item.row.presentation,
        factorUnidadBase: item.row.unitsPerPresentation,
        precioCOP: item.row.salesPriceCop,
        precioTiendaCOP: item.row.salesPriceCop,
        ...(item.row.costCopPerPresentation === null ? {} : { costoPresentacionCOP: item.row.costCopPerPresentation }),
      });
      presentacionesActualizadas += 1;
      onProgress?.({ fase: "presentaciones", completadas: presentacionesCreadas + presentacionesActualizadas, total: preparado.resumen.presentacionesPorCrear + preparado.resumen.presentacionesPorActualizar });
    }
  }
  return { categoriasCreadas, productosCreados, productosActualizados, presentacionesCreadas, presentacionesActualizadas };
}
