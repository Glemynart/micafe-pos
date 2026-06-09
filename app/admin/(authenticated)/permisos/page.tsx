"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, Shield, Check, X, Users, Search, Save, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  suscribirUsuarios,
  suscribirPermisosRoles,
  guardarPermisosRol,
  actualizarPermisosUsuario,
  MODULOS,
  type Usuario,
  type PermisosRol,
  getPermisosPorRol,
  type RolUsuario,
} from "@/lib/permisos-service"

const ROLES: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "cajero", label: "Cajero" },
  { key: "cocinero", label: "Cocinero" },
]

const MODULE_LABELS: Record<string, string> = {
  sell: "Vender", kitchen: "Cocina", inventory: "Inventario", recipes: "Recetas",
  purchases: "Compras", reports: "Reportes", shifts: "Turnos", waste: "Mermas",
  permissions: "Permisos", settings: "Configuración", cuentas_cobro: "Cuentas Cobro",
  clientes: "Clientes", consignaciones: "Consignaciones", alquiler_dashboard: "Alquileres",
  gastos: "Gastos", historial: "Historial",
}

function buildMatrix(rolesPermisos: PermisosRol[]): Record<string, Record<string, boolean>> {
  const m: Record<string, Record<string, boolean>> = {}
  MODULOS.forEach(mod => {
    m[mod] = {}
    ROLES.forEach(rol => {
      const rp = rolesPermisos.find(r => r.rol === rol.key)
      if (rp) m[mod][rol.key] = rp.permisos.includes(mod)
      else m[mod][rol.key] = getPermisosPorRol(rol.key as RolUsuario).includes(mod)
    })
  })
  return m
}

export default function PermisosPage() {
  const [tab, setTab] = useState<"roles" | "users">("roles")
  const [rolesPermisos, setRolesPermisos] = useState<PermisosRol[]>([])
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({})
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [selUser, setSelUser] = useState<string>("")
  const [search, setSearch] = useState("")
  const [cargandoR, setCargandoR] = useState(true)
  const [cargandoU, setCargandoU] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [gu, setGu] = useState<string | null>(null)

  useEffect(() => {
    const u = suscribirPermisosRoles(r => { setRolesPermisos(r); setMatrix(buildMatrix(r)); setCargandoR(false) })
    return u
  }, [])

  useEffect(() => {
    const u = suscribirUsuarios(d => { setUsuarios(d); setCargandoU(false) })
    return u
  }, [])

  const toggle = (modId: string, rolKey: string) => {
    setMatrix(prev => {
      const next = structuredClone(prev)
      next[modId][rolKey] = !next[modId][rolKey]
      return next
    })
  }

  const hGuardarRoles = async () => {
    setGuardando(true)
    try {
      for (const rol of ROLES) {
        const perms = MODULOS.filter(mod => matrix[mod]?.[rol.key])
        await guardarPermisosRol(rol.key, perms)
      }
      toast.success("Permisos guardados")
    } catch { toast.error("Error al guardar") }
    finally { setGuardando(false) }
  }

  const hGuardarUsuario = async (uid: string, modId: string, on: boolean) => {
    setGu(uid)
    try {
      const user = usuarios.find(u => u.uid === uid)
      const perms = new Set(user?.permisos || getPermisosPorRol((user?.rol || "cajero") as RolUsuario))
      if (on) perms.add(modId); else perms.delete(modId)
      await actualizarPermisosUsuario(uid, [...perms])
      toast.success(on ? "Permiso otorgado" : "Permiso revocado")
    } catch { toast.error("Error") }
    finally { setGu(null) }
  }

  const filtered = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (u.username || "").toLowerCase().includes(search.toLowerCase())
  )

  const activePerms = new Set(usuarios.find(u => u.uid === selUser)?.permisos || [])
  const selUsuario = usuarios.find(u => u.uid === selUser)

  if (cargandoR || cargandoU) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-white/20" />
    </div>
  )

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/5 bg-white/5">
        <h1 className="text-xl font-bold text-white">Permisos</h1>
        <p className="text-xs text-white/40 mt-0.5">Configura quién accede a cada módulo</p>
      </div>

      {/* Tab Selector */}
      <div className="px-4 pt-4 pb-3 bg-white/5 border-b border-white/5">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setTab("roles")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-semibold transition-all",
              tab === "roles" ? "bg-white/10 text-white shadow-sm" : "text-white/60 hover:text-white/70"
            )}
          >
            <Shield className="h-3.5 w-3.5" />
            Por Rol
          </button>
          <button
            onClick={() => { setTab("users"); setSelUser("") }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-semibold transition-all",
              tab === "users" ? "bg-white/10 text-white shadow-sm" : "text-white/60 hover:text-white/70"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Por Usuario
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* ── TAB: Por Rol ── */}
        {tab === "roles" && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Toca un check para activar/quitar el módulo del rol
            </p>

            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-4 gap-0 border-b border-white/5 bg-white/5 px-3 py-2">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider col-span-1">Módulo</span>
                {ROLES.map(r => (
                  <span key={r.key} className="text-[10px] font-bold text-white/40 uppercase tracking-wider text-center">{r.label}</span>
                ))}
              </div>
              {/* Table rows */}
              <div className="divide-y divide-white/5">
                {MODULOS.map(mod => (
                  <div key={mod} className="grid grid-cols-4 gap-0 px-3 py-2.5 items-center hover:bg-white/5 transition-colors">
                    <span className="text-sm text-white/70 font-medium truncate pr-2">{MODULE_LABELS[mod] || mod}</span>
                    {ROLES.map(rol => (
                      <div key={rol.key} className="flex justify-center">
                        <button
                          onClick={() => toggle(mod, rol.key)}
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90",
                            matrix[mod]?.[rol.key]
                              ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                              : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          )}
                        >
                          {matrix[mod]?.[rol.key]
                            ? <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            : <X className="h-3.5 w-3.5 stroke-[2.5]" />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white h-10 rounded-xl text-sm font-semibold shadow-none"
              onClick={hGuardarRoles}
              disabled={guardando}
            >
              {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar cambios
            </Button>
          </div>
        )}

        {/* ── TAB: Por Usuario ── */}
        {tab === "users" && (
          <div className="space-y-3">
            {selUser && selUsuario ? (
              /* Vista detalle de usuario */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelUser("")}
                    className="w-8 h-8 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-white">{selUsuario.nombre}</p>
                    <p className="text-[11px] text-white/40">@{selUsuario.username} · {selUsuario.rol}</p>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                  {MODULOS.map(mod => {
                    const on = activePerms.has(mod)
                    return (
                      <div key={mod} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-white/70">{MODULE_LABELS[mod] || mod}</span>
                        <button
                          onClick={() => hGuardarUsuario(selUser, mod, !on)}
                          disabled={gu === selUser}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90",
                            on ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          )}
                        >
                          {gu === selUser
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : on ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : <X className="h-3.5 w-3.5 stroke-[2.5]" />
                          }
                        </button>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-white/40 text-center pb-2">
                  Estos permisos sobrescriben los del rol asignado.
                </p>
              </div>
            ) : (
              /* Lista de usuarios */
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar usuario..."
                    className="pl-9 bg-white/5 border-white/10 text-sm h-9 rounded-lg"
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                  {filtered.length === 0 && (
                    <p className="text-sm text-white/40 text-center py-8">Sin resultados</p>
                  )}
                  {filtered.map(u => (
                    <button
                      key={u.uid}
                      onClick={() => setSelUser(u.uid)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-white/60">{u.nombre.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/80">{u.nombre}</p>
                          <p className="text-[11px] text-white/40">@{u.username}</p>
                        </div>
                      </div>
                      <Badge className={cn(
                        "text-[10px] font-semibold border",
                        u.rol === "admin" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                        u.rol === "cajero" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
                        "bg-violet-500/20 text-violet-300 border-violet-500/30"
                      )}>
                        {u.rol}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
