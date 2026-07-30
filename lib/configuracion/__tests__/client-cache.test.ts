import assert from 'node:assert/strict'
import test from 'node:test'
import { CacheConfiguracionEmpresa } from '../client-cache'
import { crearPlantillaConfiguracionRevision1 } from '../plantilla'
const cfg = (empresaId: string, revision: number) => ({ ...crearPlantillaConfiguracionRevision1({ empresaId, nombreComercial: empresaId, creadaEn: {}, actualizadaEn: {}, ultimaMutacion: { actorTipo: 'SYSTEM' as const, actorId: 's', origen: 'BOOTSTRAP' as const, commandId: 'c', correlationId: 'x' } }), revision })
test('B1.5 particiona cache por tenant y conserva revisión confirmada', () => { const c = new CacheConfiguracionEmpresa(); c.guardar(cfg('a', 1)); c.guardar(cfg('b', 2)); assert.equal(c.obtener('a')?.revision, 1); c.invalidar('a', 1); assert.equal(c.obtener('a')?.revision, 1); assert.equal(c.obtener('b')?.revision, 2) })
test('B1.5 invalida al cambiar revisión o tenant', () => { const c = new CacheConfiguracionEmpresa(); c.guardar(cfg('a', 1)); c.invalidar('a', 2); assert.equal(c.obtener('a'), undefined); c.guardar(cfg('b', 1)); c.invalidar(); assert.equal(c.obtener('b'), undefined) })
test('B1.5 conserva una caché solo cuando ya representa la revisión confirmada', () => { const c = new CacheConfiguracionEmpresa(); c.guardar(cfg('a', 2)); c.invalidar('a', 2); assert.equal(c.obtener('a')?.revision, 2); c.invalidar('a'); assert.equal(c.obtener('a'), undefined) })
