import { httpsCallable } from "firebase/functions"
import { getFirebaseFunctions } from "@/lib/firebase"
import type { ProgramacionPedidoBodegaDTO } from "./ui-contract"

export type Envelope<TPayload> = {
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

export function crearProgramacionPedidoBodega(command: Envelope<{
  clienteId: string
  fechaLocal: string
  franja: { desde: string; hasta: string } | null
  lineas: Array<{ productoId: string; presentacionId: string; cantidad: number }>
}>) {
  return invoke<typeof command, ProgramacionPedidoBodegaDTO & { commandId: string }>("crearProgramacionPedidoBodegaV1", command)
}

export async function consultarAgendaPedidosBodega(): Promise<ProgramacionPedidoBodegaDTO[]> {
  return (await invoke<Record<string, never>, { programaciones: ProgramacionPedidoBodegaDTO[] }>("consultarAgendaPedidosBodegaV1", {})).programaciones
}

export function construirResolucionProgramacionPedidoBodega(input: { programacionId: string; revision: number; decision: "aceptar" | "rechazar" }) {
  return envelope("bodega-resolver-agenda", input)
}

export function resolverProgramacionPedidoBodega(command: Envelope<{ programacionId: string; revision: number; decision: "aceptar" | "rechazar" }>) {
  return invoke<typeof command, { programacionId: string; estado: string }>("resolverProgramacionPedidoBodegaV1", command)
}

export function construirCancelacionProgramacionPedidoBodega(input: { programacionId: string; revision: number }) {
  return envelope("bodega-cancelar-agenda", input)
}

export function cancelarProgramacionPedidoBodega(command: Envelope<{ programacionId: string; revision: number }>) {
  return invoke<typeof command, { programacionId: string; estado: string }>("cancelarProgramacionPedidoBodegaV1", command)
}

export function construirConversionProgramacionPedidoBodega(programacionId: string) {
  return envelope("bodega-convertir-agenda", { programacionId })
}

export function convertirProgramacionPedidoBodega(command: Envelope<{ programacionId: string }>) {
  return invoke<typeof command, { programacionId: string; solicitudId: string; estado: string }>("convertirProgramacionPedidoBodegaV1", command)
}
