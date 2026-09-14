import { httpsCallable } from "firebase/functions"
import { getFirebaseFunctions } from "@/lib/firebase"
import type { ClienteVendedorDTO, ConfirmacionVentaBodega, PresentacionVendedorDTO, ResultadoVentaBodega, VentaVendedorDTO } from "./ui-contract"

async function invocar<TEntrada, TSalida>(nombre: string, data: TEntrada): Promise<TSalida> {
  const callable = httpsCallable<TEntrada, TSalida>(getFirebaseFunctions(), nombre)
  return (await callable(data)).data
}

export async function consultarClientesVendedor(): Promise<ClienteVendedorDTO[]> {
  return (await invocar<Record<string, never>, { clientes: ClienteVendedorDTO[] }>("consultarClientesVendedorV1", {})).clientes
}

export async function crearClienteVendedor(data: { nombre: string; cedula: string; telefono: string; tipoDocumento?: "NIT" | "CC"; contacto?: string; direccion?: string; barrioZona?: string }): Promise<ClienteVendedorDTO> {
  return (await invocar<typeof data, { cliente: ClienteVendedorDTO }>("crearClienteVendedorV1", data)).cliente
}

export async function consultarCatalogoBodega(): Promise<PresentacionVendedorDTO[]> {
  return (await invocar<Record<string, never>, { presentaciones: PresentacionVendedorDTO[] }>("consultarCatalogoPresentacionesVendedorV1", {})).presentaciones
}

export async function confirmarVentaBodega(envelope: ConfirmacionVentaBodega): Promise<ResultadoVentaBodega> {
  return invocar<ConfirmacionVentaBodega, ResultadoVentaBodega>("confirmarVentaBodegaV1", envelope)
}

export async function consultarMisVentasBodega(): Promise<VentaVendedorDTO[]> {
  return (await invocar<Record<string, never>, { ventas: VentaVendedorDTO[] }>("consultarMisVentasVendedorV1", {})).ventas
}
