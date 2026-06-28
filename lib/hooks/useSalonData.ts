'use client'

import { useState, useEffect } from 'react'
import { suscribirMesas, type Mesa } from '@/lib/mesas-service'
import { suscribirPedidosActivos, suscribirComandasActivas, type PedidoActivo, type ComandaCocina } from '@/lib/pedidos-service'

export interface SalonData {
  mesas: Mesa[]
  pedidos: PedidoActivo[]
  comandas: ComandaCocina[]
  cargando: boolean
}

/**
 * Suscripciones de datos del salón para un espacio.
 * Expone el mismo contrato que el futuro SalonDataProvider;
 * migrar a Provider será cambio 100% interno sin tocar consumidores.
 */
export function useSalonData(espacioId: string | null): SalonData {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [pedidos, setPedidos] = useState<PedidoActivo[]>([])
  const [comandas, setComandas] = useState<ComandaCocina[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!espacioId) {
      setMesas([]); setPedidos([]); setComandas([]); setCargando(false)
      return
    }
    setCargando(true)
    let loaded = 0
    const check = () => { if (++loaded >= 3) setCargando(false) }

    const unsubMesas    = suscribirMesas(espacioId, d => { setMesas(d); check() })
    const unsubPedidos  = suscribirPedidosActivos(espacioId, d => { setPedidos(d); check() })
    const unsubComandas = suscribirComandasActivas(espacioId, d => { setComandas(d); check() })

    return () => { unsubMesas(); unsubPedidos(); unsubComandas() }
  }, [espacioId])

  return { mesas, pedidos, comandas, cargando }
}
