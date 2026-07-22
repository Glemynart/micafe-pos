'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { useEspacios } from '@/contexts/espacios-context'
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  registrarCompra,
  eliminarCompra,
  suscribirCompras,
  type Compra,
  type CompraItem,
} from '@/lib/compras-service'
import { suscribirInsumos, type Insumo } from '@/lib/insumos-service'
import { suscribirProductos, type Producto } from '@/lib/productos-service'
import { suscribirCuentasBancarias, type CuentaBancaria } from '@/lib/finanzas-service'
import { formatCurrency } from '@/lib/demo-data'

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
  const { usuario } = useAuthContext()
  const { espacioActivo, cargandoEspacios } = useEspacios()
  const espacioId = espacioActivo?.id ?? ''
  const esCafeteria = espacioActivo?.nombre?.toLowerCase().includes('cafeter') ?? false

  const [searchTerm, setSearchTerm] = useState('')
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [compras, setCompras] = useState<Compra[]>([])
  
  // Usamos una lista unificada de items a comprar (pueden ser insumos o productos)
  const [availableItems, setAvailableItems] = useState<{id: string, nombre: string, unidadMedida: string, costo: number}[]>([])
  
  const [cargando, setCargando] = useState(true)
  const [registrando, setRegistrando] = useState(false)
  const [compraSeleccionada, setCompraSeleccionada] = useState<Compra | null>(null)
  const [compraAEliminar, setCompraAEliminar] = useState<Compra | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [fechaCompra, setFechaCompra] = useState<string>(getHoy())
  const [cuentaId, setCuentaId] = useState<string>('caja-principal')
  const [proveedor, setProveedor] = useState('')
  const [itemsForm, setItemsForm] = useState<PurchaseItemForm[]>([
    { insumoId: '', insumoNombre: '', cantidad: 0, unidadMedida: 'g', costoUnitario: 0 },
  ])

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
      { insumoId: '', insumoNombre: '', cantidad: 0, unidadMedida: 'g', costoUnitario: 0 },
    ])
  }

  const removeItem = (idx: number) => {
    if (itemsForm.length <= 1) return
    setItemsForm((prev) => prev.filter((_, i) => i !== idx))
  }

  const totalCompra = itemsForm.reduce((acc, item) => acc + item.cantidad * item.costoUnitario, 0)

  const handleRegistrarCompra = async () => {
    if (!proveedor.trim()) {
      toast.error('Debe especificar un proveedor')
      return
    }
    const itemsValidos = itemsForm.filter((i) => i.insumoId && i.cantidad > 0)
    if (itemsValidos.length === 0) {
      toast.error('Debe agregar al menos un insumo con cantidad')
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

      const cuentaSeleccionada = cuentas.find(c => c.id === cuentaId)
      await registrarCompra({
        proveedor: proveedor.trim(),
        items,
        total: items.reduce((acc, i) => acc + i.costoTotal, 0),
        espacioId,
        fechaCompra,
        ...(cuentaId ? { cuentaId, cuentaNombre: cuentaSeleccionada?.nombre } : {}),
      })

      toast.success('Compra registrada exitosamente')
      setShowPurchaseDialog(false)
      setProveedor('')
      setFechaCompra(getHoy())
      setCuentaId('caja-principal')
      setItemsForm([{ insumoId: '', insumoNombre: '', cantidad: 0, unidadMedida: 'g', costoUnitario: 0 }])
    } catch (err) {
      toast.error('Error al registrar la compra')
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

  const handleEliminarCompra = async () => {
    if (!compraAEliminar) return
    setEliminando(true)
    try {
      await eliminarCompra(compraAEliminar.id)
      toast.success('Compra eliminada y stock revertido')
      setCompraAEliminar(null)
    } catch (err) {
      toast.error('Error al eliminar la compra')
      console.error(err)
    } finally {
      setEliminando(false)
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/80 backdrop-blur-xl p-6 rounded-[2rem] border border-border/50 shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shadow-inner">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            {esCafeteria ? 'Compras de Insumos' : 'Compras de Productos'}
          </h1>
          <p className="text-muted-foreground font-medium mt-1">Registra y controla las compras a proveedores</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por proveedor..."
              className="pl-10 w-full md:w-72 bg-background border-border/50 rounded-2xl h-12 shadow-sm focus:ring-primary/50 font-medium transition-all"
            />
          </div>
          <Button onClick={() => setShowPurchaseDialog(true)} className="h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 shadow-lg shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-5 w-5 mr-2" />
            Registrar Compra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
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
                      {usuario?.rol === 'admin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCompraAEliminar(purchase)}
                          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    placeholder="Nombre del proveedor"
                    className="bg-input"
                  />
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
                <Select value={cuentaId} onValueChange={setCuentaId}>
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Sin descuento en Finanzas" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cuentaId && (
                  <p className="text-xs text-muted-foreground">
                    Se descontará {formatCurrency(totalCompra)} de <strong>{cuentas.find(c => c.id === cuentaId)?.nombre}</strong> al registrar.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Items comprados</Label>
                <Card className="bg-secondary/30 border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">{esCafeteria ? 'Insumo' : 'Producto'}</TableHead>
                        <TableHead className="text-muted-foreground">Cantidad</TableHead>
                        <TableHead className="text-muted-foreground">Unidad</TableHead>
                        <TableHead className="text-muted-foreground text-right">Costo Unit.</TableHead>
                        <TableHead className="text-muted-foreground text-right">Subtotal</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsForm.map((item, idx) => (
                        <TableRow key={idx} className="border-border">
                          <TableCell>
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
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="bg-input w-24"
                              placeholder="0"
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

      <AlertDialog open={!!compraAEliminar} onOpenChange={(open) => !open && setCompraAEliminar(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">¿Eliminar Compra?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Esta acción eliminará el registro de la compra y <strong>restará el stock</strong> que se había sumado al inventario ({compraAEliminar?.proveedor}).
              <br/><br/>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent text-foreground border-border hover:bg-secondary">
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleEliminarCompra}
              disabled={eliminando}
            >
              {eliminando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Eliminar Compra
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
