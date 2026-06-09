"use client"

import { useState, useEffect, useRef } from "react"
import { useAuthContext } from "@/contexts/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, CalendarPlus, Trash2, Edit2, Eye, EyeOff, CalendarDays, Upload, X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { suscribirEventos, crearEvento, editarEvento, toggleEvento, eliminarEvento, CATEGORIAS_EVENTOS, type Evento, type EventoInput } from "@/lib/eventos-service"
import { storage } from "@/lib/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"

export default function EventosPage() {
  const { usuario } = useAuthContext()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Evento | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState<EventoInput>({ titulo: "", descripcion: "", fecha: "", hora: "", imagenUrl: "", categoria: "Otro" })
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = suscribirEventos(false, (data) => { setEventos(data); setCargando(false) })
    return unsub
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ titulo: "", descripcion: "", fecha: "", hora: "", imagenUrl: "", categoria: "Otro" })
    setPreviewUrl("")
    setShowDialog(true)
  }

  const openEdit = (e: Evento) => {
    setEditing(e)
    setForm({ titulo: e.titulo, descripcion: e.descripcion, fecha: e.fecha, hora: e.hora, imagenUrl: e.imagenUrl || "", categoria: e.categoria })
    setPreviewUrl(e.imagenUrl || "")
    setShowDialog(true)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar 5MB"); return }

    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const ext = file.name.split(".").pop() || "jpg"
      const fileRef = ref(storage, `eventos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
      await uploadBytes(fileRef, file)
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
        await crearEvento(form, usuario?.nombre || "Admin")
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

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar este evento?")) return
    try { await eliminarEvento(id); toast.success("Eliminado") }
    catch { toast.error("Error") }
  }

  const eventosFuturos = eventos.filter(e => e.fecha >= new Date().toISOString().split("T")[0])
  const eventosPasados = eventos.filter(e => e.fecha < new Date().toISOString().split("T")[0])

  if (cargando) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-white/20" /></div>

  const EventoCard = ({ e }: { e: Evento }) => (
    <Card className={cn("bg-white/5 border-white/10", !e.activo && "opacity-50")}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">{e.categoria}</Badge>
              {!e.activo && <Badge variant="outline" className="text-[10px] text-white/60">Oculto</Badge>}
            </div>
            <p className="font-medium text-white text-sm">{e.titulo}</p>
            <p className="text-xs text-white/60 mt-0.5">
              <CalendarDays className="h-3 w-3 inline mr-1" />
              {new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" })}
              {" · "}{e.hora}
            </p>
            {e.descripcion && <p className="text-xs text-white/60 mt-1 line-clamp-2">{e.descripcion}</p>}
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#F9B207]" />Eventos</h1>
          <p className="text-sm text-white/60">Gestiona la agenda de eventos del cafe</p>
        </div>
        <Button size="sm" onClick={openNew}><CalendarPlus className="h-4 w-4 mr-1" />Nuevo</Button>
      </div>

      {eventosFuturos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">Proximos ({eventosFuturos.length})</p>
          <div className="space-y-2">{eventosFuturos.map(e => <EventoCard key={e.id} e={e} />)}</div>
        </div>
      )}

      {eventosPasados.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">Pasados ({eventosPasados.length})</p>
          <div className="space-y-2">{eventosPasados.map(e => <EventoCard key={e.id} e={e} />)}</div>
        </div>
      )}

      {eventos.length === 0 && (
        <Card className="bg-white/5 border-white/10"><CardContent className="py-8 text-center text-white/60">No hay eventos. Crea el primero.</CardContent></Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="!bg-[#0a1628] !text-white !border-white/10">
          <DialogHeader><DialogTitle className="!text-white">{editing ? "Editar Evento" : "Nuevo Evento"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="!text-white/80">Titulo</Label><Input className="!bg-[#1a2d4a] !border-white/10 !text-white placeholder:!text-white/30" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Noche de Jazz en vivo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="!text-white/80">Fecha</Label><Input type="date" className="!bg-[#1a2d4a] !border-white/10 !text-white [color-scheme:dark]" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
              <div><Label className="!text-white/80">Hora</Label><Input type="time" className="!bg-[#1a2d4a] !border-white/10 !text-white [color-scheme:dark]" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} /></div>
            </div>
            <div><Label className="!text-white/80">Categoria</Label>
              <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                <SelectTrigger className="!bg-[#1a2d4a] !border-white/10 !text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="!bg-[#0d1f3c] !border-white/10">{CATEGORIAS_EVENTOS.map(c => <SelectItem key={c} value={c} className="!text-white focus:!bg-[#1a2d4a]">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="!text-white/80">Descripcion</Label><Textarea className="!bg-[#1a2d4a] !border-white/10 !text-white placeholder:!text-white/30" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Detalles del evento..." rows={3} /></div>
            <div>
              <Label>Imagen</Label>
              {previewUrl ? (
                <div className="relative mt-1 rounded-xl overflow-hidden border border-white/10">
                  <img src={previewUrl} alt="Preview" className="w-full h-40 object-cover" />
                  <button onClick={clearImage} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                  <Button type="button" variant="outline" className="w-full h-20 border-dashed gap-2 !border-white/10 !text-white/60 hover:!bg-white/5" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    {uploading ? "Subiendo..." : "Subir imagen (JPG, PNG, max 5MB)"}
                  </Button>
                </div>
              )}
              <p className="text-[10px] text-white/60 mt-1">O pega una URL:</p>
              <Input value={form.imagenUrl || ""} onChange={e => { setForm({ ...form, imagenUrl: e.target.value }); setPreviewUrl(e.target.value) }} placeholder="https://..." className="mt-1 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="!border-white/10 !text-white/70 hover:!bg-white/5" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={guardando || uploading} style={{ backgroundColor: '#F9B207', color: '#051D41' }}>{guardando || uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
