/**
 * inventario-ledger.ts
 *
 * Núcleo del Ledger de Inventario — FASE-15 PR1.
 * Infraestructura pura: sin escritores conectados todavía.
 *
 * Colección Firestore: movimientos_inventario
 * Document ID = claveIdempotencia (permite verificación transaccional de I10)
 *
 * Invariantes I1–I13 del diseño canónico son la fuente de autoridad.
 * Referencia: FASE-15-PR1-inventario-ledger-diseno.md (§1–§5, §12)
 */

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Tipos fundamentales ──────────────────────────────────────────────────────

export type ArticuloTipo = "producto" | "insumo";

export type ClaseMovimiento = "entrada" | "salida";

/**
 * Catálogo completo de tipos de movimiento (§3 del diseño).
 * Los tipos FASE-17+ están declarados pero ningún escritor los usa todavía.
 */
export type TipoMovimientoInventario =
  // Implementados conceptualmente en FASE-15
  | "inventario_inicial"
  | "compra"
  | "venta"
  | "consumo_receta"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "merma"
  | "devolucion_compra"
  | "devolucion_venta"
  // Reservados — FASE-17 (producción)
  | "produccion_salida"
  | "produccion_entrada"
  // Reservados — futuro (traslados entre espacios)
  | "traslado_salida"
  | "traslado_entrada";

/** Detalle de una capa de costo consumida en una salida FIFO. Reservado — no se usa en PR1. */
export interface CapaConsumoDetalle {
  loteId: string;
  cantidad: number;
  costoUnitario: number;
}

// ─── Entidad principal ────────────────────────────────────────────────────────

/**
 * Registro inmutable y append-only de una variación de existencias (§1 del diseño).
 * Representa la forma leída desde Firestore: id = doc.id, fecha = Timestamp.
 *
 * Nunca se edita (I1). Nunca se elimina (I2).
 * Toda corrección se expresa como contramovimiento (I3).
 */
export interface MovimientoInventario {
  // ── Identidad y aislamiento ──────────────────────────────────────────────
  id: string;
  /** Reservado multiempresa. Siempre "default" en instalación mono-empresa. */
  empresaId: string;
  espacioId: string;

  // ── Artículo afectado ────────────────────────────────────────────────────
  articuloTipo: ArticuloTipo;
  articuloId: string;
  /** Snapshot del nombre al momento del hecho — el kardex debe leerse aunque el artículo se renombre. */
  articuloNombre: string;
  /** Snapshot de la unidad del artículo. */
  unidad: string;

  // ── Naturaleza del movimiento ────────────────────────────────────────────
  tipo: TipoMovimientoInventario;
  /** Derivado del tipo; persistido para agregaciones rápidas y validación de I13. */
  clase: ClaseMovimiento;
  /** Redundante con sign(cantidad); persistido para validación de I13. */
  signo: 1 | -1;

  // ── Cantidad y costo ─────────────────────────────────────────────────────
  /** Variación con signo. Negativa = salida. Sin recorte a cero (I6). */
  cantidad: number;
  /** Costo por unidad de este movimiento capturado en el momento del hecho (I7). */
  costoUnitario: number;
  /** |cantidad| × costoUnitario. Para valorización directa. */
  costoTotal: number;

  // ── Saldo (soporte de Kardex) ────────────────────────────────────────────
  /** Acumulado de existencias del artículo después de este movimiento (I8). */
  saldoCantidadDespues: number;
  /** Reservado hasta elegir modelo de costeo. No se calcula en PR1. */
  saldoValorDespues: null;

  // ── Trazabilidad ─────────────────────────────────────────────────────────
  /** Colección del documento de negocio que originó este movimiento. */
  referenciaColeccion: string | null;
  /** ID del documento de negocio que originó este movimiento. */
  referenciaId: string | null;
  /** Enlaza pares y reversiones: contramovimiento ↔ original. */
  movimientoRelacionadoId: string | null;
  /** Reservado FIFO: identifica la capa de costo de una entrada. */
  loteId: string | null;
  /** Reservado FIFO: desglose de capas consumidas en una salida. */
  capasConsumidasDetalle: CapaConsumoDetalle[] | null;

  // ── Auditoría y orden ────────────────────────────────────────────────────
  usuarioId: string;
  /** Snapshot del nombre del usuario al momento del hecho. */
  usuarioNombre: string;
  fecha: unknown; // Firestore Timestamp en lectura; FieldValue en escritura
  /** Ordinal monotónico por artículo. Garantiza orden determinista del kardex (I12). */
  secuenciaArticulo: number;
  /**
   * Huella compuesta del movimiento específico (I10).
   * Formato mínimo: `${tipo}:${documentoOrigenId}:${articuloTipo}:${articuloId}:${lineaOrdinal}`
   * También sirve como document ID en Firestore (habilita verificación transaccional de I10).
   */
  claveIdempotencia: string;
  motivo: string | null;
}

// ─── Catálogo interno de tipos ────────────────────────────────────────────────

interface EntradaCatalogo {
  clase: ClaseMovimiento;
  signo: 1 | -1;
}

/**
 * Declara clase y signo para cada tipo de movimiento.
 * TypeScript exige que todos los miembros del union estén cubiertos.
 */
const CATALOGO_TIPOS: Record<TipoMovimientoInventario, EntradaCatalogo> = {
  inventario_inicial:  { clase: "entrada", signo:  1 },
  compra:              { clase: "entrada", signo:  1 },
  venta:               { clase: "salida",  signo: -1 },
  consumo_receta:      { clase: "salida",  signo: -1 },
  ajuste_positivo:     { clase: "entrada", signo:  1 },
  ajuste_negativo:     { clase: "salida",  signo: -1 },
  merma:               { clase: "salida",  signo: -1 },
  devolucion_compra:   { clase: "salida",  signo: -1 },
  devolucion_venta:    { clase: "entrada", signo:  1 },
  produccion_salida:   { clase: "salida",  signo: -1 },
  produccion_entrada:  { clase: "entrada", signo:  1 },
  traslado_salida:     { clase: "salida",  signo: -1 },
  traslado_entrada:    { clase: "entrada", signo:  1 },
};

// ─── Parámetros de emisión ────────────────────────────────────────────────────

export interface EmitirMovimientoParams {
  articuloTipo: ArticuloTipo;
  articuloId: string;
  /** Capturar el nombre actual antes de llamar — se persiste como snapshot. */
  articuloNombre: string;
  /** Capturar la unidad actual antes de llamar — se persiste como snapshot. */
  unidad: string;
  tipo: TipoMovimientoInventario;
  /**
   * Variación con signo, coherente con el catálogo (I13).
   * Entradas → positivo. Salidas → negativo. Nunca cero.
   * La función valida la coherencia y lanza si no se cumple.
   */
  cantidad: number;
  costoUnitario: number;
  espacioId: string;
  usuarioId: string;
  /** Capturar el nombre actual antes de llamar — se persiste como snapshot. */
  usuarioNombre: string;
  /**
   * Clave de idempotencia compuesta por el llamador (I10).
   * Formato mínimo: `${tipo}:${documentoOrigenId}:${articuloTipo}:${articuloId}:${lineaOrdinal}`
   */
  claveIdempotencia: string;
  referenciaColeccion?: string;
  referenciaId?: string;
  movimientoRelacionadoId?: string;
  motivo?: string;
  /** Reservado FIFO — no pasar en PR1. */
  loteId?: string;
  /** Reservado FIFO — no pasar en PR1. */
  capasConsumidasDetalle?: CapaConsumoDetalle[];
}

// ─── Núcleo transaccional ─────────────────────────────────────────────────────

/**
 * Núcleo del ledger por lote — garantiza el orden reads-before-writes del SDK
 * de Firestore cuando la operación afecta múltiples artículos en la misma
 * transacción (compras multi-artículo, producciones, traslados, etc.).
 *
 * Uso:
 *   await runTransaction(db, async (t) => {
 *     // ... lógica propia del escritor ...
 *     await aplicarMovimientosEnTransaccion(t, [params1, params2]);
 *   });
 *
 * Estructura de ejecución:
 *   Fase 0 — Validaciones I13 de todos los movimientos (sin ops de Firestore).
 *   Fase 1 — TODAS las lecturas (idempotencia + artículo) de cada movimiento.
 *   Fase 2 — TODAS las escrituras de cada movimiento.
 *
 * El SDK exige mutations.length === 0 al iniciar cualquier transaction.get().
 * Al separar lectura y escritura en las fases 1 y 2, ese invariante se cumple
 * para cualquier número de artículos.
 *
 * Precondición: cada (articuloTipo, articuloId) debe ser único en paramsArray.
 * El llamador es responsable de consolidar filas del mismo artículo antes de invocar.
 *
 * Invariantes garantizados: I1 I2 I5 I6 I7 I8 I10 I11 I12 I13.
 */
export async function aplicarMovimientosEnTransaccion(
  transaction: Transaction,
  paramsArray: EmitirMovimientoParams[],
): Promise<MovimientoInventario[]> {
  // ── Fase 0: Validaciones I13 — sin ops de Firestore ─────────────────────
  for (const params of paramsArray) {
    const catalogEntry = CATALOGO_TIPOS[params.tipo];
    if (params.cantidad === 0) {
      throw new Error(
        `Ledger I13: cantidad no puede ser cero (tipo="${params.tipo}", artículo="${params.articuloId}")`,
      );
    }
    const signoCalculado = (params.cantidad > 0 ? 1 : -1) as 1 | -1;
    if (signoCalculado !== catalogEntry.signo) {
      throw new Error(
        `Ledger I13: signo de cantidad incoherente con tipo "${params.tipo}". ` +
          `Esperado ${catalogEntry.signo > 0 ? "positivo" : "negativo"}, ` +
          `recibido ${signoCalculado > 0 ? "positivo" : "negativo"}.`,
      );
    }
  }

  // ── Fase 1: TODAS las lecturas ────────────────────────────────────────────
  // Ninguna escritura ocurre aquí: mutations.length === 0 durante todos los
  // transaction.get(), cumpliendo el invariante del SDK.
  const lote: Array<{
    params:                EmitirMovimientoParams;
    catalogEntry:          EntradaCatalogo;
    /** null = movimiento nuevo; non-null = ya existe (reintento idempotente, I10). */
    existente:             Omit<MovimientoInventario, "id"> | null;
    saldoActual:           number;
    secuenciaActual:       number;
    /** Costo unitario leído del doc del artículo en Fase 1 — snapshot para inventario_inicial. */
    costoUnitarioApertura: number;
    /**
     * true cuando el artículo nunca tuvo movimientos (secuenciaActual === 0)
     * y su stock cache es estrictamente positivo: el núcleo emitirá inventario_inicial
     * en Fase 2 antes del primer movimiento real. Stock ≤ 0 se omite (evita violar I13).
     */
    necesitaApertura:      boolean;
  }> = [];

  for (const params of paramsArray) {
    const articuloColeccion = params.articuloTipo === "producto" ? "productos" : "insumos";
    const movimientoRef     = doc(db, "movimientos_inventario", params.claveIdempotencia);
    const articuloRef       = doc(db, articuloColeccion, params.articuloId);

    // Paso 2: Verificar idempotencia (I10) — dentro de la transacción
    const movSnap = await transaction.get(movimientoRef);
    if (movSnap.exists()) {
      // Reintento detectado: guardar el existente y omitir la lectura del artículo.
      // La Fase 2 no escribirá nada para esta entrada ni consumirá secuencia (I12).
      lote.push({
        params,
        catalogEntry:          CATALOGO_TIPOS[params.tipo],
        existente:             movSnap.data() as Omit<MovimientoInventario, "id">,
        saldoActual:           0,
        secuenciaActual:       0,
        costoUnitarioApertura: 0,
        necesitaApertura:      false,
      });
      continue;
    }

    // Paso 3: Leer el artículo — saldo cache y contador de secuencia (I8, I12)
    const articuloSnap = await transaction.get(articuloRef);
    if (!articuloSnap.exists()) {
      throw new Error(
        `Ledger: artículo "${params.articuloId}" (${params.articuloTipo}) no encontrado`,
      );
    }
    const articuloData = articuloSnap.data();

    const saldoActual     = (articuloData.stock           as number | undefined) ?? 0;
    const secuenciaActual = (articuloData.secuenciaLedger as number | undefined) ?? 0;
    lote.push({
      params,
      catalogEntry:          CATALOGO_TIPOS[params.tipo],
      existente:             null,
      saldoActual,
      secuenciaActual,
      costoUnitarioApertura: (articuloData.costo         as number | undefined) ?? 0,
      necesitaApertura:      secuenciaActual === 0 && saldoActual > 0,
    });
  }

  // ── Fase 2: TODAS las escrituras ──────────────────────────────────────────
  // Ninguna lectura ocurre en esta fase.
  const resultados: MovimientoInventario[] = [];

  for (const entrada of lote) {
    if (entrada.existente !== null) {
      // Idempotente: retornar el movimiento original sin escribir nada (I10).
      resultados.push({ id: entrada.params.claveIdempotencia, ...entrada.existente });
      continue;
    }

    const { params, catalogEntry } = entrada;

    // doc() es pura (sin coste de red): los refs se reconstruyen desde params.
    const articuloColeccion = params.articuloTipo === "producto" ? "productos" : "insumos";
    const movimientoRef     = doc(db, "movimientos_inventario", params.claveIdempotencia);
    const articuloRef       = doc(db, articuloColeccion, params.articuloId);

    // Paso 4a: Apertura lazy — emitir inventario_inicial si el artículo nunca ha tenido
    // movimientos (secuenciaActual === 0) y stock cache > 0 (stock ≤ 0 omitido por I13).
    // Toda la información necesaria está en datos ya leídos en Fase 1: cero lecturas nuevas.
    let secuenciaBase = entrada.secuenciaActual;
    if (entrada.necesitaApertura) {
      secuenciaBase += 1;
      const claveApertura = `inventario_inicial:${params.articuloTipo}:${params.articuloId}`;
      const aperturaRef   = doc(db, "movimientos_inventario", claveApertura);
      const aperturaData: Omit<MovimientoInventario, "id"> = {
        empresaId:               "default",
        espacioId:               params.espacioId,
        articuloTipo:            params.articuloTipo,
        articuloId:              params.articuloId,
        articuloNombre:          params.articuloNombre,
        unidad:                  params.unidad,
        tipo:                    "inventario_inicial",
        clase:                   "entrada",
        signo:                   1,
        cantidad:                entrada.saldoActual,
        costoUnitario:           entrada.costoUnitarioApertura,
        costoTotal:              entrada.saldoActual * entrada.costoUnitarioApertura,
        saldoCantidadDespues:    entrada.saldoActual,
        saldoValorDespues:       null,
        referenciaColeccion:     null,
        referenciaId:            null,
        movimientoRelacionadoId: null,
        loteId:                  null,
        capasConsumidasDetalle:  null,
        usuarioId:               params.usuarioId,
        usuarioNombre:           params.usuarioNombre,
        fecha:                   serverTimestamp(),
        secuenciaArticulo:       secuenciaBase,
        claveIdempotencia:       claveApertura,
        motivo:                  "apertura_lazy",
      };
      transaction.set(aperturaRef, aperturaData);
    }

    // Paso 4b: Calcular saldo, secuencia y costo del movimiento real (I8, I12)
    const secuenciaArticulo    = secuenciaBase + 1;
    const saldoCantidadDespues = entrada.saldoActual + params.cantidad; // I6: sin recorte a cero
    const costoTotal           = Math.abs(params.cantidad) * params.costoUnitario;

    const movimientoData: Omit<MovimientoInventario, "id"> = {
      empresaId:               "default",
      espacioId:               params.espacioId,
      articuloTipo:            params.articuloTipo,
      articuloId:              params.articuloId,
      articuloNombre:          params.articuloNombre,
      unidad:                  params.unidad,
      tipo:                    params.tipo,
      clase:                   catalogEntry.clase,
      signo:                   catalogEntry.signo,
      cantidad:                params.cantidad,
      costoUnitario:           params.costoUnitario,
      costoTotal,
      saldoCantidadDespues,
      saldoValorDespues:       null,
      referenciaColeccion:     params.referenciaColeccion     ?? null,
      referenciaId:            params.referenciaId            ?? null,
      movimientoRelacionadoId: params.movimientoRelacionadoId ?? null,
      loteId:                  params.loteId                  ?? null,
      capasConsumidasDetalle:  params.capasConsumidasDetalle  ?? null,
      usuarioId:               params.usuarioId,
      usuarioNombre:           params.usuarioNombre,
      fecha:                   serverTimestamp(),
      secuenciaArticulo,
      claveIdempotencia:       params.claveIdempotencia,
      motivo:                  params.motivo ?? null,
    };

    // Paso 5: Anexar movimiento (I1, I2, I5-A)
    transaction.set(movimientoRef, movimientoData);

    // Paso 6: Actualizar cache y secuencia (I5-B — co-atómica con paso 5)
    transaction.update(articuloRef, {
      stock:           saldoCantidadDespues,
      secuenciaLedger: secuenciaArticulo,
    });

    resultados.push({ id: params.claveIdempotencia, ...movimientoData });
  }

  return resultados;
}

// ─── Núcleo transaccional (elemento único) ────────────────────────────────────

/**
 * Wrapper de un elemento sobre `aplicarMovimientosEnTransaccion`.
 *
 * Para escritores que afectan un único artículo por transacción. Cuando la
 * operación afecta varios artículos, usar directamente
 * `aplicarMovimientosEnTransaccion` para garantizar reads-before-writes.
 *
 * Uso:
 *   await runTransaction(db, async (t) => {
 *     // ... lógica propia del escritor ...
 *     await aplicarMovimientoEnTransaccion(t, params);
 *   });
 *
 * Invariantes garantizados: I1 I2 I5 I6 I7 I8 I10 I11 I12 I13.
 */
export async function aplicarMovimientoEnTransaccion(
  transaction: Transaction,
  params: EmitirMovimientoParams,
): Promise<MovimientoInventario> {
  const [resultado] = await aplicarMovimientosEnTransaccion(transaction, [params]);
  return resultado!;
}

// ─── Wrapper público (uso aislado) ────────────────────────────────────────────

/**
 * Emite un movimiento en una transacción propia.
 *
 * Usar cuando el movimiento es la única operación atómica (p.ej. pruebas,
 * herramientas de apertura manual). Para incluir el movimiento dentro de una
 * transacción mayor (ventas, compras, etc.) usar directamente
 * `aplicarMovimientoEnTransaccion`.
 *
 * El comportamiento externo es idéntico al que tenía antes de la extracción.
 */
export async function emitirMovimientoInventario(
  params: EmitirMovimientoParams,
): Promise<MovimientoInventario> {
  return runTransaction(db, (transaction) =>
    aplicarMovimientoEnTransaccion(transaction, params),
  );
}

// ─── Reconciliación (solo lectura) ───────────────────────────────────────────

export interface ReconciliacionResult {
  articuloTipo: ArticuloTipo;
  articuloId: string;
  /** Stock almacenado actualmente en el documento del artículo (cache). */
  stockCache: number;
  /** Σ(cantidad) de todos los movimientos del ledger para este artículo. */
  stockLedger: number;
  /** stockLedger − stockCache. Cero = coherente. */
  divergencia: number;
  coherente: boolean;
  totalMovimientos: number;
  /** Números de secuencia ausentes en la serie esperada 1..N. Un hueco delata un movimiento perdido. */
  huecos: number[];
}

/**
 * Compara el stock cache del artículo contra la suma del ledger (I9).
 *
 * SOLO LECTURA — no modifica datos, no regenera cache.
 * I9 está explícitamente suspendido durante la migración Fase 0–3: la divergencia
 * es esperada mientras existan escritores no conmutados al ledger.
 * Esta función es de reporte; la acción sobre divergencias queda para Fase 4.
 */
export async function reconciliarArticulo(
  articuloTipo: ArticuloTipo,
  articuloId: string,
): Promise<ReconciliacionResult> {
  const articuloColeccion = articuloTipo === "producto" ? "productos" : "insumos";

  const [articuloSnap, movimientosSnap] = await Promise.all([
    getDoc(doc(db, articuloColeccion, articuloId)),
    getDocs(
      query(
        collection(db, "movimientos_inventario"),
        where("articuloTipo", "==", articuloTipo),
        where("articuloId",   "==", articuloId),
        orderBy("secuenciaArticulo", "asc"),
      ),
    ),
  ]);

  const stockCache: number = articuloSnap.exists()
    ? ((articuloSnap.data()?.stock as number | undefined) ?? 0)
    : 0;

  const movimientos = movimientosSnap.docs.map((d) => ({
    secuenciaArticulo: d.data().secuenciaArticulo as number,
    cantidad:          d.data().cantidad          as number,
  }));

  const stockLedger = movimientos.reduce((sum, m) => sum + m.cantidad, 0);

  // Detectar huecos en la secuencia 1..N (un hueco indica movimiento perdido)
  const huecos: number[] = [];
  let expectedSeq = 1;
  for (const m of movimientos) {
    while (expectedSeq < m.secuenciaArticulo) {
      huecos.push(expectedSeq);
      expectedSeq++;
    }
    expectedSeq = m.secuenciaArticulo + 1;
  }

  return {
    articuloTipo,
    articuloId,
    stockCache,
    stockLedger,
    divergencia:      stockLedger - stockCache,
    coherente:        stockLedger === stockCache,
    totalMovimientos: movimientos.length,
    huecos,
  };
}
