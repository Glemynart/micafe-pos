'use client'

import { useEffect, useMemo, useState } from 'react'
import { Edit2, ListChecks, Loader2, Plus, Power, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ModifierGroupEditorSheet } from '@/components/pos/modifier-group-editor-sheet'
import {
  editarModificadorGrupo,
  eliminarModificadorGrupo,
  suscribirTodosModificadorGrupos,
  type ModificadorGrupo,
} from '@/lib/modificador-grupos-service'

interface ModifierGroupsTabProps { espacioId: string | null }

export function ModifierGroupsTab({ espacioId }: ModifierGroupsTabProps) {
  const [grupos, setGrupos] = useState<ModificadorGrupo[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [editorAbierto, setEditorAbierto] = useState(false)
  const [grupoEditando, setGrupoEditando] = useState<ModificadorGrupo | null>(null)
  const [grupoEliminar, setGrupoEliminar] = useState<ModificadorGrupo | null>(null)
  const [procesandoId, setProcesandoId] = useState<string | null>(null)

  useEffect(() => {
    if (!espacioId) {
      setGrupos([])
      setCargando(false)
      return
    }
    setCargando(true)
    return suscribirTodosModificadorGrupos(espacioId, (data) => {
      setGrupos(data)
      setCargando(false)
    })
  }, [espacioId])

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-CO')
    return termino ? grupos.filter((grupo) => `${grupo.nombre} ${grupo.descripcion ?? ''}`.toLocaleLowerCase('es-CO').includes(termino)) : grupos
  }, [grupos, busqueda])

  const abrirNuevo = () => { setGrupoEditando(null); setEditorAbierto(true) }
  const abrirEdicion = (grupo: ModificadorGrupo) => { setGrupoEditando(grupo); setEditorAbierto(true) }

  const cambiarEstado = async (grupo: ModificadorGrupo) => {
    setProcesandoId(grupo.id)
    try {
      await editarModificadorGrupo(grupo.id, { activo: !grupo.activo })
      toast.success(grupo.activo ? 'Grupo desactivado' : 'Grupo activado')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el grupo.')
    } finally { setProcesandoId(null) }
  }

  const confirmarEliminar = async () => {
    if (!grupoEliminar) return
    setProcesandoId(grupoEliminar.id)
    try {
      await eliminarModificadorGrupo(grupoEliminar.id)
      toast.success('Grupo desactivado del catálogo')
      setGrupoEliminar(null)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo desactivar el grupo.')
    } finally { setProcesandoId(null) }
  }

  return (
    <div className="flex-1 min-h-0 mt-3 sm:mt-6 animate-fade-in flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" />Grupos de modificadores</h2><p className="text-sm text-muted-foreground mt-1">Catálogo reutilizable para el espacio activo.</p></div>
        <Button onClick={abrirNuevo} disabled={!espacioId} className="gap-2"><Plus className="h-4 w-4" />Nuevo grupo</Button>
      </div>
      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar grupos..." /></div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
        {cargando ? <div className="h-48 flex items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Cargando modificadores...</div>
          : filtrados.length === 0 ? <div className="h-56 rounded-2xl border border-dashed border-border/70 flex flex-col items-center justify-center text-center px-6"><ListChecks className="h-10 w-10 text-muted-foreground/40 mb-3" /><p className="font-medium">{grupos.length === 0 ? 'Aún no hay grupos de modificadores' : 'No encontramos grupos con esa búsqueda'}</p><p className="text-sm text-muted-foreground mt-1">Crea un grupo una vez y reutilízalo en varios productos.</p></div>
          : <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pb-4">{filtrados.map((grupo) => {
            const opcionesActivas = grupo.opciones.filter((opcion) => opcion.activo).length
            return <div key={grupo.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-colors hover:border-primary/30">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold truncate">{grupo.nombre}</h3><Badge className={grupo.activo ? 'bg-success/15 text-success border-success/25' : 'bg-muted text-muted-foreground'}>{grupo.activo ? 'Activo' : 'Inactivo'}</Badge></div>{grupo.descripcion && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{grupo.descripcion}</p>}</div><div className="flex items-center"><Button variant="ghost" size="icon" onClick={() => abrirEdicion(grupo)} aria-label={`Editar ${grupo.nombre}`}><Edit2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" disabled={procesandoId === grupo.id} onClick={() => cambiarEstado(grupo)} aria-label={grupo.activo ? `Desactivar ${grupo.nombre}` : `Activar ${grupo.nombre}`}>{procesandoId === grupo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setGrupoEliminar(grupo)} aria-label={`Eliminar ${grupo.nombre}`}><Trash2 className="h-4 w-4" /></Button></div></div>
              <div className="flex flex-wrap gap-2 mt-4 text-xs"><span className="rounded-lg bg-secondary px-2.5 py-1 font-medium">{grupo.minSeleccion}–{grupo.maxSeleccion} selecciones</span><span className="rounded-lg bg-secondary px-2.5 py-1 font-medium">{opcionesActivas}/{grupo.opciones.length} opciones activas</span><span className="rounded-lg bg-secondary px-2.5 py-1 font-medium">Orden {grupo.orden}</span></div>
            </div>
          })}</div>}
      </div>

      <ModifierGroupEditorSheet open={editorAbierto} onOpenChange={setEditorAbierto} grupo={grupoEditando} espacioId={espacioId} gruposExistentes={grupos} />
      <AlertDialog open={!!grupoEliminar} onOpenChange={(open) => !open && setGrupoEliminar(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Desactivar este grupo?</AlertDialogTitle><AlertDialogDescription>El grupo dejará de estar disponible para nuevas asignaciones. Las relaciones existentes se conservan para su administración posterior.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmarEliminar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Desactivar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}
