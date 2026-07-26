import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withEmpresaId } from '@/lib/tenant'
import {
  obtenerIncorporacionSesionTransicionDirecta,
  TenantSinSesionError,
} from '@/lib/tenant-context'

test('obtiene la incorporacion de una sesion DIRECTA_TEMP restaurable', () => {
  assert.equal(
    obtenerIncorporacionSesionTransicionDirecta({ authStage: 'DIRECTA_TEMP', incorporacionId: 'incorporacion-1' }),
    'incorporacion-1',
  )
})

test('no restaura una sesion sin incorporacion DIRECTA_TEMP valida', () => {
  assert.equal(obtenerIncorporacionSesionTransicionDirecta({}), null)
  assert.equal(obtenerIncorporacionSesionTransicionDirecta({ authStage: 'DIRECTA_TEMP' }), null)
  assert.equal(obtenerIncorporacionSesionTransicionDirecta({ authStage: 'DIRECTA_TEMP', incorporacionId: '  ' }), null)
  assert.equal(obtenerIncorporacionSesionTransicionDirecta({ authStage: 'DIRECTA_TEMP', incorporacionId: 1 }), null)
})

// ─── Estampado (withEmpresaId) ─────────────────────────────────────────────
//
// Única función pura y síncrona del helper: el mismo merge que usa
// `stampEmpresaId` por debajo, sin la resolución ambiental. Es lo único del
// módulo testeable sin una sesión de Firebase Auth real o simulada (ver nota
// al final del archivo).

test('withEmpresaId añade empresaId sin mutar el objeto original', () => {
  const original = { nombre: 'Café Atrato', total: 9000 }
  const resultado = withEmpresaId('empresa-1', original)

  assert.deepEqual(resultado, { nombre: 'Café Atrato', total: 9000, empresaId: 'empresa-1' })
  assert.deepEqual(original, { nombre: 'Café Atrato', total: 9000 }) // sin mutación
  assert.notEqual(resultado, original) // objeto nuevo, no el mismo por referencia
})

test('withEmpresaId preserva todos los campos existentes del dato', () => {
  const venta = { items: [{ id: 'CAF01', cantidad: 2 }], metodoPago: 'efectivo', total: 9000 }
  const resultado = withEmpresaId('empresa-2', venta)

  assert.equal(resultado.metodoPago, 'efectivo')
  assert.equal(resultado.total, 9000)
  assert.deepEqual(resultado.items, [{ id: 'CAF01', cantidad: 2 }])
  assert.equal(resultado.empresaId, 'empresa-2')
})

test('withEmpresaId sobrescribe un empresaId previo si el dato ya traía uno', () => {
  // Comportamiento documentado, no accidental: withEmpresaId es la ÚNICA vía
  // de estampado — si el llamador pasa un empresaId propio en `data`, el
  // parámetro explícito de la función es la fuente de verdad.
  const dato = { empresaId: 'valor-viejo', x: 1 }
  const resultado = withEmpresaId('empresa-correcta', dato)

  assert.equal(resultado.empresaId, 'empresa-correcta')
})

test('withEmpresaId funciona con un objeto vacío', () => {
  const resultado = withEmpresaId('empresa-3', {})
  assert.deepEqual(resultado, { empresaId: 'empresa-3' })
})

// ─── TenantSinSesionError ──────────────────────────────────────────────────

test('TenantSinSesionError expone un mensaje por defecto y su propio name', () => {
  const err = new TenantSinSesionError()
  assert.equal(err.name, 'TenantSinSesionError')
  assert.match(err.message, /no hay sesión activa/i)
  assert.ok(err instanceof Error)
})

test('TenantSinSesionError acepta un mensaje específico (caso "sin fundacional")', () => {
  const err = new TenantSinSesionError('mensaje específico de prueba')
  assert.equal(err.message, 'mensaje específico de prueba')
  assert.equal(err.name, 'TenantSinSesionError')
})

// ─── LÍMITE DE COBERTURA (léase antes de asumir que falta cobertura) ───────
//
// getEmpresaId(), stampEmpresaId(), tenantWhere() y tenantQuery() —y por
// extensión resolverEmpresaIdActivo()— dependen de `auth.currentUser` y
// `getIdTokenResult()` de Firebase Auth (cliente). Ejercitar sus tres rutas
// reales (claim presente / fallback a empresa fundacional / sin sesión)
// exige una sesión de Firebase Auth real (emulador) o un doble de prueba del
// SDK — ninguno de los dos existe hoy en este proyecto: la suite actual
// (`test:tickets`, `test:reimpresion`) solo cubre funciones puras, sin
// dependencias externas.
//
// Introducir esa infraestructura (emulador de Firestore/Auth, o mocking de
// módulos) es una decisión que excede el alcance de la Capa 1 tal como se
// entendió aquí — se deja constancia explícita en vez de omitirla en
// silencio o inventar una simulación que no pruebe el código real.
test(
  'getEmpresaId/stampEmpresaId/tenantWhere/tenantQuery: rutas claim/fallback/sin-sesión',
  { skip: 'Requiere sesión de Firebase Auth real o mock del SDK — infraestructura no presente en este proyecto (ver comentario arriba).' },
  () => {}
)
