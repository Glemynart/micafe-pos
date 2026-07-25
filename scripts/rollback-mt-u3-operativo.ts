/**
 * rollback-mt-u3-operativo.ts — ROLLBACK del backfill operativo de MT-U3
 *
 * Revierte exactamente lo que escribió `migrate-mt-u3-operativo.ts`: por cada
 * documento de las 25 colecciones oficiales (MT-U3-helper-tenant-diseno.md §7)
 * cuyo `empresaId` sea igual al id de la empresa fundacional, borra el campo
 * (`FieldValue.delete()`) — salvo en `movimientos_inventario`, donde restaura
 * el literal `"default"` (el valor original antes del backfill, no ausencia
 * de campo — ver D-U2-3).
 *
 * LIMITACIÓN IMPORTANTE (léase antes de usar) ────────────────────────────────
 * Este rollback identifica "qué escribió el backfill" por VALOR
 * (`empresaId == fundacional`), no por una marca de migración dedicada (a
 * diferencia de `rollback-fase9d.ts`, que usa `origenMigracion`/
 * `migracionVersion` porque ahí conviven varios orígenes posibles para el
 * mismo tipo de documento). Aquí, con una única empresa, todo `empresaId`
 * correcto ES el id fundacional — no hay forma de distinguir "lo estampó el
 * backfill" de "lo estampó un servicio/el ledger ya migrado, correctamente,
 * después del backfill". Por diseño (evitar una escritura extra de marcador
 * en cada uno de los documentos que toca el backfill, que duplicaría su
 * huella), este script NO añade esa distinción.
 *
 * La frontera de seguridad NO es la misma para todas las colecciones, porque
 * el diseño (MT-U3-helper-tenant-diseno.md §9) activa el estampado legítimo
 * en dos momentos distintos:
 *
 *   • `movimientos_inventario`: el estampado legítimo nace en la **Capa 2**
 *     (reescritura del ledger, D-U2-3 — `EmitirMovimientoParams` deja de
 *     usar el literal `"default"`). Este rollback es seguro para el ledger
 *     únicamente MIENTRAS la Capa 2 no esté en producción.
 *   • Las otras 24 colecciones: el estampado legítimo nace en la **Capa 3**
 *     (helper de tenant en los servicios). Este rollback es seguro para
 *     ellas únicamente MIENTRAS la Capa 3 no esté en producción.
 *
 * En consecuencia:
 *   • Es SEGURO ejecutar este rollback en su totalidad únicamente MIENTRAS
 *     NI la Capa 2 NI la Capa 3 estén desplegadas en producción — es decir,
 *     como reverso del "paso 0" (Capa 5) antes de encender el resto de MT-U3.
 *   • Una vez la Capa correspondiente esté en producción (Capa 2 para el
 *     ledger, Capa 3 para el resto), este script ya NO es un "rollback" para
 *     esa colección: borraría/degradaría `empresaId` de documentos nuevos
 *     legítimos exactamente igual que de los históricos del backfill. En ese
 *     punto, revertir MT-U3 completo exige además revertir el código de la
 *     capa correspondiente (fuera de alcance de este script).
 *   • Las ANOMALÍAS que el backfill detectó y dejó intactas (empresaId con un
 *     valor que no era ni ausente ni el fundacional) tampoco las toca este
 *     rollback — nunca fueron modificadas, no hay nada que revertir en ellas.
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito --execute.
 *   • Idempotente: un documento sin `empresaId` (ya revertido) se salta.
 *     Re-ejecutar tras un rollback completo → 0 escrituras.
 *   • Mecanismo de escritura: `BulkWriter` (Admin SDK), no `WriteBatch` — mismo
 *     razonamiento que `migrate-mt-u3-operativo.ts`. Sigue usando
 *     deliberadamente `update()` (nunca `set(merge:true)`): un borrado
 *     concurrente en una colección volátil produce `NOT_FOUND` en ESE
 *     documento (se contabiliza como "desaparecido", nunca se recrea) sin
 *     afectar a los demás documentos de la página ni de las páginas
 *     siguientes — a diferencia de `WriteBatch`, donde un solo `NOT_FOUND`
 *     tumbaba la página completa por ser atómica. Política de reintentos: la
 *     recomendada por defecto del SDK (reintenta `UNAVAILABLE`/`ABORTED`
 *     hasta 10 intentos; no reintenta `NOT_FOUND`); no se instala un
 *     `onWriteError` propio.
 *   • Reanudable sin checkpoint persistido (mismo criterio que el backfill):
 *     un fallo parcial se resuelve simplemente re-ejecutando.
 *   • Paginación por `__name__` con `startAfter`, lotes ≤500.
 *   • Solo toca el campo `empresaId` en las 25 colecciones oficiales. No borra
 *     documentos, no toca ningún otro campo.
 *
 * Uso:
 *   Dry-run (por defecto):  npx tsx scripts/rollback-mt-u3-operativo.ts
 *   Dry-run (explícito):    npx tsx scripts/rollback-mt-u3-operativo.ts --dry-run
 *   Ejecución:              npx tsx scripts/rollback-mt-u3-operativo.ts --execute
 *   Ejecución (1 colección): npx tsx scripts/rollback-mt-u3-operativo.ts --execute --solo=ventas
 *
 * Ver MT-U3-helper-tenant-diseno.md §6.6.
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import {
  getFirestore,
  FieldValue,
  GrpcStatus,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { EMPRESAS_COLLECTION } from '../lib/empresas-service'
import { drenarPagina } from './lib/drenar-pagina'
import {
  type ColeccionConfig,
  COLECCIONES_OFICIALES,
  verificarColeccionesContraFirestore,
} from './mt-u3-colecciones-oficiales'

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')
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

interface ErrorEscritura {
  docId: string
  mensaje: string
}

interface ResultadoColeccion {
  nombre: string
  examinados: number
  /** Revertidos y CONFIRMADOS en este run (delete, o restauración de "default" en el ledger). */
  revertidos: number
  /** Ya no tenían empresaId==fundacional (ya revertido, o nunca tocado por el backfill). */
  saltados: number
  /** NOT_FOUND: el doc fue borrado entre la lectura y la escritura del rollback. Nunca recreado. */
  desaparecidos: number
  /** Errores PERMANENTES por documento (excluye NOT_FOUND). No detienen la colección. */
  erroresEscritura: ErrorEscritura[]
  /** Excepción fatal de LECTURA/paginación que detuvo el resto de la colección en esta corrida. */
  erroresLectura: string[]
  duracionMs: number
}

async function procesarColeccion(config: ColeccionConfig, empresaId: string): Promise<ResultadoColeccion> {
  const inicio = Date.now()
  const resultado: ResultadoColeccion = {
    nombre: config.nombre,
    examinados: 0,
    revertidos: 0,
    saltados: 0,
    desaparecidos: 0,
    erroresEscritura: [],
    erroresLectura: [],
    duracionMs: 0,
  }

  let cursor: QueryDocumentSnapshot | undefined
  const bulkWriter = EXECUTE ? db.bulkWriter() : null

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = db.collection(config.nombre).orderBy('__name__').limit(PAGE_SIZE)
      if (cursor) q = q.startAfter(cursor)
      const snap = await q.get()
      if (snap.empty) break

      const escriturasPagina: Promise<void>[] = []

      for (const doc of snap.docs) {
        resultado.examinados++
        const actual = doc.data().empresaId as string | undefined

        if (actual !== empresaId) {
          // No es un valor que el backfill haya podido escribir → no tocar
          // (incluye: ya revertido, nunca estampado, o anomalía preexistente).
          resultado.saltados++
          continue
        }

        if (EXECUTE && bulkWriter) {
          // Restaurar el valor original pre-backfill (D-U2-3) en el ledger, no
          // ausencia de campo; borrar el campo en el resto de colecciones.
          const p = (
            config.guardaEspecial === 'movimientos_inventario_default'
              ? bulkWriter.update(doc.ref, { empresaId: 'default' })
              : bulkWriter.update(doc.ref, { empresaId: FieldValue.delete() })
          )
            .then(() => {
              resultado.revertidos++
            })
            .catch((err: any) => {
              if (err.code === GrpcStatus.NOT_FOUND) {
                resultado.desaparecidos++
              } else {
                resultado.erroresEscritura.push({ docId: doc.id, mensaje: err.message })
              }
            })
          escriturasPagina.push(p)
        } else {
          // Dry-run: simulado, sin tocar Firestore.
          resultado.revertidos++
        }
      }

      // Mismo drenado que el backfill: BulkWriter bufferiza, y esperar las
      // promesas sin llamar antes a `flush()` cuelga cuando las escrituras
      // pendientes no completan un lote interno (ver scripts/lib/drenar-pagina.ts).
      await drenarPagina(bulkWriter, escriturasPagina)

      cursor = snap.docs[snap.docs.length - 1]
      if (snap.docs.length < PAGE_SIZE) break
    }

    if (bulkWriter) await bulkWriter.close()
  } catch (err) {
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
  const marca = r.erroresLectura.length > 0 || r.erroresEscritura.length > 0 ? '❌' : '✅'
  console.log(
    `${marca} ${r.nombre.padEnd(28)} examinados=${String(r.examinados).padStart(6)}  ` +
      `revertidos=${String(r.revertidos).padStart(6)}  saltados=${String(r.saltados).padStart(6)}  ` +
      `desaparecidos=${String(r.desaparecidos).padStart(3)}  (${r.duracionMs}ms)`
  )
  if (r.desaparecidos > 0) {
    console.log(`     ℹ️  ${r.desaparecidos} documento(s) desaparecieron (NOT_FOUND) entre lectura y escritura — normal en colecciones volátiles, no requiere acción.`)
  }
  for (const e of r.erroresEscritura) console.log(`     ❌ ERROR ESCRITURA doc=${e.docId}: ${e.mensaje}`)
  for (const e of r.erroresLectura) console.log(`     ❌ ERROR LECTURA: ${e} — resto de la colección omitido en esta corrida, re-ejecutar completa lo pendiente`)
}

async function main() {
  const inicioGlobal = Date.now()

  console.log('='.repeat(78))
  console.log('MT-U3 — ROLLBACK del backfill operativo (Fase B)')
  console.log(`Modo: ${EXECUTE ? '⚠️  EXECUTE (escribe)' : '🟢 DRY-RUN (no escribe)'}`)
  if (SOLO) console.log(`Filtro: solo colección "${SOLO}"`)
  console.log('='.repeat(78))
  console.log('')
  console.log('⚠️  Ver limitación en la cabecera del archivo: este rollback solo es seguro')
  console.log('    mientras la Capa 2 (ledger) y la Capa 3 (estampado en servicios) NO estén')
  console.log('    en producción — cada colección tiene su propia frontera (ver cabecera).')
  console.log('')

  const empresa = await resolverEmpresaFundacional()
  if (!empresa) {
    console.error('❌ No existe ninguna empresa con esFundacional==true. Nada que revertir. Se aborta.')
    process.exit(1)
  }
  console.log(`Empresa fundacional: id=${empresa.id} nombre="${empresa.nombre}"`)
  console.log('')

  // ── Verificación de la lista oficial contra Firestore (solo advertencias) ──
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
    console.error(`❌ "--solo=${SOLO}" no coincide con ninguna colección oficial. Se aborta.`)
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
      revertidos: acc.revertidos + r.revertidos,
      saltados: acc.saltados + r.saltados,
      desaparecidos: acc.desaparecidos + r.desaparecidos,
      erroresEscritura: acc.erroresEscritura + r.erroresEscritura.length,
      erroresLectura: acc.erroresLectura + r.erroresLectura.length,
    }),
    { examinados: 0, revertidos: 0, saltados: 0, desaparecidos: 0, erroresEscritura: 0, erroresLectura: 0 }
  )
  const erroresTotal = totales.erroresEscritura + totales.erroresLectura

  const duracionGlobalMs = Date.now() - inicioGlobal

  console.log('')
  console.log('─'.repeat(78))
  console.log('Resumen global')
  console.log('─'.repeat(78))
  console.log(`Colecciones procesadas: ${resultados.length}`)
  console.log(`Documentos examinados:  ${totales.examinados}`)
  console.log(`Documentos revertidos:  ${totales.revertidos}${EXECUTE ? '' : ' (simulado — dry-run)'}`)
  console.log(`Documentos saltados:    ${totales.saltados} (no coincidían con el fundacional)`)
  console.log(`Documentos desaparecidos: ${totales.desaparecidos}${totales.desaparecidos > 0 ? ' (NOT_FOUND — normal, ver detalle por colección)' : ''}`)
  console.log(`Errores de escritura:   ${totales.erroresEscritura} (permanentes, por documento — no detienen la colección)`)
  console.log(`Errores de lectura:     ${totales.erroresLectura} (detienen el resto de esa colección en esta corrida)`)
  console.log(`Duración total:         ${duracionGlobalMs}ms`)
  console.log('')

  if (!EXECUTE) {
    console.log('🟢 DRY-RUN completo. No se escribió nada. Para ejecutar: añade --execute')
  } else if (erroresTotal > 0) {
    console.log('❌ EXECUTE completo con errores. Es SEGURO re-ejecutar (idempotente): completará lo pendiente.')
  } else {
    console.log('✅ EXECUTE completo sin errores.')
  }
  console.log('='.repeat(78))

  const huboFallos = resultados.some((r) => r.erroresLectura.length > 0 || r.erroresEscritura.length > 0)
  process.exit(huboFallos ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
