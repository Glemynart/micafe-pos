'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  crearModificadorGrupo,
  editarModificadorGrupo,
  type ModificadorGrupo,
  type ModificadorGrupoInput,
  type ModificadorOpcion,
} from '@/lib/modificador-grupos-service'

interface ModifierGroupEditorSheetProps {
  grupo: ModificadorGrupo | null
  espacioId: string | null
  gruposExistentes: ModificadorGrupo[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormErrors = Record<string, string>

function nuevaOpcion(orden: number): ModificadorOpcion {
  return {
    id: crypto.randomUUID(),
    nombre: '',
    precioDelta: 0,
    activo: true,
    orden,
    default: false,
  }
}

function crearBorrador(grupo: ModificadorGrupo | null, espacioId: string, orden: number): ModificadorGrupoInput {
  if (grupo) {
    return {
      espacioId: grupo.espacioId,
      nombre: grupo.nombre,
      descripcion: grupo.descripcion ?? '',
      minSeleccion: grupo.minSeleccion,
      maxSeleccion: grupo.maxSeleccion,
      activo: grupo.activo,
      orden: grupo.orden,
      opciones: grupo.opciones.map((opcion) => ({ ...opcion })),
    }
  }

  return {
    espacioId,
    nombre: '',
    descripcion: '',
    minSeleccion: 0,
    maxSeleccion: 1,
    activo: true,
    orden,
    opciones: [nuevaOpcion(0)],
  }
}

export function ModifierGroupEditorSheet({
  grupo,
  espacioId,
  gruposExistentes,
  open,
  onOpenChange,
}: ModifierGroupEditorSheetProps) {
  const [borrador, setBorrador] = useState<ModificadorGrupoInput | null>(null)
  const [errores, setErrores] = useState<FormErrors>({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open || !espacioId) return
    setBorrador(crearBorrador(grupo, espacioId, gruposExistentes.length))
    setErrores({})
  }, [open, grupo, espacioId, gruposExistentes.length])

  const opcionesActivas = useMemo(
    () => borrador?.opciones.filter((opcion) => opcion.activo).length ?? 0,
    [borrador?.opciones]
  )

  const actualizarOpcion = (id: string, cambio: Partial<ModificadorOpcion>) => {
    setBorrador((actual) => actual ? {
      ...actual,
      opciones: actual.opciones.map((opcion) => opcion.id === id ? { ...opcion, ...cambio } : opcion),
    } : actual)
  }

  const moverOpcion = (index: number, direccion: -1 | 1) => {
    setBorrador((actual) => {
      if (!actual) return actual
      const destino = index + direccion
      if (destino < 0 || destino >= actual.opciones.length) return actual
      const opciones = [...actual.opciones]
      ;[opciones[index], opciones[destino]] = [opciones[destino], opciones[index]]
      return { ...actual, opciones: opciones.map((opcion, orden) => ({ ...opcion, orden })) }
    })
  }

  const eliminarOpcion = (id: string) => {
    setBorrador((actual) => actual ? {
      ...actual,
      opciones: actual.opciones
        .filter((opcion) => opcion.id !== id)
        .map((opcion, orden) => ({ ...opcion, orden })),
    } : actual)
  }

  const validar = (): FormErrors => {
    if (!borrador) return { formulario: 'No se pudo preparar el formulario.' }
    const siguientes: FormErrors = {}
    const nombre = borrador.nombre.trim()
    const opciones = borrador.opciones
    const activas = opciones.filter((opcion) => opcion.activo)
    const defaults = activas.filter((opcion) => opcion.default)

    if (!nombre) siguientes.nombre = 'El nombre del grupo es obligatorio.'
    if (!Number.isInteger(borrador.minSeleccion) || borrador.minSeleccion < 0) {
      siguientes.minSeleccion = 'Ingresa un mínimo entero mayor o igual a cero.'
    }
    if (!Number.isInteger(borrador.maxSeleccion) || borrador.maxSeleccion < 0) {
      siguientes.maxSeleccion = 'Ingresa un máximo entero mayor o igual a cero.'
    }
    if (borrador.maxSeleccion < borrador.minSeleccion) {
      siguientes.rango = 'El máximo no puede ser menor que el mínimo.'
    }
    if (opciones.length === 0) siguientes.opciones = 'Agrega al menos una opción al grupo.'
    if (activas.length === 0) siguientes.opciones = 'El grupo debe tener al menos una opción activa.'
    if (borrador.maxSeleccion > activas.length) {
      siguientes.maxSeleccion = 'El máximo no puede superar las opciones activas.'
    }
    if (defaults.length > borrador.maxSeleccion) {
      siguientes.defaults = 'Las opciones por defecto no pueden superar el máximo de selección.'
    }

    const ids = new Set<string>()
    opciones.forEach((opcion) => {
      if (!opcion.nombre.trim()) siguientes[`opcion-${opcion.id}-nombre`] = 'El nombre es obligatorio.'
      if (!Number.isFinite(opcion.precioDelta)) siguientes[`opcion-${opcion.id}-precio`] = 'Ingresa un precio válido.'
      if (ids.has(opcion.id)) siguientes.opciones = 'Hay opciones con IDs repetidos.'
      ids.add(opcion.id)
      if (opcion.default && !opcion.activo) {
        siguientes[`opcion-${opcion.id}-default`] = 'Una opción inactiva no puede ser predeterminada.'
      }
    })
    return siguientes
  }

  const guardar = async () => {
    if (!borrador) return
    const siguientesErrores = validar()
    setErrores(siguientesErrores)
    if (Object.keys(siguientesErrores).length > 0) {
      toast.error('Revisa los campos marcados antes de guardar.')
      return
    }

    setGuardando(true)
    try {
      const payload: ModificadorGrupoInput = {
        ...borrador,
        nombre: borrador.nombre.trim(),
        descripcion: borrador.descripcion?.trim() || undefined,
        opciones: borrador.opciones.map((opcion, orden) => ({
          ...opcion,
          nombre: opcion.nombre.trim(),
          orden,
          ...(opcion.default ? { default: true } : {}),
        })),
      }
      if (grupo) {
        await editarModificadorGrupo(grupo.id, payload)
        toast.success('Grupo de modificadores actualizado')
      } else {
        await crearModificadorGrupo(payload)
        toast.success('Grupo de modificadores creado')
      }
      onOpenChange(false)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el grupo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !guardando && onOpenChange(nextOpen)}>
      <SheetContent side="right" className="theme-pos w-full sm:max-w-2xl p-0 gap-0">
        <SheetHeader className="px-6 py-5 border-b border-border/50">
          <SheetTitle className="text-xl font-bold">{grupo ? 'Editar grupo' : 'Nuevo grupo de modificadores'}</SheetTitle>
          <SheetDescription>
            Define opciones reutilizables para los productos de este espacio.
          </SheetDescription>
        </SheetHeader>

        {borrador && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Información del grupo</h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="grupo-activo" className="text-xs text-muted-foreground">Activo</Label>
                  <Switch id="grupo-activo" checked={borrador.activo} onCheckedChange={(activo) => setBorrador({ ...borrador, activo })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grupo-nombre">Nombre</Label>
                <Input id="grupo-nombre" value={borrador.nombre} onChange={(event) => setBorrador({ ...borrador, nombre: event.target.value })} aria-invalid={!!errores.nombre} placeholder="Ej. Tipo de leche" />
                {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grupo-descripcion">Descripción <span className="text-muted-foreground">(opcional)</span></Label>
                <Input id="grupo-descripcion" value={borrador.descripcion ?? ''} onChange={(event) => setBorrador({ ...borrador, descripcion: event.target.value })} placeholder="Ayuda breve para el equipo" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label htmlFor="grupo-minimo">Mínimo</Label><Input id="grupo-minimo" type="number" min="0" value={borrador.minSeleccion} onChange={(event) => setBorrador({ ...borrador, minSeleccion: Number(event.target.value) })} aria-invalid={!!errores.minSeleccion} /></div>
                <div className="space-y-1.5"><Label htmlFor="grupo-maximo">Máximo</Label><Input id="grupo-maximo" type="number" min="0" value={borrador.maxSeleccion} onChange={(event) => setBorrador({ ...borrador, maxSeleccion: Number(event.target.value) })} aria-invalid={!!errores.maxSeleccion} /></div>
                <div className="space-y-1.5"><Label htmlFor="grupo-orden">Orden</Label><Input id="grupo-orden" type="number" min="0" value={borrador.orden} onChange={(event) => setBorrador({ ...borrador, orden: Number(event.target.value) })} /></div>
              </div>
              {(errores.rango || errores.minSeleccion || errores.maxSeleccion) && <p className="text-xs text-destructive">{errores.rango || errores.minSeleccion || errores.maxSeleccion}</p>}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-bold uppercase tracking-wide text-primary">Opciones</h3><p className="text-xs text-muted-foreground mt-1">{opcionesActivas} activas · se reutilizan en los productos asignados.</p></div>
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setBorrador({ ...borrador, opciones: [...borrador.opciones, nuevaOpcion(borrador.opciones.length)] })}><Plus className="h-4 w-4" />Añadir</Button>
              </div>
              {errores.opciones && <p className="text-xs text-destructive">{errores.opciones}</p>}
              <div className="space-y-3">
                {borrador.opciones.map((opcion, index) => (
                  <div key={opcion.id} className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-3">
                    <div className="flex gap-2">
                      <div className="flex flex-col justify-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => moverOpcion(index, -1)} aria-label="Subir opción"><ChevronUp className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === borrador.opciones.length - 1} onClick={() => moverOpcion(index, 1)} aria-label="Bajar opción"><ChevronDown className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2">
                        <div><Input value={opcion.nombre} onChange={(event) => actualizarOpcion(opcion.id, { nombre: event.target.value })} placeholder="Nombre de la opción" aria-label="Nombre de la opción" aria-invalid={!!errores[`opcion-${opcion.id}-nombre`]} />{errores[`opcion-${opcion.id}-nombre`] && <p className="mt-1 text-xs text-destructive">{errores[`opcion-${opcion.id}-nombre`]}</p>}</div>
                        <div><Input type="number" value={opcion.precioDelta} onChange={(event) => actualizarOpcion(opcion.id, { precioDelta: Number(event.target.value) })} placeholder="Precio adicional" aria-label="Precio adicional" aria-invalid={!!errores[`opcion-${opcion.id}-precio`]} />{errores[`opcion-${opcion.id}-precio`] && <p className="mt-1 text-xs text-destructive">{errores[`opcion-${opcion.id}-precio`]}</p>}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => eliminarOpcion(opcion.id)} aria-label="Eliminar opción"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-8">
                      <label className="flex items-center gap-2 text-xs font-medium"><Switch aria-label={`Activar ${opcion.nombre || 'opción'}`} checked={opcion.activo} onCheckedChange={(activo) => actualizarOpcion(opcion.id, { activo, ...(activo ? {} : { default: false }) })} />Activa</label>
                      <label className="flex items-center gap-2 text-xs font-medium"><Switch aria-label={`Marcar ${opcion.nombre || 'opción'} como predeterminada`} checked={!!opcion.default} disabled={!opcion.activo} onCheckedChange={(defaultValue) => actualizarOpcion(opcion.id, { default: defaultValue })} />Predeterminada</label>
                      {errores[`opcion-${opcion.id}-default`] && <p className="text-xs text-destructive">{errores[`opcion-${opcion.id}-default`]}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {errores.defaults && <p className="text-xs text-destructive">{errores.defaults}</p>}
            </section>
          </div>
        )}

        <SheetFooter className="border-t border-border/50 px-6 py-4 flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{grupo ? 'Guardar cambios' : 'Crear grupo'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
