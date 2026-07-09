"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Square } from "lucide-react"
import { Turno, calcularVentasTurno, cerrarTurno, suscribirTurnoActivo } from "@/lib/turnos-service"
import { calcularEgresosTurno } from "@/lib/egresos-service"
import { toast } from "sonner"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { suscribirConfiguracion, type ConfiguracionGlobal } from "@/lib/configuracion-service"
import { formatCurrency, formatTime } from "@/lib/format-utils"
import { CloseShiftForm } from '@/components/pos/close-shift-form'

interface GlobalCloseShiftProps {
 usuario: any
 onCloseSuccess: () => void
}

export function GlobalCloseShift({ usuario, onCloseSuccess }: GlobalCloseShiftProps) {
 const [open, setOpen] = useState(false)
 const [activeShift, setActiveShift] = useState<Turno | null>(null)
 
 const [ventasTurno, setVentasTurno] = useState({ total: 0, efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0 })
 const [egresosTurno, setEgresosTurno] = useState(0)
 const [cashCount, setCashCount] = useState<Record<string, string>>({})
 const [closeNotes, setCloseNotes] = useState('')
 const [handoverTo, setHandoverTo] = useState('none')
 const [isClosing, setIsClosing] = useState(false)
 const [isLoadingTotals, setIsLoadingTotals] = useState(false)
 const [cajeros, setCajeros] = useState<{ uid: string; nombre: string }[]>([])
 const [config, setConfig] = useState<ConfiguracionGlobal | null>(null)

 useEffect(() => { const u = suscribirConfiguracion(setConfig); return u }, [])

 // Suscribirse al turno activo para tenerlo listo
 useEffect(() => {
 if (!usuario) return
 const unsub = suscribirTurnoActivo(usuario.uid, (doc) => {
 setActiveShift(doc)
 })
 return () => unsub()
 }, [usuario])

 // Cargar cajeros y supervisores para el relevo
 useEffect(() => {
 if (!usuario) return
 getDocs(query(collection(db, 'usuarios'), where('rol', 'in', ['cajero', 'supervisor'])))
 .then(snap => {
 setCajeros(
 snap.docs
 .map(d => ({ uid: d.id, nombre: (d.data().nombre as string) || d.id }))
 .filter(c => c.uid !== usuario.uid)
 )
 })
 .catch(() => {})
 }, [usuario])

 // Escuchar el evento global
 useEffect(() => {
 const handleRequest = async () => {
 if (!activeShift) {
 // Si no tiene turno activo, permitir salir directo
 onCloseSuccess()
 return
 }
 
 // ABRIR INMEDIATAMENTE para que el usuario no espere
 setOpen(true)
 setIsLoadingTotals(true)
 
 try {
 const ventas = await calcularVentasTurno(activeShift.id)
 const egresos = await calcularEgresosTurno(activeShift.id)
 setVentasTurno(ventas)
 setEgresosTurno(egresos)
 } catch (err) {
 console.error("Error cargando totales del turno", err)
 } finally {
 setIsLoadingTotals(false)
 }
 }

 window.addEventListener('request_close_shift', handleRequest)
 return () => window.removeEventListener('request_close_shift', handleRequest)
 }, [activeShift, onCloseSuccess])

 const totalCashCount = Object.entries(cashCount).reduce((total, [denom, raw]) => {
 const cant = parseInt(raw, 10) || 0
 if (denom === 'monedas') return total + cant
 return total + (Number(denom) * cant)
 }, 0)

 const expectedCash = activeShift ? (activeShift.baseApertura + ventasTurno.efectivo - egresosTurno) : 0
 const cashDifference = totalCashCount - expectedCash

 // FASE-10C: no se permite cerrar con conteo vacío, salvo cierre forzado del admin.
 const esAdmin = usuario?.rol === 'admin'
 const puedeCerrar = totalCashCount > 0 || esAdmin

 const handleCloseShift = async () => {
 if (!activeShift) return
 if (!puedeCerrar) {
 toast.error("Debes contar el efectivo de la caja antes de cerrar el turno.")
 return
 }
 setIsClosing(true)
 try {
 const cajeroRelevo = cajeros.find(c => c.uid === handoverTo)
 await cerrarTurno({
 turnoId: activeShift.id,
 ventasEfectivo: ventasTurno.efectivo,
 ventasOtrosMetodos: ventasTurno.transferencia + ventasTurno.tarjeta + ventasTurno.otros,
 totalEgresos: egresosTurno,
 totalEsperadoEfectivo: expectedCash,
 totalReportadoEfectivo: totalCashCount,
 diferenciaEfectivo: cashDifference,
 notasCierre: closeNotes || '',
 esCierreDefinitivo: handoverTo === 'none',
 conteoDetalle: Object.fromEntries(Object.entries(cashCount).map(([k, v]) => [k, parseInt(v, 10) || 0])),
 umbralAlertaFaltante: config?.umbralAlertaFaltante,
 ...(cajeroRelevo ? { relevoCajeroId: cajeroRelevo.uid, relevoCajeroNombre: cajeroRelevo.nombre } : {}),
 })
 setOpen(false)
 toast.success("Turno cerrado correctamente")
 // Llamamos a logout
 onCloseSuccess()
 } catch (err: any) {
 console.error(err)
 toast.error(err?.message || "Hubo un error al cerrar el turno")
 } finally {
 setIsClosing(false)
 }
 }

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <DialogContent className="theme-pos bg-background border-border max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl">
 {/* Header con gradiente sutil */}
 <div className="p-6 border-b border-border/50">
 <DialogHeader>
 <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
 <div className="p-2 bg-destructive/10 ">
 <Square className="h-5 w-5 text-destructive" />
 </div>
 Cierre de Turno
 </DialogTitle>
 <DialogDescription className="text-muted-foreground mt-1 text-base">
 Verifica los montos de caja y finaliza tu turno de trabajo.
 </DialogDescription>
 </DialogHeader>
 </div>
 
 <div className="px-6 py-5 overflow-y-auto custom-scrollbar flex-1 space-y-5">

 {/* Resumen del Turno */}
 <div className="grid grid-cols-3 gap-3">
 <div className="flex flex-col p-3 border border-border/50 bg-card rounded-lg">
 <p className="text-xs font-medium text-muted-foreground mb-1">Entrada</p>
 <p className="text-lg font-bold text-foreground leading-tight">{formatTime(activeShift?.fechaApertura)}</p>
 </div>
 <div className="flex flex-col p-3 border border-border/50 bg-card rounded-lg">
 <p className="text-xs font-medium text-muted-foreground mb-1">Base Inicial</p>
 <p className="text-lg font-bold text-foreground leading-tight">{formatCurrency(activeShift?.baseApertura || 0)}</p>
 </div>
 <div className="flex flex-col p-3 border border-primary/20 bg-primary/5 rounded-lg">
 <p className="text-xs font-medium text-primary/80 mb-1">Ventas del Turno</p>
 <p className="text-lg font-bold text-primary leading-tight">
 {isLoadingTotals ? <span className="text-sm animate-pulse">...</span> : (usuario?.rol === 'admin' ? formatCurrency(ventasTurno.total) : '***')}
 </p>
 </div>
  </div>

  <CloseShiftForm
    variant="standalone"
    cashCount={cashCount}
    setCashCount={setCashCount}
    totalCashCount={totalCashCount}
    expectedCash={expectedCash}
    cashDifference={cashDifference}
    closeNotes={closeNotes}
    setCloseNotes={setCloseNotes}
    handoverTo={handoverTo}
    setHandoverTo={setHandoverTo}
    cajeros={cajeros}
    usuario={usuario}
    puedeCerrar={puedeCerrar}
    isLoadingTotals={isLoadingTotals}
    isSubmitting={isClosing}
    onSubmit={handleCloseShift}
    onCancel={() => setOpen(false)}
  />
</div>
  </DialogContent>
  </Dialog>
  )
}
