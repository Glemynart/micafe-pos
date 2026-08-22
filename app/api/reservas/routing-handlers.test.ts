import assert from 'node:assert/strict'
import test from 'node:test'
import { listarSalasPublicas } from './salas/service'
import { consultarDisponibilidad } from './disponibilidad/service'
import { crearHoldPublico } from './hold/service'
import { cancelarHoldPendiente } from './cancelar/service'
import { crearPlantillaConfiguracionRevision1 } from '@/lib/configuracion'

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
        create: (r: ReturnType<typeof ref>, data: Record<string, any>) => {
          if (datos[r.coleccion]?.[r.id]) throw new Error('ALREADY_EXISTS')
          datos[r.coleccion] ||= {}
          datos[r.coleccion][r.id] = data
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

function configuracionFiscalReservas(empresaId: string) {
  const c = crearPlantillaConfiguracionRevision1({ empresaId, nombreComercial: 'Cafe', creadaEn: {}, actualizadaEn: {}, modulosIniciales: ['sell', 'reservas'], ultimaMutacion: { actorTipo: 'SYSTEM', actorId: 'system', origen: 'BACKFILL', commandId: 'init', correlationId: 'init' } })
  return { ...c, identidadFiscal: { ...c.identidadFiscal, razonSocial: 'Cafe SAS', tipoPersona: 'JURIDICA' as const, tipoDocumento: 'NIT', numeroDocumento: '900373913', digitoVerificacion: '4', regimenTributario: 'no_responsable' as const, actividadEconomicaPrincipal: '5610' }, localizacion: { ...c.localizacion, direccion: { linea1: 'Calle 1', departamentoCodigo: '11', municipioCodigo: '11001', municipioNombre: 'Bogota' } }, reservasPublicas: { habilitadas: true, moneda: 'COP' as const, tarifaRevision: 3, cuentaClaveOperativa: 'bancolombia', salas: { [`mesa-${empresaId}`]: { precioBloqueCentavos: 3_500_000, productoId: `producto-${empresaId}`, impuestoTipo: 'excluido' as const, bloquesMinimos: 1, bloquesMaximos: 4 } } } }
}

test('hold: falla cerrado y el servidor fija monto, tenant, referencia y firma', async () => {
  const body = { slug: 'cafe-b', mesaId: 'mesa-b', fechaLocal: '2026-07-28', bloquesSolicitados: ['10', '11'], cliente: { nombre: 'Ana Perez', email: 'ana@test.co', telefono: '3001234567' } }
  const prueba = dbDePrueba({ empresas: { b: { estado: 'activa', slug: 'cafe-b', paisFiscal: 'CO' } }, configuraciones: { b: configuracionFiscalReservas('b') }, mesas: { 'mesa-b': { empresaId: 'b', espacioId: 'espacio-b' } }, productos: { 'producto-b': { empresaId: 'b', nombre: 'Reserva sala', activo: true } }, agendas: {}, reservas: {}, intenciones_pago_reserva: {} })
  const disabled = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(body) }), prueba.db)
  assert.equal(disabled.status, 503)
  assert.equal(prueba.escrituras.length, 0)

  const response = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify({ ...body, montoTotal: 1 }) }), prueba.db, { habilitada: true, publicKey: 'pub_test', integritySecret: 'integrity_test', ahora: new Date('2026-07-20T12:00:00Z') })
  assert.equal(response.status, 400)
  const correcto = await crearHoldPublico(new Request('https://app.test/api/reservas/hold', { method: 'POST', body: JSON.stringify(body) }), prueba.db, { habilitada: true, publicKey: 'pub_test', integritySecret: 'integrity_test', ahora: new Date('2026-07-20T12:00:00Z') })
  assert.equal(correcto.status, 200)
  const result = await correcto.json()
  assert.equal(result.checkout.amountInCents, 7_000_000)
  assert.equal(result.checkout.currency, 'COP')
  assert.equal(result.checkout.reference === result.reservaId, false)
  assert.equal(Object.values(prueba.datos.reservas)[0].empresaId, 'b')
  assert.equal(Object.values(prueba.datos.intenciones_pago_reserva)[0].montoEsperadoCentavos, 7_000_000)
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
