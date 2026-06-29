/**
 * inventario-kardex.ts
 *
 * Capa de lectura del Kardex de Inventario — FASE-19 PR1.
 * Proyección de solo-lectura del Ledger; no escribe, no recalcula, no duplica lógica.
 *
 * Diseño: FASE-19-PR1-kardex-diseno.md
 * Fuente del Ledger: lib/inventario-ledger.ts
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  type ArticuloTipo,
  type ClaseMovimiento,
  type TipoMovimientoInventario,
  type EstadoReconciliacion,
  type DiagnosticoArticulo,
  diagnosticarArticulo,
} from "@/lib/inventario-ledger";

// ─── Constantes de paginación (§8) ───────────────────────────────────────────

const LIMITE_DEFAULT = 50;
const LIMITE_MAXIMO  = 100;

// ─── Cursor de paginación (§8) ────────────────────────────────────────────────

/** Cursor opaco de paginación; internamente es el valor de secuenciaArticulo del último elemento. */
export type CursorKardex = number;

// ─── Filtros de presentación (§9) ────────────────────────────────────────────

/**
 * Filtros en memoria sobre la página actual.
 * PR1: el parámetro se acepta en la firma pero se ignora — PR2 lo implementa (§6, §17).
 */
export interface FiltrosKardex {
  tipos?:           TipoMovimientoInventario[];
  clase?:           ClaseMovimiento;
  desdeFecha?:      Date;
  hastaFecha?:      Date;
  desdeSecuencia?:  number;
  hastaSecuencia?:  number;
}

// ─── Opciones de consulta (§6) ────────────────────────────────────────────────

export interface OpcionesKardex {
  /** Tamaño de página. Default: 50. Máximo: 100 (§8). */
  limite?:  number;
  /** Cursor opaco basado en secuenciaArticulo del último elemento de la página anterior (§8). */
  cursor?:  CursorKardex | null;
  /** Dirección de ordenamiento sobre secuenciaArticulo. Default: "desc" (§8). */
  orden?:   "asc" | "desc";
  /** Filtros en memoria sobre la página (§9). Aceptado en PR1; implementado en PR2. */
  filtros?: FiltrosKardex;
}

// ─── Proyección LineaKardex (§5) ─────────────────────────────────────────────

/**
 * Proyección de un MovimientoInventario para presentación en el Kardex.
 * Excluye deliberadamente: saldoValorDespues (K7), loteId / capasConsumidasDetalle
 * (reservados FIFO), empresaId (K9), usuarioId (solo se expone el nombre snapshot).
 */
export interface LineaKardex {
  id:                      string;
  secuenciaArticulo:       number;
  fecha:                   unknown;   // Firestore Timestamp; la UI decide el formato
  tipo:                    TipoMovimientoInventario;
  clase:                   ClaseMovimiento;
  signo:                   1 | -1;
  cantidad:                number;
  costoUnitario:           number;
  costoTotal:              number;
  saldoCantidadDespues:    number;
  referenciaColeccion:     string | null;
  referenciaId:            string | null;
  movimientoRelacionadoId: string | null;
  usuarioNombre:           string;
  motivo:                  string | null;
}

// ─── Contenedor KardexArticulo (§5) ──────────────────────────────────────────

export interface KardexArticulo {
  articuloTipo:   ArticuloTipo;
  articuloId:     string;
  /** Snapshot del movimiento con secuenciaArticulo máxima de la serie. null para no_migrado (§11). */
  articuloNombre: string | null;
  /** Snapshot del movimiento con secuenciaArticulo máxima de la serie. null para no_migrado (§11). */
  unidad:         string | null;
  /** EstadoReconciliacion declarado siempre, antes de interpretar la serie (K5). */
  estado:         EstadoReconciliacion;
  /** DiagnosticoArticulo.stockLedger — Σ(cantidad) autoritativo (I4). null para no_migrado (§11). */
  saldoActual:    number | null;
  /** Proyección de la página actual. Vacío para no_migrado (§11). */
  lineas:         LineaKardex[];
}

// ─── Resultado paginado (§6) ─────────────────────────────────────────────────

export interface PaginaKardex {
  articulo:         KardexArticulo;
  hayMas:           boolean;
  cursorSiguiente:  CursorKardex | null;
}

// ─── API pública (§6) ────────────────────────────────────────────────────────

/**
 * Consulta una página del Kardex de un artículo.
 *
 * Realiza entre dos y tres lecturas de Firestore:
 *   (a) Página de movimientos por el índice canónico (articuloTipo, articuloId, secuenciaArticulo) (§7).
 *   (b) Estado vía diagnosticarArticulo — lee todos los movimientos sin limit (K5, §6).
 *   (c) Opcional: cuando articuloNombre/unidad no están en la página (orden asc o cursor activo),
 *       consulta dedicada orderBy secuenciaArticulo desc limit 1 sobre el índice ya desplegado (§5).
 *
 * K1 Solo lectura. K2 Saldo no recalculado. K3 Orden por secuenciaArticulo.
 * K5 Estado declarado. K9 empresaId no filtra. K10 Paginación estable.
 */
export async function consultarKardexArticulo(
  articuloTipo: ArticuloTipo,
  articuloId:   string,
  opciones:     OpcionesKardex = {},
): Promise<PaginaKardex> {
  const orden  = opciones.orden  ?? "desc";
  const limite = Math.min(opciones.limite ?? LIMITE_DEFAULT, LIMITE_MAXIMO);
  const cursor = opciones.cursor ?? null;
  // opciones.filtros: aceptado, ignorado en PR1 — PR2 implementa la lógica (§6, §17, D4)

  // ── Lectura (a): página de movimientos — índice canónico (§7) ─────────────
  const constraints: QueryConstraint[] = [
    where("articuloTipo", "==", articuloTipo),
    where("articuloId",   "==", articuloId),
    orderBy("secuenciaArticulo", orden),
  ];
  if (cursor != null) constraints.push(startAfter(cursor));
  constraints.push(limit(limite + 1)); // +1 para detectar hayMas sin lectura adicional

  const paginaSnap = await getDocs(
    query(collection(db, "movimientos_inventario"), ...constraints),
  );

  const hayMas = paginaSnap.docs.length > limite;
  const docs   = hayMas ? paginaSnap.docs.slice(0, limite) : paginaSnap.docs;

  // ── Lectura (b): estado vía diagnosticarArticulo (K5) ────────────────────
  const diagnostico = await diagnosticarArticulo(articuloTipo, articuloId);

  // ── Proyección de líneas (§5) — cero recálculo, cero escritura (K1, K2) ──
  const lineas: LineaKardex[] = docs.map((d) => {
    const data = d.data();
    return {
      id:                      d.id,
      secuenciaArticulo:       data["secuenciaArticulo"]    as number,
      fecha:                   data["fecha"],
      tipo:                    data["tipo"]                 as TipoMovimientoInventario,
      clase:                   data["clase"]                as ClaseMovimiento,
      signo:                   data["signo"]                as 1 | -1,
      cantidad:                data["cantidad"]             as number,
      costoUnitario:           data["costoUnitario"]        as number,
      costoTotal:              data["costoTotal"]           as number,
      saldoCantidadDespues:    data["saldoCantidadDespues"] as number,
      referenciaColeccion:     (data["referenciaColeccion"]     as string | null | undefined) ?? null,
      referenciaId:            (data["referenciaId"]             as string | null | undefined) ?? null,
      movimientoRelacionadoId: (data["movimientoRelacionadoId"]  as string | null | undefined) ?? null,
      usuarioNombre:           data["usuarioNombre"]        as string,
      motivo:                  (data["motivo"]               as string | null | undefined) ?? null,
    };
  });

  // ── Lectura (c): articuloNombre / unidad — snapshot del máximo (§5) ──────
  // no_migrado → null sin consulta (§11).
  // orden=desc sin cursor → el primer documento ya es el de secuenciaArticulo máxima (gratis).
  // Cualquier otro caso → consulta dedicada orderBy secuenciaArticulo desc limit 1.
  let articuloNombre: string | null = null;
  let unidad:         string | null = null;

  if (diagnostico.estado !== "no_migrado") {
    if (orden === "desc" && cursor == null && docs.length > 0) {
      const d = docs[0]!.data();
      articuloNombre = d["articuloNombre"] as string;
      unidad         = d["unidad"]         as string;
    } else {
      const snapMax = await getDocs(
        query(
          collection(db, "movimientos_inventario"),
          where("articuloTipo", "==", articuloTipo),
          where("articuloId",   "==", articuloId),
          orderBy("secuenciaArticulo", "desc"),
          limit(1),
        ),
      );
      if (!snapMax.empty) {
        const d    = snapMax.docs[0]!.data();
        articuloNombre = d["articuloNombre"] as string;
        unidad         = d["unidad"]         as string;
      }
    }
  }

  // ── Construcción del contenedor (§5) ─────────────────────────────────────
  const articulo: KardexArticulo = {
    articuloTipo,
    articuloId,
    articuloNombre,
    unidad,
    estado:      diagnostico.estado,
    saldoActual: diagnostico.stockLedger ?? null,
    lineas,
  };

  // ── Cursor de paginación — secuenciaArticulo del último elemento (§8, K10) ─
  const cursorSiguiente: CursorKardex | null =
    hayMas && docs.length > 0
      ? (docs[docs.length - 1]!.data()["secuenciaArticulo"] as number)
      : null;

  return { articulo, hayMas, cursorSiguiente };
}

/**
 * Estado de reconciliación del artículo.
 * Reexportado / compuesto del Ledger — no reimplementa el replay (D7, Principio 6).
 */
export async function obtenerEstadoKardex(
  articuloTipo: ArticuloTipo,
  articuloId:   string,
): Promise<DiagnosticoArticulo> {
  return diagnosticarArticulo(articuloTipo, articuloId);
}
