'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  calcularPrecioModificadores,
  crearSeleccionesIniciales,
  serializarSelecciones,
  validarSelecciones,
  type GrupoModificadorResuelto,
  type SeleccionesModificador,
} from '@/lib/modifier-selection'
import type { Producto } from '@/lib/productos-service'
import { formatCurrency } from '@/lib/demo-data'

interface ModifierSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  producto: Producto | null
  grupos: GrupoModificadorResuelto[]
  onConfirm: (selecciones: ReturnType<typeof serializarSelecciones>, precioFinal: number) => Promise<boolean>
}

export function ModifierSelectorDialog({
  open,
  onOpenChange,
  producto,
  grupos,
  onConfirm,
}: ModifierSelectorDialogProps) {
  const [selecciones, setSelecciones] = useState<SeleccionesModificador>({})
  const [procesando, setProcesando] = useState(false)
  const procesandoRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setSelecciones(crearSeleccionesIniciales(grupos))
    setProcesando(false)
    procesandoRef.current = false
  }, [open, producto?.id]) // Los defaults solo se aplican al abrir un producto.

  const errores = useMemo(() => validarSelecciones(grupos, selecciones), [grupos, selecciones])
  const adicional = useMemo(() => calcularPrecioModificadores(grupos, selecciones), [grupos, selecciones])
  const precioFinal = (producto?.precio ?? 0) + adicional
  const obligatorio = grupos.filter((grupo) => grupo.minSeleccion > 0)
  const opcional = grupos.filter((grupo) => grupo.minSeleccion === 0)
  const sePuedeConfirmar = grupos.length > 0 && Object.keys(errores).length === 0
  const configuracionInvalida = grupos.some((grupo) => grupo.inconsistencias.length > 0)

  const cambiarOpcion = (grupoId: string, opcionId: string, checked: boolean) => {
    setSelecciones((actual) => {
      const seleccionActual = actual[grupoId] ?? []
      const siguiente = checked
        ? [...seleccionActual, opcionId]
        : seleccionActual.filter((id) => id !== opcionId)
      return { ...actual, [grupoId]: siguiente }
    })
  }

  const confirmar = async () => {
    if (!sePuedeConfirmar || !producto || procesandoRef.current) return
    procesandoRef.current = true
    setProcesando(true)
    try {
      const confirmado = await onConfirm(serializarSelecciones(selecciones), precioFinal)
      if (confirmado) onOpenChange(false)
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !procesando && onOpenChange(nextOpen)}>
      <DialogContent
        showCloseButton
        className="theme-pos fixed inset-0 top-0 left-0 h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none p-0 gap-0 sm:top-1/2 sm:left-1/2 sm:h-[min(48rem,calc(100vh-2rem))] sm:w-[95vw] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-5 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2 pr-8 text-xl font-bold">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Personaliza {producto?.nombre}
          </DialogTitle>
          <DialogDescription>
            Completa los grupos obligatorios y elige los adicionales que necesite el cliente.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-5 py-5 sm:px-6">
          <div className="space-y-6 pb-2">
            {obligatorio.length > 0 && <section className="space-y-3" aria-labelledby="grupos-obligatorios">
              <div><h3 id="grupos-obligatorios" className="text-sm font-bold uppercase tracking-wide text-primary">Obligatorios</h3><p className="mt-1 text-xs text-muted-foreground">Deben completarse antes de agregar el producto.</p></div>
              {obligatorio.map((grupo) => <ModifierGroupChoices key={grupo.id} grupo={grupo} seleccionadas={selecciones[grupo.id] ?? []} error={errores[grupo.id]} onChange={cambiarOpcion} />)}
            </section>}

            {opcional.length > 0 && <section className="space-y-3" aria-labelledby="grupos-opcionales">
              <div><h3 id="grupos-opcionales" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Opcionales</h3><p className="mt-1 text-xs text-muted-foreground">Puedes omitirlos o personalizarlos.</p></div>
              {opcional.map((grupo) => <ModifierGroupChoices key={grupo.id} grupo={grupo} seleccionadas={selecciones[grupo.id] ?? []} error={errores[grupo.id]} onChange={cambiarOpcion} />)}
            </section>}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t border-border/50 bg-card px-5 py-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="order-1 rounded-xl bg-secondary/50 px-3 py-2 text-sm sm:order-none">
            <span className="text-muted-foreground">Total del producto</span>
            <p className="font-black text-primary">{formatCurrency(precioFinal)}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" disabled={procesando} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!producto || !sePuedeConfirmar || configuracionInvalida || procesando} className="gap-2">
              <Check className="h-4 w-4" />{procesando ? 'Agregando…' : 'Agregar al pedido'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ModifierGroupChoicesProps {
  grupo: GrupoModificadorResuelto
  seleccionadas: string[]
  error?: string
  onChange: (grupoId: string, opcionId: string, checked: boolean) => void
}

function ModifierGroupChoices({ grupo, seleccionadas, error, onChange }: ModifierGroupChoicesProps) {
  const seleccionadasSet = new Set(seleccionadas)
  const maxAlcanzado = seleccionadas.length >= grupo.maxSeleccion

  return <div className="rounded-2xl border border-border/60 bg-card p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div><h4 className="font-bold">{grupo.nombre}</h4>{grupo.descripcion && <p className="mt-1 text-xs text-muted-foreground">{grupo.descripcion}</p>}</div>
      <Badge variant={grupo.minSeleccion > 0 ? 'default' : 'secondary'}>{seleccionadas.length}/{grupo.maxSeleccion} · mín. {grupo.minSeleccion}</Badge>
    </div>
    <div className="space-y-2">
      {grupo.opciones.map((opcion) => {
        const checked = seleccionadasSet.has(opcion.id)
        return <label key={opcion.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-sm transition-colors hover:border-primary/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40">
          <Checkbox checked={checked} disabled={!checked && maxAlcanzado} onCheckedChange={(value) => onChange(grupo.id, opcion.id, value === true)} aria-label={`${opcion.nombre}, ${formatCurrency(opcion.precioDelta)}`} />
          <span className="flex-1 font-medium">{opcion.nombre}{opcion.default && <span className="ml-2 text-xs text-muted-foreground">Predeterminada</span>}</span>
          <span className={opcion.precioDelta === 0 ? 'text-xs text-muted-foreground' : 'text-xs font-bold text-primary'}>{opcion.precioDelta === 0 ? 'Sin costo' : `${opcion.precioDelta > 0 ? '+' : ''}${formatCurrency(opcion.precioDelta)}`}</span>
        </label>
      })}
    </div>
    {error && <p className="mt-3 text-xs text-destructive" role="alert">{error}</p>}
  </div>
}
