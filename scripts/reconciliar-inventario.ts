/**
 * reconciliar-inventario.ts  —  RECONCILIACIÓN AUTORITATIVA FASE-15 PR9
 *
 * Implementa la Fase 4 del plan de migración del Ledger de inventario:
 * activa I9 (stock cache == Σ(ledger)) para todos los artículos migrados
 * y repara el cache de los que tienen divergencia.
 *
 * Precondiciones satisfechas antes de ejecutar:
 *   • Fase 3 completa: I11 activo, todos los escritores conmutados (PR7).
 *   • Mecanismo paralelo Electron cerrado (eliminado en commit 862d574).
 *   • Una divergencia ya no es artefacto de migración: es un defecto.
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito --execute
 *   • Idempotente y REANUDABLE: re-ejecutar converge sin dobles escrituras.
 *   • Los artículos no_migrado (apertura lazy pendiente) NO se tocan.
 *   • Los artículos corrupto (huecos/inválidos) NO se tocan — requieren
 *     investigación manual; nunca se lava corrupción del ledger (I1/I2).
 *   • Única escritura posible: campo `stock` del documento del artículo.
 *     Jamás se escribe en movimientos_inventario (append-only I1/I2).
 *   • Guarda optimista de secuencia: si un escritor emitió un movimiento
 *     entre el diagnóstico y la reparación, la transacción aborta.
 *
 * Uso:
 *   Dry-run (no escribe):
 *     FIREBASE_SERVICE_ACCOUNT_PATH=./sa.json npx tsx scripts/reconciliar-inventario.ts
 *
 *   Ejecución real (repara divergentes_reparables):
 *     FIREBASE_SERVICE_ACCOUNT_PATH=./sa.json npx tsx scripts/reconciliar-inventario.ts --execute
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
dotenv.config({ path: ".env.local" });

import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Query } from "firebase-admin/firestore";

const EXECUTE = process.argv.includes("--execute");

// ─── Service account (patrón canónico del proyecto) ──────────────────────────

function loadServiceAccount(): object {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().length > 2) {
    try {
      return JSON.parse(inline) as object;
    } catch {
      /* cae a modo archivo */
    }
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    "./service-account.local.json",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as object;
  }
  console.error("❌ No se encontró el service account (env inline o archivo).");
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();

// ─── Tipos locales (espejo del ledger — Admin SDK sin imports de lib/) ────────

type ArticuloTipo = "producto" | "insumo";
type EstadoReconciliacion =
  | "no_migrado"
  | "corrupto"
  | "divergente_reparable"
  | "consistente";

interface MovimientoRaw {
  id: string;
  secuenciaArticulo: number;
  cantidad: number;
  signo: number;
  clase: string;
  tipo: string;
  saldoCantidadDespues: number;
}

interface DiagnosticoLocal {
  tipo: ArticuloTipo;
  id: string;
  nombre: string;
  estado: EstadoReconciliacion;
  stockCache: number;
  stockLedger: number | undefined;
  divergencia: number | undefined;
  secuenciaLedger: number;
  secuenciaMax: number;
  totalMovimientos: number;
  huecos: number[];
  invalidos: number;
  motivoCorrupcion: string | undefined;
}

// ─── Catálogo de tipos (replica del núcleo — Admin SDK no importa lib/) ──────

const CATALOGO_TIPOS: Record<string, { clase: string; signo: number }> = {
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

// ─── Capa 1: replay puro (sin escritura, sin leer cache) ─────────────────────

function replayLedger(movimientos: MovimientoRaw[]): {
  stockLedger: number;
  secuenciaMax: number;
  huecos: number[];
  invalidos: number;
} {
  let acumulado = 0;
  let expectedSeq = 1;
  const huecos: number[] = [];
  let invalidos = 0;

  for (const m of movimientos) {
    while (expectedSeq < m.secuenciaArticulo) {
      huecos.push(expectedSeq);
      expectedSeq++;
    }

    // I13: signo
    const signoCalculado = m.cantidad > 0 ? 1 : m.cantidad < 0 ? -1 : 0;
    if (signoCalculado !== m.signo) invalidos++;

    // I13: clase
    const cat = CATALOGO_TIPOS[m.tipo];
    if (cat && cat.clase !== m.clase) invalidos++;

    acumulado += m.cantidad;

    // I8: saldo encadenado
    if (Math.abs(m.saldoCantidadDespues - acumulado) > 1e-9) invalidos++;

    expectedSeq = m.secuenciaArticulo + 1;
  }

  const secuenciaMax =
    movimientos.length > 0
      ? movimientos[movimientos.length - 1]!.secuenciaArticulo
      : 0;

  return { stockLedger: acumulado, secuenciaMax, huecos, invalidos };
}

// ─── Capa 2: diagnóstico por artículo ────────────────────────────────────────

async function diagnosticar(
  tipo: ArticuloTipo,
  id: string,
  nombre: string,
): Promise<DiagnosticoLocal> {
  const coleccion = tipo === "producto" ? "productos" : "insumos";

  // Paso 1: leer SOLO el artículo. movimientos_inventario no se consulta hasta
  // confirmar que está migrado (secuenciaLedger > 0): los no_migrado quedan
  // completamente fuera del replay.
  const artSnap = await db.collection(coleccion).doc(id).get();
  const data = artSnap.exists ? artSnap.data()! : {};
  const stockCache      = (data.stock           as number | undefined) ?? 0;
  const secuenciaLedger = (data.secuenciaLedger as number | undefined) ?? 0;

  // P1: no migrado → clasificar sin tocar movimientos_inventario
  if (secuenciaLedger === 0) {
    return {
      tipo, id, nombre,
      estado:           "no_migrado",
      stockCache,
      stockLedger:      undefined,
      divergencia:      undefined,
      secuenciaLedger:  0,
      secuenciaMax:     0,
      totalMovimientos: 0,
      huecos:           [],
      invalidos:        0,
      motivoCorrupcion: undefined,
    };
  }

  // Paso 2: solo para artículos migrados, leer sus movimientos
  const movsSnap = await db
    .collection("movimientos_inventario")
    .where("articuloTipo", "==", tipo)
    .where("articuloId", "==", id)
    .orderBy("secuenciaArticulo", "asc")
    .get();

  const movimientos: MovimientoRaw[] = movsSnap.docs.map((d) => {
    const md = d.data();
    return {
      id:                   d.id,
      secuenciaArticulo:    md.secuenciaArticulo    as number,
      cantidad:             md.cantidad             as number,
      signo:                md.signo                as number,
      clase:                md.clase                as string,
      tipo:                 md.tipo                 as string,
      saldoCantidadDespues: md.saldoCantidadDespues as number,
    };
  });

  const { stockLedger, secuenciaMax, huecos, invalidos } = replayLedger(movimientos);
  const perdidaDeCola = secuenciaLedger > secuenciaMax;

  if (huecos.length > 0 || invalidos > 0 || perdidaDeCola) {
    const motivos: string[] = [];
    if (huecos.length > 0)    motivos.push(`huecos: [${huecos.join(",")}]`);
    if (invalidos > 0)        motivos.push(`invalidos: ${invalidos}`);
    if (perdidaDeCola)        motivos.push(`cola: ledger=${secuenciaLedger} > max=${secuenciaMax}`);
    return {
      tipo, id, nombre,
      estado:           "corrupto",
      stockCache,
      stockLedger,
      divergencia:      undefined,
      secuenciaLedger,
      secuenciaMax,
      totalMovimientos: movimientos.length,
      huecos,
      invalidos,
      motivoCorrupcion: motivos.join("; "),
    };
  }

  const divergencia   = stockLedger - stockCache;
  const esConsistente = Math.abs(divergencia) <= 1e-6;

  return {
    tipo, id, nombre,
    estado:           esConsistente ? "consistente" : "divergente_reparable",
    stockCache,
    stockLedger,
    divergencia,
    secuenciaLedger,
    secuenciaMax,
    totalMovimientos: movimientos.length,
    huecos:           [],
    invalidos:        0,
    motivoCorrupcion: undefined,
  };
}

// ─── Capa 3: reparación con guarda optimista ──────────────────────────────────

async function repararCache(diag: DiagnosticoLocal): Promise<"reparado" | "skip" | "abortada"> {
  if (diag.estado !== "divergente_reparable") return "skip";

  const coleccion  = diag.tipo === "producto" ? "productos" : "insumos";
  const artRef     = db.collection(coleccion).doc(diag.id);
  const stockNuevo = diag.stockLedger!;
  const seqObservada = diag.secuenciaLedger;

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(artRef);
    if (!snap.exists) return "no_existe";

    const d = snap.data()!;
    const seqActual   = (d.secuenciaLedger as number | undefined) ?? 0;
    const cacheActual = (d.stock           as number | undefined) ?? 0;

    // Guarda optimista
    if (seqActual !== seqObservada) return "guarda_activada";

    // Idempotencia interna
    if (Math.abs(stockNuevo - cacheActual) <= 1e-6) return "ya_consistente";

    tx.update(artRef, { stock: stockNuevo });
    return "ok";
  });

  if (resultado === "ok")    return "reparado";
  if (resultado === "guarda_activada") return "abortada";
  return "skip";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(` RECONCILIACIÓN INVENTARIO — FASE-15 PR9`);
  console.log(` modo: ${EXECUTE ? "⚠️  EXECUTE (escribe)" : "🟢 DRY-RUN (no escribe)"}`);
  console.log("══════════════════════════════════════════════════════════════════\n");

  // ── 1) Cargar artículos activos ──────────────────────────────────────────────
  const [prodSnap, insSnap] = await Promise.all([
    db.collection("productos").where("activo", "==", true).get(),
    db.collection("insumos").where("activo", "==", true).get(),
  ]);

  const articulos: Array<{ tipo: ArticuloTipo; id: string; nombre: string }> = [
    ...prodSnap.docs.map((d) => ({
      tipo: "producto" as ArticuloTipo,
      id:   d.id,
      nombre: (d.data().nombre as string | undefined) ?? d.id,
    })),
    ...insSnap.docs.map((d) => ({
      tipo: "insumo" as ArticuloTipo,
      id:   d.id,
      nombre: (d.data().nombre as string | undefined) ?? d.id,
    })),
  ];

  console.log(`Artículos activos cargados: ${articulos.length} (${prodSnap.size} productos, ${insSnap.size} insumos)\n`);

  // ── 2) Diagnóstico de todos los artículos ────────────────────────────────────
  const diagnosticos: DiagnosticoLocal[] = [];
  for (const art of articulos) {
    const diag = await diagnosticar(art.tipo, art.id, art.nombre);
    diagnosticos.push(diag);
  }

  // ── 3) Clasificar y reportar ─────────────────────────────────────────────────
  const noMigrados          = diagnosticos.filter((d) => d.estado === "no_migrado");
  const consistentes        = diagnosticos.filter((d) => d.estado === "consistente");
  const divergentesRep      = diagnosticos.filter((d) => d.estado === "divergente_reparable");
  const corruptos           = diagnosticos.filter((d) => d.estado === "corrupto");

  console.log("── Resumen de diagnóstico ──────────────────────────────────────────");
  console.log(`  Consistentes (I9 satisfecho):    ${consistentes.length}`);
  console.log(`  Divergentes reparables:          ${divergentesRep.length}`);
  console.log(`  Corruptos (investigar):          ${corruptos.length}`);
  console.log(`  No migrados (apertura pendiente): ${noMigrados.length}`);
  console.log(`  TOTAL:                           ${diagnosticos.length}\n`);

  if (noMigrados.length > 0) {
    console.log("── No migrados (apertura lazy pendiente — no son defectos) ──────────");
    for (const d of noMigrados) {
      console.log(`  ⏳ [${d.tipo}] ${d.nombre} (${d.id})  cache=${d.stockCache}`);
    }
    console.log();
  }

  if (corruptos.length > 0) {
    console.log("── ⚠️  Corruptos (requieren investigación manual — NO se reparan) ───");
    for (const d of corruptos) {
      console.log(
        `  🔴 [${d.tipo}] ${d.nombre} (${d.id})` +
        `  huecos=${d.huecos.length}  invalidos=${d.invalidos}` +
        `  ${d.motivoCorrupcion ?? ""}`,
      );
    }
    console.log();
  }

  if (divergentesRep.length > 0) {
    console.log("── Divergentes reparables ──────────────────────────────────────────");
    console.table(
      divergentesRep.map((d) => ({
        tipo:       d.tipo,
        nombre:     d.nombre,
        id:         d.id,
        cache:      d.stockCache,
        ledger:     d.stockLedger,
        divergencia: d.divergencia,
      })),
    );
    console.log();
  }

  if (!EXECUTE) {
    console.log("🟢 DRY-RUN completo. No se escribió nada.");
    if (divergentesRep.length > 0 || corruptos.length > 0) {
      console.log("   Para reparar divergentes: añade --execute");
    }
    console.log();
    return;
  }

  // ── 4) Reparación (solo divergentes_reparables) ───────────────────────────────
  if (divergentesRep.length === 0) {
    console.log("✅ No hay artículos divergentes reparables. Nada que ejecutar.\n");
    return;
  }

  console.log("── ⚠️  EXECUTE: reparando divergentes ──────────────────────────────");
  let reparados = 0, saltados = 0, abortadas = 0;
  for (const diag of divergentesRep) {
    const res = await repararCache(diag);
    if (res === "reparado") {
      reparados++;
      console.log(
        `  ✅ REPARADO  [${diag.tipo}] ${diag.nombre} (${diag.id})` +
        `  ${diag.stockCache} → ${diag.stockLedger}`,
      );
    } else if (res === "abortada") {
      abortadas++;
      console.log(
        `  ⟳  ABORTADA  [${diag.tipo}] ${diag.nombre} (${diag.id})` +
        `  — guarda optimista activada (re-ejecutar para reintentar)`,
      );
    } else {
      saltados++;
      console.log(`  ⏭️  SKIP       [${diag.tipo}] ${diag.nombre} (${diag.id})`);
    }
  }

  console.log("\n── Resumen de reparación ───────────────────────────────────────────");
  console.log(`  Reparados:  ${reparados}`);
  console.log(`  Saltados:   ${saltados}`);
  console.log(`  Abortados:  ${abortadas}`);
  if (abortadas > 0) {
    console.log("  ⚠️  Artículos abortados: re-ejecutar el script (idempotente y reanudable).");
  }
  if (corruptos.length > 0) {
    console.log(`  🔴 ${corruptos.length} artículo(s) corrupto(s) requieren revisión manual — ver arriba.`);
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("❌ Error fatal:", err);
    process.exit(1);
  });
