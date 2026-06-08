"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Users,
  Phone,
  Mail,
  UserCheck,
  UserX,
} from "lucide-react"

export function Clientes() {
  const [clientes, setClientes] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [clienteEditar, setClienteEditar] = useState<any | null>(null)
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)

  const estadoInicial = {
    nombre: "",
    identificacion: "",
    tipo_documento: "",
    email: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    notas: "",
    estado: 1,
  }
  
  const [nuevoCliente, setNuevoCliente] = useState(estadoInicial)
  const [buscandoNit, setBuscandoNit] = useState(false)

  const buscarPorNitEnModal = async () => {
    const nit = nuevoCliente.identificacion.trim()
    if (!nit) {
      toast.error("Digita un número de identificación para buscar")
      return
    }

    setBuscandoNit(true)
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        // 1. Buscar localmente primero
        const localCli = await (window as any).api.clientes.getByIdentificacion(nit)
        if (localCli) {
          setNuevoCliente({
            nombre: localCli.nombre || "",
            identificacion: localCli.identificacion || "",
            tipo_documento: localCli.tipo_documento || "",
            email: localCli.email || "",
            telefono: localCli.telefono || "",
            direccion: localCli.direccion || "",
            ciudad: localCli.ciudad || "",
            notas: localCli.notas || "",
            estado: localCli.estado !== undefined ? localCli.estado : 1,
          })
          toast.success("Cliente encontrado en la base de datos local")
          setBuscandoNit(false)
          return
        }

        // 2. Si no está local, buscar en Factus API
        if ((window as any).api.factus?.buscarCliente) {
          const res = await (window as any).api.factus.buscarCliente(nit)
          if (res.ok && res.cliente) {
            const fc = res.cliente
            setNuevoCliente({
              ...nuevoCliente,
              nombre: fc.names || fc.company || fc.nombre || "",
              email: fc.email || "",
              telefono: fc.phone || fc.telefono || "",
              direccion: fc.address || fc.direccion || "",
            })
            toast.success("Cliente encontrado en Factus y campos autocompletados")
          } else {
            toast.info("No se encontró el NIT en Factus. Completa los datos manualmente.")
          }
        } else {
          toast.info("NIT no registrado localmente. Completa los datos manualmente.")
        }
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Error al buscar el NIT: " + err.message)
    } finally {
      setBuscandoNit(false)
    }
  }

  useEffect(() => {
    loadClientes()
  }, [])

  const loadClientes = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        const data = await (window as any).api.clientes.getAll()
        setClientes(data || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.identificacion || "").includes(busqueda) ||
      (c.email || "").toLowerCase().includes(busqueda.toLowerCase())
  )

  const guardarCliente = async () => {
    if (!nuevoCliente.nombre.trim()) {
      toast.error("El nombre es requerido")
      return
    }
    if (!nuevoCliente.identificacion.trim()) {
      toast.error("El número de identificación es requerido")
      return
    }
    if (!nuevoCliente.tipo_documento) {
      toast.error("El tipo de documento es requerido")
      return
    }
    if (!nuevoCliente.email.trim()) {
      toast.error("El correo electrónico es requerido para la facturación electrónica")
      return
    }
    
    // Validar formato de correo básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(nuevoCliente.email.trim())) {
      toast.error("Por favor ingresa un correo electrónico válido")
      return
    }

    const cli = {
      id: clienteEditar?.id,
      ...nuevoCliente,
      nombre: nuevoCliente.nombre.trim(),
      identificacion: nuevoCliente.identificacion.trim(),
      email: nuevoCliente.email.trim(),
    }

    try {
      if (typeof window !== "undefined" && (window as any).api) {
        await (window as any).api.clientes.save(cli)
        toast.success(clienteEditar ? "Cliente actualizado correctamente" : "Cliente creado correctamente")
        loadClientes()
        cerrarModal()
      }
    } catch (err: any) {
      console.error(err)
      toast.error("Error al guardar el cliente (puede que la identificación ya esté registrada)")
    }
  }

  const editarCliente = (cliente: any) => {
    setClienteEditar(cliente)
    setNuevoCliente({
      nombre: cliente.nombre || "",
      identificacion: cliente.identificacion || "",
      tipo_documento: cliente.tipo_documento || "",
      email: cliente.email || "",
      telefono: cliente.telefono || "",
      direccion: cliente.direccion || "",
      ciudad: cliente.ciudad || "",
      notas: cliente.notas || "",
      estado: cliente.estado !== undefined ? cliente.estado : 1,
    })
    setShowModal(true)
  }

  const eliminarCliente = async () => {
    if (!idToDelete) return;
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        await (window as any).api.clientes.delete(idToDelete)
        toast.success("Cliente eliminado correctamente")
        loadClientes()
        setIsDeleteDialogOpen(false)
        setIdToDelete(null)
      }
    } catch (err) {
      console.error(err)
      toast.error("Error al eliminar el cliente")
    }
  }

  const confirmarEliminar = (id: string) => {
    setIdToDelete(id)
    setIsDeleteDialogOpen(true)
  }

  const cerrarModal = () => {
    setShowModal(false)
    setClienteEditar(null)
    setNuevoCliente(estadoInicial)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Clientes</p>
              <p className="text-2xl font-bold text-foreground">{clientes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Activos</p>
              <p className="text-2xl font-bold text-foreground">
                {clientes.filter((c) => c.estado === 1).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <UserX className="h-6 w-6 text-rose-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inactivos</p>
              <p className="text-2xl font-bold text-foreground">
                {clientes.filter((c) => c.estado === 0).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente por nombre, documento o correo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Directorio de Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Cliente</TableHead>
                <TableHead className="text-muted-foreground">Identificación</TableHead>
                <TableHead className="text-muted-foreground">Correo (Envío de Factura)</TableHead>
                <TableHead className="text-muted-foreground">Teléfono</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
                <TableHead className="text-muted-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No se encontraron clientes. ¡Registra uno nuevo!
                  </TableCell>
                </TableRow>
              ) : (
                clientesFiltrados.map((cliente) => (
                  <TableRow key={cliente.id} className="border-border">
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{cliente.nombre}</p>
                        <p className="text-xs text-muted-foreground">{cliente.direccion || "Sin dirección"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground">
                      <Badge variant="outline" className="mr-2 font-sans font-normal">
                        {cliente.tipo_documento}
                      </Badge>
                      {cliente.identificacion}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-foreground">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {cliente.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-foreground">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {cliente.telefono || "Sin teléfono"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={cliente.estado === 1 ? "default" : "secondary"}
                        className={cliente.estado === 1 ? "bg-emerald-500 hover:bg-emerald-600" : "bg-muted text-muted-foreground"}
                      >
                        {cliente.estado === 1 ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => editarCliente(cliente)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive animate-pulse-hover"
                          onClick={() => confirmarEliminar(cliente.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmar Eliminar */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El cliente será marcado como eliminado en el directorio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setIdToDelete(null) }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminarCliente}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Nuevo/Editar Cliente */}
      <Dialog open={showModal} onOpenChange={cerrarModal}>
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {clienteEditar ? "Editar Cliente" : "Nuevo Cliente"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-foreground">Nombre / Razón Social <span className="text-rose-500">*</span></Label>
              <Input
                value={nuevoCliente.nombre}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })
                }
                placeholder="Nombre completo o razón social de la empresa"
                className="bg-secondary"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-1">
                <Label className="text-foreground">Documento <span className="text-rose-500">*</span></Label>
                <Select
                  value={nuevoCliente.tipo_documento}
                  onValueChange={(val) =>
                    setNuevoCliente({ ...nuevoCliente, tipo_documento: val })
                  }
                >
                  <SelectTrigger className="bg-secondary h-10 mt-1">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">CC (Cédula)</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                    <SelectItem value="CE">CE (Extranjería)</SelectItem>
                    <SelectItem value="PP">Pasaporte</SelectItem>
                    <SelectItem value="TE">T. Extranjera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2 col-span-2">
                <Label className="text-foreground">Número de Identificación <span className="text-rose-500">*</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={nuevoCliente.identificacion}
                    onChange={(e) =>
                      setNuevoCliente({ ...nuevoCliente, identificacion: e.target.value })
                    }
                    placeholder="Número o NIT sin guiones"
                    className="bg-secondary"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={buscarPorNitEnModal}
                    disabled={buscandoNit}
                  >
                    {buscandoNit ? "Buscando..." : "Buscar"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Email (Facturación Electrónica) <span className="text-rose-500">*</span></Label>
                <Input
                  type="email"
                  value={nuevoCliente.email}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, email: e.target.value })
                  }
                  placeholder="cliente@correo.com"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Teléfono</Label>
                <Input
                  value={nuevoCliente.telefono}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
                  }
                  placeholder="Número telefónico"
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Dirección</Label>
                <Input
                  value={nuevoCliente.direccion}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })
                  }
                  placeholder="Dirección del domicilio / fiscal"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Ciudad / Municipio</Label>
                <Input
                  value={nuevoCliente.ciudad || ""}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, ciudad: e.target.value })
                  }
                  placeholder="Ciudad o municipio"
                  className="bg-secondary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Notas / Observaciones</Label>
                <Textarea
                  value={nuevoCliente.notas}
                  onChange={(e) =>
                    setNuevoCliente({ ...nuevoCliente, notas: e.target.value })
                  }
                  placeholder="Observación sobre el cliente"
                  className="bg-secondary resize-none"
                  rows={2}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-foreground">Estado</Label>
                <Select
                  value={nuevoCliente.estado?.toString()}
                  onValueChange={(val) =>
                    setNuevoCliente({ ...nuevoCliente, estado: parseInt(val, 10) })
                  }
                >
                  <SelectTrigger className="bg-secondary h-10 mt-1">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Activo</SelectItem>
                    <SelectItem value="0">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={guardarCliente}>Guardar Cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
