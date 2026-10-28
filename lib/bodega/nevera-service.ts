import { httpsCallable } from "firebase/functions"
import { getFirebaseFunctions } from "@/lib/firebase"
import { resolverCallableOperacionBodega } from "./operation-routing"
import type { ComandoAperturaNevera, ComandoVentaRetailNevera, PresentacionRetailNeveraDTO, ResultadoAperturaNevera, ResultadoPreflightAperturaNevera, ResultadoVentaRetailNevera } from "./nevera-contract"

async function invocar<TEntrada, TSalida>(nombre: string, data: TEntrada): Promise<TSalida> {
  const callable = httpsCallable<TEntrada, TSalida>(getFirebaseFunctions(), resolverCallableOperacionBodega("BODEGA_MVP1", nombre))
  return (await callable(data)).data
}

export async function consultarCatalogoNeveraVendedor(): Promise<PresentacionRetailNeveraDTO[]> {
  const result = await invocar<Record<string, never>, { catalogoId: "NEVERA"; presentaciones: PresentacionRetailNeveraDTO[] }>("consultarCatalogoNeveraVendedorV1", {})
  return result.presentaciones
}

export function registrarVentaRetailNevera(command: ComandoVentaRetailNevera): Promise<ResultadoVentaRetailNevera> {
  return invocar<ComandoVentaRetailNevera, ResultadoVentaRetailNevera>("registrarVentaRetailNeveraV1", command)
}

export function preflightAperturaNevera(): Promise<ResultadoPreflightAperturaNevera> {
  return invocar<Record<string, never>, ResultadoPreflightAperturaNevera>("preflightAperturaNeveraV1", {})
}

export function abrirProductoNevera(command: ComandoAperturaNevera): Promise<ResultadoAperturaNevera> {
  return invocar<ComandoAperturaNevera, ResultadoAperturaNevera>("abrirProductoNeveraV1", command)
}
