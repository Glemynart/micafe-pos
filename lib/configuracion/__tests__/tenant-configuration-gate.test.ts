import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('MT-B7 mantiene rutas sin tenant disponibles y bloquea hijos operativos sin configuración LISTA', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/tenant/tenant-access-guard.tsx'), 'utf8')

  assert.match(source, /useConfiguracionEmpresa/)
  assert.match(source, /if \(!empresaId\) return <>{children}<\/>/)
  assert.match(source, /estado === "LISTA" && empresaConfiguracionId === empresaId && proyecciones/)
  assert.match(source, /estado === "CARGANDO"/)
  assert.match(source, /estado === "AUSENTE"/)
  assert.match(source, /estado === "INVALIDA"/)
  assert.match(source, /estado === "ERROR"/)
})

test('MT-B7 conserva LISTA durante el refresco periódico de la misma empresa', () => {
  const source = readFileSync(resolve(process.cwd(), 'contexts/configuracion-empresa-context.tsx'), 'utf8')

  assert.match(source, /const tieneConfiguracionActual = forzar && configuracionActual\.current\?\.empresaId === empresaId/)
  assert.match(source, /if \(!tieneConfiguracionActual\) setEstado\("CARGANDO"\)/)
  assert.match(source, /if \(tieneConfiguracionActual\) \{[\s\S]*setEstado\("LISTA"\)/)
})
