"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Trash2, Shield, Users, Loader2 } from "lucide-react"
import {
  suscribirUsuarios,
  crearOperador,
  actualizarRolUsuario,
  toggleUsuarioActivo,
  type Usuario,
  type RolUsuario,
  type ResultadoCreacionOperador,
} from "@/lib/permisos-service"

export function UserManagement() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [usuarioADesactivar, setUsuarioADesactivar] = useState<Usuario | null>(null)
  const [newUser, setNewUser] = useState({ nombre: "", rol: "cajero" as RolUsuario })
  const [creando, setCreando] = useState(false)
  const [guardandoRol, setGuardandoRol] = useState<string | null>(null)
  const [showCredential, setShowCredential] = useState(false)
  const [credentialData, setCredentialData] = useState<ResultadoCreacionOperador | null>(null)
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    const unsub = suscribirUsuarios((data) => {
      setUsuarios(data)
      setCargando(false)
    })
    return unsub
  }, [])

  const handleCreateUser = async () => {
    if (!newUser.nombre.trim()) {
      toast.error("El nombre es obligatorio")
      return
    }

    setCreando(true)
    try {
      const result = await crearOperador(newUser.nombre.trim(), newUser.rol)
      setCredentialData(result)
      setShowCredential(true)
      setShowCreate(false)
      setNewUser({ nombre: "", rol: "cajero" })
    } catch (err: any) {
      toast.error(err?.message || "Error al crear operador")
    } finally {
      setCreando(false)
    }
  }

  const handleCloseCredential = () => {
    setShowCredential(false)
    setCredentialData(null)
    setShowPin(false)
    toast.success("Operador creado. Entrega el código y PIN al operador.")
  }

  const confirmDeleteUser = (user: Usuario) => {
    setUsuarioADesactivar(user)
    setShowDelete(true)
  }

  const handleDeleteUser = async () => {
    if (!usuarioADesactivar) return
    try {
      await toggleUsuarioActivo(usuarioADesactivar.uid, false)
      toast.success(`Usuario "${usuarioADesactivar.nombre}" desactivado`)
      setShowDelete(false)
      setUsuarioADesactivar(null)
    } catch (err) {
      toast.error("Error al desactivar usuario")
    }
  }

  const handleChangeRole = async (uid: string, nuevoRol: string) => {
    setGuardandoRol(uid)
    try {
      await actualizarRolUsuario(uid, nuevoRol as RolUsuario)
      toast.success("Rol actualizado")
    } catch (err) {
      toast.error("Error al cambiar rol")
    } finally {
      setGuardandoRol(null)
    }
  }

  const roleBadge = (rol: string) => {
    if (rol === "admin") {
      return <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">Administrador</Badge>
    }
    if (rol === "cajero") {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">Cajero</Badge>
    }
    if (rol === "supervisor") {
      return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Supervisor</Badge>
    }
    return <Badge variant="outline" className="bg-muted text-muted-foreground">Cocinero</Badge>
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestion de Operadores
          </CardTitle>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Nuevo Operador
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No hay operadores registrados
                  </TableCell>
                </TableRow>
              )}
              {usuarios.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell>
                    {guardandoRol === u.uid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Select value={u.rol} onValueChange={(v) => handleChangeRole(u.uid, v)}>
                        <SelectTrigger className="w-36 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="cajero">Cajero</SelectItem>
                          <SelectItem value="cocinero">Cocinero</SelectItem>
                          <SelectItem value="marketing">Marketing</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.activo ? roleBadge(u.rol) : <Badge variant="destructive">Inactivo</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => confirmDeleteUser(u)}
                      disabled={!u.activo}
                      title={u.activo ? "Desactivar usuario" : "Usuario ya inactivo"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Informacion de Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
            <p>Los operadores usan código + PIN para iniciar sesión. El PIN temporal debe cambiarse en el primer ingreso.</p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
            <p>Los roles determinan los modulos y permisos del operador en el sistema.</p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
            <p>Los cajeros solo pueden realizar ventas. Los cocineros ven el KDS. Solo administradores tienen acceso total.</p>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
            <p>Desactivar un operador no elimina sus datos, solo impide que inicie sesion.</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Operador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-nombre">Nombre completo</Label>
              <Input
                id="new-nombre"
                placeholder="Ej: Carlos Rodriguez"
                value={newUser.nombre}
                onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Rol</Label>
              <Select value={newUser.rol} onValueChange={(v) => setNewUser({ ...newUser, rol: v as RolUsuario })}>
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (acceso total)</SelectItem>
                  <SelectItem value="supervisor">Supervisor (operación ampliada)</SelectItem>
                  <SelectItem value="cajero">Cajero (solo ventas)</SelectItem>
                  <SelectItem value="cocinero">Cocinero (solo cocina)</SelectItem>
                  <SelectItem value="marketing">Marketing (eventos y promos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={creando}>
              {creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Crear Operador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCredential} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credencial del operador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold">Estos datos no se volverán a mostrar. Entrégalos al operador ahora. El operador deberá cambiar su PIN en el primer ingreso.</p>
            <div className="space-y-1">
              <Label>Código operativo</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono bg-muted">{credentialData?.codigo}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (credentialData?.codigo) navigator.clipboard.writeText(credentialData.codigo); toast.success("Código copiado") }}
                >
                  Copiar
                </Button>
              </div>
            </div>
            {credentialData?.pinTemporal && (
              <div className="space-y-1">
                <Label>PIN temporal</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono tracking-widest bg-muted">{showPin ? credentialData.pinTemporal : "••••••"}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPin(!showPin)}
                  >
                    {showPin ? "Ocultar" : "Mostrar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { if (credentialData?.pinTemporal) navigator.clipboard.writeText(credentialData.pinTemporal); toast.success("PIN copiado") }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleCloseCredential} variant="default">
              Entendido, ya los guardé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar Usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Esta seguro que desea desactivar al usuario "{usuarioADesactivar?.nombre}"?
              El usuario no podra iniciar sesion hasta que sea reactivado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
