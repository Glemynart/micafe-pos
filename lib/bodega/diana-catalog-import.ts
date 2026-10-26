import { CATEGORIAS_CATALOGO_DIANA } from "./diana-catalog-category-suggestions";

export interface DianaCatalogImportRow {
  sourceRow: number;
  reviewRow: number;
  name: string;
  category: string;
  baseUnit: string;
  presentation: string;
  unitsPerPresentation: number;
  salesPriceCop: number;
  sourceCostCop: number;
  costBasis: "UNIDAD BASE" | "PRESENTACION / EMPAQUE";
  costCopPerBaseUnit: number;
}

export interface DianaCatalogImportPlan {
  planSchemaVersion: "1.0";
  mode: "offline-review-only";
  sourceSha256: string;
  reviewSha256: string;
  proposal: {
    status: "requires-human-review";
    granularity: "one-presentation-per-store-source-row";
    salesPriceSource: "PRECIOS A TIENDA.PRECIO VENTA";
    costPolicy: "AL COSTO exact per base unit; no automatic markup";
    productGroupingInferred: false;
    presentations: DianaCatalogImportRow[];
  };
  consumerReference: {
    salesPricesApplied: false;
    consumerOnlyRowsDeferred: number;
    crossListCandidates: number;
    crossListDecisionsPending: number;
    crossListCandidatesMerged: false;
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
}

export interface CatalogImportProduct {
  id: string;
  nombre: string;
  categoriaId: string;
  espacioId: string;
  unidad: string;
  costoUnidadBaseCOP: number;
  stock: number;
  stockMinimo: number;
  activo: boolean;
}

export interface CatalogImportPresentation {
  id: string;
  productoId: string;
  nombre: string;
  factorUnidadBase: number;
  precioCOP: number;
  activo: boolean;
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
  errores: string[];
  categorias: Array<{ nombre: string; commandId: string; categoriaId: string | null }>;
  filas: Array<{
    row: DianaCatalogImportRow;
    categoriaId: string;
    productoCommandId: string;
    productoId: string;
    productoExistente: boolean;
    presentacionCommandId: string;
    presentacionId: string;
    presentacionExistente: boolean;
  }>;
  resumen: {
    productosTotales: number;
    categoriasTotales: number;
    categoriasPorCrear: number;
    productosPorCrear: number;
    presentacionesPorCrear: number;
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

export function crearComandoProductoCatalogo(sourceSha256: string, sourceRow: number): string {
  return `catalogo-diana:${sourceSha256}:producto:${sourceRow}`;
}

function crearComandoCategoria(sourceSha256: string, category: string): string {
  return `catalogo-diana:${sourceSha256}:categoria:${slug(category)}`;
}

function crearComandoPresentacion(sourceSha256: string, sourceRow: number): string {
  return `catalogo-diana:${sourceSha256}:presentacion:${sourceRow}`;
}

export function validarPlanImportacionCatalogo(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ["El archivo no contiene un plan JSON válido."];
  const plan = value as unknown as Partial<DianaCatalogImportPlan>;
  if (plan.planSchemaVersion !== "1.0" || plan.mode !== "offline-review-only") errors.push("El archivo no es un plan offline de catálogo versión 1.0.");
  if (!/^[a-f0-9]{64}$/i.test(String(plan.sourceSha256 ?? "")) || !/^[a-f0-9]{64}$/i.test(String(plan.reviewSha256 ?? ""))) errors.push("Falta el SHA-256 válido del origen o de la revisión.");
  if (plan.proposal?.status !== "requires-human-review"
    || plan.proposal.granularity !== "one-presentation-per-store-source-row"
    || plan.proposal.salesPriceSource !== "PRECIOS A TIENDA.PRECIO VENTA"
    || plan.proposal.costPolicy !== "AL COSTO exact per base unit; no automatic markup"
    || plan.proposal.productGroupingInferred !== false) {
    errors.push("El plan no conserva las decisiones comerciales de catálogo aprobadas.");
  }
  if (plan.initialStockIncluded !== false) errors.push("El importador no acepta existencias iniciales dentro del catálogo.");
  if (plan.safety?.firebaseAccessed !== false || plan.safety?.writesPerformed !== false
    || plan.safety?.importReady !== false || plan.safety?.executable !== false || plan.safety?.deploymentAuthorized !== false) {
    errors.push("El archivo debe provenir del generador offline y no contener banderas de ejecución o autorización.");
  }
  if (plan.consumerReference?.salesPricesApplied !== false || plan.consumerReference?.crossListCandidatesMerged !== false) {
    errors.push("El plan no puede aplicar tarifas de consumidor ni fusionar coincidencias entre listas.");
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
      if (!(Object.values(CATEGORIAS_CATALOGO_DIANA) as string[]).includes(row.category)) errors.push(`La categoría de la fila ${index + 1} no pertenece a las 17 categorías aprobadas.`);
      if (typeof row.baseUnit !== "string" || row.baseUnit.trim() === "" || row.baseUnit.trim().length > 32) errors.push(`La unidad base de la fila ${index + 1} no es válida.`);
      if (typeof row.presentation !== "string" || row.presentation.trim() === "" || row.presentation.trim().length > 120) errors.push(`La presentación de la fila ${index + 1} no es válida.`);
      if (!positiveInteger(row.unitsPerPresentation) || !positiveInteger(row.salesPriceCop) || !positiveInteger(row.sourceCostCop) || !positiveInteger(row.costCopPerBaseUnit)) errors.push(`La fila ${index + 1} contiene precio, costo o factor inválido.`);
      if (row.costBasis !== "UNIDAD BASE" && row.costBasis !== "PRESENTACION / EMPAQUE") errors.push(`La base de costo de la fila ${index + 1} no es válida.`);
      else if (row.costBasis === "UNIDAD BASE" && row.sourceCostCop !== row.costCopPerBaseUnit) errors.push(`El costo por unidad base de la fila ${index + 1} no coincide con su origen.`);
      else if (row.costBasis === "PRESENTACION / EMPAQUE" && row.sourceCostCop / row.unitsPerPresentation !== row.costCopPerBaseUnit) errors.push(`El costo de la fila ${index + 1} no se convierte exactamente a la unidad base.`);
    }
  }
  return [...new Set(errors)];
}

function productCommandId(plan: DianaCatalogImportPlan, sourceRow: number): string {
  return crearComandoProductoCatalogo(plan.sourceSha256, sourceRow);
}

export function prepararImportacionCatalogo(
  value: unknown,
  tenantId: string,
  espacioId: string,
  snapshot: CatalogImportSnapshot,
): ImportacionCatalogoPreparada {
  const errores = validarPlanImportacionCatalogo(value);
  if (!tenantId.trim()) errores.push("No se pudo verificar el tenant activo.");
  if (!espacioId.trim()) errores.push("Selecciona un espacio operativo.");
  if (errores.length > 0) {
    return {
      plan: value as DianaCatalogImportPlan,
      tenantId,
      espacioId,
      errores: [...new Set(errores)],
      categorias: [],
      filas: [],
      resumen: { productosTotales: 0, categoriasTotales: 0, categoriasPorCrear: 0, productosPorCrear: 0, presentacionesPorCrear: 0 },
    };
  }
  const plan = value as DianaCatalogImportPlan;
  const names = [...new Set((plan?.proposal?.presentations ?? []).map(row => row.category))];
  const categorias = names.map(nombre => {
    const commandId = crearComandoCategoria(plan.sourceSha256, nombre);
    const expectedId = crearIdInternoCatalogo(tenantId, `categoria:${commandId}`);
    const expectedCategory = snapshot.categorias.find(category => category.id === expectedId);
    if (expectedCategory && (expectedCategory.espacioId !== espacioId || normalized(expectedCategory.nombre) !== normalized(nombre))) {
      errores.push(`La categoría «${nombre}» de este lote ya existe en otro espacio o con otro nombre; reanuda en el espacio original y no cambies el plan.`);
    }
    const matches = snapshot.categorias.filter(category => category.espacioId === espacioId && normalized(category.nombre) === normalized(nombre));
    if (matches.length > 1) errores.push(`La categoría «${nombre}» está duplicada en el espacio seleccionado.`);
    return {
      nombre,
      commandId,
      categoriaId: matches.length === 1 ? matches[0].id : null,
    };
  });
  const categoryIds = new Map(categorias.map(category => [normalized(category.nombre), category.categoriaId
    ?? crearIdInternoCatalogo(tenantId, `categoria:${category.commandId}`)]));
  const filas = (plan?.proposal?.presentations ?? []).map(row => {
    const commandId = productCommandId(plan, row.sourceRow);
    const productoId = crearIdInternoCatalogo(tenantId, `producto:${commandId}`);
    const categoriaId = categoryIds.get(normalized(row.category)) ?? "";
    const existingProducts = snapshot.productos.filter(product => normalized(product.nombre) === normalized(row.name));
    let productoExistente = false;
    if (existingProducts.length > 1) errores.push(`Hay varios productos existentes llamados «${row.name}»; resuelve la duplicidad antes de importar.`);
    if (existingProducts.length === 1) {
      const existing = existingProducts[0];
      if (existing.id !== productoId) errores.push(`El producto «${row.name}» ya existe y no pertenece a este lote; no se creará un duplicado.`);
      else if (existing.categoriaId !== categoriaId || existing.espacioId !== espacioId || existing.unidad !== row.baseUnit
        || existing.costoUnidadBaseCOP !== row.costCopPerBaseUnit || !existing.activo) {
        errores.push(`El producto «${row.name}» ya existe con datos distintos al plan; requiere revisión manual.`);
      } else productoExistente = true;
    }
    const presentacionCommandId = crearComandoPresentacion(plan.sourceSha256, row.sourceRow);
    const presentacionId = crearIdInternoCatalogo(tenantId, `presentacion:${productoId}:${presentacionCommandId}`);
    const existingPresentations = snapshot.presentaciones.filter(presentation => presentation.productoId === productoId && normalized(presentation.nombre) === normalized(row.presentation));
    let presentacionExistente = false;
    if (existingPresentations.length > 1) errores.push(`La presentación «${row.presentation}» está duplicada para «${row.name}».`);
    if (existingPresentations.length === 1) {
      const existing = existingPresentations[0];
      if (existing.id !== presentacionId) errores.push(`La presentación «${row.presentation}» de «${row.name}» ya existe con otra identidad.`);
      else if (existing.factorUnidadBase !== row.unitsPerPresentation || existing.precioCOP !== row.salesPriceCop || !existing.activo) {
        errores.push(`La presentación «${row.presentation}» de «${row.name}» ya existe con datos distintos al plan.`);
      } else presentacionExistente = true;
    }
    return { row, categoriaId, productoCommandId: commandId, productoId, productoExistente, presentacionCommandId, presentacionId, presentacionExistente };
  });
  const categoriasPorCrear = categorias.filter(category => category.categoriaId === null).length;
  return {
    plan,
    tenantId,
    espacioId,
    errores: [...new Set(errores)],
    categorias,
    filas,
    resumen: {
      productosTotales: filas.length,
      categoriasTotales: categorias.length,
      categoriasPorCrear,
      productosPorCrear: filas.filter(row => !row.productoExistente).length,
      presentacionesPorCrear: filas.filter(row => !row.presentacionExistente).length,
    },
  };
}

export type CatalogImportProgress = { fase: "categorias" | "productos" | "presentaciones"; completadas: number; total: number };
export type CatalogImportCommand = (nombre: string, commandId: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

export async function ejecutarImportacionCatalogo(
  preparado: ImportacionCatalogoPreparada,
  ejecutarComando: CatalogImportCommand,
  onProgress?: (progress: CatalogImportProgress) => void,
): Promise<{ categoriasCreadas: number; productosCreados: number; presentacionesCreadas: number }> {
  if (preparado.errores.length > 0) throw new Error("El preflight del catálogo contiene bloqueos y no permite importar.");
  const idsCategorias = new Map<string, string>();
  let categoriasCreadas = 0;
  let productosCreados = 0;
  let presentacionesCreadas = 0;
  let done = 0;
  for (const category of preparado.categorias) {
    let id = category.categoriaId;
    if (!id) {
      const result = await ejecutarComando("crearCategoriaBodegaV1", category.commandId, { espacioId: preparado.espacioId, nombre: category.nombre });
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
          espacioId: preparado.espacioId,
          unidad: item.row.baseUnit,
          costo: item.row.costCopPerBaseUnit,
          stock: 0,
          stockMinimo: 0,
          activo: true,
        },
      });
      if (typeof result.articuloId !== "string" || result.articuloId === "") throw new Error(`No se confirmó el producto de la fila de origen ${item.row.sourceRow}.`);
      productoId = result.articuloId;
      productosCreados += 1;
    }
    done += 1;
    onProgress?.({ fase: "productos", completadas: done, total: preparado.filas.length });
    if (!item.presentacionExistente) {
      const result = await ejecutarComando("crearPresentacionComercialV1", item.presentacionCommandId, {
        productoId,
        nombre: item.row.presentation,
        factorUnidadBase: item.row.unitsPerPresentation,
        precioCOP: item.row.salesPriceCop,
        activo: true,
      });
      if (typeof result.presentacionId !== "string" || result.presentacionId === "") throw new Error(`No se confirmó la presentación de la fila de origen ${item.row.sourceRow}.`);
      presentacionesCreadas += 1;
      onProgress?.({ fase: "presentaciones", completadas: presentacionesCreadas, total: preparado.resumen.presentacionesPorCrear });
    }
  }
  return { categoriasCreadas, productosCreados, presentacionesCreadas };
}
