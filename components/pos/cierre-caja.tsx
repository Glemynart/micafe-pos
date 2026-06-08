"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DollarSign, Wallet, ArrowDownCircle, ArrowUpCircle, Lock, History } from "lucide-react"

export function CierreCaja() {
  const [turnoActivo, setTurnoActivo] = useState<any>(null)
  const [resumen, setResumen] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog states
  const [isAbrirOpen, setIsAbrirOpen] = useState(false)
  const [baseInicial, setBaseInicial] = useState("")

  const [isMovimientoOpen, setIsMovimientoOpen] = useState(false)
  const [movTipo, setMovTipo] = useState<"ingreso"|"egreso">("egreso")
  const [movMonto, setMovMonto] = useState("")
  const [movDesc, setMovDesc] = useState("")

  const [isCerrarOpen, setIsCerrarOpen] = useState(false)
  const [efectivoReal, setEfectivoReal] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const turno = await (window as any).api.caja.getTurnoActivo()
      setTurnoActivo(turno)
      
      if (turno) {
        const res = await (window as any).api.caja.getResumenTurno(turno.id)
        setResumen(res)
      } else {
        setResumen(null)
      }

      const hist = await (window as any).api.caja.getHistorialTurnos()
      setHistorial(hist || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const formatInputMoney = (val: string) => {
    const digits = val.replace(/\D/g, "")
    if (!digits) return ""
    return new Intl.NumberFormat('es-CO').format(parseInt(digits, 10))
  }

  const handleAbrirTurno = async () => {
    const base = parseFloat(baseInicial.replace(/\./g, '')) || 0
    await (window as any).api.caja.abrirTurno(base)
    setIsAbrirOpen(false)
    setBaseInicial("")
    loadData()
  }

  const handleRegistrarMovimiento = async () => {
    const monto = parseFloat(movMonto.replace(/\./g, '')) || 0
    if (monto <= 0 || !movDesc) return
    
    await (window as any).api.caja.registrarMovimiento(
      turnoActivo?.id, movTipo, monto, movDesc
    )
    setIsMovimientoOpen(false)
    setMovMonto("")
    setMovDesc("")
    loadData()
  }

  const handleCerrarTurno = async () => {
    const efReal = parseFloat(efectivoReal.replace(/\./g, '')) || 0
    await (window as any).api.caja.cerrarTurno(turnoActivo.id, efReal)
    setIsCerrarOpen(false)
    setEfectivoReal("")
    loadData()
  }

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val || 0)
  }

  const formatFecha = (d: string) => {
    if (!d) return "En curso"
    const obj = new Date(d)
    if (isNaN(obj.getTime())) return d
    return obj.toLocaleString()
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando módulo de caja...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {!turnoActivo && (
          <Button onClick={() => setIsAbrirOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            <Wallet className="mr-2 h-4 w-4" />
            Abrir Turno
          </Button>
        )}
      </div>

      {/* DASHBOARD DE TURNO ACTIVO */}
      {turnoActivo && resumen ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Base Inicial</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatMoney(resumen.base_inicial)}</div>
              <p className="text-xs text-muted-foreground mt-1">Inicio: {resumen.fecha_apertura}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ventas (Solo Efectivo)</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">+{formatMoney(resumen.ventasEfectivo)}</div>
              <p className="text-xs text-muted-foreground mt-1">Otros medios: {formatMoney(resumen.ventasOtros)}</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gastos / Egresos</CardTitle>
              <ArrowDownCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">-{formatMoney(resumen.totalEgresos)}</div>
              <p className="text-xs text-muted-foreground mt-1">Salidas de la registradora</p>
            </CardContent>
          </Card>

          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Efectivo Esperado</CardTitle>
              <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(resumen.efectivo_esperado)}</div>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">Base + Ventas - Egresos</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-card p-8 text-center border-dashed">
          <Wallet className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">No hay un turno activo</h3>
          <p className="text-sm text-muted-foreground mb-4">Para poder registrar gastos o hacer un cuadre, abre un nuevo turno.</p>
          <Button onClick={() => setIsAbrirOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            Abrir Turno Ahora
          </Button>
        </Card>
      )}

      {/* ACCIONES Y MOVIMIENTOS */}
      {turnoActivo && resumen && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Acciones de Caja</CardTitle>
              <CardDescription>Registra salidas de dinero para compras rápidas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => { setMovTipo("egreso"); setIsMovimientoOpen(true) }} variant="destructive" className="w-full">
                <ArrowDownCircle className="mr-2 h-4 w-4" />
                Registrar Salida / Gasto
              </Button>
              <Button onClick={() => { setMovTipo("ingreso"); setIsMovimientoOpen(true) }} variant="outline" className="w-full border-border text-foreground hover:bg-accent hover:text-accent-foreground">
                <ArrowUpCircle className="mr-2 h-4 w-4" />
                Registrar Ingreso Extra
              </Button>
              <div className="pt-4 border-t border-border">
                <Button onClick={() => setIsCerrarOpen(true)} variant="secondary" className="w-full">
                  <Lock className="mr-2 h-4 w-4" />
                  Hacer Arqueo y Cerrar Turno
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Movimientos del Turno</CardTitle>
            </CardHeader>
            <CardContent>
              {resumen.movimientos?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay movimientos manuales registrados en este turno.</p>
              ) : (
                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                  {resumen.movimientos?.map((m: any) => (
                    <div key={m.id} className="flex justify-between items-center bg-muted p-3 rounded-md">
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.descripcion}</p>
                        <p className="text-xs text-muted-foreground">{m.fecha}</p>
                      </div>
                      <span className={m.tipo === 'ingreso' ? 'text-emerald-500 font-bold' : 'text-destructive font-bold'}>
                        {m.tipo === 'ingreso' ? '+' : '-'}{formatMoney(m.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HISTORIAL DE TURNOS */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <History className="mr-2 h-5 w-5" />
            Historial de Turnos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="text-muted-foreground">ID</TableHead>
                <TableHead className="text-muted-foreground">Apertura</TableHead>
                <TableHead className="text-muted-foreground">Cierre</TableHead>
                <TableHead className="text-muted-foreground">Esperado</TableHead>
                <TableHead className="text-muted-foreground">Físico (Real)</TableHead>
                <TableHead className="text-muted-foreground">Descuadre</TableHead>
                <TableHead className="text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map(t => (
                <TableRow key={t.id} className="border-border hover:bg-muted/50">
                  <TableCell className="text-foreground font-medium">#{t.id}</TableCell>
                  <TableCell className="text-muted-foreground">{formatFecha(t.fecha_apertura)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatFecha(t.fecha_cierre)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatMoney(t.efectivo_esperado)}</TableCell>
                  <TableCell className="text-muted-foreground">{t.efectivo_real !== null ? formatMoney(t.efectivo_real) : '-'}</TableCell>
                  <TableCell>
                    {t.descuadre !== null ? (
                      <span className={t.descuadre < 0 ? 'text-destructive font-bold' : t.descuadre > 0 ? 'text-emerald-500 font-bold' : 'text-muted-foreground'}>
                        {formatMoney(t.descuadre)}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {t.estado === 1 ? (
                      <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full text-xs font-medium border border-emerald-500/20">Abierto</span>
                    ) : (
                      <span className="bg-muted text-muted-foreground px-2 py-1 rounded-full text-xs font-medium border border-border">Cerrado</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {historial.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No hay historial de turnos</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* DIALOGOS */}
      <Dialog open={isAbrirOpen} onOpenChange={setIsAbrirOpen}>
        <DialogContent className="bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Abrir Turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Base Inicial (Efectivo en caja)</Label>
              <Input 
                type="text" 
                value={baseInicial} 
                onChange={e => setBaseInicial(formatInputMoney(e.target.value))} 
                placeholder="Ej: 50.000"
                className="bg-background text-foreground"
              />
              <p className="text-xs text-muted-foreground">Ingresa la cantidad de dinero físico con la que abres el cajón para dar vueltos.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAbrirOpen(false)}>Cancelar</Button>
            <Button onClick={handleAbrirTurno} className="bg-emerald-500 hover:bg-emerald-600 text-white">Iniciar Turno</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMovimientoOpen} onOpenChange={setIsMovimientoOpen}>
        <DialogContent className="bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>{movTipo === 'egreso' ? 'Registrar Gasto / Salida' : 'Registrar Ingreso'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Monto</Label>
              <Input 
                type="text" 
                value={movMonto} 
                onChange={e => setMovMonto(formatInputMoney(e.target.value))} 
                placeholder="Ej: 15.000"
                className="bg-background text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción o Motivo</Label>
              <Input 
                value={movDesc} 
                onChange={e => setMovDesc(e.target.value)} 
                placeholder={movTipo === 'egreso' ? "Ej: Pago de panadería" : "Ej: Base adicional"}
                className="bg-background text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMovimientoOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegistrarMovimiento} className="bg-emerald-500 hover:bg-emerald-600 text-white">Guardar Movimiento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCerrarOpen} onOpenChange={setIsCerrarOpen}>
        <DialogContent className="bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>Cerrar Turno (Arqueo)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-emerald-500/10 p-4 rounded-md border border-emerald-500/20">
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">El sistema espera que haya en caja:</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(resumen?.efectivo_esperado)}</p>
            </div>
            <div className="space-y-2">
              <Label>Dinero Físico Real (Cuéntalo)</Label>
              <Input 
                type="text" 
                value={efectivoReal} 
                onChange={e => setEfectivoReal(formatInputMoney(e.target.value))} 
                placeholder="Ej: 125.000"
                className="bg-background text-foreground text-lg font-bold"
              />
              <p className="text-xs text-muted-foreground">Suma todos los billetes y monedas que hay en el cajón.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCerrarOpen(false)}>Cancelar</Button>
            <Button onClick={handleCerrarTurno} variant="destructive">Terminar y Cerrar Caja</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
