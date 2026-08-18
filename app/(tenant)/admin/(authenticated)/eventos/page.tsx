"use client"

import { useState, useEffect, useRef } from "react"
import { useAuthContext } from "@/contexts/auth-context"
import { useSaaS } from "@/contexts/saas-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Loader2, CalendarPlus, Trash2, Edit2, Eye, EyeOff, CalendarDays, Upload, X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { suscribirEventos, crearEvento, editarEvento, toggleEvento, eliminarEvento, generarEventoId, CATEGORIAS_EVENTOS, type Evento, type EventoInput } from "@/lib/eventos-service"
import { storage } from "@/lib/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"

export default function EventosPage() {
  const { usuario } = useAuthContext()
  const { empresaId } = useSaaS()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Evento | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState<EventoInput>({ titulo: "", descripcion: "", fecha: "", hora: "", imagenUrl: "", categoria: "Otro" })
  const [draftEventoId, setDraftEventoId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = suscribirEventos(false, (data) => { setEventos(data); setCargando(false) }, () => setCargando(false))
    return unsub
  }, [empresaId])

  const openNew = () => {
    setEditing(null)
    setDraftEventoId(generarEventoId())
    setForm({ titulo: "", descripcion: "", fecha: "", hora: "", imagenUrl: "", categoria: "Otro" })
    setPreviewUrl("")
    setShowDialog(true)
  }

  const openEdit = (e: Evento) => {
    setEditing(e)
    setDraftEventoId(e.id)
    setForm({ titulo: e.titulo, descripcion: e.descripcion, fecha: e.fecha, hora: e.hora, imagenUrl: e.imagenUrl || "", categoria: e.categoria })
    setPreviewUrl(e.imagenUrl || "")
    setShowDialog(true)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar 5MB"); return }
    if (!empresaId || !draftEventoId) { toast.error("No hay un evento tenant-aware activo para subir la imagen"); return }

    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const ext = file.type.split("/")[1] || "jpg"
      const fileRef = ref(storage, `tenants/${empresaId}/eventos/${draftEventoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
      await uploadBytes(fileRef, file, { contentType: file.type })
      const url = await getDownloadURL(fileRef)
      setForm(prev => ({ ...prev, imagenUrl: url }))
      toast.success("Imagen subida")
    } catch { toast.error("Error al subir imagen") }
    finally { setUploading(false) }
  }

  const clearImage = () => {
    setForm(prev => ({ ...prev, imagenUrl: "" }))
    setPreviewUrl("")
    if (fileRef.current) fileRef.current.value = ""
  }

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.fecha || !form.hora) { toast.error("Titulo, fecha y hora requeridos"); return }
    setGuardando(true)
    try {
      if (editing) {
        await editarEvento(editing.id, form)
        toast.success("Evento actualizado")
      } else {
        await crearEvento(form, usuario?.nombre || "Admin", draftEventoId || undefined)
        toast.success("Evento creado")
      }
      setShowDialog(false)
    } catch { toast.error("Error al guardar") }
    finally { setGuardando(false) }
  }

  const handleToggle = async (e: Evento) => {
    try { await toggleEvento(e.id, !e.activo); toast.success(e.activo ? "Ocultado" : "Visible") }
    catch { toast.error("Error") }
  }

  const handleDelete = (id: string) => {
    setEventToDelete(id)
  }

  const confirmDelete = async () => {
    if (!eventToDelete) return
    setDeleting(true)
    try { 
      await eliminarEvento(eventToDelete); 
      toast.success("Eliminado") 
      setEventToDelete(null)
    }
    catch (e: any) { 
      toast.error("Error al eliminar");
      console.error("Error deleting event:", e);
    } finally {
      setDeleting(false)
    }
  }

  const eventosFuturos = eventos.filter(e => e.fecha >= new Date().toISOString().split("T")[0])
  const eventosPasados = eventos.filter(e => e.fecha < new Date().toISOString().split("T")[0])

  if (cargando) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" /></div>

  const EventoCard = ({ e }: { e: Evento }) => (
    <Card className={cn("bg-card/50 border-border", !e.activo && "opacity-50")}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">{e.categoria}</Badge>
              {!e.activo && <Badge variant="outline" className="text-[10px] text-muted-foreground">Oculto</Badge>}
            </div>
            <p className="font-medium text-foreground text-sm">{e.titulo}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <CalendarDays className="h-3 w-3 inline mr-1" />
              {new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" })}
              {" · "}{e.hora}
            </p>
            {e.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.descripcion}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}><Edit2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(e)}>{e.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Eventos</h1>
          <p className="text-sm text-muted-foreground">Gestiona la agenda de eventos del cafe</p>
        </div>
        <Button size="sm" onClick={openNew}><CalendarPlus className="h-4 w-4 mr-1" />Nuevo</Button>
      </div>

      {eventosFuturos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Proximos ({eventosFuturos.length})</p>
          <div className="space-y-2">{eventosFuturos.map(e => <EventoCard key={e.id} e={e} />)}</div>
        </div>
      )}

      {eventosPasados.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pasados ({eventosPasados.length})</p>
          <div className="space-y-2">{eventosPasados.map(e => <EventoCard key={e.id} e={e} />)}</div>
        </div>
      )}

      {eventos.length === 0 && (
        <Card className="bg-card/50 border-border"><CardContent className="py-8 text-center text-muted-foreground">No hay eventos. Crea el primero.</CardContent></Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="!bg-background !text-foreground !border-border">
          <DialogHeader><DialogTitle className="!text-foreground">{editing ? "Editar Evento" : "Nuevo Evento"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="!text-foreground/80">Titulo</Label><Input className="!bg-input !border-border !text-foreground placeholder:!text-muted-foreground/70" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Noche de Jazz en vivo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="!text-foreground/80">Fecha</Label><Input type="date" className="!bg-input !border-border !text-foreground [color-scheme:dark]" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
              <div><Label className="!text-foreground/80">Hora</Label><Input type="time" className="!bg-input !border-border !text-foreground [color-scheme:dark]" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} /></div>
            </div>
            <div><Label className="!text-foreground/80">Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                <SelectTrigger className="!bg-input !border-border !text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent className="!bg-card !border-border">{CATEGORIAS_EVENTOS.map(c => <SelectItem key={c} value={c} className="!text-foreground focus:!bg-input">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="!text-foreground/80">Descripcion</Label><Textarea className="!bg-input !border-border !text-foreground placeholder:!text-muted-foreground/70" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Detalles del evento..." rows={3} /></div>
            <div>
              <Label>Imagen</Label>
              {previewUrl ? (
                <div className="relative mt-1 rounded-xl overflow-hidden border border-border">
                  <img src={previewUrl} alt="Preview" className="w-full h-40 object-cover" />
                  <button onClick={clearImage} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                  <Button type="button" variant="outline" className="w-full h-20 border-dashed gap-2 !border-border !text-foreground/60 hover:!bg-card/50" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    {uploading ? "Subiendo..." : "Subir imagen (JPG, PNG, max 5MB)"}
                  </Button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Las imágenes nuevas se almacenan dentro del tenant activo.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="!border-border !text-foreground/70 hover:!bg-card/50" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={guardando || uploading} style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{guardando || uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!eventToDelete} onOpenChange={(open) => !open && setEventToDelete(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este evento?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Esta acción no se puede deshacer. El evento desaparecerá de la página principal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-border text-foreground hover:bg-card/50">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} disabled={deleting} className="bg-red-500 hover:bg-red-600 text-foreground border-0">
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
