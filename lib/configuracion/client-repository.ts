"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";
import type { ConfiguracionEmpresa } from "./contrato";
import type { OperacionConfiguracion } from "./operaciones";
import { validarConfiguracionEmpresa } from "./validacion";
import { CacheConfiguracionEmpresa } from './client-cache'

const REGION = "us-central1";
const cache = new CacheConfiguracionEmpresa();
export class ConfiguracionClienteError extends Error { constructor(public readonly codigo: "AUSENTE" | "INVALIDA" | "CONFLICTO" | "BACKEND", mensaje: string) { super(mensaje); } }
const funciones = () => getFunctions(app, REGION);

export async function leerConfiguracionEmpresaCliente(empresaId: string, forzar = false): Promise<ConfiguracionEmpresa> {
  const existente = cache.obtener(empresaId);
  if (existente && !forzar) return existente;
  try {
    const callable = httpsCallable<void, ConfiguracionEmpresa>(funciones(), "obtenerConfiguracionEmpresa");
    const { data } = await callable();
    const resultado = validarConfiguracionEmpresa(data, { empresaId });
    if (!resultado.valida) throw new ConfiguracionClienteError("INVALIDA", "La configuración empresarial no es válida.");
    cache.guardar(data);
    return data;
  } catch (error) {
    if (error instanceof ConfiguracionClienteError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code.endsWith("not-found")) throw new ConfiguracionClienteError("AUSENTE", "La empresa aún no tiene configuración.");
    if (code.endsWith("failed-precondition")) throw new ConfiguracionClienteError("INVALIDA", "La configuración empresarial no es válida.");
    throw new ConfiguracionClienteError("BACKEND", "No fue posible leer la configuración empresarial.");
  }
}

export function invalidarCacheConfiguracion(empresaId?: string, revisionConfirmada?: number): void {
  cache.invalidar(empresaId, revisionConfirmada)
}

export interface EntradaActualizacionCliente { expectedRevision: number; idempotencyKey: string; commandId: string; correlationId: string; motivo?: string; operaciones: OperacionConfiguracion[] }
export interface ResultadoActualizacionCliente { revision: number; idempotente: boolean; noOp: boolean }
export async function ejecutarComandoConfiguracionCliente(comando: "actualizarConfiguracionEmpresa" | "actualizarParametrosFiscales" | "actualizarPreferenciasImpresion" | "actualizarPoliticasOperativas", empresaId: string, entrada: EntradaActualizacionCliente): Promise<ResultadoActualizacionCliente> {
  try {
    const callable = httpsCallable<EntradaActualizacionCliente, ResultadoActualizacionCliente>(funciones(), comando);
    const { data } = await callable(entrada);
    if (!data.noOp) invalidarCacheConfiguracion(empresaId, data.revision);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/CONFIG_REVISION_CONFLICT/.test(message)) throw new ConfiguracionClienteError("CONFLICTO", "La configuración cambió en otra sesión.");
    throw new ConfiguracionClienteError("BACKEND", "No fue posible actualizar la configuración empresarial.");
  }
}
