'use client'

/**
 * activacion-credencial.tsx
 *
 * ADR-SAAS-013 §9 — paso de activación de la credencial operativa inicial.
 * Se renderiza en lugar del formulario de login cuando
 * `useAuthContext().activacionPendiente` no es null; no tiene chrome propio
 * (Card/fondo) para poder insertarse dentro del contenedor de login ya
 * existente en cada superficie (admin y POS) sin duplicar estilos.
 */

import { useState } from 'react'
import { Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthContext } from '@/contexts/auth-context'

export function ActivacionCredencial() {
  const { activandoCredencial, errorLogin, limpiarError, activarCredencial, cancelarActivacion } = useAuthContext()
  const [pinNuevo, setPinNuevo] = useState('')
  const [confirmarPin, setConfirmarPin] = useState('')

  const soloDigitos = (valor: string) => /^\d{0,6}$/.test(valor)
  const pinValido = /^\d{6}$/.test(pinNuevo)
  const coinciden = pinNuevo === confirmarPin
  const puedeEnviar = pinValido && coinciden && !activandoCredencial

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeEnviar) return
    await activarCredencial(pinNuevo)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-foreground">
        <KeyRound className="h-4 w-4 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold">Define tu PIN definitivo</p>
          <p className="text-xs text-muted-foreground">Este es tu primer ingreso. Elige un PIN de 6 dígitos distinto del temporal.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="pin-nuevo" className="text-sm font-medium text-muted-foreground">Nuevo PIN</label>
          <input
            id="pin-nuevo"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
            autoFocus
            value={pinNuevo}
            onChange={(e) => { if (soloDigitos(e.target.value)) { setPinNuevo(e.target.value); if (errorLogin) limpiarError() } }}
            placeholder="******"
            disabled={activandoCredencial}
            className="w-full h-11 px-4 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="pin-confirmar" className="text-sm font-medium text-muted-foreground">Confirma el PIN</label>
          <input
            id="pin-confirmar"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
            value={confirmarPin}
            onChange={(e) => { if (soloDigitos(e.target.value)) { setConfirmarPin(e.target.value); if (errorLogin) limpiarError() } }}
            placeholder="******"
            disabled={activandoCredencial}
            className="w-full h-11 px-4 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
          />
          {confirmarPin.length === 6 && !coinciden && (
            <p className="text-xs text-red-400">Los PIN no coinciden.</p>
          )}
        </div>

        {errorLogin && (
          <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">{errorLogin}</p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 rounded-xl"
            onClick={() => cancelarActivacion()}
            disabled={activandoCredencial}
          >
            Cancelar
          </Button>
          <button
            type="submit"
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={!puedeEnviar}
          >
            {activandoCredencial ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Activar
          </button>
        </div>
      </form>
    </div>
  )
}
