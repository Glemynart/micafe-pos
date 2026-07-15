'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Producto } from '@/lib/productos-service'
import {
  suscribirTodosModificadorGrupos,
  type ModificadorGrupo,
} from '@/lib/modificador-grupos-service'
import {
  asignarGrupoAProducto,
  quitarGrupoDeProducto,
  reactivarGrupoEnProducto,
  reordenarProductoModificadorGrupos,
  suscribirTodosProductoModificadorGrupos,
  type ProductoModificadorGrupo,
  type ProductoModificadorGrupoInput,
  type ProductoModificadorGrupoOverride,
} from '@/lib/producto-modificador-grupos-service'

interface ProductModifierGroupsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  producto: Producto | null
}

function relacionInput(relacion: ProductoModificadorGrupo, cambios: Partial<ProductoModificadorGrupoInput> = {}): ProductoModificadorGrupoInput {
  return {
    espacioId: relacion.espacioId,
    productoId: relacion.productoId,
    grupoId: relacion.grupoId,
    orden: relacion.orden,
    activo: relacion.activo,
    ...(relacion.minSeleccion !== undefined ? { minSeleccion: relacion.minSeleccion } : {}),
    ...(relacion.maxSeleccion !== undefined ? { maxSeleccion: relacion.maxSeleccion } : {}),
    ...(relacion.opcionesPermitidas !== undefined ? { opcionesPermitidas: relacion.opcionesPermitidas } : {}),
    ...(relacion.opcionOverrides !== undefined ? { opcionOverrides: relacion.opcionOverrides } : {}),
    ...cambios,
  }
}

export function ProductModifierGroupsSheet({ open, onOpenChange, producto }: ProductModifierGroupsSheetProps) {
  const [grupos, setGrupos] = useState<ModificadorGrupo[]>([])
  const [relaciones, setRelaciones] = useState<ProductoModificadorGrupo[]>([])
  const [cargando, setCargando] = useState(false)
  const [grupoNuevoId, setGrupoNuevoId] = useState('')
  const [configurandoId, setConfigurandoId] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !producto) {
      setGrupos([])
      setRelaciones([])
      setGrupoNuevoId('')
      setConfigurandoId(null)
      return
    }
    setCargando(true)
    const unsubGrupos = suscribirTodosModificadorGrupos(producto.espacioId, setGrupos)
    const unsubRelaciones = suscribirTodosProductoModificadorGrupos(producto.id, (data) => {
      setRelaciones(data)
      setCargando(false)
    })
    return () => { unsubGrupos(); unsubRelaciones() }
  }, [open, producto?.id, producto?.espacioId])

  const gruposActivosDisponibles = useMemo(() => {
    const asignados = new Set(relaciones.map((relacion) => relacion.grupoId))
    return grupos.filter((grupo) => grupo.activo && !asignados.has(grupo.id))
  }, [grupos, relaciones])

  const relacionesActivas = useMemo(() => relaciones.filter((relacion) => relacion.activo), [relaciones])
  const relacionesInactivas = useMemo(() => relaciones.filter((relacion) => !relacion.activo), [relaciones])

  const asignar = async () => {
    if (!producto || !grupoNuevoId) return
    const grupo = grupos.find((item) => item.id === grupoNuevoId)
    if (!grupo) return
    setProcesando(grupo.id)
    try {
      await asignarGrupoAProducto({
        espacioId: producto.espacioId,
        productoId: producto.id,
        grupoId: grupo.id,
        orden: relaciones.length,
        activo: true,
      })
      setGrupoNuevoId('')
      toast.success(`${grupo.nombre} asignado a ${producto.nombre}`)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo asignar el grupo.')
    } finally { setProcesando(null) }
  }

  const guardarRelacion = async (input: ProductoModificadorGrupoInput, mensaje = 'Configuración actualizada') => {
    setProcesando(input.grupoId)
    try {
      await asignarGrupoAProducto(input)
      toast.success(mensaje)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la relación.')
    } finally { setProcesando(null) }
  }

  const quitar = async (relacion: ProductoModificadorGrupo) => {
    setProcesando(relacion.grupoId)
    try {
      await quitarGrupoDeProducto(relacion.productoId, relacion.grupoId)
      if (configurandoId === relacion.grupoId) setConfigurandoId(null)
      toast.success('Grupo quitado del producto')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo quitar el grupo.')
    } finally { setProcesando(null) }
  }

  const reactivar = async (relacion: ProductoModificadorGrupo) => {
    setProcesando(relacion.grupoId)
    try {
      await reactivarGrupoEnProducto(relacion.productoId, relacion.grupoId)
      toast.success('Grupo reactivado sin perder su configuración')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reactivar el grupo.')
    } finally { setProcesando(null) }
  }

  const mover = async (index: number, direccion: -1 | 1) => {
    const destino = index + direccion
    if (destino < 0 || destino >= relacionesActivas.length || !producto) return
    const reordenadas = [...relacionesActivas]
    ;[reordenadas[index], reordenadas[destino]] = [reordenadas[destino], reordenadas[index]]
    setProcesando(relacionesActivas[index].grupoId)
    try {
      await reordenarProductoModificadorGrupos(producto.id, [
        ...reordenadas.map((relacion) => relacion.grupoId),
        ...relacionesInactivas.map((relacion) => relacion.grupoId),
      ])
      toast.success('Orden de grupos actualizado')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reordenar los grupos.')
    } finally { setProcesando(null) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="theme-pos w-full sm:max-w-xl p-0 gap-0">
        <SheetHeader className="px-6 py-5 border-b border-border/50">
          <SheetTitle className="text-xl font-bold flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary" />Modificadores</SheetTitle>
          <SheetDescription>{producto ? `Configura los grupos disponibles para ${producto.nombre}.` : 'Selecciona un producto para administrar sus grupos.'}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {cargando ? <div className="h-44 flex items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Cargando grupos...</div> : <>
            <section className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-3">
              <Label htmlFor="agregar-grupo" className="text-sm font-semibold">Agregar grupo existente</Label>
              <div className="flex gap-2">
                <Select value={grupoNuevoId} onValueChange={setGrupoNuevoId}><SelectTrigger id="agregar-grupo" className="flex-1"><SelectValue placeholder={gruposActivosDisponibles.length ? 'Selecciona un grupo' : 'No hay grupos disponibles'} /></SelectTrigger><SelectContent>{gruposActivosDisponibles.map((grupo) => <SelectItem key={grupo.id} value={grupo.id}>{grupo.nombre}</SelectItem>)}</SelectContent></Select>
                <Button onClick={asignar} disabled={!grupoNuevoId || !!procesando} className="gap-2"><Plus className="h-4 w-4" />Asignar</Button>
              </div>
            </section>

            {relaciones.length === 0 ? <div className="rounded-xl border border-dashed border-border/70 py-10 px-5 text-center"><SlidersHorizontal className="h-9 w-9 text-muted-foreground/40 mx-auto mb-3" /><p className="font-medium">Sin grupos asignados</p><p className="text-sm text-muted-foreground mt-1">Añade un grupo del catálogo para reutilizar sus opciones.</p></div>
              : <section className="space-y-3"><div><h3 className="text-sm font-bold uppercase tracking-wide text-primary">Grupos asignados</h3><p className="text-xs text-muted-foreground mt-1">El orden será el orden de presentación futura en el POS.</p></div>{relacionesActivas.map((relacion, index) => {
                const grupo = grupos.find((item) => item.id === relacion.grupoId)
                if (!grupo) return <div key={relacion.id} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">No se encontró el grupo {relacion.grupoId}.</div>
                return <RelationCard key={relacion.id} relacion={relacion} grupo={grupo} indice={index} total={relacionesActivas.length} procesando={procesando === relacion.grupoId} abierto={configurandoId === relacion.grupoId} onToggleConfig={() => setConfigurandoId(configurandoId === relacion.grupoId ? null : relacion.grupoId)} onGuardar={guardarRelacion} onMover={mover} onQuitar={quitar} />
              })}{relacionesInactivas.length > 0 && <div className="pt-2 space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Grupos inactivos</p>{relacionesInactivas.map((relacion) => { const grupo = grupos.find((item) => item.id === relacion.grupoId); return <div key={relacion.id} className="rounded-lg border border-border/50 bg-muted/30 p-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium truncate">{grupo?.nombre ?? relacion.grupoId}</p><p className="text-xs text-muted-foreground">Conserva sus límites y overrides.</p></div><Button size="sm" variant="outline" disabled={procesando === relacion.grupoId} onClick={() => reactivar(relacion)}>{procesando === relacion.grupoId && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Reactivar</Button></div> })}</div>}</section>}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface RelationCardProps {
  relacion: ProductoModificadorGrupo
  grupo: ModificadorGrupo
  indice: number
  total: number
  procesando: boolean
  abierto: boolean
  onToggleConfig: () => void
  onGuardar: (input: ProductoModificadorGrupoInput, mensaje?: string) => Promise<void>
  onMover: (indice: number, direccion: -1 | 1) => Promise<void>
  onQuitar: (relacion: ProductoModificadorGrupo) => Promise<void>
}

function RelationCard({ relacion, grupo, indice, total, procesando, abierto, onToggleConfig, onGuardar, onMover, onQuitar }: RelationCardProps) {
  const [minimo, setMinimo] = useState(relacion.minSeleccion?.toString() ?? '')
  const [maximo, setMaximo] = useState(relacion.maxSeleccion?.toString() ?? '')
  const [restringir, setRestringir] = useState(relacion.opcionesPermitidas !== undefined)
  const [permitidas, setPermitidas] = useState<string[]>(relacion.opcionesPermitidas ?? grupo.opciones.map((opcion) => opcion.id))
  const [overrides, setOverrides] = useState<Record<string, ProductoModificadorGrupoOverride>>(relacion.opcionOverrides ?? {})
  const [error, setError] = useState('')

  useEffect(() => {
    setMinimo(relacion.minSeleccion?.toString() ?? '')
    setMaximo(relacion.maxSeleccion?.toString() ?? '')
    setRestringir(relacion.opcionesPermitidas !== undefined)
    setPermitidas(relacion.opcionesPermitidas ?? grupo.opciones.map((opcion) => opcion.id))
    setOverrides(relacion.opcionOverrides ?? {})
    setError('')
  }, [relacion, grupo])

  const opcionesVisibles = grupo.opciones.filter((opcion) => !restringir || permitidas.includes(opcion.id))

  const actualizarOverride = (opcionId: string, cambio: Partial<ProductoModificadorGrupoOverride>) => {
    setOverrides((actual) => {
      const siguiente = { ...(actual[opcionId] ?? {}), ...cambio }
      if (siguiente.precioDelta === undefined && siguiente.activo === undefined) {
        const { [opcionId]: _, ...sinOpcion } = actual
        return sinOpcion
      }
      return { ...actual, [opcionId]: siguiente }
    })
  }

  const cambiarPermitida = (opcionId: string, checked: boolean) => {
    setPermitidas((actual) => checked ? [...actual, opcionId] : actual.filter((id) => id !== opcionId))
    if (!checked) {
      setOverrides((actual) => { const { [opcionId]: _, ...sinOpcion } = actual; return sinOpcion })
    }
  }

  const guardarConfiguracion = async () => {
    const min = minimo === '' ? undefined : Number(minimo)
    const max = maximo === '' ? undefined : Number(maximo)
    const opcionesEfectivas = opcionesVisibles.filter((opcion) => (overrides[opcion.id]?.activo ?? opcion.activo))
    if ((min !== undefined && (!Number.isInteger(min) || min < 0)) || (max !== undefined && (!Number.isInteger(max) || max < 0))) {
      setError('Los límites deben ser números enteros mayores o iguales a cero.')
      return
    }
    const minimoEfectivo = min ?? grupo.minSeleccion
    const maximoEfectivo = max ?? grupo.maxSeleccion
    if (maximoEfectivo < minimoEfectivo) { setError('El máximo no puede ser menor que el mínimo.'); return }
    if (restringir && permitidas.length === 0) { setError('Selecciona al menos una opción permitida.'); return }
    if (maximoEfectivo > opcionesEfectivas.length) { setError('El máximo supera las opciones disponibles para este producto.'); return }
    setError('')
    await onGuardar({
      espacioId: relacion.espacioId,
      productoId: relacion.productoId,
      grupoId: relacion.grupoId,
      orden: relacion.orden,
      activo: relacion.activo,
      ...(min !== undefined ? { minSeleccion: min } : {}),
      ...(max !== undefined ? { maxSeleccion: max } : {}),
      ...(restringir ? { opcionesPermitidas: permitidas } : {}),
      ...(Object.keys(overrides).length > 0 ? { opcionOverrides: overrides } : {}),
    })
  }

  return <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
    <div className="p-3 flex items-start gap-2"><div className="flex flex-col gap-1 pt-1"><Button variant="ghost" size="icon" className="h-6 w-6" disabled={procesando || indice === 0} onClick={() => onMover(indice, -1)} aria-label="Subir grupo"><ChevronUp className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-6 w-6" disabled={procesando || indice === total - 1} onClick={() => onMover(indice, 1)} aria-label="Bajar grupo"><ChevronDown className="h-3.5 w-3.5" /></Button></div><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold truncate">{grupo.nombre}</p><Badge variant="outline">{relacion.minSeleccion ?? grupo.minSeleccion}–{relacion.maxSeleccion ?? grupo.maxSeleccion}</Badge></div><p className="text-xs text-muted-foreground mt-1">{grupo.opciones.length} opciones · orden {indice + 1}</p><label className="mt-2 inline-flex items-center gap-2 text-xs font-medium"><Switch aria-label={`Activar ${grupo.nombre} para este producto`} checked={relacion.activo} disabled={procesando || !grupo.activo} onCheckedChange={(activo) => onGuardar(relacionInput(relacion, { activo }), activo ? 'Grupo activado para el producto' : 'Grupo desactivado para el producto')} />Activo para este producto</label>{!grupo.activo && <p className="mt-1 text-xs text-muted-foreground">El grupo está inactivo en el catálogo. Reactívalo desde Modificadores para cambiar esta relación.</p>}</div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" disabled={procesando} onClick={onToggleConfig} aria-label="Configurar grupo"><Settings2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={procesando} onClick={() => onQuitar(relacion)} aria-label="Quitar grupo">{procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div></div>
    {abierto && <div className="border-t border-border/50 bg-secondary/15 px-4 py-4 space-y-5"><div><h4 className="font-semibold text-sm">Overrides del producto</h4><p className="text-xs text-muted-foreground mt-1">Deja los límites vacíos para usar la configuración base del grupo.</p></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor={`min-${relacion.id}`}>Mínimo</Label><Input id={`min-${relacion.id}`} type="number" min="0" placeholder={String(grupo.minSeleccion)} value={minimo} onChange={(event) => setMinimo(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor={`max-${relacion.id}`}>Máximo</Label><Input id={`max-${relacion.id}`} type="number" min="0" placeholder={String(grupo.maxSeleccion)} value={maximo} onChange={(event) => setMaximo(event.target.value)} /></div></div><div className="space-y-3"><label className="flex items-center gap-2 text-sm font-medium"><Switch aria-label="Restringir opciones para este producto" checked={restringir} onCheckedChange={setRestringir} />Restringir opciones para este producto</label>{restringir && <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/50 bg-background/50 p-3">{grupo.opciones.map((opcion) => <label key={opcion.id} className="flex items-center gap-2 text-sm"><Checkbox checked={permitidas.includes(opcion.id)} onCheckedChange={(checked) => cambiarPermitida(opcion.id, checked === true)} />{opcion.nombre}<span className="ml-auto text-xs text-muted-foreground">{opcion.activo ? 'Activa' : 'Inactiva'}</span></label>)}</div>}</div><div className="space-y-3"><div><h5 className="text-sm font-semibold">Ajustes por opción</h5><p className="text-xs text-muted-foreground mt-1">Cambia precio adicional o disponibilidad solo para este producto.</p></div>{opcionesVisibles.map((opcion) => { const override = overrides[opcion.id]; const activa = override?.activo ?? opcion.activo; return <div key={opcion.id} className="rounded-lg border border-border/50 bg-background/50 p-3 grid grid-cols-[1fr_7rem] gap-3 items-center"><div><p className="text-sm font-medium">{opcion.nombre}</p><label className="mt-2 flex items-center gap-2 text-xs"><Switch aria-label={`Disponibilidad de ${opcion.nombre}`} checked={activa} onCheckedChange={(activo) => actualizarOverride(opcion.id, { activo: activo === opcion.activo ? undefined : activo })} />Disponible</label></div><div className="space-y-1"><Label className="text-xs">Precio adicional</Label><Input aria-label={`Precio adicional de ${opcion.nombre}`} type="number" value={override?.precioDelta ?? opcion.precioDelta} onChange={(event) => { const valor = event.target.value; actualizarOverride(opcion.id, { precioDelta: valor === '' ? undefined : Number(valor) }) }} /><Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => actualizarOverride(opcion.id, { precioDelta: undefined, activo: undefined })}>Restablecer</Button></div></div> })}</div>{error && <p className="text-xs text-destructive" role="alert">{error}</p>}<div className="flex justify-end"><Button size="sm" disabled={procesando} onClick={guardarConfiguracion}>{procesando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Guardar configuración</Button></div></div>}
  </div>
}
