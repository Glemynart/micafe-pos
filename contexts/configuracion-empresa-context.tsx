"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSaaS } from "./saas-context";
import type { ConfiguracionEmpresa } from "../lib/configuracion/contrato";
import { leerConfiguracionEmpresaCliente, invalidarCacheConfiguracion, type EntradaActualizacionCliente, ejecutarComandoConfiguracionCliente, type ResultadoActualizacionCliente } from "../lib/configuracion/client-repository";
import { proyectarBrandingConfiguracion, proyectarCajaConfiguracion, proyectarIdentidadConfiguracion, proyectarImpresionConfiguracion, proyectarLocalizacionConfiguracion, proyectarModulosConfiguracion, proyectarPosConfiguracion, proyectarTicketConfiguracion } from "../lib/configuracion/proyecciones";
import { resolverBrandingRuntime, type BrandingRuntimeResuelto } from '../lib/configuracion/branding-runtime'

type Estado = "SIN_TENANT" | "CARGANDO" | "LISTA" | "AUSENTE" | "INVALIDA" | "ERROR";
interface Contexto { empresaId: string | null; estado: Estado; revision: number | null; error: Error | null; proyecciones: ReturnType<typeof crearProyecciones> | null; branding: BrandingRuntimeResuelto; refrescar(): Promise<void>; ejecutar(comando: Parameters<typeof ejecutarComandoConfiguracionCliente>[0], entrada: EntradaActualizacionCliente): Promise<ResultadoActualizacionCliente>; }
const crearProyecciones = (c: ConfiguracionEmpresa) => ({ identidad: proyectarIdentidadConfiguracion(c), localizacion: proyectarLocalizacionConfiguracion(c), ticket: proyectarTicketConfiguracion(c), impresion: proyectarImpresionConfiguracion(c), pos: proyectarPosConfiguracion(c), modulos: proyectarModulosConfiguracion(c), caja: proyectarCajaConfiguracion(c), branding: proyectarBrandingConfiguracion(c) });
export const ConfiguracionContext = createContext<Contexto | null>(null);

export function ConfiguracionEmpresaProvider({ children }: { children: ReactNode }) {
  const { empresaId, loading } = useSaaS(); const [configuracion, setConfiguracion] = useState<ConfiguracionEmpresa | null>(null); const [estado, setEstado] = useState<Estado>("SIN_TENANT"); const [error, setError] = useState<Error | null>(null);
  const generacion = useRef(0)
  const configuracionActual = useRef<ConfiguracionEmpresa | null>(null)
  const empresaActual = useRef(empresaId); empresaActual.current = empresaId
  const cargar = useCallback(async (forzar = false) => { const actual = ++generacion.current; if (!empresaId) { configuracionActual.current = null; setConfiguracion(null); setEstado("SIN_TENANT"); return; } const tieneConfiguracionActual = forzar && configuracionActual.current?.empresaId === empresaId; if (!tieneConfiguracionActual) setEstado("CARGANDO"); setError(null); try { const c = await leerConfiguracionEmpresaCliente(empresaId, forzar); if (actual !== generacion.current) return; configuracionActual.current = c; setConfiguracion(c); setEstado("LISTA"); } catch (e) { if (actual !== generacion.current) return; const err = e instanceof Error ? e : new Error("Error de configuración"); if (tieneConfiguracionActual) { setError(err); setEstado("LISTA"); return; } configuracionActual.current = null; setConfiguracion(null); setError(err); setEstado("codigo" in err && err.codigo === "AUSENTE" ? "AUSENTE" : "codigo" in err && err.codigo === "INVALIDA" ? "INVALIDA" : "ERROR"); } }, [empresaId]);
  useEffect(() => { if (loading) { configuracionActual.current = null; setConfiguracion(null); setEstado("CARGANDO"); return }; configuracionActual.current = null; setConfiguracion(null); void cargar(); return () => { generacion.current += 1; configuracionActual.current = null; if (empresaId) invalidarCacheConfiguracion(empresaId); }; }, [empresaId, loading, cargar]);
  useEffect(() => { if (!empresaId || loading) return; const intervalo = window.setInterval(() => { void cargar(true) }, 60000); return () => window.clearInterval(intervalo) }, [empresaId, loading, cargar])
  const refrescar = useCallback(async () => { if (empresaId) invalidarCacheConfiguracion(empresaId); await cargar(true); }, [empresaId, cargar]);
  const ejecutar = useCallback(async (comando: Parameters<typeof ejecutarComandoConfiguracionCliente>[0], entrada: EntradaActualizacionCliente) => { if (!empresaId) throw new Error("No existe tenant activo."); const tenantComando = empresaId; const resultado = await ejecutarComandoConfiguracionCliente(comando, tenantComando, entrada); if (!resultado.noOp && empresaActual.current === tenantComando) await refrescar(); return resultado; }, [empresaId, refrescar]);
  const vigente = !loading && configuracion?.empresaId === empresaId ? configuracion : null
  const proyecciones = useMemo(() => vigente ? crearProyecciones(vigente) : null, [vigente]);
  const branding = useMemo(() => resolverBrandingRuntime(vigente), [vigente])
  const estadoVigente: Estado = vigente ? estado : estado === "LISTA" ? "CARGANDO" : estado
  return <ConfiguracionContext.Provider value={{ empresaId: vigente?.empresaId ?? null, estado: estadoVigente, revision: vigente?.revision ?? null, error, proyecciones, branding, refrescar, ejecutar }}>{children}</ConfiguracionContext.Provider>;
}
export function useConfiguracionEmpresa(): Contexto { const c = useContext(ConfiguracionContext); if (!c) throw new Error("useConfiguracionEmpresa requiere ConfiguracionEmpresaProvider"); return c; }
