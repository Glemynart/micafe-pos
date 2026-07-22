/**
 * B1.8 — Analizador de paridad del singleton legacy.
 * Solo admite dry-run: lee configuracion/general una vez y nunca escribe.
 */
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { ejecutarAnalisisConfiguracionLegacy, serializarReporteParidadConfiguracionLegacy } from '../lib/configuracion/legado-paridad'

dotenv.config({ path: '.env.local' })

function cargarCuentaServicio(): object {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline) return JSON.parse(inline)
  const rutas = [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, process.env.GOOGLE_APPLICATION_CREDENTIALS, './service-account.local.json'].filter(Boolean) as string[]
  for (const ruta of rutas) if (fs.existsSync(ruta)) return JSON.parse(fs.readFileSync(ruta, 'utf8'))
  throw new Error('No se encontró una cuenta de servicio para la lectura dry-run.')
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2)
  if (argumentos.includes('--execute')) throw new Error('B1.8 no admite --execute: el analizador es exclusivamente dry-run.')
  if (argumentos.some((argumento) => argumento !== '--dry-run')) throw new Error('Argumento no soportado. Use únicamente --dry-run.')
  if (!getApps().length) initializeApp({ credential: cert(cargarCuentaServicio()) })
  const db = getFirestore()
  const reporte = await ejecutarAnalisisConfiguracionLegacy(async () => {
    const snapshot = await db.collection('configuracion').doc('general').get()
    return snapshot.exists ? snapshot.data() : undefined
  })
  process.stdout.write(serializarReporteParidadConfiguracionLegacy(reporte))
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
