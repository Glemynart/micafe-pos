'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

const ZOOM_MIN = 0.2
const ZOOM_MAX = 4

function storageKey(espacioId: string) {
  return `salon:viewport:${espacioId}`
}

function parseViewport(raw: string | null): Viewport | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (
      typeof v.zoom === 'number' && isFinite(v.zoom) &&
      typeof v.panX === 'number' && isFinite(v.panX) &&
      typeof v.panY === 'number' && isFinite(v.panY)
    ) return v
  } catch { /* invalid */ }
  return null
}

export function useSalonViewport(espacioId: string | null) {
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 })
  // true = no hay viewport guardado para este espacio → SalonCanvas debe hacer zoom-to-fit.
  // false = ya se restauró desde localStorage → SalonCanvas NO debe sobrescribir.
  const [fitPending, setFitPending] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const espacioRef = useRef(espacioId)

  useEffect(() => {
    espacioRef.current = espacioId
    if (!espacioId) return
    const saved = parseViewport(localStorage.getItem(storageKey(espacioId)))
    if (saved) {
      setViewport(saved)
      setFitPending(false) // C1: viewport restaurado → no sobrescribir con fit
    } else {
      setViewport({ zoom: 1, panX: 0, panY: 0 })
      setFitPending(true)  // I4: espacio sin viewport guardado → pedir fit
    }
  }, [espacioId])

  const updateViewport = useCallback((next: Viewport | ((prev: Viewport) => Viewport)) => {
    setViewport(prev => {
      const v = typeof next === 'function' ? next(prev) : next
      const clamped = { ...v, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom)) }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (espacioRef.current) {
          try {
            localStorage.setItem(storageKey(espacioRef.current), JSON.stringify(clamped))
          } catch { /* quota/private mode */ }
        }
      }, 300)
      return clamped
    })
  }, [])

  const clearFitPending = useCallback(() => setFitPending(false), [])

  return { viewport, updateViewport, fitPending, clearFitPending, ZOOM_MIN, ZOOM_MAX }
}
