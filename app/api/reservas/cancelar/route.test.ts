import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelarHoldPendiente } from './service'

const ahora = new Date('2026-07-20T12:00:00.000Z')
const empresaId = 'cafe-atrato'

function reservaHold(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    empresaId,
    estadoReserva: 'activa',
    estadoPago: 'pendiente',
    holdExpira: '2026-07-20T12:15:00.000Z',
    mesaId: 'sala-a',
    espacioId: 'salas-coworking',
    fechaLocal: '2026-07-20',
    bloques: ['08'],
    ...overrides,
  }
}

function dbDePrueba(reserva?: Record<string, unknown>) {
  const datos: Record<string, Record<string, Record<string, unknown>>> = {
    empresas: { [empresaId]: { estado: 'activa' } },
    reservas: reserva ? { 'reserva-1': reserva } : {},
    mesas: {
      'sala-a': { empresaId, espacioId: 'salas-coworking' },
    },
    agendas: {
      'sala-a_2026-07-20': { empresaId, mesaId: 'sala-a', espacioId: 'salas-coworking', bloques: { '08': { reservaId: 'reserva-1' } } },
    },
  }
  const escrituras: Array<{ coleccion: string, id: string }> = []

  const db = {
    collection(coleccion: string) {
      return {
        doc(id: string) {
          return { coleccion, id }
        },
      }
    },
    async runTransaction<T>(callback: (tx: any) => Promise<T>) {
      return callback({
        async get(ref: { coleccion: string, id: string }) {
          const data = datos[ref.coleccion]?.[ref.id]
          return { exists: !!data, data: () => data }
        },
        update(ref: { coleccion: string, id: string }, cambios: Record<string, unknown>) {
          Object.assign(datos[ref.coleccion][ref.id], cambios)
          escrituras.push(ref)
        },
      })
    },
  }

  return { db: db as unknown as FirebaseFirestore.Firestore, datos, escrituras }
}

test('cancelación pública: cancela un hold pendiente vigente de Café Atrato', async () => {
  const prueba = dbDePrueba(reservaHold())

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'CANCELABLE')
  assert.equal(prueba.datos.reservas['reserva-1'].estadoReserva, 'cancelada')
  assert.equal(prueba.escrituras.length, 2)
})

test('cancelaci\u00f3n p\u00fablica: no libera la agenda si mesa o agenda pertenecen a otro tenant', async () => {
  const prueba = dbDePrueba(reservaHold())
  prueba.datos.mesas['sala-a'].empresaId = 'cafe-otro'

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'RESERVA_INCONSISTENTE')
  assert.equal(prueba.escrituras.length, 0)
})

test('cancelacion publica: no libera un hold de una empresa suspendida', async () => {
  const prueba = dbDePrueba(reservaHold())
  prueba.datos.empresas[empresaId].estado = 'suspendida'

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'EMPRESA_NO_OPERATIVA')
  assert.equal(prueba.escrituras.length, 0)
})

test('cancelación pública: rechaza una reserva confirmada o pagada', async () => {
  const prueba = dbDePrueba(reservaHold({ estadoPago: 'pagado' }))

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'RESERVA_NO_CANCELABLE')
  assert.equal(prueba.escrituras.length, 0)
})

test('cancelación pública: rechaza una reserva completada', async () => {
  const prueba = dbDePrueba(reservaHold({ estadoReserva: 'completada' }))

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'RESERVA_NO_CANCELABLE')
  assert.equal(prueba.escrituras.length, 0)
})

test('cancelación pública: una segunda cancelación es idempotente', async () => {
  const prueba = dbDePrueba(reservaHold())

  await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora)
  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'YA_CANCELADA')
  assert.equal(prueba.escrituras.length, 2)
})

test('cancelación pública: rechaza holds expirados sin escribir', async () => {
  const prueba = dbDePrueba(reservaHold({ holdExpira: '2026-07-20T11:59:59.000Z' }))

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-1', ahora), 'RESERVA_NO_CANCELABLE')
  assert.equal(prueba.escrituras.length, 0)
})

test('cancelación pública: responde controladamente si la reserva no existe', async () => {
  const prueba = dbDePrueba()

  assert.equal(await cancelarHoldPendiente(prueba.db, 'reserva-inexistente', ahora), 'RESERVA_NO_ENCONTRADA')
  assert.equal(prueba.escrituras.length, 0)
})
