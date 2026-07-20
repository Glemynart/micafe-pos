/**
 * set-claims-mt-u2.ts — MT-U2: acuñación de custom claims {empresaId, rol}
 *
 * Lee la membresía canónica de la empresa fundacional (`empresas` con
 * `esFundacional==true`, sin hardcodear su id opaco — MT-U1 D-U1-1) y acuña
 * en Firebase Auth el custom claim
 * `{ empresaId, rol }` para cada usuario existente.
 *
 * Desde MT-U5B, el claim es un espejo de `membresias/{empresaId}_{uid}.rol`.
 * Este script no cambia ningún guard, provider, servicio ni regla de Firestore.
 *
 * SEGURIDAD:
 *   • DRY-RUN por defecto. Solo escribe con el flag explícito --execute.
 *   • Idempotente: compara el claim objetivo con el actual antes de
 *     escribir; si coinciden, no realiza ninguna llamada a Auth.
 *   • Preserva cualquier otra clave de customClaims que ya existiera
 *     (merge), en vez de sobreescribir el objeto completo — evita clobber
 *     accidental de claims ajenos a este bloque (setCustomUserClaims
 *     reemplaza el objeto entero por diseño del SDK).
 *   • Aborta sin escribir nada si no existe la empresa fundacional
 *     (`esFundacional==true`) — precondición de MT-U1 (R6, ya cerrada).
 *   • Roles fuera del contrato de membresía conocido se omiten (no se acuña su
 *     claim) y se reportan como advertencia, sin abortar el resto de la
 *     corrida.
 *
 * Uso:
 *   Dry-run (por defecto):  npx tsx scripts/set-claims-mt-u2.ts
 *   Dry-run (explícito):    npx tsx scripts/set-claims-mt-u2.ts --dry-run
 *   Ejecución:              npx tsx scripts/set-claims-mt-u2.ts --execute
 *
 * Ver MT-U2-runtime-saas-diseno.md §5 y §7 (Capa 2).
 */

import * as dotenv from 'dotenv'
import * as fs from 'fs'
dotenv.config({ path: '.env.local' })

import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { EMPRESAS_COLLECTION } from '../lib/empresas-service'
import type { RolMembresia } from '../lib/membresias-service'

const argv = process.argv.slice(2)
// --dry-run gana si se combinan ambos flags por error: seguro por defecto.
const EXECUTE = argv.includes('--execute') && !argv.includes('--dry-run')

const ROLES_CONOCIDOS: readonly RolMembresia[] = ['admin', 'supervisor', 'cajero', 'cocinero', 'marketing']

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
const auth = getAuth()

interface MembresiaMin {
  uid: string
  rol?: string
  estado?: string
  activo?: boolean
}

interface ClaimsActuales {
  empresaId?: string
  rol?: string
  [key: string]: unknown
}

interface ReporteUsuario {
  uid: string
  rolMembresia: string | null
  accion: 'creado' | 'actualizado' | 'sin_cambios' | 'omitido_rol_invalido' | 'omitido_sin_auth'
}

interface Reporte {
  modo: 'DRY-RUN' | 'EXECUTE'
  empresaId: string | null
  usuarios: ReporteUsuario[]
  errores: string[]
  resultado: 'SUCCESS' | 'FAILED'
}

async function resolverEmpresaFundacional(): Promise<string | null> {
  const snap = await db.collection(EMPRESAS_COLLECTION).where('esFundacional', '==', true).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
}

async function obtenerMembresias(empresaId: string): Promise<MembresiaMin[]> {
  const snap = await db.collection('membresias').where('empresaId', '==', empresaId).get()
  return snap.docs.map((d) => ({ uid: d.data().uid, rol: d.data().rol, estado: d.data().estado, activo: d.data().activo }))
}

function esRolValido(rol: string | undefined): rol is RolMembresia {
  return !!rol && (ROLES_CONOCIDOS as readonly string[]).includes(rol)
}

function imprimirReporte(r: Reporte) {
  console.log('='.repeat(70))
  console.log('MT-U2 — Capa 2: Acuñación de custom claims {empresaId, rol}')
  console.log(`Modo: ${r.modo}`)
  console.log('='.repeat(70))
  console.log('')
  console.log(`Empresa fundacional: ${r.empresaId ?? '(no encontrada)'}`)
  console.log('')
  console.log(`Usuarios procesados: ${r.usuarios.length}`)
  for (const u of r.usuarios) {
    console.log(`  - uid=${u.uid} rol(membresía)=${u.rolMembresia ?? '(sin rol)'} → ${u.accion}`)
  }
  console.log('')
  console.log(`Errores/advertencias: ${r.errores.length === 0 ? 'ninguno' : ''}`)
  for (const e of r.errores) console.log(`  ⚠ ${e}`)
  console.log('')
  console.log(`Resultado: ${r.resultado}`)
  console.log('='.repeat(70))
}

async function main() {
  const reporte: Reporte = {
    modo: EXECUTE ? 'EXECUTE' : 'DRY-RUN',
    empresaId: null,
    usuarios: [],
    errores: [],
    resultado: 'SUCCESS',
  }

  const empresaId = await resolverEmpresaFundacional()
  reporte.empresaId = empresaId

  if (!empresaId) {
    reporte.errores.push(
      'No existe ninguna empresa con esFundacional==true. Ejecutar primero scripts/migrate-mt-u1-fundacional.ts --execute (MT-U1). Se aborta sin escribir nada.'
    )
    reporte.resultado = 'FAILED'
    imprimirReporte(reporte)
    process.exit(1)
  }

  const membresias = await obtenerMembresias(empresaId)

  for (const membresia of membresias) {
    if (membresia.estado !== 'activa' || membresia.activo !== true || !esRolValido(membresia.rol)) {
      reporte.usuarios.push({ uid: membresia.uid, rolMembresia: membresia.rol ?? null, accion: 'omitido_rol_invalido' })
      reporte.errores.push(
        `uid=${membresia.uid}: membresía activa con rol="${membresia.rol ?? '(vacío)'}" inválido o estado inactivo. Claim NO acuñado.`
      )
      continue
    }

    let claimsActuales: ClaimsActuales = {}
    try {
      const authUser = await auth.getUser(membresia.uid)
      claimsActuales = (authUser.customClaims as ClaimsActuales) ?? {}
    } catch (err) {
      reporte.usuarios.push({ uid: membresia.uid, rolMembresia: membresia.rol, accion: 'omitido_sin_auth' })
      reporte.errores.push(`uid=${membresia.uid}: no existe en Firebase Auth (${(err as Error).message}). Claim NO acuñado.`)
      continue
    }

    const sinCambios = claimsActuales.empresaId === empresaId && claimsActuales.rol === membresia.rol
    const accion: ReporteUsuario['accion'] = sinCambios
      ? 'sin_cambios'
      : claimsActuales.empresaId === undefined
        ? 'creado'
        : 'actualizado'

    reporte.usuarios.push({ uid: membresia.uid, rolMembresia: membresia.rol, accion })

    if (EXECUTE && !sinCambios) {
      const nuevosClaims: ClaimsActuales = { ...claimsActuales, empresaId, rol: membresia.rol }
      await auth.setCustomUserClaims(membresia.uid, nuevosClaims)
    }
  }

  imprimirReporte(reporte)
  process.exit(reporte.resultado === 'FAILED' ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
