'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useEspacios } from '@/contexts/espacios-context'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'
import {
  Plus,
  Search,
  Truck,
  Eye,
  TrendingUp,
  TrendingDown,
  Calendar,
  Trash2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  registrarCompra,
  suscribirCompras,
  type Compra,
  type CompraItem,
} from '@/lib/compras-service'
import { obtenerComandoCompraPendiente, type ComandoCompraPendiente } from '@/lib/compra-command'
import { validarEntradaCompra } from '@/lib/compra-input-validation'
import { suscribirInsumos, type Insumo } from '@/lib/insumos-service'
import { suscribirProductos, type Producto } from '@/lib/productos-service'
import { suscribirCuentasBancarias, type CuentaBancaria } from '@/lib/finanzas-service'
import { suscribirProveedores, type Proveedor } from '@/lib/proveedores-service'
import { ProveedoresModule } from '@/components/pos/proveedores-module'
import { formatCurrency } from '@/lib/demo-data'
import { suscribirPresentacionesBodegaAdmin, type PresentacionBodegaAdmin } from '@/lib/bodega/admin-service'
import { proyectarMargenCompraPorPresentaciones } from '@/lib/bodega/purchase-margin'
import {
  esCompraDeInsumos,
  sincronizarUnidadPredeterminadaEnItemsVacios,
  unidadMedidaCompraPredeterminada,
} from '@/lib/bodega/compra-routing'

interface PurchaseItemForm {
  insumoId: string
  insumoNombre: string
  cantidad: number
  unidadMedida: string
  costoUnitario: number
}

function getHoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PurchasesModule() {
  const { espacioActivo, cargandoEspacios } = useEspacios()
  const { vertical } = useConfiguracionEmpresa()
  const espacioId = espacioActivo?.id ?? ''
  const esBodega = vertical === 'BODEGA_MVP1'
  const esCafeteria = esCompraDeInsumos(vertical, espacioActivo?.nombre)
  const unidadPredeterminada = unidadMedidaCompraPredeterminada(vertical, espacioActivo?.nombre)

  const [searchTerm, setSearchTerm] = useState('')
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [showProvidersDialog, setShowProvidersDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [compras, setCompras] = useState<Compra[]>([])
  
  // Usamos una lista unificada de items a comprar (pueden ser insumos o productos)
  const [availableItems, setAvailableItems] = useState<{id: string, nombre: string, unidadMedida: string, costo: number}[]>([])
  const [presentacionesVenta, setPresentacionesVenta] = useState<PresentacionBodegaAdmin[]>([])
  const [cargandoPresentacionesVenta, setCargandoPresentacionesVenta] = useState(false)
  const [errorPresentacionesVenta, setErrorPresentacionesVenta] = useState(false)
  
  const [cargando, setCargando] = useState(true)
  const [registrando, setRegistrando] = useState(false)
  const [compraSeleccionada, setCompraSeleccionada] = useState<Compra | null>(null)
  const comandoCompraPendienteRef = useRef<ComandoCompraPendiente | null>(null)

  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [fechaCompra, setFechaCompra] = useState<string>(getHoy())
  const [cuentaClaveOperativa, setCuentaClaveOperativa] = useState<string>('')
  const [proveedor, setProveedor] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [itemsForm, setItemsForm] = useState<PurchaseItemForm[]>([
    { insumoId: '', insumoNombre: '', cantidad: 0, unidadMedida: unidadPredeterminada, costoUnitario: 0 },
  ])

  useEffect(() => {
    setItemsForm((actuales) => sincronizarUnidadPredeterminadaEnItemsVacios(actuales, unidadPredeterminada))
  }, [unidadPredeterminada])

  useEffect(() => {
    if (!espacioId) return
    const unsub = suscribirCompras(espacioId, (data) => {
      setCompras(data)
      setCargando(false)
    })
    return unsub
  }, [espacioId])

  useEffect(() => {
    const unsub = suscribirCuentasBancarias(setCuentas)
    return unsub
  }, [])

  useEffect(() => {
    if (!esBodega || !showPurchaseDialog) {
      setPresentacionesVenta([])
      setCargandoPresentacionesVenta(false)
      setErrorPresentacionesVenta(false)
      return
    }

    setCargandoPresentacionesVenta(true)
    setErrorPresentacionesVenta(false)
    return suscribirPresentacionesBodegaAdmin(
      (data) => {
        setPresentacionesVenta(data)
        setCargandoPresentacionesVenta(false)
      },
      () => {
        setPresentacionesVenta([])
        setCargandoPresentacionesVenta(false)
        setErrorPresentacionesVenta(true)
      },
    )
  }, [esBodega, showPurchaseDialog])

  useEffect(() => {
    if (esBodega) {
      setProveedores([])
      return
    }
    return suscribirProveedores(setProveedores)
  }, [esBodega])

  useEffect(() => {
    if (!espacioId) return
    
    if (esCafeteria) {
      const unsub = suscribirInsumos(espacioId, (data) => {
        setAvailableItems(data.map(i => ({
          id: i.id,
          nombre: i.nombre,
          unidadMedida: i.unidadMedida || 'g',
          costo: i.costo || 0
        })))
      })
      return unsub
    } else {
      const unsub = suscribirProductos(espacioId, (data) => {
        setAvailableItems(data.map(p => ({
          id: p.id,
          nombre: p.nombre,
          unidadMedida: 'unidades', // Productos siempre se cuentan por unidades
          costo: p.costo || 0
        })))
      })
      return unsub
    }
  }, [espacioId, esCafeteria])

  const filteredPurchases = compras.filter((p) =>
    p.proveedor.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const currentMonthTotal = compras.reduce((acc, p) => acc + p.total, 0)
  const lastMonthTotal = compras.length > 1 ? compras.slice(1).reduce((acc, p) => acc + p.total, 0) : 0
  const percentChange = lastMonthTotal > 0 ? ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0
  const proveedorSeleccionado = proveedores.find((item) => item.id === proveedorId && item.estado === 'ACTIVO')
  const margenesPorItem = itemsForm.map((item) => proyectarMargenCompraPorPresentaciones(
    item.costoUnitario,
    presentacionesVenta.filter((presentacion) => presentacion.productoId === item.insumoId),
  ))

  const updateItem = useCallback((idx: number, field: keyof PurchaseItemForm, value: string | number) => {
    setItemsForm((prev) => {
      const next = [...prev]
      const item = { ...next[idx] }

      if (field === 'insumoId' && typeof value === 'string') {
        const selectedItem = availableItems.find((i) => i.id === value)
        item.insumoId = value
        item.insumoNombre = selectedItem?.nombre ?? ''
        item.unidadMedida = selectedItem?.unidadMedida ?? (esCafeteria ? 'g' : 'unidades')
        item.costoUnitario = selectedItem?.costo ?? 0
      } else if (field === 'cantidad') {
        item.cantidad = typeof value === 'number' ? value : parseFloat(value as string) || 0
      } else if (field === 'costoUnitario') {
        item.costoUnitario = typeof value === 'number' ? value : parseFloat(value as string) || 0
      }

      next[idx] = item
      return next
    })
  }, [availableItems, esCafeteria])

  const addItem = () => {
    setItemsForm((prev) => [
      ...prev,
      { insumoId: '', insumoNombre: '', cantidad: 0, unidadMedida: unidadPredeterminada, costoUnitario: 0 },
    ])
  }

  const removeItem = (idx: number) => {
    if (itemsForm.length <= 1) return
    setItemsForm((prev) => prev.filter((_, i) => i !== idx))
  }

  const totalCompra = itemsForm.reduce((acc, item) => acc + item.cantidad * item.costoUnitario, 0)

  const handleRegistrarCompra = async () => {
    const nombreProveedor = proveedorSeleccionado?.nombre ?? proveedor.trim()
    if (!nombreProveedor) {
      toast.error('Debe especificar un proveedor')
      return
    }
    const itemsValidos = itemsForm.filter((i) => i.insumoId && i.cantidad > 0)
    if (itemsValidos.length === 0) {
      toast.error('Debe agregar al menos un insumo con cantidad')
      return
    }

    const tipoArticulo = esCafeteria ? 'insumo' : 'producto'
    const errorValidacion = validarEntradaCompra(itemsValidos.map((item) => ({
      tipo: tipoArticulo,
      articuloId: item.insumoId,
      cantidad: item.cantidad,
      costoUnitario: item.costoUnitario,
    })))
    if (errorValidacion === 'CANTIDAD_INVALIDA') {
      toast.error('Las cantidades acumuladas por artículo deben formar un entero positivo en su unidad de inventario.')
      return
    }
    if (errorValidacion === 'COSTO_INVALIDO') {
      toast.error('Cada costo y el costo unitario consolidado deben ser enteros positivos en COP.')
      return
    }
    if (errorValidacion === 'TOTAL_COMPRA_INVALIDO') {
      toast.error('El total de la compra excede el rango de COP que puede procesarse con seguridad.')
      return
    }

    setRegistrando(true)
    try {
      const items: CompraItem[] = itemsValidos.map((i) => ({
        tipo: esCafeteria ? 'insumo' : 'producto',
        insumoId: i.insumoId,
        insumoNombre: i.insumoNombre,
        itemId: i.insumoId,
        itemNombre: i.insumoNombre,
        cantidad: i.cantidad,
        unidadMedida: i.unidadMedida,
        costoUnitario: i.costoUnitario,
        costoTotal: i.cantidad * i.costoUnitario,
      }))

      const parametrosCompra = {
        proveedor: nombreProveedor,
        ...(proveedorSeleccionado ? { proveedorId: proveedorSeleccionado.id } : {}),
        items,
        espacioId,
        fechaCompra,
        ...(cuentaClaveOperativa ? { cuentaClaveOperativa } : {}),
      }
      const comandoCompraPendiente = obtenerComandoCompraPendiente(
        parametrosCompra,
        vertical,
        comandoCompraPendienteRef.current,
      )
      comandoCompraPendienteRef.current = comandoCompraPendiente
      await registrarCompra({ ...parametrosCompra, commandId: comandoCompraPendiente.commandId }, vertical)

      toast.success('Compra registrada exitosamente')
      comandoCompraPendienteRef.current = null
      setShowPurchaseDialog(false)
      setProveedor('')
      setProveedorId('')
      setFechaCompra(getHoy())
      setCuentaClaveOperativa('')
      setItemsForm([{ insumoId: '', insumoNombre: '', cantidad: 0, unidadMedida: unidadPredeterminada, costoUnitario: 0 }])
    } catch (err) {
      toast.error('No se pudo confirmar la compra. Puedes reintentar sin cambiar el borrador.')
      console.error(err)
    } finally {
      setRegistrando(false)
    }
  }

  const formatDate = (fecha: unknown): string => {
    if (!fecha) return '-'
    if (fecha && typeof fecha === 'object' && 'toDate' in (fecha as Record<string, unknown>)) {
      return (fecha as any).toDate().toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      })
    }
    return '-'
  }

  if (cargandoEspacios || cargando) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex flex-col justify-between gap-4 bg-card/80 backdrop-blur-xl p-6 rounded-[2rem] border border-border/50 shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shadow-inner">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            {esCafeteria ? 'Compras de Insumos' : 'Compras de Productos'}
          </h1>
          <p className="text-muted-foreground font-medium mt-1">Registra y controla las compras a proveedores</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por proveedor..."
              className="pl-10 w-full bg-background border-border/50 rounded-2xl h-12 shadow-sm focus:ring-primary/50 font-medium transition-all"
            />
          </div>
          <Button onClick={() => setShowPurchaseDialog(true)} className="h-12 w-full rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 shadow-lg shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-5 w-5 mr-2" />
            Registrar Compra
          </Button>
          {!esBodega && <Button variant="outline" onClick={() => setShowProvidersDialog(true)} className="h-12 rounded-2xl font-bold px-4">
            Proveedores
          </Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mt-2">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Gasto este periodo</p>
                <p className="text-4xl font-black text-foreground tracking-tight">{formatCurrency(currentMonthTotal)}</p>
              </div>
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold shadow-sm backdrop-blur-md border border-border/50",
                percentChange > 0
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-success/10 text-success border-success/20"
              )}>
                {percentChange > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {Math.abs(percentChange).toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-bl from-secondary/30 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-secondary/30 rounded-full blur-3xl"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Total de compras</p>
                <p className="text-4xl font-black text-foreground tracking-tight">{compras.length}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Promedio por compra</p>
                <p className="text-2xl font-bold text-primary">
                  {compras.length > 0 ? formatCurrency(currentMonthTotal / compras.length) : '$0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 flex flex-col bg-card/50 backdrop-blur-md border-border/50 rounded-[2rem] shadow-sm overflow-hidden mt-4">
        <CardHeader className="border-b border-border/50 py-5 bg-card/80">
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Historial de Compras
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-bold h-12">Fecha</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Proveedor</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-right">Total</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-right">Items</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Registrado por</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 bg-secondary/30 rounded-full flex items-center justify-center">
                        <Truck className="h-8 w-8 text-muted-foreground opacity-50" />
                      </div>
                      <p className="font-medium">No hay compras registradas</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filteredPurchases.map((purchase, idx) => (
                <TableRow
                  key={purchase.id}
                  className="border-border/50 hover:bg-secondary/40 transition-colors group"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-background border border-border/50 flex items-center justify-center shadow-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="font-bold text-foreground text-[15px]">{formatDate(purchase.fecha)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-secondary/30 font-semibold text-foreground text-[14px]">
                      {purchase.proveedor}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-black text-primary text-[15px]">
                    {formatCurrency(purchase.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="bg-background rounded-lg border-border/50 font-bold px-2 py-0.5">
                      {purchase.items?.length ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground font-medium text-[14px]">
                      {purchase.registradoPorNombre}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCompraSeleccionada(purchase); setShowDetailDialog(true) }}
                        className="rounded-xl font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors h-9"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent className="bg-card border-border sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Registrar Compra</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Registra una nueva compra a proveedor
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-4 pr-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  {!esBodega && <Select value={proveedorId || '__manual__'} onValueChange={(value) => setProveedorId(value === '__manual__' ? '' : value)}>
                    <SelectTrigger className="bg-input">
                      <SelectValue placeholder="Selecciona un proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manual__">Captura manual (compatibilidad)</SelectItem>
                      {proveedores.filter((item) => item.estado === 'ACTIVO').map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>}
                  {(esBodega || !proveedorId) && (
                    <Input
                      value={proveedor}
                      onChange={(e) => setProveedor(e.target.value)}
                      placeholder="Nombre del proveedor"
                      className="bg-input"
                    />
                  )}
                  {proveedorSeleccionado && <p className="text-xs text-muted-foreground">Se congelará el snapshot comercial de {proveedorSeleccionado.nombre} al confirmar.</p>}
                </div>
                <div className="space-y-2">
                  <Label>Fecha de compra</Label>
                  <Input
                    type="date"
                    className="bg-input"
                    value={fechaCompra}
                    onChange={(e) => setFechaCompra(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cuenta de pago <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Select value={cuentaClaveOperativa} onValueChange={setCuentaClaveOperativa}>
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Sin descuento en Finanzas" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c.id} value={c.claveOperativa}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cuentaClaveOperativa && (
                  <p className="text-xs text-muted-foreground">
                    Se descontará {formatCurrency(totalCompra)} de <strong>{cuentas.find(c => c.claveOperativa === cuentaClaveOperativa)?.nombre}</strong> al registrar.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Items comprados</Label>
                {esBodega && (
                  <p className="text-xs text-muted-foreground">
                    La cantidad y el costo de esta compra se registran por unidad base; este costo no actualiza el catálogo. Para calcular el margen de una caja completa, configura su costo de compra en Catálogo, dentro de la presentación.
                  </p>
                )}
                <Card className="bg-secondary/30 border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">{esCafeteria ? 'Insumo' : 'Producto'}</TableHead>
                        <TableHead className="text-muted-foreground">Cantidad</TableHead>
                        <TableHead className="text-muted-foreground">Unidad</TableHead>
                        <TableHead className="text-muted-foreground text-right">{esBodega ? 'Costo / unidad base' : 'Costo Unit.'}</TableHead>
                        <TableHead className="text-muted-foreground text-right">Subtotal</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsForm.map((item, idx) => (
                        <TableRow key={idx} className="border-border">
                          <TableCell className={esBodega ? 'min-w-56' : undefined}>
                            <Select value={item.insumoId} onValueChange={(v) => updateItem(idx, 'insumoId', v)}>
                              <SelectTrigger className="bg-input">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableItems.map((ing) => (
                                  <SelectItem key={ing.id} value={ing.id}>{ing.nombre}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {esBodega && item.insumoId && (
                              <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-background/70 p-2 text-left">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Precio de venta vigente · margen estimado
                                </p>
                                {cargandoPresentacionesVenta ? (
                                  <p className="text-xs text-muted-foreground">Consultando presentaciones…</p>
                                ) : errorPresentacionesVenta ? (
                                  <p className="text-xs text-destructive">No fue posible consultar los precios vigentes.</p>
                                ) : margenesPorItem[idx].length === 0 ? (
                                  <p className="text-xs text-muted-foreground">No hay presentaciones activas con precio válido.</p>
                                ) : margenesPorItem[idx].map((presentacion) => (
                                  <div key={presentacion.id} className="space-y-0.5 border-t border-border/50 pt-1.5 first:border-0 first:pt-0">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="min-w-0 truncate font-medium">
                                        {presentacion.nombre} · ×{presentacion.factorUnidadBase} {item.unidadMedida}
                                      </span>
                                      <span className="shrink-0 font-semibold">{formatCurrency(presentacion.precioCOP)}</span>
                                    </div>
                                    {presentacion.utilidadBrutaCOP !== null && presentacion.margenBrutoPorcentaje !== null ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        Utilidad bruta: {formatCurrency(presentacion.utilidadBrutaCOP)} · Margen bruto: {presentacion.margenBrutoPorcentaje.toFixed(1)}%
                                      </p>
                                    ) : (
                                      <p className="text-[11px] text-muted-foreground">Ingresa un costo entero por unidad base para calcular.</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="bg-input w-24"
                              placeholder="0"
                              step="any"
                              value={item.cantidad || ''}
                              onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.unidadMedida}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="bg-input w-32 text-right"
                              placeholder="$0"
                              min={1}
                              max={Number.MAX_SAFE_INTEGER}
                              step={1}
                              value={item.costoUnitario || ''}
                              onChange={(e) => updateItem(idx, 'costoUnitario', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-foreground">
                            {formatCurrency(item.cantidad * item.costoUnitario)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
                <Button variant="outline" className="w-full mt-2" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar item
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg">
                <span className="font-medium text-foreground">Total de la compra</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(totalCompra)}</span>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
              Cancelar
            </Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleRegistrarCompra} disabled={registrando}>
              {registrando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Registrar Compra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!esBodega && <Dialog open={showProvidersDialog} onOpenChange={setShowProvidersDialog}>
        <DialogContent className="bg-card border-border sm:max-w-5xl h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="sr-only">Gestión de proveedores</DialogTitle>
          </DialogHeader>
          <ProveedoresModule />
        </DialogContent>
      </Dialog>}

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Detalle de Compra</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {compraSeleccionada?.proveedor} - {compraSeleccionada ? formatDate(compraSeleccionada.fecha) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {compraSeleccionada ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">{esCafeteria ? 'Insumo' : 'Producto'}</TableHead>
                      <TableHead className="text-muted-foreground text-right">Cantidad</TableHead>
                      <TableHead className="text-muted-foreground text-right">Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compraSeleccionada.items?.map((item, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="text-foreground">{item.itemNombre || item.insumoNombre}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{item.cantidad} {item.unidadMedida}</TableCell>
                        <TableCell className="text-right text-primary">{formatCurrency(item.costoTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg mt-4">
                  <span className="font-medium text-foreground">Total</span>
                  <span className="text-2xl font-bold text-primary">{formatCurrency(compraSeleccionada.total)}</span>
                </div>
                {compraSeleccionada.cuentaNombre && (
                  <p className="text-sm text-muted-foreground mt-2 text-right">
                    Pagado desde: <strong className="text-foreground">{compraSeleccionada.cuentaNombre}</strong>
                  </p>
                )}
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">Seleccione una compra para ver el detalle</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowDetailDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
