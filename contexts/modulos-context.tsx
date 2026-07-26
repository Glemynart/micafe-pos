"use client"

import { useState, useEffect, createContext, useContext, type ReactNode } from "react"
import { suscribirConfiguracion, DEFAULT_MODULOS } from "@/lib/configuracion-service"
import { useSaaS } from "@/contexts/saas-context"

interface ModulosContextValue {
  modulos: string[]
  cargando: boolean
}

const ModulosContext = createContext<ModulosContextValue>({ modulos: [], cargando: true })

export function ModulosProvider({ children }: { children: ReactNode }) {
  const { empresaId, loading } = useSaaS()
  const [modulos, setModulos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (loading || !empresaId) {
      setModulos([])
      setCargando(false)
      return
    }

    setCargando(true)
    const unsubscribe = suscribirConfiguracion((configuracion) => {
      setModulos(configuracion.modulos_habilitados ?? DEFAULT_MODULOS)
      setCargando(false)
    })
    return unsubscribe
  }, [empresaId, loading])

  return <ModulosContext.Provider value={{ modulos, cargando }}>{children}</ModulosContext.Provider>
}

export function useModulosHabilitados() {
  return useContext(ModulosContext)
}
