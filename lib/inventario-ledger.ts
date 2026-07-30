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
import { getEmpresaId } from "@/lib/tenant";

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
  /** Tenant propietario del movimiento (MT-U3 Capa 2). Estampado por el llamador vía `EmitirMovimientoParams.empresaId`. */
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
  /**
   * MT-U3 Capa 2 (D-U2-3): resuelto por el llamador con `getEmpresaId()`
   * ANTES de abrir su `runTransaction` (dentro de una transacción no puede
   * leerse el token de forma limpia; el valor es de sesión y estable).
   */
  empresaId: string;
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
        empresaId:               params.empresaId,
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
      empresaId:               params.empresaId,
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

// ─── Reconciliación autoritativa (Fase 4) ────────────────────────────────────

// ── Capa 1: replay puro ──────────────────────────────────────────────────────

/** Movimiento inválido detectado durante el replay. */
export interface MovimientoInvalido {
  /** Document ID / claveIdempotencia del movimiento con problema. */
  movimientoId: string;
  secuenciaArticulo: number;
  razon:
    | "i13_signo_incoherente"      // sign(cantidad) ≠ signo (I13)
    | "i13_clase_incoherente"      // clase no corresponde al tipo (I13)
    | "i8_saldo_encadenado_roto";  // saldoCantidadDespues ≠ acumulado replay (I8)
  detalles: string;
}

/**
 * Resultado del replay puro del ledger para un artículo (Capa 1).
 *
 * Calculado exclusivamente a partir de los movimientos; no lee el cache del artículo.
 * Autoritativo por I4: el stock es Σ(cantidad) de los movimientos, comenzando desde 0.
 */
export interface ReplayArticuloResult {
  articuloTipo: ArticuloTipo;
  articuloId: string;
  /** Σ(cantidad) de todos los movimientos, empezando desde 0 — autoridad del ledger (I4). */
  stockLedger: number;
  /** Número de secuencia más alto encontrado en los movimientos leídos. */
  secuenciaMax: number;
  totalMovimientos: number;
  /** Secuencias ausentes en la serie 1..secuenciaMax. */
  huecos: number[];
  /** Movimientos que violan I13 o cuyo saldoCantidadDespues no coincide con el acumulado (I8). */
  movimientosInvalidos: MovimientoInvalido[];
}

/**
 * Reconstruye el stock de un artículo recorriendo sus movimientos en orden de secuencia.
 *
 * CAPA 1 — SOLO LECTURA. No escribe nada. No lee el campo `stock` del artículo.
 * Recibe los movimientos ya leídos (en orden secuenciaArticulo asc) para desacoplar
 * la lógica de reconstrucción de las lecturas de Firestore.
 *
 * Invariantes verificados: I4, I8, I13.
 */
export function replayLedgerArticulo(
  articuloTipo: ArticuloTipo,
  articuloId: string,
  movimientos: Pick<
    MovimientoInventario,
    | "id"
    | "secuenciaArticulo"
    | "cantidad"
    | "signo"
    | "clase"
    | "tipo"
    | "saldoCantidadDespues"
  >[],
): ReplayArticuloResult {
  let acumulado = 0;       // empieza en 0, autoritativo (I4)
  let expectedSeq = 1;
  const huecos: number[] = [];
  const movimientosInvalidos: MovimientoInvalido[] = [];

  for (const m of movimientos) {
    // Detectar huecos antes de procesar
    while (expectedSeq < m.secuenciaArticulo) {
      huecos.push(expectedSeq);
      expectedSeq++;
    }

    // Validar I13: coherencia de signo
    const signoCalculado = m.cantidad > 0 ? 1 : m.cantidad < 0 ? -1 : 0;
    if (signoCalculado !== m.signo) {
      movimientosInvalidos.push({
        movimientoId: m.id,
        secuenciaArticulo: m.secuenciaArticulo,
        razon: "i13_signo_incoherente",
        detalles: `cantidad=${m.cantidad} → signo esperado=${signoCalculado}, persistido=${m.signo}`,
      });
    }

    // Validar I13: coherencia de clase con signo
    const claseEsperada = CATALOGO_TIPOS[m.tipo]?.clase;
    if (claseEsperada !== undefined && claseEsperada !== m.clase) {
      movimientosInvalidos.push({
        movimientoId: m.id,
        secuenciaArticulo: m.secuenciaArticulo,
        razon: "i13_clase_incoherente",
        detalles: `tipo="${m.tipo}" → clase esperada="${claseEsperada}", persistida="${m.clase}"`,
      });
    }

    // Acumular (siempre, incluso si hay inválidos — para seguir detectando rotura de saldo)
    acumulado += m.cantidad;

    // Validar I8: saldo encadenado (tolerancia para aritmética flotante)
    const diff = Math.abs(m.saldoCantidadDespues - acumulado);
    if (diff > 1e-9) {
      movimientosInvalidos.push({
        movimientoId: m.id,
        secuenciaArticulo: m.secuenciaArticulo,
        razon: "i8_saldo_encadenado_roto",
        detalles: `saldoCantidadDespues=${m.saldoCantidadDespues}, acumulado_replay=${acumulado}, diff=${diff}`,
      });
    }

    expectedSeq = m.secuenciaArticulo + 1;
  }

  const secuenciaMax = movimientos.length > 0
    ? movimientos[movimientos.length - 1]!.secuenciaArticulo
    : 0;

  return {
    articuloTipo,
    articuloId,
    stockLedger: acumulado,
    secuenciaMax,
    totalMovimientos: movimientos.length,
    huecos,
    movimientosInvalidos,
  };
}

// ── Capa 2: diagnóstico / clasificación ──────────────────────────────────────

/**
 * Estado del artículo según la reconciliación.
 *
 * - `no_migrado`          : secuenciaLedger===0 — apertura lazy pendiente. I9 no aplica.
 * - `corrupto`            : huecos en secuencia, inválidos I13/I8, o pérdida de cola
 *                           (secuenciaLedger > secuenciaMax). Nunca se repara automáticamente.
 * - `divergente_reparable`: P1∧P2∧P3 y |Σ−cache| > ε. Solo estado que acepta reparación.
 * - `consistente`         : P1∧P2∧P3 y |Σ−cache| ≤ ε. Nada que hacer.
 */
export type EstadoReconciliacion =
  | "no_migrado"
  | "corrupto"
  | "divergente_reparable"
  | "consistente";

/** Resultado de la capa de diagnóstico para un artículo. */
export interface DiagnosticoArticulo {
  articuloTipo: ArticuloTipo;
  articuloId: string;
  estado: EstadoReconciliacion;
  /** Cache leído del documento del artículo. */
  stockCache: number;
  /** Σ(cantidad) del replay. undefined para no_migrado. */
  stockLedger: number | undefined;
  /** stockLedger − stockCache. undefined para no_migrado o corrupto. */
  divergencia: number | undefined;
  /** secuenciaLedger leída del documento del artículo. */
  secuenciaLedger: number;
  /** secuenciaMax del replay. */
  secuenciaMax: number;
  totalMovimientos: number;
  huecos: number[];
  movimientosInvalidos: MovimientoInvalido[];
  /** Motivo adicional cuando estado === 'corrupto'. */
  motivoCorrupcion: string | undefined;
}

// ── Resultado legacy (mantenido para no romper consumidores existentes) ───────

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
  /** Extensión aditiva Fase 4: clasificación del estado del artículo. */
  estado: EstadoReconciliacion;
  /** Extensión aditiva Fase 4: movimientos que violan I13 o I8. */
  movimientosInvalidos: MovimientoInvalido[];
}

/**
 * Diagnóstica el estado de un artículo respecto a la reconciliación (I9).
 *
 * CAPA 2 — SOLO LECTURA. Lee artículo + movimientos; llama replayLedgerArticulo;
 * clasifica en uno de los 4 estados: no_migrado / corrupto / divergente_reparable / consistente.
 *
 * I9 está activo a partir de Fase 4 (FASE-15 PR9): una divergencia ya no es un
 * artefacto de migración sino un defecto reparable, salvo que el artículo esté
 * no_migrado o corrupto.
 *
 * Tolerancia flotante: |Σ − cache| ≤ 1e-6 se considera consistente (insumos en g/ml
 * acumulan error de representación).
 *
 * MT-U3 Capa 2: filtra `movimientos_inventario` por `empresaId`. El parámetro
 * es opcional — si el llamador ya lo resolvió (p. ej. `reconciliarGlobal`
 * reutilizándolo dentro de su bucle, para no resolverlo una vez por artículo)
 * lo pasa; si se omite (llamada standalone, p. ej. `hooks/use-kardex.ts` vía
 * `obtenerEstadoKardex`), se resuelve aquí con `getEmpresaId()`.
 */
export async function diagnosticarArticulo(
  articuloTipo: ArticuloTipo,
  articuloId: string,
  empresaId?: string,
): Promise<DiagnosticoArticulo> {
  const empresaIdResuelto = empresaId ?? (await getEmpresaId());
  const articuloColeccion = articuloTipo === "producto" ? "productos" : "insumos";

  // Paso 1: leer SOLO el artículo. La colección movimientos_inventario no se
  // consulta hasta confirmar que el artículo está migrado (secuenciaLedger > 0).
  // Esta función no abre transacción ni escribe: el orden reads-before-writes
  // del SDK no aplica, por lo que secuencializar las lecturas es seguro y deja
  // a los artículos no_migrado completamente fuera del replay (coherente con la
  // máquina de estados).
  const articuloSnap    = await getDoc(doc(db, articuloColeccion, articuloId));
  const articuloData     = articuloSnap.exists() ? articuloSnap.data() : null;
  const stockCache       = (articuloData?.stock           as number | undefined) ?? 0;
  const secuenciaLedger  = (articuloData?.secuenciaLedger as number | undefined) ?? 0;

  // P1: no migrado → clasificar y retornar SIN tocar movimientos_inventario.
  if (secuenciaLedger === 0) {
    return {
      articuloTipo,
      articuloId,
      estado:               "no_migrado",
      stockCache,
      stockLedger:          undefined,
      divergencia:          undefined,
      secuenciaLedger:      0,
      secuenciaMax:         0,
      totalMovimientos:     0,
      huecos:               [],
      movimientosInvalidos: [],
      motivoCorrupcion:     undefined,
    };
  }

  // Paso 2: solo para artículos migrados, leer sus movimientos para el replay.
  const movimientosSnap = await getDocs(
    query(
      collection(db, "movimientos_inventario"),
      where("empresaId",    "==", empresaIdResuelto),
      where("articuloTipo", "==", articuloTipo),
      where("articuloId",   "==", articuloId),
      orderBy("secuenciaArticulo", "asc"),
    ),
  );

  const movimientosRaw = movimientosSnap.docs.map((d) => {
    const data = d.data();
    return {
      id:                   d.id,
      secuenciaArticulo:    data.secuenciaArticulo    as number,
      cantidad:             data.cantidad             as number,
      signo:                data.signo                as 1 | -1,
      clase:                data.clase                as ClaseMovimiento,
      tipo:                 data.tipo                 as TipoMovimientoInventario,
      saldoCantidadDespues: data.saldoCantidadDespues as number,
    };
  });

  const replay = replayLedgerArticulo(articuloTipo, articuloId, movimientosRaw);

  // P2: pérdida de cola — el contador del artículo dice más que el replay encontró
  const perdidaDeCola = secuenciaLedger > replay.secuenciaMax;

  // P2 o P3: corrupción → no reparar
  if (replay.huecos.length > 0 || replay.movimientosInvalidos.length > 0 || perdidaDeCola) {
    const motivos: string[] = [];
    if (replay.huecos.length > 0)
      motivos.push(`huecos_secuencia: [${replay.huecos.join(",")}]`);
    if (replay.movimientosInvalidos.length > 0)
      motivos.push(`movimientos_invalidos: ${replay.movimientosInvalidos.length}`);
    if (perdidaDeCola)
      motivos.push(`perdida_de_cola: secuenciaLedger=${secuenciaLedger} > secuenciaMax=${replay.secuenciaMax}`);

    return {
      articuloTipo,
      articuloId,
      estado:               "corrupto",
      stockCache,
      stockLedger:          replay.stockLedger,
      divergencia:          undefined,
      secuenciaLedger,
      secuenciaMax:         replay.secuenciaMax,
      totalMovimientos:     replay.totalMovimientos,
      huecos:               replay.huecos,
      movimientosInvalidos: replay.movimientosInvalidos,
      motivoCorrupcion:     motivos.join("; "),
    };
  }

  // P1∧P2∧P3 — clasificar por divergencia
  const divergencia   = replay.stockLedger - stockCache;
  const esConsistente = Math.abs(divergencia) <= 1e-6;

  return {
    articuloTipo,
    articuloId,
    estado:               esConsistente ? "consistente" : "divergente_reparable",
    stockCache,
    stockLedger:          replay.stockLedger,
    divergencia,
    secuenciaLedger,
    secuenciaMax:         replay.secuenciaMax,
    totalMovimientos:     replay.totalMovimientos,
    huecos:               [],
    movimientosInvalidos: [],
    motivoCorrupcion:     undefined,
  };
}

/**
 * Compara el stock cache del artículo contra la suma del ledger (I9).
 *
 * SOLO LECTURA — no modifica datos, no regenera cache. Conserva la firma original
 * para compatibilidad; internamente delega en diagnosticarArticulo (Capa 2) y
 * proyecta al formato ReconciliacionResult.
 *
 * I9 está activo desde Fase 4 (FASE-15 PR9). La divergencia ahora es un defecto
 * reparable (si estado === 'divergente_reparable') o un incidente (si 'corrupto').
 * Los artículos no_migrados no representan una divergencia; se reportan aparte.
 *
 * MT-U3 Capa 2: `empresaId` opcional — ver `diagnosticarArticulo`.
 */
export async function reconciliarArticulo(
  articuloTipo: ArticuloTipo,
  articuloId: string,
  empresaId?: string,
): Promise<ReconciliacionResult> {
  const diag = await diagnosticarArticulo(articuloTipo, articuloId, empresaId);

  const stockLedger = diag.stockLedger ?? 0;
  const divergencia = diag.divergencia ?? (stockLedger - diag.stockCache);

  return {
    articuloTipo,
    articuloId,
    stockCache:           diag.stockCache,
    stockLedger,
    divergencia,
    coherente:            diag.estado === "consistente",
    totalMovimientos:     diag.totalMovimientos,
    huecos:               diag.huecos,
    estado:               diag.estado,
    movimientosInvalidos: diag.movimientosInvalidos,
  };
}

// ── Capa 3: reparación autoritativa ──────────────────────────────────────────

/** Resultado de intentar reparar el cache de un artículo. */
export interface ReparacionResult {
  articuloTipo: ArticuloTipo;
  articuloId: string;
  /** Estado observado antes de intentar la reparación. */
  estadoPrevio: EstadoReconciliacion;
  reparado: boolean;
  /** Stock que tenía el cache antes de la corrección. */
  stockCacheAntes: number | undefined;
  /** Stock escrito por la reparación (= Σ(ledger)). */
  stockCacheDespues: number | undefined;
  /** Motivo si no se reparó (estado no elegible, corrupción, guarda optimista activada). */
  motivoNoReparado: string | undefined;
}

/**
 * Repara el cache `stock` de un artículo si y solo si su estado es `divergente_reparable`.
 *
 * CAPA 3 — ÚNICA FUNCIÓN CON ESCRITURA DE FASE 4.
 * Solo escribe el campo `stock` en el documento del artículo; jamás toca
 * `movimientos_inventario` (I1/I2 — append-only garantizado por construcción).
 *
 * Guarda optimista: dentro del runTransaction se relee `secuenciaLedger`; si avanzó
 * respecto al valor observado en el diagnóstico, la transacción aborta para evitar
 * fijar un cache calculado sobre un snapshot obsoleto del ledger (I5/I8).
 *
 * Idempotencia: si después de reparar se llama de nuevo, el diagnóstico re-ejecutado
 * dentro de la transacción encontrará |Σ−cache| ≤ ε → no escribe nada → `reparado=false`.
 * La reconciliación converge en una sola ejecución (propiedad garantizada).
 *
 * Artículos no_migrados (secuenciaLedger===0): excluidos por precondición — I9 no rige.
 * Artículos corruptos: excluidos — no se lava corrupción del ledger (I1/I2).
 *
 * MT-U3 Capa 2: `empresaId` opcional — ver `diagnosticarArticulo`. La reparación
 * en sí (campo `stock` de `productos`/`insumos`) no estampa `empresaId`: esas
 * colecciones son alcance de Capa 3.
 */
export async function repararCacheArticulo(
  articuloTipo: ArticuloTipo,
  articuloId: string,
  empresaId?: string,
): Promise<ReparacionResult> {
  // Diagnóstico previo fuera de la transacción (lectura sin costo transaccional)
  const diagPrevio = await diagnosticarArticulo(articuloTipo, articuloId, empresaId);

  if (diagPrevio.estado !== "divergente_reparable") {
    return {
      articuloTipo,
      articuloId,
      estadoPrevio:      diagPrevio.estado,
      reparado:          false,
      stockCacheAntes:   diagPrevio.stockCache,
      stockCacheDespues: undefined,
      motivoNoReparado:  `estado_no_elegible: ${diagPrevio.estado}`,
    };
  }

  const secuenciaLedgerObservada = diagPrevio.secuenciaLedger;
  const stockLedgerCalculado     = diagPrevio.stockLedger!;
  const stockCacheAntes          = diagPrevio.stockCache;
  const articuloColeccion        = articuloTipo === "producto" ? "productos" : "insumos";
  const articuloRef              = doc(db, articuloColeccion, articuloId);

  const resultado = await runTransaction(db, async (transaction) => {
    const articuloSnap = await transaction.get(articuloRef);
    if (!articuloSnap.exists()) {
      return { abortada: true, motivo: "articulo_no_encontrado" };
    }

    const data = articuloSnap.data();
    const secuenciaActual = (data.secuenciaLedger as number | undefined) ?? 0;
    const cacheActual     = (data.stock           as number | undefined) ?? 0;

    // Guarda optimista: si el ledger avanzó desde el diagnóstico, abortar
    if (secuenciaActual !== secuenciaLedgerObservada) {
      return {
        abortada: true,
        motivo: `guarda_optimista: secuenciaLedger cambió de ${secuenciaLedgerObservada} a ${secuenciaActual}`,
      };
    }

    // Verificar idempotencia dentro de la transacción: si ya es consistente, no escribir
    if (Math.abs(stockLedgerCalculado - cacheActual) <= 1e-6) {
      return { abortada: false, yaConsistente: true };
    }

    // Única escritura de Fase 4: corregir solo el cache stock
    transaction.update(articuloRef, { stock: stockLedgerCalculado });
    return { abortada: false, yaConsistente: false };
  });

  if (resultado.abortada) {
    return {
      articuloTipo,
      articuloId,
      estadoPrevio:      diagPrevio.estado,
      reparado:          false,
      stockCacheAntes,
      stockCacheDespues: undefined,
      motivoNoReparado:  resultado.motivo,
    };
  }

  if (resultado.yaConsistente) {
    return {
      articuloTipo,
      articuloId,
      estadoPrevio:      diagPrevio.estado,
      reparado:          false,
      stockCacheAntes,
      stockCacheDespues: undefined,
      motivoNoReparado:  "ya_consistente_al_momento_de_escribir",
    };
  }

  return {
    articuloTipo,
    articuloId,
    estadoPrevio:      diagPrevio.estado,
    reparado:          true,
    stockCacheAntes,
    stockCacheDespues: stockLedgerCalculado,
    motivoNoReparado:  undefined,
  };
}

// ── Orquestador global ────────────────────────────────────────────────────────

/** Reporte agregado del barrido global de reconciliación. */
export interface ReporteGlobalReconciliacion {
  totalArticulos:       number;
  noMigrados:           number;
  consistentes:         number;
  divergentesReparables: number;
  corruptos:            number;
  /** Artículos divergentes_reparable o corrupto — para revisión inmediata. */
  articulosConProblema: DiagnosticoArticulo[];
  /** Artículos no_migrado — apertura lazy pendiente, no son defectos. */
  articulosPendientes:  DiagnosticoArticulo[];
}

/**
 * Barre todos los artículos activos (productos + insumos) y clasifica su estado.
 *
 * SOLO LECTURA por defecto. Con `opts.aplicar = true` invoca repararCacheArticulo
 * para cada artículo en estado divergente_reparable. Los artículos corruptos
 * y no_migrados nunca se tocan.
 *
 * I9 aplica a cada artículo individualmente: la atomicidad vive en repararCacheArticulo,
 * nunca en un batch global (un batch global violaría I5 y no escala con el catálogo).
 *
 * MT-U3 Capa 2: `empresaId` se resuelve UNA sola vez aquí (§2.5) y se reutiliza
 * en cada iteración del bucle de abajo — nunca se resuelve dentro del bucle.
 */
export async function reconciliarGlobal(
  opts: { aplicar?: boolean } = {},
): Promise<ReporteGlobalReconciliacion> {
  const empresaId = await getEmpresaId();

  const [productosSnap, insumosSnap] = await Promise.all([
    getDocs(query(collection(db, "productos"), where("empresaId", "==", empresaId), where("activo", "==", true))),
    getDocs(query(collection(db, "insumos"),   where("empresaId", "==", empresaId), where("activo", "==", true))),
  ]);

  const articulos: Array<{ tipo: ArticuloTipo; id: string }> = [
    ...productosSnap.docs.map((d) => ({ tipo: "producto" as ArticuloTipo, id: d.id })),
    ...insumosSnap.docs.map((d)   => ({ tipo: "insumo"   as ArticuloTipo, id: d.id })),
  ];

  const reporte: ReporteGlobalReconciliacion = {
    totalArticulos:        articulos.length,
    noMigrados:            0,
    consistentes:          0,
    divergentesReparables: 0,
    corruptos:             0,
    articulosConProblema:  [],
    articulosPendientes:   [],
  };

  for (const { tipo, id } of articulos) {
    const diag = await diagnosticarArticulo(tipo, id, empresaId);

    switch (diag.estado) {
      case "no_migrado":
        reporte.noMigrados++;
        reporte.articulosPendientes.push(diag);
        break;
      case "consistente":
        reporte.consistentes++;
        break;
      case "divergente_reparable":
        reporte.divergentesReparables++;
        reporte.articulosConProblema.push(diag);
        if (opts.aplicar) {
          // repararCacheArticulo re-diagnostica internamente con guarda optimista
          await repararCacheArticulo(tipo, id, empresaId);
        }
        break;
      case "corrupto":
        reporte.corruptos++;
        reporte.articulosConProblema.push(diag);
        // Nunca se repara automáticamente: corrupción del ledger requiere investigación
        break;
    }
  }

  return reporte;
}
