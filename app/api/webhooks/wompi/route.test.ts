import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import { evaluarPropiedadWebhook, procesarWebhookWompi, resolverEmpresaIdDeReserva, validarAgendaDeReserva } from './route'

function dbWebhook(inicial: Record<string, Record<string, Record<string, any>>>) {
  let datos = structuredClone(inicial)
  let id = 0
  const ref = (coleccion: string, docId: string) => ({ coleccion, id: docId })
  const db = {
    collection(coleccion: string) { return { doc: (docId?: string) => ref(coleccion, docId || `${coleccion}-${++id}`) } },
    async runTransaction<T>(callback: (tx: any) => Promise<T>) {
      const pendiente = structuredClone(datos)
      const tx = {
        get: async (r: ReturnType<typeof ref>) => {
          const data = pendiente[r.coleccion]?.[r.id]
          return { exists: !!data, data: () => data }
        },
        update: (r: ReturnType<typeof ref>, cambios: Record<string, unknown>) => Object.assign(pendiente[r.coleccion][r.id], cambios),
        set: (r: ReturnType<typeof ref>, data: Record<string, unknown>, opciones?: { merge?: boolean }) => {
          pendiente[r.coleccion] ||= {}
          pendiente[r.coleccion][r.id] = opciones?.merge ? { ...(pendiente[r.coleccion][r.id] || {}), ...data } : data
        },
      }
      const result = await callback(tx)
      datos = pendiente
      return result
    },
  }
  return { db: db as unknown as FirebaseFirestore.Firestore, datos: () => datos }
}

function eventoAprobado(reservaId: string, transactionId = 'tx-1') {
  const body: any = { event: 'transaction.updated', data: { transaction: { id: transactionId, status: 'APPROVED', reference: reservaId } }, timestamp: '123', signature: { properties: ['data.transaction.id', 'data.transaction.status', 'data.transaction.reference'] } }
  const secreto = process.env.WOMPI_EVENTS_SECRET = 'secreto-prueba'
  body.signature.checksum = crypto.createHash('sha256').update(`${transactionId}APPROVED${reservaId}123${secreto}`).digest('hex')
  return new Request('https://app.test/api/webhooks/wompi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

function datosPagables(reserva: Record<string, unknown>) {
  return {
    reservas: { 'reserva-b': reserva },
    agendas: { 'mesa-b_2026-07-28': { empresaId: 'b', mesaId: 'mesa-b', espacioId: 'espacio-b', bloques: { '10': { reservaId: 'reserva-b', estado: 'hold' } } } },
    asignaciones_numeracion: { b_empresa_pos: { estado: 'VIGENTE', numeracionId: 'pos' } },
    numeraciones: { b_pos: { estado: 'HABILITADA', ultimoAsignado: 0, rangoFin: 10 } },
    ventas: {}, cuentas_bancarias: {}, transacciones_financieras: {},
  }
}

const reservaB = { empresaId: 'b', estadoPago: 'pendiente', mesaId: 'mesa-b', espacioId: 'espacio-b', fechaLocal: '2026-07-28', bloques: ['10'], montoTotal: 10000 }

test('webhook Wompi: la propiedad del tenant procede exclusivamente de la reserva', () => {
  assert.equal(resolverEmpresaIdDeReserva({ empresaId: 'tenant-b' }), 'tenant-b')
  assert.equal(resolverEmpresaIdDeReserva({}), null)
  assert.equal(resolverEmpresaIdDeReserva({ empresaId: '   ' }), null)
})

test('webhook Wompi: la agenda debe coincidir con la propiedad canónica de la reserva', () => {
  const reserva = { empresaId: 'tenant-b', mesaId: 'mesa-b', espacioId: 'espacio-b' }
  assert.equal(validarAgendaDeReserva(reserva, { empresaId: 'tenant-b', mesaId: 'mesa-b', espacioId: 'espacio-b' }), true)
  assert.equal(validarAgendaDeReserva(reserva, { empresaId: 'tenant-a', mesaId: 'mesa-b', espacioId: 'espacio-b' }), false)
  assert.equal(validarAgendaDeReserva(reserva, { empresaId: 'tenant-b', mesaId: 'mesa-a', espacioId: 'espacio-b' }), false)
})

test('webhook Wompi: falla cerrado incluso si una reserva ya pagada carece de empresaId', () => {
  assert.deepEqual(evaluarPropiedadWebhook({ estadoPago: 'pagado' }), { error: 'RESERVA_SIN_EMPRESA' })
  assert.deepEqual(evaluarPropiedadWebhook({ empresaId: 'tenant-b', estadoPago: 'pagado' }), { empresaId: 'tenant-b' })
})

test('webhook Wompi: una agenda ajena se rechaza antes de mutaciones financieras', () => {
  assert.deepEqual(
    evaluarPropiedadWebhook({ empresaId: 'tenant-b', mesaId: 'mesa-b', espacioId: 'espacio-b' }, { empresaId: 'tenant-a', mesaId: 'mesa-b', espacioId: 'espacio-b' }),
    { error: 'AGENDA_INCONSISTENTE' },
  )
})

test('webhook firmado: enruta pago al tenant de la reserva y conserva idempotencia', async () => {
  const prueba = dbWebhook(datosPagables(reservaB))
  const sinPush = async () => ({ enviados: 0, purgados: 0 })
  assert.equal((await procesarWebhookWompi(eventoAprobado('reserva-b'), prueba.db, sinPush)).status, 200)
  assert.equal(prueba.datos().reservas['reserva-b'].estadoPago, 'pagado')
  assert.equal(Object.values(prueba.datos().ventas)[0].empresaId, 'b')
  assert.equal((await procesarWebhookWompi(eventoAprobado('reserva-b'), prueba.db, sinPush)).status, 200)
  assert.equal(Object.keys(prueba.datos().ventas).length, 1)
})

test('webhook firmado: dos pagos válidos se aislan por la empresa de cada reserva', async () => {
  const reservaA = { empresaId: 'a', estadoPago: 'pendiente', mesaId: 'mesa-a', espacioId: 'espacio-a', fechaLocal: '2026-07-28', bloques: ['10'], montoTotal: 12000 }
  const reservaB = { empresaId: 'b', estadoPago: 'pendiente', mesaId: 'mesa-b', espacioId: 'espacio-b', fechaLocal: '2026-07-28', bloques: ['10'], montoTotal: 18000 }
  const datos = {
    reservas: { 'reserva-a': reservaA, 'reserva-b': reservaB },
    agendas: {
      'mesa-a_2026-07-28': { empresaId: 'a', mesaId: 'mesa-a', espacioId: 'espacio-a', bloques: { '10': { reservaId: 'reserva-a', estado: 'hold' } } },
      'mesa-b_2026-07-28': { empresaId: 'b', mesaId: 'mesa-b', espacioId: 'espacio-b', bloques: { '10': { reservaId: 'reserva-b', estado: 'hold' } } },
    },
    asignaciones_numeracion: {
      a_empresa_pos: { estado: 'VIGENTE', numeracionId: 'pos' },
      b_empresa_pos: { estado: 'VIGENTE', numeracionId: 'pos' },
    },
    numeraciones: {
      a_pos: { estado: 'HABILITADA', ultimoAsignado: 0, rangoFin: 10 },
      b_pos: { estado: 'HABILITADA', ultimoAsignado: 0, rangoFin: 10 },
    },
    ventas: {}, cuentas_bancarias: {}, transacciones_financieras: {},
  }
  const prueba = dbWebhook(datos)
  const sinPush = async () => ({ enviados: 0, purgados: 0 })

  assert.equal((await procesarWebhookWompi(eventoAprobado('reserva-a', 'tx-a'), prueba.db, sinPush)).status, 200)
  assert.equal((await procesarWebhookWompi(eventoAprobado('reserva-b', 'tx-b'), prueba.db, sinPush)).status, 200)

  const resultado = prueba.datos()
  assert.equal(resultado.reservas['reserva-a'].estadoPago, 'pagado')
  assert.equal(resultado.reservas['reserva-b'].estadoPago, 'pagado')
  assert.deepEqual(Object.values(resultado.ventas).map((venta: any) => ({ empresaId: venta.empresaId, origenReserva: venta.origenReserva })).sort((x: any, y: any) => x.empresaId.localeCompare(y.empresaId)), [
    { empresaId: 'a', origenReserva: 'reserva-a' },
    { empresaId: 'b', origenReserva: 'reserva-b' },
  ])
  assert.deepEqual(Object.values(resultado.transacciones_financieras).map((transaccion: any) => ({ empresaId: transaccion.empresaId, monto: transaccion.monto })).sort((x: any, y: any) => x.empresaId.localeCompare(y.empresaId)), [
    { empresaId: 'a', monto: 12000 },
    { empresaId: 'b', monto: 18000 },
  ])
  assert.equal(resultado.numeraciones.a_pos.ultimoAsignado, 1)
  assert.equal(resultado.numeraciones.b_pos.ultimoAsignado, 1)
  assert.equal(resultado.agendas['mesa-a_2026-07-28'].bloques['10'].estado, 'confirmado')
  assert.equal(resultado.agendas['mesa-b_2026-07-28'].bloques['10'].estado, 'confirmado')
})

test('webhook firmado: una reserva sin empresaId, incluso pagada, responde 503 y conserva datos', async () => {
  const prueba = dbWebhook(datosPagables({ ...reservaB, empresaId: undefined, estadoPago: 'pagado' }))
  const res = await procesarWebhookWompi(eventoAprobado('reserva-b'), prueba.db, async () => ({ enviados: 0, purgados: 0 }))
  assert.equal(res.status, 503)
  assert.equal(Object.keys(prueba.datos().ventas).length, 0)
})

test('webhook firmado: una agenda de otro tenant aborta antes de cualquier commit', async () => {
  const datos = datosPagables(reservaB)
  datos.agendas['mesa-b_2026-07-28'].empresaId = 'a'
  const prueba = dbWebhook(datos)
  const res = await procesarWebhookWompi(eventoAprobado('reserva-b'), prueba.db, async () => ({ enviados: 0, purgados: 0 }))
  assert.equal(res.status, 503)
  assert.equal(prueba.datos().reservas['reserva-b'].estadoPago, 'pendiente')
  assert.equal(Object.keys(prueba.datos().ventas).length, 0)
})
