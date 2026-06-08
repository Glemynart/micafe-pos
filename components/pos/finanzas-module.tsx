'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthContext } from '@/contexts/auth-context'
import { useUI } from '@/contexts/ui-context'
import { formatCurrency } from '@/lib/demo-data'
import { DynamicIcon } from '@/components/ui/dynamic-icon'
import { toast } from 'sonner'
import { 
  Plus, 
  Minus, 
  ArrowRightLeft, 
  Wallet, 
  Landmark, 
  TrendingUp, 
  TrendingDown, 
  Search,
  FileText
} from 'lucide-react'

import { 
  suscribirCuentasBancarias, 
  suscribirTransacciones, 
  registrarTransaccion,
  inicializarCuentasBancarias,
  type CuentaBancaria, 
  type TransaccionFinanciera 
} from '@/lib/finanzas-service'

export function FinanzasModule() {
  const { usuario } = useAuthContext()
  const { showMenu } = useUI()
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [transacciones, setTransacciones] = useState<TransaccionFinanciera[]>([])
  const [cargando, setCargando] = useState(true)

  // Dialog State
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [txTipo, setTxTipo] = useState<'egreso' | 'ingreso' | 'traslado'>('egreso')
  
  // Form State
  const [formData, setFormData] = useState({
    cuentaId: '',
    cuentaDestinoId: '', // solo para traslados
    monto: '',
    concepto: '',
    categoria: '',
    referencia: ''
  })

  // Init & Subscribe
  useEffect(() => {
    // Inicializar cuentas si están vacías
    inicializarCuentasBancarias()

    const unsubCuentas = suscribirCuentasBancarias((data) => {
      setCuentas(data)
      setCargando(false)
    })

    const date = new Date()
    const unsubTx = suscribirTransacciones(date.getMonth() + 1, date.getFullYear(), (data) => {
      setTransacciones(data)
    })

    return () => {
      unsubCuentas()
      unsubTx()
    }
  }, [])

  const resetForm = () => {
    setFormData({ cuentaId: '', cuentaDestinoId: '', monto: '', concepto: '', categoria: '', referencia: '' })
  }

  const handleOpenModal = (tipo: 'egreso' | 'ingreso' | 'traslado') => {
    setTxTipo(tipo)
    resetForm()
    setShowTransactionModal(true)
  }

  const handleGuardarTransaccion = async () => {
    if (!usuario) return
    const monto = parseFloat(formData.monto.replace(/[^\d.-]/g, ''))
    if (!monto || isNaN(monto) || monto <= 0) {
      toast.error('Ingresa un monto válido mayor a 0')
      return
    }

    if (!formData.cuentaId) {
      toast.error('Selecciona una cuenta de origen')
      return
    }
    if (!formData.concepto || !formData.categoria) {
      toast.error('Ingresa el concepto y la categoría')
      return
    }

    try {
      const cuentaOrigen = cuentas.find(c => c.id === formData.cuentaId)

      if (txTipo === 'traslado') {
        if (!formData.cuentaDestinoId) {
          toast.error('Selecciona una cuenta de destino')
          return
        }
        if (formData.cuentaId === formData.cuentaDestinoId) {
          toast.error('La cuenta origen y destino no pueden ser la misma')
          return
        }
        const cuentaDestino = cuentas.find(c => c.id === formData.cuentaDestinoId)
        
        // Retiro
        await registrarTransaccion({
          cuentaId: formData.cuentaId,
          cuentaNombre: cuentaOrigen?.nombre || '',
          tipo: 'egreso',
          monto,
          concepto: `Traslado a ${cuentaDestino?.nombre} - ${formData.concepto}`,
          categoria: 'traslado',
          usuarioId: usuario.uid,
          usuarioNombre: usuario.username
        })

        // Ingreso
        await registrarTransaccion({
          cuentaId: formData.cuentaDestinoId,
          cuentaNombre: cuentaDestino?.nombre || '',
          tipo: 'ingreso',
          monto,
          concepto: `Traslado desde ${cuentaOrigen?.nombre} - ${formData.concepto}`,
          categoria: 'traslado',
          usuarioId: usuario.uid,
          usuarioNombre: usuario.username
        })

        toast.success('Traslado realizado con éxito')

      } else {
        await registrarTransaccion({
          cuentaId: formData.cuentaId,
          cuentaNombre: cuentaOrigen?.nombre || '',
          tipo: txTipo,
          monto,
          concepto: formData.concepto,
          categoria: formData.categoria,
          referencia: formData.referencia,
          usuarioId: usuario.uid,
          usuarioNombre: usuario.username
        })
        toast.success(`${txTipo === 'egreso' ? 'Pago' : 'Ingreso'} registrado con éxito`)
      }

      setShowTransactionModal(false)
      resetForm()
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || 'Ocurrió un error al registrar la transacción')
    }
  }

  const saldoTotal = cuentas.reduce((acc, c) => acc + (c.saldo || 0), 0)

  return (
    <div className="flex h-full bg-background overflow-hidden relative">
      <div className="flex-1 flex flex-col h-full relative overflow-y-auto">
        {showMenu && <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden" />}
        
        {/* Header Premium */}
        <header className="flex flex-col md:flex-row flex-shrink-0 bg-card/80 backdrop-blur-xl border border-border/50 shadow-sm p-5 md:px-8 mx-4 mt-4 rounded-[2rem] items-center justify-between z-10 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shadow-inner">
                <Landmark className="h-6 w-6 text-primary" />
              </div>
              Finanzas y Tesorería
            </h1>
            <p className="text-muted-foreground font-medium mt-1">Control de bancos, flujos de efectivo y pagos</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <Button className="h-11 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-bold shadow-md shadow-success/20 flex-1 md:flex-none" onClick={() => handleOpenModal('ingreso')}>
              <Plus className="h-5 w-5 mr-2" /> Ingreso
            </Button>
            <Button className="h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold shadow-md shadow-destructive/20 flex-1 md:flex-none" onClick={() => handleOpenModal('egreso')}>
              <Minus className="h-5 w-5 mr-2" /> Pago / Gasto
            </Button>
            <Button variant="outline" className="h-11 rounded-xl border-warning text-warning hover:bg-warning/10 font-bold hidden sm:flex shadow-sm w-full md:w-auto" onClick={() => handleOpenModal('traslado')}>
              <ArrowRightLeft className="h-5 w-5 mr-2" /> Trasladar
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6">
          {/* Dashboard Summary Premium */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 shadow-sm rounded-[2rem] relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
              <CardContent className="p-6 relative z-10 flex flex-col justify-center h-full">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo Total</p>
                  <div className="p-2.5 rounded-xl bg-primary/20 shadow-inner">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <p className="text-3xl font-black mt-3 text-foreground tracking-tight">{formatCurrency(saldoTotal)}</p>
              </CardContent>
            </Card>

            {cuentas.map(cuenta => (
              <Card key={cuenta.id} className="bg-card shadow-sm border-border/50 rounded-[2rem] hover:shadow-md transition-all group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">{cuenta.nombre}</p>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center opacity-90 shadow-inner" style={{ backgroundColor: cuenta.color }}>
                      <DynamicIcon name={cuenta.icono} className="h-5 w-5 text-white drop-shadow-sm" />
                    </div>
                  </div>
                  <p className="text-2xl font-black mt-3 text-foreground tracking-tight">{formatCurrency(cuenta.saldo)}</p>
                  <Badge variant="secondary" className="mt-2 text-[10px] uppercase font-bold tracking-wider">{cuenta.tipo}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Transactions List Premium */}
          <Card className="bg-card/50 backdrop-blur-md shadow-sm border-border/50 flex-1 flex flex-col rounded-[2rem] overflow-hidden">
            <CardHeader className="border-b border-border/50 pb-5 bg-card/80">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Últimos Movimientos
              </CardTitle>
              <CardDescription className="font-medium">Registro de todas las entradas, salidas y traslados.</CardDescription>
            </CardHeader>
            <ScrollArea className="h-[400px]">
              <CardContent className="p-0">
                {transacciones.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <div className="h-16 w-16 bg-secondary/30 rounded-full flex items-center justify-center mb-4">
                      <FileText className="h-8 w-8 opacity-50" />
                    </div>
                    <p className="font-medium">No hay transacciones recientes.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {transacciones.map((tx, idx) => (
                      <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-secondary/40 transition-colors group" style={{ animationDelay: `${idx * 30}ms` }}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${
                            tx.tipo === 'ingreso' ? 'bg-success/20 text-success' : 
                            tx.tipo === 'egreso' ? 'bg-destructive/20 text-destructive' : 
                            'bg-warning/20 text-warning'
                          }`}>
                            {tx.tipo === 'ingreso' ? <TrendingUp className="h-6 w-6" /> : 
                             tx.tipo === 'egreso' ? <TrendingDown className="h-6 w-6" /> : 
                             <ArrowRightLeft className="h-6 w-6" />}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-[15px]">{tx.concepto}</p>
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mt-1">
                              <span>{new Date(tx.fecha?.seconds * 1000 || Date.now()).toLocaleString()}</span>
                              <span>•</span>
                              <Badge variant="outline" className="text-[10px] py-0.5 rounded-lg border-border/50 shadow-sm bg-background">{tx.cuentaNombre}</Badge>
                              <Badge variant="secondary" className="text-[10px] py-0.5 rounded-lg uppercase bg-secondary/50">{tx.categoria}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-[16px] ${
                            tx.tipo === 'ingreso' ? 'text-success' : 
                            tx.tipo === 'egreso' ? 'text-destructive' : 'text-foreground'
                          }`}>
                            {tx.tipo === 'ingreso' ? '+' : '-'}{formatCurrency(tx.monto)}
                          </p>
                          <p className="text-xs font-semibold text-muted-foreground mt-1">{tx.usuarioNombre}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        </main>
      </div>

      {/* Transaction Modal */}
      <Dialog open={showTransactionModal} onOpenChange={setShowTransactionModal}>
        <DialogContent className="bg-card border-border sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {txTipo === 'ingreso' ? 'Registrar Ingreso' : txTipo === 'egreso' ? 'Registrar Pago / Gasto' : 'Trasladar Dinero'}
            </DialogTitle>
            <DialogDescription>
              Completa los detalles de la transacción. El saldo de la cuenta se actualizará automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Cuenta de Origen</Label>
              <Select value={formData.cuentaId} onValueChange={(val) => setFormData({...formData, cuentaId: val})}>
                <SelectTrigger className="bg-input">
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} - {formatCurrency(c.saldo)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {txTipo === 'traslado' && (
              <div className="space-y-2">
                <Label>Cuenta de Destino</Label>
                <Select value={formData.cuentaDestinoId} onValueChange={(val) => setFormData({...formData, cuentaDestinoId: val})}>
                  <SelectTrigger className="bg-input border-warning">
                    <SelectValue placeholder="Selecciona una cuenta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentas.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Monto</Label>
              <Input 
                type="number" 
                className="bg-input text-lg font-bold" 
                placeholder="0"
                value={formData.monto}
                onChange={(e) => setFormData({...formData, monto: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input 
                className="bg-input" 
                placeholder={txTipo === 'egreso' ? 'Ej: Pago arriendo local' : 'Ej: Inyección capital'}
                value={formData.concepto}
                onChange={(e) => setFormData({...formData, concepto: e.target.value})}
              />
            </div>

            {txTipo !== 'traslado' && (
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={formData.categoria} onValueChange={(val) => setFormData({...formData, categoria: val})}>
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {txTipo === 'egreso' ? (
                      <>
                        <SelectItem value="proveedores">Proveedores / Compras</SelectItem>
                        <SelectItem value="nomina">Nómina / Empleados</SelectItem>
                        <SelectItem value="servicios">Servicios Públicos / Arriendo</SelectItem>
                        <SelectItem value="caja-menor">Gasto Operativo / Caja Menor</SelectItem>
                        <SelectItem value="impuestos">Impuestos</SelectItem>
                        <SelectItem value="otros">Otros Gastos</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="ventas">Ventas Externas</SelectItem>
                        <SelectItem value="inversion">Inversión / Préstamo</SelectItem>
                        <SelectItem value="reintegro">Reintegro</SelectItem>
                        <SelectItem value="otros">Otros Ingresos</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {txTipo !== 'traslado' && (
              <div className="space-y-2">
                <Label>Referencia / Recibo (Opcional)</Label>
                <Input 
                  className="bg-input" 
                  placeholder="Factura #001"
                  value={formData.referencia}
                  onChange={(e) => setFormData({...formData, referencia: e.target.value})}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransactionModal(false)}>Cancelar</Button>
            <Button 
              className={txTipo === 'ingreso' ? 'bg-success hover:bg-success/90' : txTipo === 'egreso' ? 'bg-destructive hover:bg-destructive/90' : 'bg-warning hover:bg-warning/90'}
              onClick={handleGuardarTransaccion}
            >
              Confirmar Transacción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
