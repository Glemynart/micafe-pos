'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  CreditCard,
  ClipboardList,
  CheckCircle2,
  X,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCurrency } from '@/lib/demo-data'
import {
  suscribirClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
  filtrarClientes,
  type Cliente,
  type ClienteInput,
} from '@/lib/clientes-service'
import {
  suscribirCuentasPorCobrar,
  marcarComoPagada,
  calcularEstadoDIAN,
  tiempoRestanteDIAN,
  type CuentaCobro,
} from '@/lib/cuentas-cobro-service'

const CLIENTE_VACIO: ClienteInput = { nombre: '', cedula: '', telefono: '' }

export function ClientesModule() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cuentas, setCuentas] = useState<CuentaCobro[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  // Dialogs
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetalleDialog, setShowDetalleDialog] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null)
  const [clienteDetalle, setClienteDetalle] = useState<Cliente | null>(null)
  const [form, setForm] = useState<ClienteInput>(CLIENTE_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [metodoPagoFiado, setMetodoPagoFiado] = useState<'efectivo' | 'transferencia' | 'mixto'>('efectivo')
  const [cuentaACobrar, setCuentaACobrar] = useState<CuentaCobro | null>(null)
  const [showCobrarDialog, setShowCobrarDialog] = useState(false)
  const [procesandoCobro, setProcesandoCobro] = useState(false)

  useEffect(() => {
    const u1 = suscribirClientes((data) => { setClientes(data); setCargando(false) })
    const u2 = suscribirCuentasPorCobrar(setCuentas)
    return () => { u1(); u2() }
  }, [])

  const clientesFiltrados = useMemo(
    () => filtrarClientes(clientes, busqueda),
    [clientes, busqueda]
  )

  // Deuda acumulada por clienteId
  const deudaPorCliente = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cuentas) {
      if (c.clienteId) {
        map.set(c.clienteId, (map.get(c.clienteId) || 0) + c.totales.total)
      }
    }
    return map
  }, [cuentas])

  // Fiados del cliente en detalle
  const cuentasDelCliente = useMemo(() =>
    clienteDetalle
      ? cuentas.filter(c => c.clienteId === clienteDetalle.id)
      : [],
    [cuentas, clienteDetalle]
  )

  const abrirCrear = () => {
    setClienteEditando(null)
    setForm(CLIENTE_VACIO)
    setShowFormDialog(true)
  }

  const abrirEditar = (cliente: Cliente) => {
    setClienteEditando(cliente)
    setForm({ nombre: cliente.nombre, cedula: cliente.cedula, telefono: cliente.telefono })
    setShowFormDialog(true)
  }

  const abrirDetalle = (cliente: Cliente) => {
    setClienteDetalle(cliente)
    setShowDetalleDialog(true)
  }

  const handleGuardar = async () => {
    if (!form.nombre.trim()) return
    setGuardando(true)
    try {
      if (clienteEditando) {
        await actualizarCliente(clienteEditando.id, form)
      } else {
        await crearCliente(form)
      }
      setShowFormDialog(false)
    } catch (e) {
      console.error(e)
      alert('Error al guardar el cliente.')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async () => {
    if (!clienteEditando) return
    setGuardando(true)
    try {
      await eliminarCliente(clienteEditando.id)
      setShowDeleteDialog(false)
      setClienteEditando(null)
    } finally {
      setGuardando(false)
    }
  }

  const handleCobrarFiado = async () => {
    if (!cuentaACobrar) return
    setProcesandoCobro(true)
    try {
      await marcarComoPagada(cuentaACobrar.id, metodoPagoFiado, usuario?.uid)
      toast({ title: 'Pago registrado con éxito' })
      setShowCobrarDialog(false)
      setCuentaACobrar(null)
    } catch (e) {
      console.error(e)
      alert('Error al registrar el pago.')
    } finally {
      setProcesandoCobro(false)
    }
  }

  const formatFecha = (ts: { toDate: () => Date } | null) => {
    if (!ts) return '—'
    return ts.toDate().toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const totalDeudaGeneral = Array.from(deudaPorCliente.values()).reduce((a, b) => a + b, 0)

  return (
    <div className="flex h-full p-4 gap-4">
      {/* Left panel: list */}
      <div className="flex flex-col flex-1 gap-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Clientes
            </h1>
            <p className="text-muted-foreground text-sm">
              {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} ·{' '}
              {totalDeudaGeneral > 0 && (
                <span className="text-destructive font-medium">{formatCurrency(totalDeudaGeneral)} en fiados pendientes</span>
              )}
            </p>
          </div>
          <Button onClick={abrirCrear} className="bg-primary text-primary-foreground gap-2">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o teléfono..."
            className="pl-9 bg-card border-border"
          />
        </div>

        {/* List */}
        <Card className="flex-1 bg-card/60 backdrop-blur-xl border-border/50 overflow-hidden shadow-lg">
          <ScrollArea className="h-full">
            {cargando ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Cargando clientes...
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Users className="h-12 w-12 opacity-30" />
                <p className="font-medium">{busqueda ? 'Sin resultados' : 'Aún no hay clientes'}</p>
                {!busqueda && <Button variant="outline" onClick={abrirCrear} className="gap-2"><Plus className="h-4 w-4" /> Crear primer cliente</Button>}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {clientesFiltrados.map(cliente => {
                  const deuda = deudaPorCliente.get(cliente.id) || 0
                  return (
                    <div
                      key={cliente.id}
                      onClick={() => abrirDetalle(cliente)}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-primary/5 transition-all cursor-pointer group border-b border-border/30 last:border-0"
                    >
                      {/* Avatar inicial */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">
                        {cliente.nombre.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground truncate">{cliente.nombre}</p>
                          {deuda > 0 && (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/20 text-xs gap-1">
                              <AlertCircle className="h-2.5 w-2.5" />
                              {formatCurrency(deuda)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {cliente.cedula && <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" />{cliente.cedula}</span>}
                          {cliente.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{cliente.telefono}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={e => { e.stopPropagation(); abrirEditar(cliente) }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={e => { e.stopPropagation(); setClienteEditando(cliente); setShowDeleteDialog(true) }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      {/* ── Crear / Editar Dialog ── */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="bg-background border-border shadow-2xl max-w-md p-0 gap-0 overflow-hidden sm:rounded-2xl">
          <div className="bg-gradient-to-r from-primary/10 via-background to-background p-6 border-b border-border/50">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{clienteEditando ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                {clienteEditando ? 'Actualiza los datos del cliente.' : 'Completa los datos para registrar el cliente.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Nombre completo <span className="text-destructive">*</span></Label>
              <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Juan Pérez" className="bg-background/50 focus:bg-background transition-colors" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Cédula / NIT</Label>
              <Input value={form.cedula} onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))} placeholder="Ej: 1020304050" className="bg-background/50 focus:bg-background transition-colors" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Teléfono</Label>
              <Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Ej: 3001234567" className="bg-background/50 focus:bg-background transition-colors" />
            </div>
          </div>
          <div className="p-6 pt-4 border-t border-border/50 bg-muted/20">
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFormDialog(false)} className="rounded-xl">Cancelar</Button>
              <Button onClick={handleGuardar} disabled={guardando || !form.nombre.trim()} className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 rounded-xl active:scale-95 transition-all">
                {guardando ? <div className="h-4 w-4 mr-2 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : null}
                {clienteEditando ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Eliminar Dialog ── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar cliente</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas eliminar a <strong>{clienteEditando?.nombre}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
            <Button onClick={handleEliminar} disabled={guardando} className="bg-destructive text-destructive-foreground">
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detalle de cliente (fiados) ── */}
      <Dialog open={showDetalleDialog} onOpenChange={open => { setShowDetalleDialog(open); if (!open) setClienteDetalle(null) }}>
        <DialogContent className="bg-background border-border shadow-2xl max-w-lg p-0 gap-0 overflow-hidden sm:rounded-2xl">
          <div className="bg-gradient-to-r from-primary/10 via-background to-background p-6 border-b border-border/50">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shadow-sm">
                  {clienteDetalle?.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-foreground">{clienteDetalle?.nombre}</DialogTitle>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    {clienteDetalle?.cedula && <span className="flex items-center gap-1.5"><CreditCard className="h-4 w-4" />{clienteDetalle.cedula}</span>}
                    {clienteDetalle?.telefono && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />{clienteDetalle.telefono}</span>}
                  </div>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Fiados pendientes
              </h3>
              {clienteDetalle && deudaPorCliente.get(clienteDetalle.id) ? (
                <Badge className="bg-destructive/15 text-destructive border-destructive/20">
                  Total: {formatCurrency(deudaPorCliente.get(clienteDetalle.id)!)}
                </Badge>
              ) : (
                <Badge className="bg-success/15 text-success border-success/20">Al día ✓</Badge>
              )}
            </div>

            <ScrollArea className="max-h-72">
              {cuentasDelCliente.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <CheckCircle2 className="h-8 w-8 text-success/60" />
                  <p className="text-sm">Sin fiados pendientes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cuentasDelCliente.map(cuenta => {
                    const estadoDIAN = calcularEstadoDIAN(cuenta.fecha)
                    return (
                      <div
                        key={cuenta.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                          estadoDIAN === 'danger' ? "bg-destructive/5 border-destructive/20" :
                          estadoDIAN === 'warning' ? "bg-warning/5 border-warning/20" :
                          "bg-secondary/20 border-border"
                        )}
                      >
                        <div className={cn(
                          "w-1 self-stretch rounded-full flex-shrink-0",
                          estadoDIAN === 'danger' ? "bg-destructive" :
                          estadoDIAN === 'warning' ? "bg-warning" : "bg-success"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{formatFecha(cuenta.fecha)}</p>
                          <p className="text-xs text-muted-foreground">{tiempoRestanteDIAN(cuenta.fecha)}</p>
                          {cuenta.notasFiado && <p className="text-xs text-muted-foreground mt-0.5">📝 {cuenta.notasFiado}</p>}
                        </div>
                        <p className="text-base font-bold text-primary">{formatCurrency(cuenta.totales.total)}</p>
                        <Button
                          size="sm"
                          className="bg-success/10 text-success hover:bg-success hover:text-success-foreground border border-success/30"
                          onClick={() => { setCuentaACobrar(cuenta); setShowCobrarDialog(true) }}
                        >
                          Cobrar
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDetalleDialog(false); abrirEditar(clienteDetalle!) }} className="gap-1">
              <Edit2 className="h-4 w-4" /> Editar datos
            </Button>
            <Button onClick={() => setShowDetalleDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cobrar fiado desde detalle ── */}
      <Dialog open={showCobrarDialog} onOpenChange={open => { if (!open) { setShowCobrarDialog(false); setCuentaACobrar(null) } }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              {cuentaACobrar && formatCurrency(cuentaACobrar.totales.total)} — {clienteDetalle?.nombre}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <Label>¿Cómo pagó el cliente?</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['efectivo', 'transferencia', 'mixto'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMetodoPagoFiado(m)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm capitalize",
                    metodoPagoFiado === m ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground hover:border-success/50"
                  )}
                >
                  {m === 'efectivo' && '💵'}
                  {m === 'transferencia' && '📲'}
                  {m === 'mixto' && '🔀'}
                  {m}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCobrarDialog(false)}>Cancelar</Button>
            <Button onClick={handleCobrarFiado} disabled={procesandoCobro} className="bg-success text-success-foreground">
              {procesandoCobro ? <div className="h-4 w-4 mr-1 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
