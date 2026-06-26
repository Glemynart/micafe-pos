/**
 * migrate-fase12b.ts  —  MIGRACIÓN FASE-12B (Operación Cocina)
 *
 * Actualiza documentos de `pedidos_activos` al nuevo modelo:
 *   - estado === 'abierto'    → activo = true
 *   - estado === 'pagado'     → activo = false
 *   - estado === 'cancelado'  → activo = false
 *   - Si falta `comandaIds`   → comandaIds = []
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito  --execute
 *   • Idempotente: si `activo` ya tiene el valor correcto y `comandaIds`
 *     existe, no escribe. Re-ejecutar nunca produce cambios adicionales.
 *   • Solo toca: pedidos_activos (update). Nada más.
 *
 * Uso:
 *   Dry-run:    FIREBASE_SERVICE_ACCOUNT_PATH=./<sa>.json npx tsx scripts/migrate-fase12b.ts
 *   Ejecutar:   ... npx tsx scripts/migrate-fase12b.ts --execute
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const EXECUTE = process.argv.includes('--execute')
const COLLECTION = 'pedidos_activos'

function loadServiceAccount(): any {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline && inline.trim().length > 2) {
    try {
      return JSON.parse(inline)
    } catch {
      /* cae a modo archivo */
    }
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

function computeActivo(estado: string | undefined): boolean {
  return estado === 'abierto'
}

async function migrate() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  MIGRACIÓN FASE-12B — pedidos_activos`)
  console.log(`  Modo: ${EXECUTE ? '🔴 EJECUCIÓN REAL' : '🟡 DRY-RUN (sin escrituras)'}`)
  console.log(`${'═'.repeat(60)}\n`)

  const snapshot = await db.collection(COLLECTION).get()
  console.log(`📋 Documentos encontrados: ${snapshot.size}`)

  let needsMigration = 0
  let alreadyCorrect = 0
  let migrated = 0
  let errors = 0

  const toMigrate: Array<{ id: string, patch: Record<string, any>, reason: string[] }> = []

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const estado: string | undefined = data.estado
    const expectedActivo = computeActivo(estado)
    const currentActivo = data.activo
    const hasComandaIds = Array.isArray(data.comandaIds)

    const needsActivoFix = currentActivo !== expectedActivo
    const needsComandaIds = !hasComandaIds

    if (!needsActivoFix && !needsComandaIds) {
      alreadyCorrect++
      continue
    }

    needsMigration++
    const patch: Record<string, any> = {}
    const reason: string[] = []

    if (needsActivoFix) {
      patch.activo = expectedActivo
      reason.push(`activo: ${currentActivo} → ${expectedActivo}`)
    }
    if (needsComandaIds) {
      patch.comandaIds = []
      reason.push('comandaIds: [] (nuevo)')
    }

    toMigrate.push({ id: doc.id, patch, reason })
  }

  console.log(`✅ Ya correctos: ${alreadyCorrect}`)
  console.log(`🔧 Requieren migración: ${needsMigration}\n`)

  if (toMigrate.length === 0) {
    console.log('✨ No hay documentos que migrar.\n')
    return
  }

  for (const { id, patch, reason } of toMigrate) {
    const label = `  [${id.substring(0, 12)}...] ${reason.join(', ')}`

    if (!EXECUTE) {
      console.log(`  🟡 DRY: ${label}`)
      migrated++
      continue
    }

    try {
      await db.collection(COLLECTION).doc(id).update(patch)
      console.log(`  ✅ ${label}`)
      migrated++
    } catch (e: any) {
      console.error(`  ❌ ERROR ${id}: ${e.message}`)
      errors++
    }
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  RESUMEN`)
  console.log(`${'─'.repeat(60)}`)
  console.log(`  Total documentos:      ${snapshot.size}`)
  console.log(`  Ya correctos:          ${alreadyCorrect}`)
  console.log(`  Migrados:              ${migrated}${!EXECUTE ? ' (dry-run)' : ''}`)
  console.log(`  Errores:               ${errors}`)
  console.log(`${'─'.repeat(60)}\n`)
}

async function verify() {
  console.log(`${'═'.repeat(60)}`)
  console.log(`  VERIFICACIÓN POST-MIGRACIÓN`)
  console.log(`${'═'.repeat(60)}\n`)

  const snapshot = await db.collection(COLLECTION).get()
  let ok = true

  let openInactive = 0
  let paidActive = 0
  let cancelledActive = 0
  let missingComandaIds = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const estado = data.estado
    const activo = data.activo

    if (estado === 'abierto' && activo !== true) {
      openInactive++
      console.log(`  ❌ ${doc.id}: abierto pero activo=${activo}`)
      ok = false
    }
    if (estado === 'pagado' && activo !== false) {
      paidActive++
      console.log(`  ❌ ${doc.id}: pagado pero activo=${activo}`)
      ok = false
    }
    if (estado === 'cancelado' && activo !== false) {
      cancelledActive++
      console.log(`  ❌ ${doc.id}: cancelado pero activo=${activo}`)
      ok = false
    }
    if (!Array.isArray(data.comandaIds)) {
      missingComandaIds++
      console.log(`  ⚠️  ${doc.id}: falta comandaIds`)
      ok = false
    }
  }

  console.log()
  if (ok) {
    console.log('  ✅ Todos los documentos cumplen las invariantes.\n')
  } else {
    console.log(`  Abiertos sin activo=true:    ${openInactive}`)
    console.log(`  Pagados con activo=true:     ${paidActive}`)
    console.log(`  Cancelados con activo=true:  ${cancelledActive}`)
    console.log(`  Sin comandaIds:              ${missingComandaIds}\n`)
  }
}

async function main() {
  await migrate()
  if (EXECUTE) {
    await verify()
  } else {
    console.log('ℹ️  Ejecuta con --execute para aplicar los cambios y verificar.\n')
  }
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
