import assert from 'node:assert/strict'
import test from 'node:test'
import { listarSalasPublicas } from './salas/route'
import { consultarDisponibilidad } from './disponibilidad/route'
import { crearHoldPublico } from './hold/route'
import { cancelarHoldPendiente } from './cancelar/route'

type Datos = Record<string, Record<string, Record<string, any>>>

function dbDePrueba(datos: Datos) {
  const escrituras: Array<{ coleccion: string; id: string; data: Record<string, any> }> = []
  let id = 0
  const ref = (coleccion: string, id: string) => ({ coleccion, id })
  const snapshot = (data: Record<string, any> | undefined) => ({ exists: !!data, data: () => data })
  const db = {
    collection(coleccion: string) {
      return {
        doc(docId?: string) {
          return ref(coleccion, docId || `${coleccion}-${++id}`)
        },
        where(campo: string, _op: string, valor: unknown) {
          const docs = Object.entries(datos[coleccion] || {})
            .filter(([, data]) => data[campo] === valor)
            .map(([docId, data]) => ({ id: docId, data: () => data }))
          return { limit: (n: number) => ({ get: async () => ({ size: Math.min(docs.length, n), docs: docs.slice(0, n) }) }), get: async () => ({ docs }) }
        },
      }
    },
    async runTransaction<T>(callback: (tx: any) => Promise<T>) {
      return callback({
        get: async (r: ReturnType<typeof ref>) => snapshot(datos[r.coleccion]?.[r.id]),
        set: (r: ReturnType<typeof ref>, data: Record<string, any>) => {
          datos[r.coleccion] ||= {}
          datos[r.coleccion][r.id] = { ...(datos[r.coleccion][r.id] || {}), ...data }
          escrituras.push({ ...r, data })
        },
        update: (r: ReturnType<typeof ref>, data: Record<string, any>) => {
          datos[r.coleccion][r.id] = { ...datos[r.coleccion][r.id], ...data }
          escrituras.push({ ...r, data })
        },
      })
    },
  }
  return { db: db as unknown as FirebaseFirestore.Firestore, datos, escrituras }
}

test('salas: el slug resuelve unicamente el catalogo del tenant correspondiente', async () => {
  const prueba = dbDePrueba({
    empresas: { a: { slug: 'cafe-a', estado: 'activa' }, b: { slug: 'cafe-b', estado: 'activa' } },
    mesas: { 'sala-a': { empresaId: 'a', nombre: 'Sala A' }, 'sala-b': { empresaId: 'b', nombre: 'Sala B' } },
  })

  const res = await listarSalasPublicas(new Request('https://app.test/api/reservas/salas?slug=cafe-b'), prueba.db)
  assert.deepEqual(await res.json(), { salas: [{ id: 'sala-b', nombre: 'Sala B' }] })
})

test('disponibilidad: materializa agenda desde la mesa y bloquea tenants no operativos', async () => {
  const prueba = dbDePrueba({ empresas: { b: { estado: 'trial' } }, mesas: { 'mesa-b': { empresaId: 'b', espacioId: 'espacio-b' } }, agendas: {} })
  const res = await consultarDisponibilidad(new Request('https://app.test/api/reservas/disponibilidad?mesaId=mesa-b&fechaLocal=2026-07-28'), prueba.db)
  assert.equal(res.status, 200)
  assert.equal(prueba.datos.agendas['mesa-b_2026-07-28'].empresaId, 'b')

  prueba.datos.empresas.b.estado = 'suspendida'
  const suspendida = await consultarDisponibilidad(new Request('https://app.test/api/reservas/disponibilidad?mesaId=mesa-b&fechaLocal=2026-07-29'), prueba.db)
  assert.equal(suspendida.status, 409)
})

test('disponibilidad: dos tenants operativos materializan y consultan agendas independientes', async () => {
  const prueba = dbDePrueba({
    empresas: { a: { estado: 'activa' }, b: { estado: 'trial' } },
    mesas: {
      'mesa-a': { empresaId: 'a', espacioId: 'espacio-a' },
      'mesa-b': { empresaId: 'b', espacioId: 'espacio-b' },
    },
    agendas: {},
  })

  assert.equal((await consultarDisponibilidad(new Request('https://app.test/api/reservas/disponibilidad?mesaId=mesa-a&fechaLocal=2026-07-28'), prueba.db)).status, 200)
  assert.equal((await consultarDisponibilidad(new Request('https://app.test/api/reservas/disponibilidad?mesaId=mesa-b&fechaLocal=2026-07-28'), prueba.db)).status, 200)
  assert.equal(prueba.datos.agendas['mesa-a_2026-07-28'].empresaId, 'a')
  assert.equal(prueba.datos.agendas['mesa-b_2026-07-28'].empresaId, 'b')
})

test('hold: la mesa es la autoridad y rechaza espacio o agenda cruzados', async () => {
  const body = { reservaData: { clienteNombre: 'Ana', clienteEmail: 'ana@test.co', clienteTelefono: '1', mesaId: 'mesa-b', espacioId: 'espacio-b', fechaInicio: '2026-07-28T10:00:00Z', fechaFin: '2026-07-28T11:00:00Z', estadoPago: 'pendiente' as const, estadoReserva: 'activa' as const, montoTotal: 10000, referenciaPago: 'r', fechaCreacion: '2026-07-28T00:00:00Z' }, fechaLocal: '2026-07-28', bloquesSolicitados: ['10'] }
  const prueba = dbDePrueba({ empresas: { b: { estado: 'activa' } }, mesas: { 'mesa-b': { empresaId: 'b', espacioId: 'espacio-b' } }, agendas: { 'mesa-b_2026-07-28': { empresaId: 'a', mesaId: 'mesa-b', espacioId: 'espacio-b', bloques: {} } }, reservas: {} })
  const cruzada = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(body) }), prueba.db)
  assert.equal(cruzada.status, 409)
  assert.equal(prueba.escrituras.length, 0)

  prueba.datos.agendas = {}
  const espacioAjeno = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify({ ...body, reservaData: { ...body.reservaData, espacioId: 'espacio-a' } }) }), prueba.db)
  assert.equal(espacioAjeno.status, 409)
  assert.equal(prueba.escrituras.length, 0)

  prueba.datos.empresas.b.estado = 'suspendida'
  const suspendida = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(body) }), prueba.db)
  assert.equal(suspendida.status, 409)
  assert.equal(prueba.escrituras.length, 0)

  prueba.datos.empresas.b.estado = 'activa'
  const correcto = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(body) }), prueba.db)
  assert.equal(correcto.status, 200)
  assert.equal(Object.values(prueba.datos.reservas)[0].empresaId, 'b')
})

test('hold: dos tenants crean reservas y agendas sin afectarse entre sí', async () => {
  const prueba = dbDePrueba({
    empresas: { a: { estado: 'activa' }, b: { estado: 'activa' } },
    mesas: {
      'mesa-a': { empresaId: 'a', espacioId: 'espacio-a' },
      'mesa-b': { empresaId: 'b', espacioId: 'espacio-b' },
    },
    agendas: {}, reservas: {},
  })
  const crearBody = (tenant: 'a' | 'b') => ({
    reservaData: {
      clienteNombre: `Cliente ${tenant}`, clienteEmail: `${tenant}@test.co`, clienteTelefono: '1',
      mesaId: `mesa-${tenant}`, espacioId: `espacio-${tenant}`, fechaInicio: '2026-07-28T10:00:00Z', fechaFin: '2026-07-28T11:00:00Z',
      estadoPago: 'pendiente' as const, estadoReserva: 'activa' as const, montoTotal: 10000, referenciaPago: `r-${tenant}`, fechaCreacion: '2026-07-28T00:00:00Z',
    },
    fechaLocal: '2026-07-28', bloquesSolicitados: ['10'],
  })

  assert.equal((await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(crearBody('a')) }), prueba.db)).status, 200)
  assert.equal((await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(crearBody('b')) }), prueba.db)).status, 200)

  assert.deepEqual(Object.values(prueba.datos.reservas).map((reserva: any) => reserva.empresaId).sort(), ['a', 'b'])
  assert.equal(prueba.datos.agendas['mesa-a_2026-07-28'].empresaId, 'a')
  assert.equal(prueba.datos.agendas['mesa-b_2026-07-28'].empresaId, 'b')
})

test('cancelación: cada tenant libera únicamente los bloques de su propia reserva', async () => {
  const ahora = new Date('2026-07-20T12:00:00.000Z')
  const prueba = dbDePrueba({
    empresas: { a: { estado: 'activa' }, b: { estado: 'activa' } },
    mesas: {
      'mesa-a': { empresaId: 'a', espacioId: 'espacio-a' },
      'mesa-b': { empresaId: 'b', espacioId: 'espacio-b' },
    },
    reservas: {
      'reserva-a': { empresaId: 'a', estadoReserva: 'activa', estadoPago: 'pendiente', holdExpira: '2026-07-20T12:15:00.000Z', mesaId: 'mesa-a', espacioId: 'espacio-a', fechaLocal: '2026-07-20', bloques: ['10'] },
      'reserva-b': { empresaId: 'b', estadoReserva: 'activa', estadoPago: 'pendiente', holdExpira: '2026-07-20T12:15:00.000Z', mesaId: 'mesa-b', espacioId: 'espacio-b', fechaLocal: '2026-07-20', bloques: ['10'] },
    },
    agendas: {
      'mesa-a_2026-07-20': { empresaId: 'a', mesaId: 'mesa-a', espacioId: 'espacio-a', bloques: { '10': { reservaId: 'reserva-a' } } },
      'mesa-b_2026-07-20': { empresaId: 'b', mesaId: 'mesa-b', espacioId: 'espacio-b', bloques: { '10': { reservaId: 'reserva-b' } } },
    },
  })

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-a', ahora), 'CANCELABLE')
  assert.equal(prueba.datos.reservas['reserva-a'].estadoReserva, 'cancelada')
  assert.equal(prueba.datos.agendas['mesa-a_2026-07-20'].bloques['10'], undefined)
  assert.equal(prueba.datos.reservas['reserva-b'].estadoReserva, 'activa')
  assert.deepEqual(prueba.datos.agendas['mesa-b_2026-07-20'].bloques, { '10': { reservaId: 'reserva-b' } })

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-b', ahora), 'CANCELABLE')
  assert.equal(prueba.datos.agendas['mesa-b_2026-07-20'].bloques['10'], undefined)
})
