'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Handshake,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  CreditCard,
  Package,
  ReceiptText,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Percent,
  TrendingUp,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/demo-data'
import {
  suscribirConsignadores,
  crearConsignador,
  actualizarConsignador,
  eliminarConsignador,
  type Consignador,
  type ConsignadorInput,
} from '@/lib/consignadores-service'
import {
  suscribirProductos,
  type Producto,
} from '@/lib/productos-service'
import {
  suscribirLiquidaciones,
  crearLiquidacion,
  marcarLiquidacionPagada,
  type Liquidacion,
} from '@/lib/liquidaciones-service'
import { useEspacios } from '@/contexts/espacios-context'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FORM_VACIO: ConsignadorInput = { nombre: '', cedula: '', telefono: '', comisionPct: 30 }

const formatFecha = (ts: { toDate: () => Date } | null) => {
  if (!ts) return '—'
  return ts.toDate().toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ConsignacionesModule() {
  const { espacios } = useEspacios()

  // El espacio de consignación (id que empiece o nombre que contenga 'consign')
  const espacioConsignacion = useMemo(
    () => espacios.find(e => e.nombre.toLowerCase().includes('consign')),
    [espacios]
  )

  const [consignadores, setConsignadores] = useState<Consignador[]>([])
  const [productosConsignacion, setProductosConsignacion] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  // Consignador seleccionado (panel derecho)
  const [seleccionado, setSeleccionado] = useState<Consignador | null>(null)
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([])

  // Dialogs
  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showLiquidar, setShowLiquidar] = useState(false)
  const [showLiquidacionDetalle, setShowLiquidacionDetalle] = useState<Liquidacion | null>(null)
  const [editando, setEditando] = useState<Consignador | null>(null)
  const [form, setForm] = useState<ConsignadorInput>(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const unsub = suscribirConsignadores((data) => {
      setConsignadores(data)
      setCargando(false)
    })
    return unsub
  }, [])

  // Cargar productos del espacio de consignación
  useEffect(() => {
    if (!espacioConsignacion) return
    return suscribirProductos(espacioConsignacion.id, setProductosConsignacion)
  }, [espacioConsignacion?.id])

  // Cargar liquidaciones del consignador seleccionado
  useEffect(() => {
    if (!seleccionado) { setLiquidaciones([]); return }
    return suscribirLiquidaciones(seleccionado.id, setLiquidaciones)
  }, [seleccionado?.id])

  // Productos de cada consignador
  const productosPorConsignador = useMemo(() => {
    const map = new Map<string, Producto[]>()
    for (const p of productosConsignacion) {
      if (p.consignadorId) {
        const arr = map.get(p.consignadorId) || []
        arr.push(p)
        map.set(p.consignadorId, arr)
      }
    }
    return map
  }, [productosConsignacion])

  const productosDelSeleccionado = seleccionado
    ? productosPorConsignador.get(seleccionado.id) || []
    : []

  // Ventas aproximadas: stockInicial - stock actual (unidades movidas)
  const calcularVendido = (p: Producto) => Math.max(0, (p.stockInicial ?? 0) - p.stock)
  const calcularTotalVentas = (prods: Producto[]) =>
    prods.reduce((acc, p) => acc + calcularVendido(p) * p.precio, 0)

  const consignadoresFiltrados = consignadores.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.cedula.includes(busqueda) ||
    c.telefono.includes(busqueda)
  )

  // CRUD
  const abrirCrear = () => { setEditando(null); setForm(FORM_VACIO); setShowForm(true) }
  const abrirEditar = (c: Consignador) => {
    setEditando(c)
    setForm({ nombre: c.nombre, cedula: c.cedula, telefono: c.telefono, comisionPct: c.comisionPct })
    setShowForm(true)
  }

  const handleGuardar = async () => {
    if (!form.nombre.trim()) return
    setGuardando(true)
    try {
      if (editando) {
        await actualizarConsignador(editando.id, form)
      } else {
        const id = await crearConsignador(form)
        // Seleccionar automáticamente el nuevo consignador
        setSeleccionado({ id, ...form, activo: true, creadoEn: null })
      }
      setShowForm(false)
    } catch { alert('Error al guardar.') }
    finally { setGuardando(false) }
  }

  const handleEliminar = async () => {
    if (!editando) return
    setGuardando(true)
    try {
      await eliminarConsignador(editando.id)
      if (seleccionado?.id === editando.id) setSeleccionado(null)
      setShowDelete(false)
    } finally { setGuardando(false) }
  }

  // Liquidación
  const handleLiquidar = async () => {
    if (!seleccionado || productosDelSeleccionado.length === 0) return
    setGuardando(true)
    try {
      const items = productosDelSeleccionado.map(p => ({
        productoId: p.id,
        productoNombre: p.nombre,
        unidades: calcularVendido(p),
        precioUnitario: p.precio,
        subtotal: calcularVendido(p) * p.precio,
      })).filter(i => i.unidades > 0)

      const totalVentas = items.reduce((a, i) => a + i.subtotal, 0)
      const comisionMonto = Math.round(totalVentas * seleccionado.comisionPct / 100)
      const montoAPagar = totalVentas - comisionMonto

      await crearLiquidacion({
        consignadorId: seleccionado.id,
        consignadorNombre: seleccionado.nombre,
        fechaInicio: null,
        fechaFin: null,
        items,
        totalVentas,
        comisionPct: seleccionado.comisionPct,
        comisionMonto,
        montoAPagar,
        estado: 'pendiente',
      })
      setShowLiquidar(false)
    } catch { alert('Error al crear la liquidación.') }
    finally { setGuardando(false) }
  }

  const totalVentasSeleccionado = calcularTotalVentas(productosDelSeleccionado)
  const comisionSeleccionado = Math.round(totalVentasSeleccionado * (seleccionado?.comisionPct ?? 0) / 100)
  const pagarSeleccionado = totalVentasSeleccionado - comisionSeleccionado

  return (
    <div className="flex h-full p-4 gap-4 overflow-hidden">
      {/* ── Panel izquierdo: lista de consignadores ── */}
      <div className="flex flex-col w-80 flex-shrink-0 gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" />
              Consignadores
            </h1>
            <p className="text-muted-foreground text-xs">{consignadores.length} consignador{consignadores.length !== 1 ? 'es' : ''}</p>
          </div>
          <Button size="sm" onClick={abrirCrear} className="bg-primary text-primary-foreground gap-1">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar..." className="pl-8 bg-card border-border h-8 text-sm" />
        </div>

        <Card className="flex-1 bg-card border-border overflow-hidden">
          <ScrollArea className="h-full">
            {cargando ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Cargando...
              </div>
            ) : consignadoresFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Handshake className="h-8 w-8 opacity-30" />
                <p className="text-sm">{busqueda ? 'Sin resultados' : 'Sin consignadores'}</p>
                {!busqueda && <Button size="sm" variant="outline" onClick={abrirCrear} className="gap-1 text-xs"><Plus className="h-3 w-3" />Agregar</Button>}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {consignadoresFiltrados.map(c => {
                  const prods = productosPorConsignador.get(c.id) || []
                  const totalVend = calcularTotalVentas(prods)
                  const isSelected = seleccionado?.id === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSeleccionado(c)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
                        isSelected ? 'bg-primary/10 border-r-2 border-primary' : 'hover:bg-secondary/30'
                      )}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                        {c.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{c.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{prods.length} prod.</span>
                          {totalVend > 0 && <span className="text-xs text-success font-medium">{formatCurrency(totalVend)} vend.</span>}
                        </div>
                      </div>
                      <ChevronRight className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform', isSelected && 'text-primary rotate-90')} />
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      {/* ── Panel derecho: detalle del consignador ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">
        {!seleccionado ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Handshake className="h-16 w-16 opacity-20" />
            <p className="font-medium">Selecciona un consignador</p>
            <p className="text-sm">para ver sus productos y liquidaciones</p>
          </div>
        ) : (
          <>
            {/* Header del consignador */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {seleccionado.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{seleccionado.nombre}</h2>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {seleccionado.cedula && <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" />{seleccionado.cedula}</span>}
                    {seleccionado.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{seleccionado.telefono}</span>}
                    <span className="flex items-center gap-1"><Percent className="h-3 w-3" />Comisión negocio: <strong>{seleccionado.comisionPct}%</strong></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => abrirEditar(seleccionado)} className="gap-1">
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditando(seleccionado); setShowDelete(true) }} className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-card border-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Productos</p>
                    <p className="font-bold text-lg text-foreground">{productosDelSeleccionado.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total vendido</p>
                    <p className="font-bold text-lg text-foreground">{formatCurrency(totalVentasSeleccionado)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                    <ReceiptText className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">A pagar</p>
                    <p className="font-bold text-lg text-foreground">{formatCurrency(pagarSeleccionado)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs: Productos | Liquidaciones */}
            <Tabs defaultValue="productos" className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <TabsList className="bg-card border border-border">
                  <TabsTrigger value="productos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-sm">
                    <Package className="h-3.5 w-3.5" /> Productos
                  </TabsTrigger>
                  <TabsTrigger value="liquidaciones" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-sm">
                    <ReceiptText className="h-3.5 w-3.5" /> Liquidaciones
                  </TabsTrigger>
                </TabsList>
                {totalVentasSeleccionado > 0 && (
                  <Button size="sm" onClick={() => setShowLiquidar(true)} className="bg-success text-success-foreground gap-1.5">
                    <ReceiptText className="h-4 w-4" /> Generar liquidación
                  </Button>
                )}
              </div>

              {/* Tab productos */}
              <TabsContent value="productos" className="flex-1 mt-3 min-h-0">
                <Card className="h-full bg-card border-border overflow-hidden">
                  <ScrollArea className="h-full">
                    {productosDelSeleccionado.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <Package className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Sin productos registrados</p>
                        <p className="text-xs">Crea productos en el espacio "Consignación" y asígnaselos a este consignador desde el módulo de Inventario</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card border-b border-border">
                          <tr className="text-muted-foreground text-xs">
                            <th className="text-left px-4 py-2 font-medium">Producto</th>
                            <th className="text-center px-3 py-2 font-medium">Inicial</th>
                            <th className="text-center px-3 py-2 font-medium">Vendido</th>
                            <th className="text-center px-3 py-2 font-medium">Restante</th>
                            <th className="text-right px-4 py-2 font-medium">Precio</th>
                            <th className="text-right px-4 py-2 font-medium">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {productosDelSeleccionado.map(p => {
                            const vendido = calcularVendido(p)
                            const inicial = p.stockInicial ?? 0
                            const pct = inicial > 0 ? Math.min(100, (vendido / inicial) * 100) : 0
                            return (
                              <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="font-medium text-foreground">{p.nombre}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                      <Progress value={pct} className="h-1.5 w-24" />
                                      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center text-muted-foreground">{inicial}</td>
                                <td className="px-3 py-3 text-center">
                                  <span className={cn('font-semibold', vendido > 0 ? 'text-success' : 'text-muted-foreground')}>{vendido}</span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className={cn('font-semibold', p.stock <= p.stockMinimo ? 'text-destructive' : 'text-foreground')}>{p.stock}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(p.precio)}</td>
                                <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(vendido * p.precio)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot className="border-t-2 border-border bg-secondary/20">
                          <tr>
                            <td colSpan={5} className="px-4 py-2 text-right font-bold text-foreground text-sm">Total vendido:</td>
                            <td className="px-4 py-2 text-right font-bold text-success">{formatCurrency(totalVentasSeleccionado)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </ScrollArea>
                </Card>
              </TabsContent>

              {/* Tab liquidaciones */}
              <TabsContent value="liquidaciones" className="flex-1 mt-3 min-h-0">
                <Card className="h-full bg-card border-border overflow-hidden">
                  <ScrollArea className="h-full">
                    {liquidaciones.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <ReceiptText className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Sin liquidaciones aún</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {liquidaciones.map(liq => (
                          <button
                            key={liq.id}
                            onClick={() => setShowLiquidacionDetalle(liq)}
                            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
                          >
                            <div className={cn(
                              'w-2 self-stretch rounded-full flex-shrink-0',
                              liq.estado === 'pagada' ? 'bg-success' : 'bg-warning'
                            )} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-foreground text-sm">
                                  {liq.items.length} producto{liq.items.length !== 1 ? 's' : ''}
                                </p>
                                <Badge className={cn(
                                  'text-xs',
                                  liq.estado === 'pagada'
                                    ? 'bg-success/15 text-success border-success/20'
                                    : 'bg-warning/15 text-warning border-warning/20'
                                )}>
                                  {liq.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Comisión {liq.comisionPct}% → negocio: {formatCurrency(liq.comisionMonto)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-primary">{formatCurrency(liq.montoAPagar)}</p>
                              <p className="text-xs text-muted-foreground">a pagar</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* ── Dialog: Crear / Editar consignador ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar consignador' : 'Nuevo consignador'}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Registra quién dejó productos en consignación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Artesanías López" className="bg-input" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cédula / NIT</Label>
                <Input value={form.cedula} onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))} placeholder="1020304050" className="bg-input" />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="3001234567" className="bg-input" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Comisión del negocio (%) <span className="text-muted-foreground text-xs">— el resto va al consignador</span></Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.comisionPct}
                  onChange={e => setForm(f => ({ ...f, comisionPct: Number(e.target.value) }))}
                  className="bg-input w-24"
                />
                <span className="text-sm text-muted-foreground">→ consignador recibe <strong className="text-foreground">{100 - form.comisionPct}%</strong></span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={guardando || !form.nombre.trim()} className="bg-primary text-primary-foreground">
              {guardando && <div className="h-4 w-4 mr-2 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />}
              {editando ? 'Guardar cambios' : 'Crear consignador'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Eliminar ── */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar consignador</DialogTitle>
            <DialogDescription>
              ¿Eliminar a <strong>{editando?.nombre}</strong>? Sus productos no se borrarán pero quedarán sin consignador asignado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancelar</Button>
            <Button onClick={handleEliminar} disabled={guardando} className="bg-destructive text-destructive-foreground">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar liquidación ── */}
      <Dialog open={showLiquidar} onOpenChange={setShowLiquidar}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-success" />
              Generar Liquidación
            </DialogTitle>
            <DialogDescription>
              Resumen de ventas para <strong>{seleccionado?.nombre}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            {/* Ítems */}
            <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
              {productosDelSeleccionado.filter(p => calcularVendido(p) > 0).map(p => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-foreground">{calcularVendido(p)}× {p.nombre}</span>
                  <span className="text-muted-foreground">{formatCurrency(calcularVendido(p) * p.precio)}</span>
                </div>
              ))}
              {productosDelSeleccionado.filter(p => calcularVendido(p) > 0).length === 0 && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <AlertCircle className="h-4 w-4" />
                  No hay unidades vendidas desde el último reseteo de stock.
                </div>
              )}
            </div>

            {/* Cálculo */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total ventas</span>
                <span className="font-medium">{formatCurrency(totalVentasSeleccionado)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Comisión negocio ({seleccionado?.comisionPct}%)</span>
                <span className="text-primary font-medium">− {formatCurrency(comisionSeleccionado)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                <span>A pagar al consignador</span>
                <span className="text-success">{formatCurrency(pagarSeleccionado)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLiquidar(false)}>Cancelar</Button>
            <Button
              onClick={handleLiquidar}
              disabled={guardando || productosDelSeleccionado.filter(p => calcularVendido(p) > 0).length === 0}
              className="bg-success text-success-foreground"
            >
              {guardando && <div className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Registrar liquidación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Detalle de liquidación ── */}
      <Dialog open={!!showLiquidacionDetalle} onOpenChange={open => { if (!open) setShowLiquidacionDetalle(null) }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Liquidación</DialogTitle>
            <DialogDescription>{seleccionado?.nombre}</DialogDescription>
          </DialogHeader>
          {showLiquidacionDetalle && (
            <div className="py-2 space-y-4">
              <Badge className={cn(
                showLiquidacionDetalle.estado === 'pagada'
                  ? 'bg-success/15 text-success border-success/20'
                  : 'bg-warning/15 text-warning border-warning/20'
              )}>
                {showLiquidacionDetalle.estado === 'pagada' ? '✓ Pagada' : '⏳ Pendiente de pago'}
              </Badge>

              <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                {showLiquidacionDetalle.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{item.unidades}× {item.productoNombre}</span>
                    <span className="text-muted-foreground">{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total ventas</span><span>{formatCurrency(showLiquidacionDetalle.totalVentas)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Comisión negocio ({showLiquidacionDetalle.comisionPct}%)</span><span className="text-primary">− {formatCurrency(showLiquidacionDetalle.comisionMonto)}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-2"><span>A pagar</span><span className="text-success">{formatCurrency(showLiquidacionDetalle.montoAPagar)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            {showLiquidacionDetalle?.estado === 'pendiente' && (
              <Button
                onClick={async () => {
                  await marcarLiquidacionPagada(showLiquidacionDetalle!.id)
                  setShowLiquidacionDetalle(null)
                }}
                className="bg-success text-success-foreground gap-1"
              >
                <CheckCircle2 className="h-4 w-4" /> Marcar como pagada
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowLiquidacionDetalle(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
