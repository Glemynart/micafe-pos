/**
 * inventario-kardex.ts
 *
 * Capa de lectura del Kardex de Inventario — FASE-19 PR1 + PR2.
 * Proyección de solo-lectura del Ledger; no escribe, no recalcula, no duplica lógica.
 *
 * PR2 activa los filtros de presentación (§9) en memoria sobre la página ya
 * obtenida: no añade where(...), no reconsulta Firestore, no altera cursores,
 * paginación ni orden, y no recalcula saldos.
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
import { getEmpresaId } from "@/lib/tenant";

// ─── Constantes de paginación (§8) ───────────────────────────────────────────

const LIMITE_DEFAULT = 50;
const LIMITE_MAXIMO  = 100;

// ─── Cursor de paginación (§8) ────────────────────────────────────────────────

/** Cursor opaco de paginación; internamente es el valor de secuenciaArticulo del último elemento. */
export type CursorKardex = number;

// ─── Filtros de presentación (§9) ────────────────────────────────────────────

/**
 * Filtros en memoria sobre la página actual.
 * PR2 implementa su lógica (§9) sin cambiar esta interfaz definida en PR1 (§6, §17).
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

// ─── Filtros en memoria sobre la página (§9) — PR2 ───────────────────────────

/**
 * Convierte el campo `fecha` (Firestore Timestamp en lectura) a milisegundos
 * para comparación en memoria. Devuelve null si no es convertible: una línea sin
 * fecha comparable nunca puede afirmarse dentro de un rango, por lo que se excluye
 * cuando un corte por fecha está activo. No muta nada (K1).
 */
function fechaAMillis(fecha: unknown): number | null {
  if (fecha == null) return null;
  if (
    typeof fecha === "object" &&
    typeof (fecha as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (fecha as { toMillis: () => number }).toMillis();
  }
  if (fecha instanceof Date) return fecha.getTime();
  if (typeof fecha === "number") return fecha;
  return null;
}

/**
 * Aplica los filtros documentados (§9) en memoria sobre la página actual.
 *
 * Reglas (§9):
 *  - Opera SOLO sobre las líneas de esta página; nunca sobre la serie completa.
 *  - Oculta filas; jamás reescribe `saldoCantidadDespues` ni recalcula nada (K2).
 *  - No reordena: preserva el orden de la página tal cual llegó del Ledger (K3).
 *  - No reconsulta Firestore ni añade where(...): es puro filtrado en memoria.
 *
 * Un filtro ausente no restringe. `tipos` filtra por pertenencia (vacío → ningún
 * tipo coincide); los rangos de secuencia/fecha son inclusivos en ambos extremos
 * y se comparan con `!= null` para admitir el valor 0.
 */
function aplicarFiltros(
  lineas:  LineaKardex[],
  filtros: FiltrosKardex | undefined,
): LineaKardex[] {
  if (!filtros) return lineas;

  const {
    tipos,
    clase,
    desdeFecha,
    hastaFecha,
    desdeSecuencia,
    hastaSecuencia,
  } = filtros;

  const desdeMillis = desdeFecha != null ? desdeFecha.getTime() : null;
  const hastaMillis = hastaFecha != null ? hastaFecha.getTime() : null;

  return lineas.filter((linea) => {
    // tipo — pertenencia al conjunto de tipos pedido
    if (tipos != null && !tipos.includes(linea.tipo)) return false;

    // clase — entrada | salida
    if (clase != null && linea.clase !== clase) return false;

    // rango de secuencia (corte histórico canónico, inclusivo)
    if (desdeSecuencia != null && linea.secuenciaArticulo < desdeSecuencia) return false;
    if (hastaSecuencia != null && linea.secuenciaArticulo > hastaSecuencia) return false;

    // rango de fecha (conveniencia en memoria, inclusivo)
    if (desdeMillis != null || hastaMillis != null) {
      const millis = fechaAMillis(linea.fecha);
      if (millis == null) return false;
      if (desdeMillis != null && millis < desdeMillis) return false;
      if (hastaMillis != null && millis > hastaMillis) return false;
    }

    return true;
  });
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
 * K5 Estado declarado. K9 filtra por empresaId (MT-U3 Capa 2). K10 Paginación estable.
 *
 * MT-U3 Capa 2: `empresaId` se resuelve UNA sola vez aquí (§2.5) y se reutiliza
 * en las tres lecturas de esta función (incluida la delegada a
 * `diagnosticarArticulo`) — nunca se resuelve más de una vez por llamada.
 */
export async function consultarKardexArticulo(
  articuloTipo: ArticuloTipo,
  articuloId:   string,
  opciones:     OpcionesKardex = {},
): Promise<PaginaKardex> {
  const orden  = opciones.orden  ?? "desc";
  const limite = Math.min(opciones.limite ?? LIMITE_DEFAULT, LIMITE_MAXIMO);
  const cursor = opciones.cursor ?? null;
  const empresaId = await getEmpresaId();
  // opciones.filtros (§9): se aplican en memoria sobre la página, al final (PR2, D4).
  // No intervienen en la consulta, ni en hayMas/cursorSiguiente, que describen la
  // página SIN filtrar (§9).

  // ── Lectura (a): página de movimientos — índice canónico (§7) ─────────────
  const constraints: QueryConstraint[] = [
    where("empresaId",    "==", empresaId),
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
  const diagnostico = await diagnosticarArticulo(articuloTipo, articuloId, empresaId);

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
          where("empresaId",    "==", empresaId),
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

  // ── Filtros en memoria sobre la página (§9, PR2) ─────────────────────────
  // Solo ocultan filas de ESTA página; no alteran el saldo (K2) ni el orden (K3).
  // hayMas / cursorSiguiente se calculan sobre la página SIN filtrar (§9).
  const lineasFiltradas = aplicarFiltros(lineas, opciones.filtros);

  // ── Construcción del contenedor (§5) ─────────────────────────────────────
  const articulo: KardexArticulo = {
    articuloTipo,
    articuloId,
    articuloNombre,
    unidad,
    estado:      diagnostico.estado,
    saldoActual: diagnostico.stockLedger ?? null,
    lineas:      lineasFiltradas,
  };

  // ── Cursor de paginación — secuenciaArticulo del último elemento (§8, K10) ─
  // Basado en `docs` (página SIN filtrar): los filtros no tocan la paginación (§9).
  const cursorSiguiente: CursorKardex | null =
    hayMas && docs.length > 0
      ? (docs[docs.length - 1]!.data()["secuenciaArticulo"] as number)
      : null;

  return { articulo, hayMas, cursorSiguiente };
}

/**
 * Estado de reconciliación del artículo.
 * Reexportado / compuesto del Ledger — no reimplementa el replay (D7, Principio 6).
 *
 * MT-U3 Capa 2: `empresaId` se resuelve aquí (única resolución de esta llamada).
 */
export async function obtenerEstadoKardex(
  articuloTipo: ArticuloTipo,
  articuloId:   string,
): Promise<DiagnosticoArticulo> {
  const empresaId = await getEmpresaId();
  return diagnosticarArticulo(articuloTipo, articuloId, empresaId);
}
