/**
 * migrate-mt-u3-operativo.ts — MT-U3 Capa 5: Backfill operativo (Fase B de MT-U1)
 *
 * Estampa `empresaId` (id opaco de la empresa fundacional) en las 25 colecciones
 * operativas del POS. Es el "paso 0" del despliegue de MT-U3 (D-U1-3): corre
 * inmediatamente antes de activar el estampado/filtrado en los servicios, en el
 * mismo despliegue, para que nunca exista una ventana con filtros activos sobre
 * datos sin `empresaId`.
 *
 * Fuente oficial de la lista de colecciones: MT-U3-helper-tenant-diseno.md §7
 * (25 colecciones; corrige la lista previa de MT-U1/maestro — ver notas de
 * reconciliación en esos documentos).
 *
 * GUARDA ESPECIAL (D-U2-3): `movimientos_inventario` ya tiene el campo
 * `empresaId` pero con el literal `"default"` (lib/inventario-ledger.ts:339,374).
 * La guarda estándar `if (!doc.data().empresaId)` NO basta para esta colección:
 * se usa una guarda adicional que remapea `"default"` → id fundacional.
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito --execute.
 *   • Idempotente por documento: un doc con `empresaId` ya igual al fundacional
 *     se salta (no-op). Re-ejecutar N veces produce el mismo estado que 1 vez.
 *   • Mecanismo de escritura: `BulkWriter` (Admin SDK), no `WriteBatch`. Sigue
 *     usando deliberadamente `update()` (nunca `set(data, {merge:true})`): si
 *     un doc de una colección volátil (p. ej. `pedidos_activos`,
 *     `comandas_cocina`) es borrado por la operación normal del POS entre la
 *     lectura y la escritura, `update()` falla con `NOT_FOUND` en vez de
 *     resucitar silenciosamente un documento fantasma con solo el campo
 *     `empresaId` (lo que sí haría `set(merge:true)`) — un defecto de datos
 *     real, evitado a propósito.
 *   • A diferencia de `WriteBatch` (atómico: un fallo tumba TODA la página),
 *     `BulkWriter` resuelve/rechaza cada escritura de forma INDEPENDIENTE: un
 *     `NOT_FOUND` en un doc no afecta a los demás de la misma página ni a las
 *     páginas siguientes. Se contabiliza aparte como "desaparecidos" (ver
 *     reporte), nunca se recrea el documento, y la ejecución continúa.
 *   • Política de reintentos: la política **por defecto** del SDK (reintenta
 *     `UNAVAILABLE`/`ABORTED` hasta 10 intentos; NO reintenta `NOT_FOUND`).
 *     Este script NO instala un `onWriteError` propio — se usa la política
 *     recomendada de Firestore tal cual, sin reinventar una estrategia de
 *     reintentos ad-hoc.
 *   • Errores permanentes (cualquier rechazo final que no sea `NOT_FOUND`, ya
 *     agotados los reintentos por defecto) se registran en `errores` y se
 *     reflejan en el reporte; no detienen el resto de la colección.
 *   • Reanudable SIN checkpoint persistido: ante un fallo parcial, simplemente
 *     se re-ejecuta desde el principio. La idempotencia por documento hace que
 *     los docs ya estampados se salten (lecturas baratas, cero escrituras
 *     redundantes) — se prefiere este diseño sobre un cursor persistido en
 *     disco para evitar la clase de bug "checkpoint obsoleto apunta a datos
 *     que ya no existen". Ver MT-U3-helper-tenant-diseno.md §6.4.
 *   • Nunca sobreescribe un `empresaId` inesperado: si un doc tiene un valor
 *     que no es "ausente", no es el fundacional, y (solo para el ledger) no es
 *     "default", se reporta como ANOMALÍA y se deja intacto — requiere
 *     intervención humana (MT-U1 §5 paso 7).
 *   • Aborta sin escribir nada si no existe la empresa fundacional
 *     (`esFundacional==true`) — misma precondición que MT-U1/MT-U2.
 *   • Paginación por `__name__` (doc id) con `startAfter`, lotes de hasta 500
 *     documentos por página; nunca carga una colección completa en memoria.
 *   • Solo escribe el campo `empresaId` (vía `update`) en las 25 colecciones
 *     oficiales. No toca ningún otro campo, no borra documentos, no crea
 *     documentos nuevos.
 *
 * Uso:
 *   Dry-run (por defecto):  npx tsx scripts/migrate-mt-u3-operativo.ts
 *   Dry-run (explícito):    npx tsx scripts/migrate-mt-u3-operativo.ts --dry-run
 *   Ejecución:              npx tsx scripts/migrate-mt-u3-operativo.ts --execute
 *   Ejecución (1 colección): npx tsx scripts/migrate-mt-u3-operativo.ts --execute --solo=ventas
 *
 * Ver MT-U3-helper-tenant-diseno.md §6 (Backfill) y §5 (Ledger).
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, GrpcStatus, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { EMPRESAS_COLLECTION } from '../lib/empresas-service'
import {
  type ColeccionConfig,
  COLECCIONES_OFICIALES,
  verificarColeccionesContraFirestore,
} from './mt-u3-colecciones-oficiales'

const argv = process.argv.slice(2)
// --dry-run gana si se combinan ambos flags por error: seguro por defecto.
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')
// Filtro opcional para operar sobre una sola colección durante pruebas
// (--solo=<nombre>). Sin este flag se recorren las 25 colecciones oficiales.
const SOLO = argv.find((a) => a.startsWith('--solo='))?.split('=')[1]

// ─── Service account (mismo patrón que scripts/migrate-mt-u1-fundacional.ts) ──
function loadServiceAccount(): any {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline && inline.trim().length > 2) {
    try { return JSON.parse(inline) } catch { /* file fallback */ }
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    './service-account.local.json',
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  console.error('❌ No se encontró el service account (env inline o archivo).')
  process.exit(1)
}

if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()

const PAGE_SIZE = 500

// ─── Resultado por colección ───────────────────────────────────────────────────

interface Anomalia {
  docId: string
  empresaIdPrevio: string
}

interface ErrorEscritura {
  docId: string
  mensaje: string
}

interface ResultadoColeccion {
  nombre: string
  examinados: number
  /** Estampados y CONFIRMADOS en este run (incluye remapeos de "default" para el ledger). */
  tocados: number
  /** Ya tenían empresaId == fundacional — no-op. */
  saltados: number
  /** NOT_FOUND: el doc fue borrado (operación normal del POS) entre la lectura y la escritura. Nunca recreado. */
  desaparecidos: number
  anomalias: Anomalia[]
  /** Errores PERMANENTES por documento (ya agotados los reintentos por defecto del SDK; excluye NOT_FOUND). No detienen la colección. */
  erroresEscritura: ErrorEscritura[]
  /** Excepción fatal de LECTURA/paginación que detuvo el resto de la colección en esta corrida (try/catch exterior). */
  erroresLectura: string[]
  duracionMs: number
}

/**
 * Clasifica y (si EXECUTE) estampa una colección completa, paginando por
 * `__name__` en páginas de PAGE_SIZE. Las escrituras de cada página se
 * encolan en un `BulkWriter` por colección (paralelo, no atómico entre
 * documentos) y se esperan antes de pasar a la página siguiente.
 */
async function procesarColeccion(config: ColeccionConfig, empresaId: string): Promise<ResultadoColeccion> {
  const inicio = Date.now()
  const resultado: ResultadoColeccion = {
    nombre: config.nombre,
    examinados: 0,
    tocados: 0,
    saltados: 0,
    desaparecidos: 0,
    anomalias: [],
    erroresEscritura: [],
    erroresLectura: [],
    duracionMs: 0,
  }

  let cursor: QueryDocumentSnapshot | undefined
  // Un único BulkWriter por colección: se cierra al terminar de procesarla.
  const bulkWriter = EXECUTE ? db.bulkWriter() : null

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = db.collection(config.nombre).orderBy('__name__').limit(PAGE_SIZE)
      if (cursor) q = q.startAfter(cursor)
      const snap = await q.get()
      if (snap.empty) break

      // Promesas de escritura de ESTA página — cada una ya lleva su propio
      // .then/.catch, por lo que Promise.all nunca rechaza (los fallos se
      // contabilizan en `resultado`, no se propagan).
      const escriturasPagina: Promise<void>[] = []

      for (const doc of snap.docs) {
        resultado.examinados++
        const actual = doc.data().empresaId as string | undefined

        const remapeaDesdeDefault =
          config.guardaEspecial === 'movimientos_inventario_default' && actual === 'default'

        const necesitaEstampado = actual === undefined || actual === null || remapeaDesdeDefault

        if (necesitaEstampado) {
          if (EXECUTE && bulkWriter) {
            const p = bulkWriter
              .update(doc.ref, { empresaId })
              .then(() => {
                resultado.tocados++
              })
              .catch((err: any) => {
                if (err.code === GrpcStatus.NOT_FOUND) {
                  // Documento borrado por la operación normal del POS entre la
                  // lectura y la escritura. Se registra, se contabiliza, se
                  // continúa. Nunca se recrea (no se usa set/merge).
                  resultado.desaparecidos++
                } else {
                  resultado.erroresEscritura.push({ docId: doc.id, mensaje: err.message })
                }
              })
            escriturasPagina.push(p)
          } else {
            // Dry-run: simulado, sin tocar Firestore.
            resultado.tocados++
          }
        } else if (actual === empresaId) {
          // Ya estampado con el valor correcto (re-ejecución) → no-op.
          resultado.saltados++
        } else {
          // empresaId presente pero con un valor inesperado: NUNCA se sobreescribe.
          resultado.anomalias.push({ docId: doc.id, empresaIdPrevio: String(actual) })
        }
      }

      // Esperar TODAS las escrituras de esta página antes de paginar: acota
      // el trabajo en vuelo a una página a la vez (misma cadencia que el
      // WriteBatch anterior), sin la atomicidad que hacía fallar la página
      // entera por un solo documento desaparecido.
      if (escriturasPagina.length > 0) await Promise.all(escriturasPagina)

      cursor = snap.docs[snap.docs.length - 1]
      if (snap.docs.length < PAGE_SIZE) break
    }

    if (bulkWriter) await bulkWriter.close()
  } catch (err) {
    // Excepción fatal de lectura/paginación (no de escritura): detiene el
    // resto de esta colección en esta corrida. Idempotente — re-ejecutar
    // completa lo pendiente.
    resultado.erroresLectura.push((err as Error).message)
  }

  resultado.duracionMs = Date.now() - inicio
  return resultado
}

async function resolverEmpresaFundacional(): Promise<{ id: string; nombre: string } | null> {
  const snap = await db.collection(EMPRESAS_COLLECTION).where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, nombre: (doc.data().nombre as string) ?? '(sin nombre)' }
}

function imprimirReporteColeccion(r: ResultadoColeccion) {
  const marca = r.erroresLectura.length > 0 || r.erroresEscritura.length > 0
    ? '❌'
    : r.anomalias.length > 0 ? '⚠️ ' : '✅'
  console.log(
    `${marca} ${r.nombre.padEnd(28)} examinados=${String(r.examinados).padStart(6)}  ` +
      `tocados=${String(r.tocados).padStart(6)}  saltados=${String(r.saltados).padStart(6)}  ` +
      `desaparecidos=${String(r.desaparecidos).padStart(3)}  anomalías=${String(r.anomalias.length).padStart(3)}  (${r.duracionMs}ms)`
  )
  if (r.desaparecidos > 0) {
    console.log(`     ℹ️  ${r.desaparecidos} documento(s) desaparecieron (NOT_FOUND) entre lectura y escritura — normal en colecciones volátiles, no requiere acción.`)
  }
  for (const a of r.anomalias) {
    console.log(`     ⚠ ANOMALÍA doc=${a.docId} empresaIdPrevio="${a.empresaIdPrevio}" — NO tocado, requiere revisión humana`)
  }
  for (const e of r.erroresEscritura) {
    console.log(`     ❌ ERROR ESCRITURA doc=${e.docId}: ${e.mensaje}`)
  }
  for (const e of r.erroresLectura) {
    console.log(`     ❌ ERROR LECTURA: ${e} — resto de la colección omitido en esta corrida, re-ejecutar completa lo pendiente`)
  }
}

async function main() {
  const inicioGlobal = Date.now()

  console.log('='.repeat(78))
  console.log('MT-U3 — Backfill operativo (Fase B) — Capa 5')
  console.log(`Modo: ${EXECUTE ? '⚠️  EXECUTE (escribe)' : '🟢 DRY-RUN (no escribe)'}`)
  if (SOLO) console.log(`Filtro: solo colección "${SOLO}"`)
  console.log('='.repeat(78))
  console.log('')

  const empresa = await resolverEmpresaFundacional()
  if (!empresa) {
    console.error('❌ No existe ninguna empresa con esFundacional==true. Ejecutar primero')
    console.error('   scripts/migrate-mt-u1-fundacional.ts --execute (MT-U1). Se aborta sin escribir nada.')
    process.exit(1)
  }
  console.log(`Empresa fundacional: id=${empresa.id} nombre="${empresa.nombre}"`)
  console.log('')

  // ── Verificación de la lista oficial contra Firestore (solo advertencias) ──
  // No aborta nada: ni una colección desconocida ni una oficial "faltante"
  // (que puede estar simplemente vacía) son errores críticos.
  const verificacion = await verificarColeccionesContraFirestore(db)
  if (verificacion.desconocidas.length > 0) {
    console.log('⚠️  Colecciones en Firestore que NO están en la lista oficial ni en las globales conocidas:')
    for (const n of verificacion.desconocidas) console.log(`     - ${n}  (revisar si debe añadirse a COLECCIONES_OFICIALES)`)
    console.log('')
  }
  if (verificacion.faltantesEnFirestore.length > 0) {
    console.log('⚠️  Colecciones oficiales que listCollections() no reportó:')
    for (const n of verificacion.faltantesEnFirestore) console.log(`     - ${n}  (puede estar vacía, o el nombre puede ser incorrecto — verificar)`)
    console.log('')
  }

  const coleccionesAProcesar = SOLO
    ? COLECCIONES_OFICIALES.filter((c) => c.nombre === SOLO)
    : COLECCIONES_OFICIALES

  if (SOLO && coleccionesAProcesar.length === 0) {
    console.error(`❌ "--solo=${SOLO}" no coincide con ninguna colección oficial. Se aborta sin escribir nada.`)
    console.error(`   Colecciones válidas: ${COLECCIONES_OFICIALES.map((c) => c.nombre).join(', ')}`)
    process.exit(1)
  }

  const resultados: ResultadoColeccion[] = []
  for (const config of coleccionesAProcesar) {
    const r = await procesarColeccion(config, empresa.id)
    resultados.push(r)
    imprimirReporteColeccion(r)
  }

  const totales = resultados.reduce(
    (acc, r) => ({
      examinados: acc.examinados + r.examinados,
      tocados: acc.tocados + r.tocados,
      saltados: acc.saltados + r.saltados,
      desaparecidos: acc.desaparecidos + r.desaparecidos,
      anomalias: acc.anomalias + r.anomalias.length,
      erroresEscritura: acc.erroresEscritura + r.erroresEscritura.length,
      erroresLectura: acc.erroresLectura + r.erroresLectura.length,
    }),
    { examinados: 0, tocados: 0, saltados: 0, desaparecidos: 0, anomalias: 0, erroresEscritura: 0, erroresLectura: 0 }
  )
  const erroresTotal = totales.erroresEscritura + totales.erroresLectura

  const duracionGlobalMs = Date.now() - inicioGlobal

  console.log('')
  console.log('─'.repeat(78))
  console.log('Resumen global')
  console.log('─'.repeat(78))
  console.log(`Colecciones procesadas: ${resultados.length}`)
  console.log(`Documentos examinados:  ${totales.examinados}`)
  console.log(`Documentos tocados:     ${totales.tocados}${EXECUTE ? '' : ' (simulado — dry-run)'}`)
  console.log(`Documentos saltados:    ${totales.saltados} (ya estampados)`)
  console.log(`Documentos desaparecidos: ${totales.desaparecidos}${totales.desaparecidos > 0 ? ' (NOT_FOUND — normal, ver detalle por colección)' : ''}`)
  console.log(`Anomalías detectadas:   ${totales.anomalias}${totales.anomalias > 0 ? '  ⚠️  requieren revisión humana antes de MT-U4' : ''}`)
  console.log(`Errores de escritura:   ${totales.erroresEscritura} (permanentes, por documento — no detienen la colección)`)
  console.log(`Errores de lectura:     ${totales.erroresLectura} (detienen el resto de esa colección en esta corrida)`)
  console.log(`Duración total:         ${duracionGlobalMs}ms`)
  console.log('')

  // Invariante de auditoría: todo doc examinado debe caer en exactamente una
  // categoría (tocado | saltado | anomalía | desaparecido | error de
  // escritura) salvo que la colección haya abortado por un error de LECTURA
  // (en ese caso el conteo es parcial por diseño). Si no cuadra sin haber
  // habido un error de lectura, algo en la paginación no se recorrió
  // completo — señal de bug, no de dato.
  for (const r of resultados) {
    const cuentaCompleta = r.tocados + r.saltados + r.anomalias.length + r.desaparecidos + r.erroresEscritura.length
    if (r.erroresLectura.length === 0 && cuentaCompleta !== r.examinados) {
      console.warn(
        `⚠️  Inconsistencia de conteo en "${r.nombre}": ` +
          `tocados(${r.tocados})+saltados(${r.saltados})+anomalías(${r.anomalias.length})+` +
          `desaparecidos(${r.desaparecidos})+erroresEscritura(${r.erroresEscritura.length}) ` +
          `≠ examinados(${r.examinados}). Revisar antes de confiar en este reporte.`
      )
    }
  }

  if (!EXECUTE) {
    console.log('🟢 DRY-RUN completo. No se escribió nada. Para ejecutar: añade --execute')
  } else if (totales.anomalias > 0) {
    console.log('⚠️  EXECUTE completo con anomalías pendientes de revisión humana (ver detalle arriba).')
  } else if (erroresTotal > 0) {
    console.log('❌ EXECUTE completo con errores. Es SEGURO re-ejecutar (idempotente): completará lo pendiente.')
  } else {
    console.log('✅ EXECUTE completo sin anomalías ni errores.')
  }
  console.log('='.repeat(78))

  const huboFallos = resultados.some((r) => r.erroresLectura.length > 0 || r.erroresEscritura.length > 0)
  process.exit(huboFallos ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
