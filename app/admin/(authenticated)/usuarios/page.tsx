"use client"

import { useState, useEffect } from "react"
import { useAuthContext } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import Link from "next/link"
import { Loader2, UserPlus, Trash2, Shield, ArrowRight, ClipboardList, LayoutGrid, ChevronRight, Lock, Truck, CalendarDays } from "lucide-react"
import { toast } from "sonner"
import { suscribirUsuarios, crearUsuario, actualizarRolUsuario, toggleUsuarioActivo, type Usuario, type RolUsuario } from "@/lib/permisos-service"

export default function UsuariosPage() {
  const { usuario: cu } = useAuthContext()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [uDel, setUDel] = useState<Usuario | null>(null)
  const [form, setForm] = useState({ usuario: "", password: "", nombre: "", rol: "cajero" as RolUsuario })
  const [creando, setCreando] = useState(false)
  const [gr, setGr] = useState<string | null>(null)

  useEffect(() => { const u = suscribirUsuarios(d => { setUsuarios(d); setCargando(false) }); return u }, [])

  const hCreate = async () => {
    if (form.usuario.length < 4) { toast.error("Mínimo 4 caracteres"); return }
    if (form.password.length < 8) { toast.error("Mínimo 8 caracteres"); return }
    if (!form.nombre.trim()) { toast.error("Nombre requerido"); return }
    setCreando(true)
    try {
      await crearUsuario(form.usuario, form.password, form.nombre.trim(), form.rol)
      toast.success("Usuario creado")
      setShowCreate(false)
      setForm({ usuario: "", password: "", nombre: "", rol: "cajero" })
    } catch (err: any) {
      toast.error(err?.code === "auth/email-already-in-use" ? "Usuario ya existe" : err?.message || "Error al crear")
    } finally { setCreando(false) }
  }

  const hDelete = async () => {
    if (!uDel) return
    try { await toggleUsuarioActivo(uDel.uid, false); toast.success("Usuario desactivado"); setShowDelete(false); setUDel(null) }
    catch { toast.error("Error al desactivar") }
  }

  const hRole = async (uid: string, rol: string) => {
    setGr(uid)
    try { await actualizarRolUsuario(uid, rol as RolUsuario); toast.success("Rol actualizado") }
    catch { toast.error("Error al actualizar") }
    finally { setGr(null) }
  }

  const rolColor = (r: string) => r === "admin" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : r === "cajero" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : r === "marketing" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "bg-violet-500/20 text-violet-300 border-violet-500/30"

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-white/20" />
    </div>
  )

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Ajustes</h1>
          <p className="text-xs text-white/40 mt-0.5">Configuración y gestión</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 px-3 rounded-lg shadow-none"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Nuevo usuario
        </Button>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Configuración */}
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Configuración</p>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {[
              { href: "/admin/permisos", label: "Permisos", desc: "Módulos por rol y usuario", icon: Shield, color: "text-amber-400", bg: "bg-amber-500/20" },
              { href: "/admin/espacios", label: "Espacios", desc: "Áreas del negocio", icon: LayoutGrid, color: "text-blue-400", bg: "bg-blue-500/20" },
            ].map(item => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                  <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white/80">{item.label}</p>
                    <p className="text-[11px] text-white/40">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/30 shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>

        {/* Operaciones */}
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Operaciones</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/admin/mermas" className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center mb-3">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-sm font-semibold text-white/80">Mermas</p>
              <p className="text-[11px] text-white/40 mt-0.5">Pérdidas registradas</p>
            </Link>
            <Link href="/admin/cuentas-cobro" className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mb-3">
                <ClipboardList className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-sm font-semibold text-white/80">Cuentas</p>
              <p className="text-[11px] text-white/40 mt-0.5">Por cobrar</p>
            </Link>
            <Link href="/admin/compras" className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center mb-3">
                <Truck className="h-4 w-4 text-sky-400" />
              </div>
              <p className="text-sm font-semibold text-white/80">Compras</p>
              <p className="text-[11px] text-white/40 mt-0.5">A proveedores</p>
            </Link>
            <Link href="/admin/eventos" className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center mb-3">
                <CalendarDays className="h-4 w-4 text-rose-400" />
              </div>
              <p className="text-sm font-semibold text-white/80">Eventos</p>
              <p className="text-[11px] text-white/40 mt-0.5">Agenda cultural</p>
            </Link>
          </div>
        </div>

        {/* Usuarios */}
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Empleados ({usuarios.length})</p>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {usuarios.length === 0 && (
              <p className="text-sm text-white/40 text-center py-8">Sin usuarios registrados</p>
            )}
            {usuarios.map(u => (
              <div key={u.uid} className="px-4 py-3 flex items-center gap-3">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white/60">{(u.nombre || u.username).charAt(0).toUpperCase()}</span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white/80 truncate">{u.nombre}</p>
                    {!u.activo && <Badge className="text-[9px] bg-red-500/20 text-red-300 border-red-500/30 py-0 px-1.5 h-4">Inactivo</Badge>}
                  </div>
                  <p className="text-[11px] text-white/40">@{u.username}</p>
                </div>
                {/* Role selector */}
                <div className="shrink-0">
                  {gr === u.uid ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/20" />
                  ) : (
                    <Select value={u.rol} onValueChange={v => hRole(u.uid, v)} disabled={u.uid === cu?.uid}>
                      <SelectTrigger className={`h-7 text-[11px] font-semibold border rounded-lg w-24 ${rolColor(u.rol)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                        <SelectItem value="cajero" className="text-xs">Cajero</SelectItem>
                        <SelectItem value="cocinero" className="text-xs">Cocinero</SelectItem>
                        <SelectItem value="marketing" className="text-xs">Marketing</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {/* Delete */}
                <button
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                  onClick={() => { setUDel(u); setShowDelete(true) }}
                  disabled={!u.activo || u.uid === cu?.uid}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Security note */}
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-start gap-3">
          <Lock className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
          <p className="text-xs text-white/60">Las contraseñas están protegidas con Firebase Authentication. Desactivar un usuario impide su acceso inmediatamente.</p>
        </div>
      </div>

      {/* Dialog crear usuario */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="!bg-[#0a1628] !text-white !border-white/10" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-white font-bold">Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-white/60 uppercase tracking-wider">Usuario (mín. 4 caracteres)</Label>
              <Input
                className="mt-1.5 !bg-[#1a2d4a] !border-white/10 !text-white placeholder:text-white/30 focus-visible:ring-[#F9B207]"
                placeholder="usuario123"
                value={form.usuario}
                onChange={e => setForm({ ...form, usuario: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-white/60 uppercase tracking-wider">Nombre completo</Label>
              <Input
                className="mt-1.5 !bg-[#1a2d4a] !border-white/10 !text-white placeholder:text-white/30 focus-visible:ring-[#F9B207]"
                placeholder="Ej: Carlos López"
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-white/60 uppercase tracking-wider">Contraseña (mín. 8 caracteres)</Label>
              <Input
                className="mt-1.5 !bg-[#1a2d4a] !border-white/10 !text-white placeholder:text-white/30 focus-visible:ring-[#F9B207]"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-white/60 uppercase tracking-wider">Rol</Label>
              <Select value={form.rol} onValueChange={v => setForm({ ...form, rol: v as RolUsuario })}>
                <SelectTrigger className="mt-1.5 !bg-[#1a2d4a] !border-white/10 !text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="!bg-[#0d1f3c] !border-white/10">
                  <SelectItem value="cocinero" className="!text-white focus:!bg-[#1a2d4a]">Cocinero</SelectItem>
                  <SelectItem value="cajero" className="!text-white focus:!bg-[#1a2d4a]">Cajero</SelectItem>
                  <SelectItem value="marketing" className="!text-white focus:!bg-[#1a2d4a]">Marketing</SelectItem>
                  <SelectItem value="admin" className="!text-white focus:!bg-[#1a2d4a]">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} className="!border-white/10 !text-white/70 hover:!bg-white/5">Cancelar</Button>
            <Button onClick={hCreate} disabled={creando} className="!bg-[#F9B207] !text-[#051D41] hover:!bg-[#e6a100] shadow-none font-bold">
              {creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Crear usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert dialog desactivar */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="!bg-[#0a1628] !text-white !border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-bold">Desactivar usuario</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              ¿Desactivar a <strong className="text-white/80">{uDel?.nombre}</strong>? Perderá acceso al sistema inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="!border-white/10 !text-white/70 hover:!bg-white/5">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={hDelete} className="!bg-red-600 hover:!bg-red-700 !text-white">Desactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
