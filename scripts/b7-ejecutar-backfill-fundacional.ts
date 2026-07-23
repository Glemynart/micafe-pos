/**
 * b7-ejecutar-backfill-fundacional.ts — Backfill Fundacional B7 (Cutover y Certificación Final)
 *
 * Asigna de forma explícita el campo `estadoOperativo` a todas las ventas históricas
 * creadas previo a B7, homogeneizando la base de datos para la Estrategia Única Post-Cutover
 * (ADR-SAAS-010).
 *
 * Asignaciones:
 *   • Si `venta.estado !== "anulada"` -> `estadoOperativo = "COMPLETO"`
 *   • Si `venta.estado === "anulada"` -> `estadoOperativo = "ANULADA_CON_EFECTOS"`
 *
 * SEGURIDAD & CONCURRENCIA:
 *   • DRY-RUN por defecto. Solo escribe si se especifica `--execute`.
 *   • Idempotente: procesa únicamente documentos que carezcan de `estadoOperativo`.
 *   • Procesamiento por lotes (batches de máximo 500 documentos).
 *   • Auditoría: escribe un registro inmutable en `migraciones_log/b7_backfill_ventas`.
 *   • Flag `--verify`: realiza un escaneo de solo lectura comprobando que 0 ventas carezcan de `estadoOperativo`.
 *
 * Uso:
 *   Dry-run (por defecto):  npx tsx scripts/b7-ejecutar-backfill-fundacional.ts
 *   Ejecución:              npx tsx scripts/b7-ejecutar-backfill-fundacional.ts --execute
 *   Verificación:           npx tsx scripts/b7-ejecutar-backfill-fundacional.ts --verify
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const argv = process.argv.slice(2)
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')
const VERIFY = argv.includes('--verify')

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

const BATCH_LIMIT = 500

interface Reporte {
  modo: 'VERIFY' | 'EXECUTE' | 'DRY-RUN'
  totalEscaneados: number
  completadosAsignados: number
  anuladosAsignados: number
  yaMigrados: number
  huerfanosRestantes: number
  resultado: 'SUCCESS' | 'FAILED'
  errores: string[]
}

async function verificarHuerfanos(): Promise<number> {
  const snapshot = await db.collection('ventas').get()
  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    if (data.estadoOperativo === undefined || data.estadoOperativo === null) {
      count++
    }
  }
  return count
}

async function main() {
  const reporte: Reporte = {
    modo: VERIFY ? 'VERIFY' : EXECUTE ? 'EXECUTE' : 'DRY-RUN',
    totalEscaneados: 0,
    completadosAsignados: 0,
    anuladosAsignados: 0,
    yaMigrados: 0,
    huerfanosRestantes: 0,
    resultado: 'SUCCESS',
    errores: [],
  }

  console.log('='.repeat(70))
  console.log('B7 — Script de Backfill Fundacional (estadoOperativo)')
  console.log(`Modo: ${reporte.modo}`)
  console.log('='.repeat(70))

  if (VERIFY) {
    console.log('Escaneando base de datos de ventas para verificación...')
    reporte.huerfanosRestantes = await verificarHuerfanos()
    console.log(`Ventas sin estadoOperativo encontradas: ${reporte.huerfanosRestantes}`)
    if (reporte.huerfanosRestantes > 0) {
      reporte.resultado = 'FAILED'
      reporte.errores.push(`Se encontraron ${reporte.huerfanosRestantes} ventas sin estadoOperativo.`)
    } else {
      console.log('✅ Verificación exitosa: 0 ventas huérfanas encontradas.')
    }
    process.exit(reporte.resultado === 'FAILED' ? 1 : 0)
  }

  const snapshot = await db.collection('ventas').get()
  reporte.totalEscaneados = snapshot.size

  let batch = db.batch()
  let opsEnBatch = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    if (data.estadoOperativo !== undefined && data.estadoOperativo !== null) {
      reporte.yaMigrados++
      continue
    }

    const esAnulada = data.estado === 'anulada'
    const nuevoEstado = esAnulada ? 'ANULADA_CON_EFECTOS' : 'COMPLETO'

    if (esAnulada) {
      reporte.anuladosAsignados++
    } else {
      reporte.completadosAsignados++
    }

    if (EXECUTE) {
      batch.update(doc.ref, {
        estadoOperativo: nuevoEstado,
        backfillB7En: Timestamp.now(),
      })
      opsEnBatch++

      if (opsEnBatch >= BATCH_LIMIT) {
        await batch.commit()
        batch = db.batch()
        opsEnBatch = 0
      }
    }
  }

  if (EXECUTE && opsEnBatch > 0) {
    await batch.commit()
  }

  if (EXECUTE) {
    // Registrar auditoría inmutable en migraciones_log
    const auditRef = db.collection('migraciones_log').doc('b7_backfill_ventas')
    await auditRef.set({
      tipo: 'b7_backfill_ventas',
      ejecutadoEn: Timestamp.now(),
      totalEscaneados: reporte.totalEscaneados,
      completadosAsignados: reporte.completadosAsignados,
      anuladosAsignados: reporte.anuladosAsignados,
      yaMigrados: reporte.yaMigrados,
      estado: 'EXITOSO',
    }, { merge: true })
  }

  reporte.huerfanosRestantes = await verificarHuerfanos()

  console.log('')
  console.log('Resumen de Ejecución:')
  console.log(`  Total escaneados:            ${reporte.totalEscaneados}`)
  console.log(`  Ya migrados (no-op):         ${reporte.yaMigrados}`)
  console.log(`  Asignados a COMPLETO:        ${reporte.completadosAsignados}`)
  console.log(`  Asignados a ANULADA_CON_...: ${reporte.anuladosAsignados}`)
  console.log(`  Huérfanos restantes:         ${reporte.huerfanosRestantes}`)
  console.log('='.repeat(70))

  if (reporte.errores.length > 0) {
    for (const err of reporte.errores) console.log(`⚠ ${err}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error inesperado en script de backfill:', err)
  process.exit(1)
})
