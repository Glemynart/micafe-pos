import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { evaluarReadinessConfiguracion, type ConfiguracionEmpresa } from '@/lib/configuracion'
import { resolverLineaImpuesto, type RegimenTributario } from '@/lib/impuestos-service'
import {
  MAX_BODY_HOLD_BYTES,
  calcularMontoAutorizadoCentavos,
  validarConfiguracionReservasPublicas,
  validarSolicitudHoldPublico,
} from '@/lib/reservas-publicas/contrato'
import { firmaIntegridadCheckout } from '@/lib/reservas-publicas/crypto-servidor'

interface BloqueAgenda { reservaId: string; estado: 'hold' | 'confirmado'; holdExpira: string | null; creadoEn: string }
interface AgendaDoc { empresaId?: unknown; mesaId?: unknown; espacioId?: unknown; bloques?: Record<string, BloqueAgenda> }
interface OpcionesHold { habilitada?: boolean; publicKey?: string; integritySecret?: string; ahora?: Date }
const HOLD_TTL_MS = 15 * 60 * 1000

function esBloqueOcupado(bloque: BloqueAgenda, ahora: Date) {
  return bloque.estado === 'confirmado' || (!!bloque.holdExpira && new Date(bloque.holdExpira) > ahora)
}

async function leerJsonAcotado(req: Request) {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY_HOLD_BYTES) throw new Error('BODY_TOO_LARGE')
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_HOLD_BYTES) throw new Error('BODY_TOO_LARGE')
  try { return JSON.parse(text) as unknown } catch { throw new Error('BODY_INVALID') }
}

export async function crearHoldPublico(req: Request, db: FirebaseFirestore.Firestore = getAdminDb(), opciones: OpcionesHold = {}) {
  const habilitada = opciones.habilitada ?? process.env.RESERVAS_PUBLICAS_ENABLED === 'true'
  const publicKey = opciones.publicKey ?? process.env.NEXT_PUBLIC_WOMPI_PUB_KEY
  const integritySecret = opciones.integritySecret ?? process.env.WOMPI_INTEGRITY_SECRET
  if (!habilitada || !publicKey || !integritySecret) return NextResponse.json({ error: 'Reservas públicas no disponibles' }, { status: 503 })

  try {
    const body = await leerJsonAcotado(req)
    const mesaId = body && typeof body === 'object' && !Array.isArray(body) && typeof (body as Record<string, unknown>).mesaId === 'string' ? (body as Record<string, unknown>).mesaId as string : ''
    if (!mesaId || mesaId.length > 120) return NextResponse.json({ error: 'Datos de reserva inválidos' }, { status: 400 })

    const ahora = opciones.ahora ?? new Date()
    const reservaRef = db.collection('reservas').doc()
    const reference = `res_${randomUUID().replaceAll('-', '')}`
    const intentRef = db.collection('intenciones_pago_reserva').doc(reference)
    let checkout: { amountInCents: number; currency: 'COP'; reference: string; signature: string; publicKey: string } | null = null

    await db.runTransaction(async (tx) => {
      const mesaRef = db.collection('mesas').doc(mesaId)
      const mesaSnap = await tx.get(mesaRef)
      if (!mesaSnap.exists) throw new Error('RESERVA_INVALIDA')
      const mesa = mesaSnap.data() as { empresaId?: unknown; espacioId?: unknown; nombre?: unknown }
      if (typeof mesa.empresaId !== 'string' || !mesa.empresaId || typeof mesa.espacioId !== 'string' || !mesa.espacioId) throw new Error('RESERVA_INVALIDA')

      const empresaRef = db.collection('empresas').doc(mesa.empresaId)
      const configRef = db.collection('configuraciones').doc(mesa.empresaId)
      const [empresaSnap, configSnap] = await Promise.all([tx.get(empresaRef), tx.get(configRef)])
      const empresa = empresaSnap.data() as { estado?: unknown; slug?: unknown; paisFiscal?: unknown } | undefined
      const config = configSnap.data() as ConfiguracionEmpresa | undefined
      if (!empresaSnap.exists || !configSnap.exists || !empresa || !config || !['trial', 'activa'].includes(String(empresa.estado))) throw new Error('RESERVA_INVALIDA')
      if (!validarSolicitudHoldPublico(body, config.localizacion?.zonaHoraria ?? '', ahora) || body.mesaId !== mesaId || body.slug !== empresa.slug) throw new Error('RESERVA_INVALIDA')
      if (!validarConfiguracionReservasPublicas(config.reservasPublicas) || !config.reservasPublicas.habilitadas || config.localizacion.moneda !== 'COP') throw new Error('CAPACIDAD_NO_DISPONIBLE')
      if (!evaluarReadinessConfiguracion(config, { empresaId: mesa.empresaId, paisFiscalEmpresa: String(empresa.paisFiscal ?? config.localizacion.paisFiscal) }).fiscal.lista) throw new Error('READINESS_FISCAL_INCOMPLETA')

      const tarifa = config.reservasPublicas.salas[mesaId]
      if (!tarifa) throw new Error('CAPACIDAD_NO_DISPONIBLE')
      const montoCentavos = calcularMontoAutorizadoCentavos(tarifa, body.bloquesSolicitados)
      const montoPesos = montoCentavos / 100
      const productoRef = db.collection('productos').doc(tarifa.productoId)
      const productoSnap = await tx.get(productoRef)
      const producto = productoSnap.data() as { empresaId?: unknown; nombre?: unknown; activo?: unknown } | undefined
      if (!productoSnap.exists || producto?.empresaId !== mesa.empresaId || producto.activo === false || typeof producto.nombre !== 'string' || !producto.nombre.trim()) throw new Error('PRODUCTO_TARIFA_INVALIDO')

      const agendaRef = db.collection('agendas').doc(`${mesaId}_${body.fechaLocal}`)
      const agendaSnap = await tx.get(agendaRef)
      const agenda = agendaSnap.exists ? agendaSnap.data() as AgendaDoc : null
      if (agenda && (agenda.empresaId !== mesa.empresaId || agenda.mesaId !== mesaId || agenda.espacioId !== mesa.espacioId)) throw new Error('AGENDA_INCONSISTENTE')
      const actuales = agenda?.bloques || {}
      for (const bloque of body.bloquesSolicitados) if (actuales[bloque] && esBloqueOcupado(actuales[bloque], ahora)) throw new Error('BLOQUE_OCUPADO')

      const holdExpira = new Date(ahora.getTime() + HOLD_TTL_MS).toISOString()
      const nuevos = { ...actuales }
      for (const bloque of body.bloquesSolicitados) nuevos[bloque] = { reservaId: reservaRef.id, estado: 'hold', holdExpira, creadoEn: ahora.toISOString() }
      const inicio = body.bloquesSolicitados[0]
      const fin = String(Number(body.bloquesSolicitados.at(-1)) + 1).padStart(2, '0')
      const impuesto = resolverLineaImpuesto(montoPesos, tarifa.impuestoTipo, config.identidadFiscal.regimenTributario as RegimenTributario)
      const firma = firmaIntegridadCheckout(reference, montoCentavos, 'COP', integritySecret)

      tx.create(intentRef, {
        schemaVersion: 1, estado: 'CREADA', empresaId: mesa.empresaId, reservaId: reservaRef.id, mesaId, espacioId: mesa.espacioId,
        reference, montoEsperadoCentavos: montoCentavos, moneda: 'COP', cuentaClaveOperativa: config.reservasPublicas.cuentaClaveOperativa,
        configuracionRevision: config.revision, tarifaRevision: config.reservasPublicas.tarifaRevision,
        tarifaSnapshot: { ...tarifa }, productoSnapshot: { id: tarifa.productoId, nombre: producto.nombre },
        lineaFiscalSnapshot: { id: tarifa.productoId, nombre: producto.nombre, cantidad: 1, precioUnitario: montoPesos, subtotal: montoPesos, ...impuesto },
        creadaEn: ahora.toISOString(), actualizadaEn: ahora.toISOString(), holdExpira,
      })
      tx.create(reservaRef, {
        id: reservaRef.id, empresaId: mesa.empresaId, mesaId, espacioId: mesa.espacioId, clienteNombre: body.cliente.nombre,
        clienteEmail: body.cliente.email, clienteTelefono: body.cliente.telefono, fechaLocal: body.fechaLocal, bloques: body.bloquesSolicitados,
        fechaInicio: `${body.fechaLocal}T${inicio}:00:00`, fechaFin: `${body.fechaLocal}T${fin}:00:00`, estadoPago: 'pendiente',
        estadoReserva: 'activa', montoTotal: montoPesos, moneda: 'COP', referenciaPago: reference, fechaCreacion: ahora.toISOString(), holdExpira,
      })
      tx.set(agendaRef, { mesaId, espacioId: mesa.espacioId, fecha: body.fechaLocal, materializado: true, bloques: nuevos, actualizadoEn: ahora.toISOString(), empresaId: mesa.empresaId })
      checkout = { amountInCents: montoCentavos, currency: 'COP', reference, signature: firma, publicKey }
    })

    return NextResponse.json({ reservaId: reservaRef.id, checkout })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    if (code === 'BODY_TOO_LARGE') return NextResponse.json({ error: 'Solicitud demasiado grande' }, { status: 413 })
    if (code === 'BODY_INVALID' || code === 'RESERVA_INVALIDA' || code === 'DURACION_NO_PERMITIDA') return NextResponse.json({ error: 'Datos de reserva inválidos' }, { status: 400 })
    if (code === 'BLOQUE_OCUPADO') return NextResponse.json({ error: 'BLOQUE_OCUPADO' }, { status: 409 })
    if (['CAPACIDAD_NO_DISPONIBLE', 'READINESS_FISCAL_INCOMPLETA', 'PRODUCTO_TARIFA_INVALIDO', 'AGENDA_INCONSISTENTE'].includes(code)) return NextResponse.json({ error: 'Reservas públicas no disponibles' }, { status: 503 })
    console.error('Error en /api/reservas/hold:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
