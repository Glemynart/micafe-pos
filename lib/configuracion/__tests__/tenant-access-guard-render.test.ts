import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TenantAccessGuard } from '@/components/tenant/tenant-access-guard'
import { ConfiguracionContext } from '@/contexts/configuracion-empresa-context'
import { SaaSContext } from '@/contexts/saas-context'

type EstadoConfiguracion = 'CARGANDO' | 'LISTA' | 'AUSENTE' | 'INVALIDA' | 'ERROR'

const saasTenant = {
  empresaId: 'empresa-a',
  empresa: null,
  membresia: null,
  rol: null,
  loading: false,
  accesoTenantDenegado: false,
  errorVerificacionTenant: false,
  refresh: async () => {},
}

function renderGuard(
  estado: EstadoConfiguracion,
  overrides: Record<string, unknown> = {},
  saasOverrides: Record<string, unknown> = {},
) {
  const refrescar = async () => {}
  const configuracion = {
    empresaId: estado === 'LISTA' ? 'empresa-a' : null,
    estado,
    revision: estado === 'LISTA' ? 1 : null,
    error: estado === 'ERROR' ? new Error('Fallo de lectura') : null,
    proyecciones: estado === 'LISTA' ? {} : null,
    branding: {},
    refrescar,
    ejecutar: async () => ({ noOp: true }),
    ...overrides,
  }

  return renderToStaticMarkup(
    createElement(
      SaaSContext.Provider,
      { value: { ...saasTenant, ...saasOverrides } as never },
      createElement(
        ConfiguracionContext.Provider,
        { value: configuracion as never },
        createElement(TenantAccessGuard, null, createElement('span', null, 'POS operativo')),
      ),
    ),
  )
}

test('TenantAccessGuard muestra una opción recuperable si falla la verificación del tenant', () => {
  const html = renderGuard('LISTA', {}, { errorVerificacionTenant: true })

  assert.match(html, /No fue posible verificar el acceso al tenant/)
  assert.match(html, /Reintentar/)
  assert.doesNotMatch(html, /POS operativo/)
})

test('SaaSProvider siempre finaliza la carga si falla la verificación de sesión', () => {
  const source = readFileSync(resolve(process.cwd(), 'contexts/saas-context.tsx'), 'utf8')
  const listenerStart = source.indexOf('const unsubscribe = onIdTokenChanged')
  const refreshStart = source.indexOf('const refresh = useCallback')

  assert.ok(listenerStart >= 0, 'debe existir el listener de cambios de identidad')
  assert.ok(refreshStart > listenerStart, 'el refresh debe declararse después del listener')

  const listener = source.slice(listenerStart, refreshStart)
  const refresh = source.slice(refreshStart)

  assert.match(listener, /finally\s*\{[\s\S]*setLoading\(false\)/)
  assert.match(listener, /setErrorVerificacionTenant\(true\)/)
  assert.match(refresh, /finally\s*\{[\s\S]*setLoading\(false\)/)
  assert.match(refresh, /setErrorVerificacionTenant\(true\)/)
})

test('TenantAccessGuard renderiza spinner solamente mientras la configuracion esta CARGANDO', () => {
  const html = renderGuard('CARGANDO')

  assert.match(html, /Cargando/)
  assert.doesNotMatch(html, /no disponible/)
  assert.doesNotMatch(html, /POS operativo/)
})

for (const estado of ['AUSENTE', 'INVALIDA', 'ERROR'] as const) {
  test(`TenantAccessGuard renderiza el error recuperable para ${estado}`, () => {
    const html = renderGuard(estado)

    assert.match(html, /no disponible/)
    assert.match(html, /Reintentar/)
    assert.doesNotMatch(html, /Cargando/)
    assert.doesNotMatch(html, /POS operativo/)
  })
}

test('TenantAccessGuard deja pasar un tenant LISTA con configuracion y proyecciones exactas', () => {
  const html = renderGuard('LISTA')

  assert.match(html, /POS operativo/)
  assert.doesNotMatch(html, /no disponible/)
  assert.doesNotMatch(html, /Cargando/)
})

test('TenantAccessGuard no expone hijos cuando LISTA pertenece a otro tenant o no tiene proyecciones', () => {
  const html = renderGuard('LISTA', { empresaId: 'empresa-b', proyecciones: null })

  assert.match(html, /no disponible/)
  assert.doesNotMatch(html, /POS operativo/)
})

test('TenantAccessGuard conecta Reintentar con una nueva carga del provider', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/tenant/tenant-access-guard.tsx'), 'utf8')

  assert.match(source, /onClick=\{\(\) => \{ void refrescar\(\) \}\}/)
})
