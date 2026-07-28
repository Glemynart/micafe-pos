"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"

interface ModulosContextValue {
  modulos: string[]
  cargando: boolean
}

const ModulosContext = createContext<ModulosContextValue>({ modulos: [], cargando: true })

export function ModulosProvider({ children }: { children: ReactNode }) {
  const { estado, proyecciones } = useConfiguracionEmpresa()
  const cargando = estado !== "LISTA"
  const modulos = proyecciones?.modulos.habilitados ?? []

  return <ModulosContext.Provider value={{ modulos, cargando }}>{children}</ModulosContext.Provider>
}

export function useModulosHabilitados() {
  return useContext(ModulosContext)
}
