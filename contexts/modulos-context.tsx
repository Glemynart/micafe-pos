"use client"

import { useState, useEffect, createContext, useContext, type ReactNode } from "react"
import { suscribirConfiguracion, DEFAULT_MODULOS } from "@/lib/configuracion-service"

interface ModulosContextValue {
  modulos: string[]
  cargando: boolean
}

const ModulosContext = createContext<ModulosContextValue>({ modulos: DEFAULT_MODULOS, cargando: true })

export function ModulosProvider({ children }: { children: ReactNode }) {
  const [modulos, setModulos] = useState<string[]>(DEFAULT_MODULOS)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const unsub = suscribirConfiguracion((config) => {
      if (config.modulos_habilitados?.length > 0) {
        const mods = [...config.modulos_habilitados]
        if (!mods.includes('reservas')) mods.push('reservas')
        setModulos(mods)
      } else {
        setModulos(DEFAULT_MODULOS)
      }
      setCargando(false)
    })
    return unsub
  }, [])

  return <ModulosContext.Provider value={{ modulos, cargando }}>{children}</ModulosContext.Provider>
}

export function useModulosHabilitados() {
  return useContext(ModulosContext)
}
