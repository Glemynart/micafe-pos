'use client'

import { useState, useEffect } from 'react'
import {
  Shield,
  Check,
  Eye,
  X,
  Users,
  Search,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
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
} from '@/lib/permisos-service'

const ROLES: { key: string; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'cajero', label: 'Cajero' },
  { key: 'cocinero', label: 'Cocinero' },
  { key: 'marketing', label: 'Marketing' },
]

const MODULE_LABELS: Record<string, string> = {
  sell: 'Vender',
  kitchen: 'Cocina (KDS)',
  inventory: 'Inventario',
  recipes: 'Recetas',
  purchases: 'Compras',
  reports: 'Reportes',
  shifts: 'Turnos',
  waste: 'Mermas',
  gastos: 'Gastos',
  permissions: 'Permisos',
  settings: 'Configuración',
  cuentas_cobro: 'Cuentas de Cobro',
  clientes: 'Clientes',
  consignaciones: 'Consignaciones',
  alquiler_dashboard: 'Alquileres',
}

type PermissionLevel = 'full' | 'read' | 'none'

function mapMatrixToPermisos(matrix: Record<string, Record<string, PermissionLevel>>, rolKey: string): string[] {
  const permisos: string[] = []
  MODULOS.forEach((mod) => {
    if (matrix[mod]?.[rolKey] !== 'none') {
      permisos.push(mod)
    }
  })
  return permisos
}

function buildDefaultMatrix(rolesPermisos: PermisosRol[]): Record<string, Record<string, PermissionLevel>> {
  const matrix: Record<string, Record<string, PermissionLevel>> = {}
  MODULOS.forEach((mod) => {
    matrix[mod] = {}
    ROLES.forEach((rol) => {
      const rp = rolesPermisos.find((r) => r.rol === rol.key)
      if (rp) {
        matrix[mod][rol.key] = rp.permisos.includes(mod) ? 'full' : 'none'
      } else {
        const defaults = getPermisosPorRol(rol.key as RolUsuario)
        matrix[mod][rol.key] = defaults.includes(mod) ? 'full' : 'none'
      }
    })
  })
  return matrix
}

export function PermissionsModule() {
  const [activeTab, setActiveTab] = useState('roles')
  const [permisosRoles, setPermisosRoles] = useState<PermisosRol[]>([])
  const [permissions, setPermissions] = useState<Record<string, Record<string, PermissionLevel>>>({})
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [cargandoRoles, setCargandoRoles] = useState(true)
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const unsubRoles = suscribirPermisosRoles((roles) => {
      setPermisosRoles(roles)
      setPermissions(buildDefaultMatrix(roles))
      setCargandoRoles(false)
    })
    return unsubRoles
  }, [])

  useEffect(() => {
    const unsub = suscribirUsuarios((data) => {
      setUsuarios(data)
      setCargandoUsuarios(false)
    })
    return unsub
  }, [])

  const cyclePermission = (moduleId: string, role: string) => {
    setPermissions((prev) => {
      const current = prev[moduleId]?.[role] ?? 'none'
      const next: PermissionLevel = current === 'full' ? 'none' : 'full'
      return {
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          [role]: next,
        },
      }
    })
  }

  const getPermissionIcon = (level: PermissionLevel) => {
    switch (level) {
      case 'full':
        return <Check className="h-4 w-4 text-success" />
      case 'read':
        return <Eye className="h-4 w-4 text-warning" />
      case 'none':
        return <X className="h-4 w-4 text-destructive" />
    }
  }

  const getPermissionBadge = (level: PermissionLevel) => {
    switch (level) {
      case 'full':
        return <Badge className="bg-success/20 text-success border-success/30">Completo</Badge>
      case 'read':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Solo lectura</Badge>
      case 'none':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Sin acceso</Badge>
    }
  }

  const handleGuardarRoles = async () => {
    setGuardando(true)
    try {
      for (const rol of ROLES) {
        const permisos = mapMatrixToPermisos(permissions, rol.key)
        await guardarPermisosRol(rol.key, permisos)
      }
      toast.success('Permisos de roles guardados exitosamente')
    } catch (err) {
      toast.error('Error al guardar permisos')
    } finally {
      setGuardando(false)
    }
  }

  const handleGuardarUsuario = async (uid: string, modulosPermitidos: string[]) => {
    try {
      await actualizarPermisosUsuario(uid, modulosPermitidos)
      toast.success('Permisos del usuario actualizados')
    } catch (err) {
      toast.error('Error al guardar permisos')
    }
  }

  const filteredUsers = usuarios.filter((u) =>
    u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.username ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const rolBadge = (rol: string) => {
    switch (rol) {
      case 'admin': return 'Administrador'
      case 'cajero': return 'Cajero'
      case 'cocinero': return 'Cocinero'
      case 'marketing': return 'Marketing'
      default: return rol
    }
  }

  if (cargandoRoles || cargandoUsuarios) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Permisos
          </h1>
          <p className="text-muted-foreground">Configura los permisos por rol y usuario</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="bg-card border border-border w-fit">
          <TabsTrigger value="roles" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Shield className="h-4 w-4" />
            Permisos por Rol
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
            <Users className="h-4 w-4" />
            Excepciones por Usuario
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="flex-1 mt-4 flex flex-col">
          <Card className="flex-1 flex flex-col bg-card border-border">
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-foreground">Matriz de Permisos</CardTitle>
              <CardDescription className="text-muted-foreground">
                Haz clic en una celda para alternar el permiso (Completo / Sin acceso)
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground w-48">Módulo</TableHead>
                    {ROLES.map((role) => (
                      <TableHead key={role.key} className="text-muted-foreground text-center">
                        {role.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODULOS.map((modId) => (
                    <TableRow key={modId} className="border-border hover:bg-secondary/30">
                      <TableCell className="font-medium text-foreground">
                        {MODULE_LABELS[modId] ?? modId}
                      </TableCell>
                      {ROLES.map((role) => (
                        <TableCell key={role.key} className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cyclePermission(modId, role.key)}
                            className={cn(
                              "gap-2 transition-all",
                              permissions[modId]?.[role.key] === 'full' && "hover:bg-success/10",
                              permissions[modId]?.[role.key] === 'none' && "hover:bg-destructive/10"
                            )}
                          >
                            {getPermissionIcon(permissions[modId]?.[role.key] ?? 'none')}
                            <span className={cn(
                              "text-xs",
                              permissions[modId]?.[role.key] === 'full' && "text-success",
                              permissions[modId]?.[role.key] === 'none' && "text-destructive"
                            )}>
                              {permissions[modId]?.[role.key] === 'full' ? 'Completo' : 'Ninguno'}
                            </span>
                          </Button>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex justify-end mt-4">
            <Button className="bg-primary text-primary-foreground" onClick={handleGuardarRoles} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar Permisos de Roles
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users" className="flex-1 mt-4">
          <div className="grid grid-cols-3 gap-4 h-full">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="text-foreground text-base">Usuarios</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar usuario..."
                    className="pl-9 bg-input"
                  />
                </div>
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <button
                      key={user.uid}
                      onClick={() => setSelectedUser(user.uid)}
                      className={cn(
                        "w-full p-3 rounded-lg text-left transition-all",
                        "hover:bg-secondary/50",
                        selectedUser === user.uid && "bg-primary/10 border border-primary/30"
                      )}
                    >
                      <p className="font-medium text-foreground">{user.nombre}</p>
                      <p className="text-xs text-muted-foreground">{user.username}</p>
                      <Badge variant="secondary" className="mt-1">
                        {rolBadge(user.rol)}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2 bg-card border-border">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="text-foreground">
                  {selectedUser
                    ? `Permisos de ${usuarios.find((u) => u.uid === selectedUser)?.nombre ?? ''}`
                    : 'Selecciona un usuario'}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Sobrescribe los permisos del rol para este usuario
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {selectedUser ? (
                  <div className="space-y-3">
                    {MODULOS.map((modId) => {
                      const user = usuarios.find((u) => u.uid === selectedUser)
                      const userPerms = new Set(user?.permisos ?? [])
                      const hasAccess = userPerms.has(modId)

                      return (
                        <div
                          key={modId}
                          className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                        >
                          <span className="font-medium text-foreground">{MODULE_LABELS[modId] ?? modId}</span>
                          <div className="flex items-center gap-3">
                            {getPermissionBadge(hasAccess ? 'full' : 'none')}
                            <Select
                              value={hasAccess ? 'full' : 'none'}
                              onValueChange={(v) => {
                                const newPerms = new Set(user?.permisos ?? [])
                                if (v === 'full') {
                                  newPerms.add(modId)
                                } else {
                                  newPerms.delete(modId)
                                }
                                handleGuardarUsuario(selectedUser, Array.from(newPerms))
                              }}
                            >
                              <SelectTrigger className="w-40 bg-input">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full">
                                  <div className="flex items-center gap-2">
                                    <Check className="h-4 w-4 text-success" />
                                    Acceso completo
                                  </div>
                                </SelectItem>
                                <SelectItem value="none">
                                  <div className="flex items-center gap-2">
                                    <X className="h-4 w-4 text-destructive" />
                                    Sin acceso
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Users className="h-12 w-12 mb-3 opacity-50" />
                    <p>Selecciona un usuario para ver y editar sus permisos</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
