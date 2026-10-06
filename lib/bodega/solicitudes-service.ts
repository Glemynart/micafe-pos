import { httpsCallable } from "firebase/functions"
import { getFirebaseFunctions } from "@/lib/firebase"
import type { ComandoSolicitudVentaBodega, SolicitudVentaBodegaDTO } from "./ui-contract"

type Envelope<TPayload> = {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  payload: TPayload
}

async function invoke<TInput, TOutput>(name: string, data: TInput): Promise<TOutput> {
  return (await httpsCallable<TInput, TOutput>(getFirebaseFunctions(), name)(data)).data
}

function envelope<TPayload>(prefix: string, payload: TPayload): Envelope<TPayload> {
  const commandId = `${prefix}:${crypto.randomUUID()}`
  return { commandId, idempotencyKey: commandId, correlationId: `${prefix}:${crypto.randomUUID()}`, causationId: null, payload }
}

export function crearSolicitudVentaBodega(command: ComandoSolicitudVentaBodega) {
  return invoke<ComandoSolicitudVentaBodega, SolicitudVentaBodegaDTO & { commandId: string }>("crearSolicitudVentaBodegaV1", command)
}

export async function consultarSolicitudesVentaBodega() {
  return (await invoke<Record<string, never>, { solicitudes: SolicitudVentaBodegaDTO[] }>("consultarSolicitudesVentaBodegaV1", {})).solicitudes
}

export function resolverSolicitudVentaBodega(input: { solicitudId: string; revision: number; decision: "aprobar" | "rechazar" }) {
  return invoke<Envelope<typeof input>, { solicitudId: string; estado: string }>("resolverSolicitudVentaBodegaV1", envelope("bodega-resolver-solicitud", input))
}

export function cancelarSolicitudVentaBodega(input: { solicitudId: string; revision: number }) {
  return invoke<Envelope<typeof input>, { solicitudId: string; estado: string }>("cancelarSolicitudVentaBodegaV1", envelope("bodega-cancelar-solicitud", input))
}
