"use client"

import { createContext, useContext, ReactNode } from "react"

interface UIContextType {
  isTouchMode: boolean
  toggleTouchMode: () => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: ReactNode }) {
  // El modo táctil fue removido a petición del usuario.
  // Mantenemos el contexto para no romper las importaciones existentes, 
  // pero siempre devolverá false.
  return (
    <UIContext.Provider value={{ isTouchMode: false, toggleTouchMode: () => {} }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const context = useContext(UIContext)
  if (context === undefined) {
    throw new Error("useUI must be used within a UIProvider")
  }
  return context
}
