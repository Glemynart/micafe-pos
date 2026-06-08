'use client'

import { useState, useEffect } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { useEspacios } from '@/contexts/espacios-context'
import {
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  Calendar,
  TrendingDown,
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  registrarMerma,
  suscribirMermas,
  type Merma,
} from '@/lib/mermas-service'
import { suscribirInsumos, type Insumo } from '@/lib/insumos-service'
import { formatCurrency } from '@/lib/demo-data'

const wasteReasons = [
  { value: 'expired', label: 'Vencido' },
  { value: 'damaged', label: 'Dañado' },
  { value: 'spilled', label: 'Derramado' },
  { value: 'burned', label: 'Quemado' },
  { value: 'other', label: 'Otro' },
]

export function WasteModule() {
  const { usuario } = useAuthContext()
  const { espacioActivo, cargandoEspacios } = useEspacios()
  const espacioId = espacioActivo?.id ?? ''

  const [searchTerm, setSearchTerm] = useState('')
  const [showWasteDialog, setShowWasteDialog] = useState(false)
  const [mermas, setMermas] = useState<Merma[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [registrando, setRegistrando] = useState(false)

  const [insumoId, setInsumoId] = useState('')
  const [insumoSeleccionado, setInsumoSeleccionado] = useState<Insumo | null>(null)
  const [cantidad, setCantidad] = useState<number>(0)
  const [motivo, setMotivo] = useState('')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    if (!espacioId) return
    const unsub = suscribirMermas(espacioId, (data) => {
      setMermas(data)
      setCargando(false)
    })
    return unsub
  }, [espacioId])

  useEffect(() => {
    if (!espacioId) return
    const unsub = suscribirInsumos(espacioId, (data) => {
      setInsumos(data)
    })
    return unsub
  }, [espacioId])

  const handleSelectInsumo = (id: string) => {
    setInsumoId(id)
    const insumo = insumos.find((i) => i.id === id) ?? null
    setInsumoSeleccionado(insumo)
  }

  const filteredWastes = mermas.filter((w) =>
    w.insumoNombre.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const mesActual = mermas.reduce((acc, m) => acc + (m.costo || 0), 0)
  const hoy = new Date().toLocaleDateString('es-CO')
  const costoHoy = mermas
    .filter((m) => m.fecha && typeof m.fecha === 'object' && 'toDate' in (m.fecha as Record<string, unknown>))
    .filter((m) => {
      const d = (m.fecha as { toDate: () => Date }).toDate()
      return d.toLocaleDateString('es-CO') === hoy
    })
    .reduce((acc, m) => acc + (m.costo || 0), 0)
  const monthGoal = 50000

  const costoEstimado = cantidad * (insumoSeleccionado?.costo ?? 0)

  const handleRegistrarMerma = async () => {
    if (!insumoId) {
      toast.error('Debe seleccionar un insumo')
      return
    }
    if (cantidad <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    if (!motivo) {
      toast.error('Debe seleccionar un motivo')
      return
    }

    setRegistrando(true)
    try {
      await registrarMerma({
        insumoId,
        insumoNombre: insumoSeleccionado?.nombre ?? '',
        cantidad,
        unidadMedida: insumoSeleccionado?.unidadMedida ?? '',
        motivo,
        costo: costoEstimado,
        notas: notas || undefined,
        espacioId,
      })

      toast.success('Merma registrada exitosamente')
      setShowWasteDialog(false)
      setInsumoId('')
      setInsumoSeleccionado(null)
      setCantidad(0)
      setMotivo('')
      setNotas('')
    } catch (err) {
      toast.error('Error al registrar la merma')
      console.error(err)
    } finally {
      setRegistrando(false)
    }
  }

  const formatDate = (fecha: unknown): string => {
    if (!fecha) return '-'
    if (fecha && typeof fecha === 'object' && 'toDate' in (fecha as Record<string, unknown>)) {
      return (fecha as { toDate: () => Date }).toDate().toLocaleDateString('es-CO')
    }
    return String(fecha)
  }

  const reasonLabel = (reason: string) => {
    return wasteReasons.find((r) => r.value === reason)?.label ?? reason
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
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-destructive/10 shadow-inner">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            Mermas y Desperdicios
          </h1>
          <p className="text-muted-foreground font-medium mt-1">Registra y controla las pérdidas de insumos y productos</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar insumo..."
              className="pl-10 w-full md:w-72 bg-background border-border/50 rounded-2xl h-12 shadow-sm focus:ring-primary/50 font-medium transition-all"
            />
          </div>
          <Button onClick={() => setShowWasteDialog(true)} className="h-12 rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold px-6 shadow-lg shadow-destructive/20 transition-all active:scale-95">
            <Plus className="h-5 w-5 mr-2" />
            Registrar Merma
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
        <Card className="bg-gradient-to-br from-destructive/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-destructive/10 rounded-full blur-3xl"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-destructive/20 shadow-inner">
                <TrendingDown className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pérdida Hoy</p>
                <p className="text-3xl font-black text-destructive tracking-tight">{formatCurrency(costoHoy)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-bl from-warning/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-warning/10 rounded-full blur-3xl"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-warning/20 shadow-inner">
                <Calendar className="h-7 w-7 text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Este Periodo</p>
                <p className="text-3xl font-black text-warning tracking-tight">{formatCurrency(mesActual)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(
          "rounded-[2rem] shadow-sm border-border/50 relative overflow-hidden",
          mesActual > monthGoal ? "bg-gradient-to-r from-destructive/20 to-destructive/5 border-destructive/30" : "bg-gradient-to-r from-success/20 to-success/5 border-success/30"
        )}>
          <CardContent className="p-6 relative z-10 h-full flex flex-col justify-center">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-2xl shadow-inner",
                mesActual > monthGoal ? "bg-destructive/20" : "bg-success/20"
              )}>
                <AlertTriangle className={cn(
                  "h-7 w-7",
                  mesActual > monthGoal ? "text-destructive" : "text-success"
                )} />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Meta Mensual</p>
                <p className={cn(
                  "text-3xl font-black tracking-tight",
                  mesActual > monthGoal ? "text-destructive" : "text-success"
                )}>
                  {formatCurrency(monthGoal)}
                </p>
                <p className={cn(
                  "text-sm font-medium mt-1",
                  mesActual > monthGoal ? "text-destructive" : "text-success"
                )}>
                  {mesActual > monthGoal
                    ? `Excedido en ${formatCurrency(mesActual - monthGoal)}`
                    : `${formatCurrency(monthGoal - mesActual)} disponible`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 flex flex-col bg-card/50 backdrop-blur-md border-border/50 rounded-[2rem] shadow-sm overflow-hidden mt-4">
        <CardHeader className="border-b border-border/50 py-5 bg-card/80">
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Registro de Mermas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-bold h-12">Fecha</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Insumo</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-right">Cantidad</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-center">Motivo</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-right">Costo</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Registrado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWastes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 bg-secondary/30 rounded-full flex items-center justify-center">
                        <Trash2 className="h-8 w-8 text-muted-foreground opacity-50" />
                      </div>
                      <p className="font-medium">No hay mermas registradas</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filteredWastes.map((waste, idx) => (
                <TableRow
                  key={waste.id}
                  className="border-border/50 hover:bg-secondary/40 transition-colors group"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-background border border-border/50 flex items-center justify-center shadow-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="font-bold text-foreground text-[15px]">{formatDate(waste.fecha)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-secondary/30 font-semibold text-foreground text-[14px]">
                      {waste.insumoNombre}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-black text-foreground text-[15px]">
                    {waste.cantidad} <span className="text-muted-foreground font-medium text-xs">{waste.unidadMedida}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={cn(
                      "rounded-lg font-bold px-2.5 py-1 border-border/50 shadow-sm",
                      waste.motivo === 'expired' ? "bg-warning/20 text-warning border-warning/30" : 
                      waste.motivo === 'damaged' ? "bg-destructive/20 text-destructive border-destructive/30" : 
                      "bg-secondary/50 text-foreground"
                    )}>
                      {reasonLabel(waste.motivo)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-black text-destructive text-[15px]">
                    {formatCurrency(waste.costo)}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground font-medium text-[14px]">{waste.registradoPorNombre}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showWasteDialog} onOpenChange={setShowWasteDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Registrar Merma</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Registra una pérdida de insumo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Insumo</Label>
              <Select value={insumoId} onValueChange={handleSelectInsumo}>
                <SelectTrigger className="bg-input">
                  <SelectValue placeholder="Seleccionar insumo" />
                </SelectTrigger>
                <SelectContent>
                  {insumos.map((ing) => (
                    <SelectItem key={ing.id} value={ing.id}>{ing.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {insumoSeleccionado && (
                <p className="text-xs text-muted-foreground">
                  Stock actual: {insumoSeleccionado.stock} {insumoSeleccionado.unidadMedida} | Costo unitario: {formatCurrency(insumoSeleccionado.costo)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  className="bg-input"
                  placeholder="0"
                  value={cantidad || ''}
                  onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidad</Label>
                <Input className="bg-input" value={insumoSeleccionado?.unidadMedida ?? ''} disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger className="bg-input">
                  <SelectValue placeholder="Seleccionar motivo" />
                </SelectTrigger>
                <SelectContent>
                  {wasteReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea className="bg-input" placeholder="Observaciones adicionales..." value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
            <div className="p-4 bg-destructive/10 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Costo estimado de la merma</p>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(costoEstimado)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWasteDialog(false)}>
              Cancelar
            </Button>
            <Button className="bg-primary text-primary-foreground" onClick={handleRegistrarMerma} disabled={registrando}>
              {registrando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Registrar Merma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
