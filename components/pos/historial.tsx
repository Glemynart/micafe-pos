"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { useAuthContext } from '@/contexts/auth-context'
import { useEspacios } from '@/contexts/espacios-context'
import { suscribirHistorialVentas, obtenerVentaPorId, anularVenta as anularVentaFirebase, guardarMetadatosDian } from '@/lib/ventas-service'
import { suscribirConfiguracion, type ConfiguracionGlobal } from '@/lib/configuracion-service'
import { TicketBuilder, generateQrDataUri, renderTicket, DEFAULT_RENDER_OPTIONS } from '@/lib/tickets'
import { adaptarVentaB2AModeloTicket, adaptarVentaLegacyAModeloTicket } from '@/lib/reimpresion/venta-ticket-adapter'
import { formatCurrency } from '@/lib/format-utils'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Calendar,
  Download,
  Eye,
  Send,
  Receipt,
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileMinus,
  FilePlus,
} from "lucide-react"

export function Historial() {
  const { usuario } = useAuthContext()
  const { espacioActivo } = useEspacios()
  const [ventas, setVentas] = useState<any[]>([])
  const [filtroFecha, setFiltroFecha] = useState("")
  const [tipoPeriodo, setTipoPeriodo] = useState<"dia" | "mes" | "ano">("dia")
  const [filtroEstado, setFiltroEstado] = useState<string>("todos")
  const [ventaDetalle, setVentaDetalle] = useState<any | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)

  const [notaState, setNotaState] = useState<{ isOpen: boolean; type: 'credito' | 'debito'; venta: any | null; motivo: string }>({
    isOpen: false,
    type: 'credito',
    venta: null,
    motivo: 'Nota de ajuste',
  })

  // Identidad del negocio para el ticket (fuente única: configuracion/general
  // en Firestore, no SQLite — ver diseño "Unificar fuente de verdad reimpresión").
  const [config, setConfig] = useState<ConfiguracionGlobal | null>(null)
  useEffect(() => {
    const unsubConfig = suscribirConfiguracion(setConfig)
    return () => unsubConfig()
  }, [])

  const handleEmitirNota = async () => {
    if (!notaState.venta || !notaState.venta.dian?.cufe) return;

    toast.loading(`Emitiendo Nota ${notaState.type === 'credito' ? 'Crédito' : 'Débito'}...`, { id: 'dian-nota' });
    try {
      // Necesitamos los items de la venta
      let ventaCompleta = await obtenerVentaPorId(notaState.venta.id);

      const payload = {
        numeroFacturaRef: ventaCompleta.dian?.numero || notaState.venta.numero || `SETP${notaState.venta.id}`,
        cufeRef: notaState.venta.dian.cufe,
        motivo: notaState.motivo,
        items: ventaCompleta.items,
        total: ventaCompleta.total,
        cliente: ventaCompleta.cliente || { tipo: 'CC', identificacion: '222222222222', nombre: 'Consumidor Final' },
        metodoPago: ventaCompleta.metodo_pago || 'efectivo',
        fecha: ventaCompleta.fecha ? ventaCompleta.fecha.split(' ')[0] : new Date().toISOString().split('T')[0],
      };

      let res;
      if (notaState.type === 'credito') {
        res = await (window as any).api.factus.emitirNotaCredito(payload);
      } else {
        res = await (window as any).api.factus.emitirNotaDebito(payload);
      }

      if (res && res.ok) {
        toast.success(`Nota ${notaState.type === 'credito' ? 'Crédito' : 'Débito'} generada correctamente.`, { id: 'dian-nota' });
        setNotaState(prev => ({ ...prev, isOpen: false }));
        loadVentas(); // Recargar historial (idealmente podríamos marcar la nota)
        if (res.pdf) {
          (window as any).api.app.openUrl(res.pdf);
        }
      } else {
        toast.error(`Error al emitir la nota: ${res.error || 'Desconocido'}`, { id: 'dian-nota' });
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Ocurrió un error al intentar emitir la nota.`, { id: 'dian-nota' });
    }
  }

  // Deriva el rango [desde, hasta] correspondiente al filtro de fecha activo
  // (día/mes/año). Devuelve undefined si no hay filtro, para conservar la
  // suscripción acotada por defecto.
  const calcularRangoFecha = (): { desde: Date; hasta: Date } | undefined => {
    if (!filtroFecha) return undefined;

    if (tipoPeriodo === "dia") {
      const [y, m, d] = filtroFecha.split("-").map(Number);
      if (!y || !m || !d) return undefined;
      return { desde: new Date(y, m - 1, d, 0, 0, 0, 0), hasta: new Date(y, m - 1, d, 23, 59, 59, 999) };
    }
    if (tipoPeriodo === "mes") {
      const [y, m] = filtroFecha.split("-").map(Number);
      if (!y || !m) return undefined;
      return { desde: new Date(y, m - 1, 1, 0, 0, 0, 0), hasta: new Date(y, m, 0, 23, 59, 59, 999) };
    }
    // tipoPeriodo === "ano"
    const y = Number(filtroFecha);
    if (!y) return undefined;
    return { desde: new Date(y, 0, 1, 0, 0, 0, 0), hasta: new Date(y, 11, 31, 23, 59, 59, 999) };
  };

  useEffect(() => {
    const rangoFecha = calcularRangoFecha();
    const unsubscribe = suscribirHistorialVentas(espacioActivo?.id, (data) => {
      setVentas(data || []);
    }, rangoFecha);
    return () => unsubscribe();
  }, [espacioActivo?.id, tipoPeriodo, filtroFecha])

  const loadVentas = async () => {
    // Función mantenida por retrocompatibilidad visual en otras funciones
  }

  const debeBloquearDIAN = (v: any): boolean =>
    v.estado === 'anulada' ||
    (v.metodo_pago === 'cuenta_cobro' && v.estado === 'pendiente')

  const ventasFiltradas = ventas.filter((v) => {
    const vFecha = v.fecha ? v.fecha.split(" ")[0] : "";
    const matchFecha = !filtroFecha || vFecha.startsWith(filtroFecha);
    
    // Si la venta tiene el bloque `dian` congelado, fue emitida; sino "pendiente"
    const estadoDian = v.dian?.cufe ? "enviado" : "pendiente";
    const matchEstado = filtroEstado === "todos" || estadoDian === filtroEstado;
    return matchFecha && matchEstado;
  })

  const totalVentas = ventasFiltradas.reduce((acc, v) => acc + (v.total || 0), 0)

  const anularVenta = async () => {
    if (!idToDelete) return;
    try {
      await anularVentaFirebase(idToDelete);
      toast.success("Venta anulada exitosamente. El inventario ha sido revertido.");
      setIsDeleteDialogOpen(false);
      setIdToDelete(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ocurrió un error al intentar anular la venta.");
    }
  };

  // Congela el bloque `dian` en la Venta tras una emisión exitosa de Factus
  // (ver diseño "Persistencia de metadatos DIAN en el modelo Venta"). Un
  // reintento (merge idempotente) mitiga un fallo transitorio de escritura;
  // si persiste, se reporta explícitamente en vez de fallar en silencio.
  const persistirMetadatosDian = async (ventaId: string, factusRes: any): Promise<boolean> => {
    const dian = {
      cufe: factusRes.cufe,
      qr: factusRes.qr,
      numero: factusRes.numero,
      prefijo: factusRes.prefijo || '',
      pdfUrl: factusRes.pdf || '',
      resolucion: config?.resolucion_dian || '',
    };
    try {
      await guardarMetadatosDian(ventaId, dian);
      return true;
    } catch {
      try {
        await guardarMetadatosDian(ventaId, dian); // reintento (R1)
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    }
  };

  const emitirDian = async (venta: any) => {
    if (debeBloquearDIAN(venta)) {
      toast.error(
        venta.estado === 'anulada'
          ? 'No se puede emitir DIAN sobre una venta anulada.'
          : 'No se puede emitir DIAN: la cuenta aún no ha sido recaudada.'
      )
      return
    }
    try {
      toast.loading(`Emitiendo factura a la DIAN para venta #${venta.id}...`, { id: 'dian' });
      let ventaCompleta = venta;
      if (!ventaCompleta.items) {
        ventaCompleta = await obtenerVentaPorId(venta.id);
      }

      const clientePayload = ventaCompleta.cliente || { tipo: "CC", identificacion: "222222222222", nombre: "Consumidor Final" };

      const factusRes = await (window as any).api.factus.emitir({
        ventaId: ventaCompleta.id,
        cliente: {
          tipo: clientePayload.tipo || "CC",
          identificacion: clientePayload.identificacion || "222222222222",
          nombre: clientePayload.nombre || "Consumidor Final",
          email: clientePayload.email || "consumidor@final.com",
          telefono: clientePayload.telefono || "3000000000",
          direccion: clientePayload.direccion || "Colombia"
        },
        items: ventaCompleta.items,
        total: ventaCompleta.total,
        metodoPago: ventaCompleta.metodoPagoFinal || ventaCompleta.metodo_pago
      });

      if (factusRes.ok) {
        const persistido = await persistirMetadatosDian(ventaCompleta.id, factusRes);
        if (persistido) {
          toast.success(`Factura emitida exitosamente.`, { id: 'dian' });
        } else {
          toast.error('Factura emitida en la DIAN, pero no se pudo registrar en el sistema. Contacte soporte antes de reimprimir.', { id: 'dian' });
        }
        loadVentas();
        if (ventaDetalle && ventaDetalle.id === venta.id) {
          verDetalle(venta.id);
        }
      } else {
        toast.error(`Error al emitir: ${factusRes.error || 'Desconocido'}`, { id: 'dian' });
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Ocurrió un error al intentar emitir la factura.`, { id: 'dian' });
    }
  };

  const emitirPendientes = async () => {
    const pendientes = ventasFiltradas.filter(v => !v.dian?.cufe && !debeBloquearDIAN(v));
    if (pendientes.length === 0) {
      toast.info("No hay facturas pendientes por enviar.");
      return;
    }

    let success = 0;
    let failed = 0;
    let sinRegistrar = 0;

    toast.loading(`Enviando ${pendientes.length} facturas a la DIAN...`, { id: 'dian-batch' });

    for (const venta of pendientes) {
      try {
        let ventaCompleta = await obtenerVentaPorId(venta.id);
        const clientePayload = ventaCompleta.cliente || { tipo: "CC", identificacion: "222222222222", nombre: "Consumidor Final" };
        const factusRes = await (window as any).api.factus.emitir({
          ventaId: ventaCompleta.id,
          cliente: {
            tipo: clientePayload.tipo || "CC",
            identificacion: clientePayload.identificacion || "222222222222",
            nombre: clientePayload.nombre || "Consumidor Final",
            email: clientePayload.email || "consumidor@final.com",
            telefono: clientePayload.telefono || "3000000000",
            direccion: clientePayload.direccion || "Colombia"
          },
          items: ventaCompleta.items,
          total: ventaCompleta.total,
          metodoPago: ventaCompleta.metodoPagoFinal || ventaCompleta.metodo_pago
        });

        if (factusRes.ok) {
          success++;
          const persistido = await persistirMetadatosDian(ventaCompleta.id, factusRes);
          if (!persistido) sinRegistrar++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }

    toast.success(
      `Proceso finalizado. Exitosas: ${success}, Fallidas: ${failed}${sinRegistrar ? `, sin registrar: ${sinRegistrar}` : ''}`,
      { id: 'dian-batch' }
    );
    loadVentas();
  };

  const verDetalle = async (ventaId: string) => {
    try {
      const v = await obtenerVentaPorId(ventaId);
      if (v) setVentaDetalle(v);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar el detalle de la venta.");
    }
  };

  const imprimirReimpresion = async (venta: any) => {
    if (!config) {
      toast.error("Configuración aún no disponible. Intente de nuevo en un momento.");
      return;
    }
    try {
      await imprimirTicketConMotor(venta, config);
    } catch (err) {
      console.error(err);
      toast.error("Error al imprimir el ticket.");
    }
  };

  // Orquestación del motor de tickets (B7): Si la venta posee snapshotFiscal (B2),
  // se invoca adaptarVentaB2AModeloTicket de forma pura sin consultar configuracion/general.
  // Si es una venta histórica pre-cutover, se invoca adaptarVentaLegacyAModeloTicket.
  const imprimirTicketConMotor = async (venta: any, config: ConfiguracionGlobal) => {
    const { input, empresa } = venta?.snapshotFiscal
      ? adaptarVentaB2AModeloTicket(venta.snapshotFiscal)
      : adaptarVentaLegacyAModeloTicket(venta, config);
    const model = TicketBuilder.fromVenta(input, empresa);
    const qrDataUri = model.dian ? await generateQrDataUri(model.dian.qrPayload) : undefined;
    const html = renderTicket(model, DEFAULT_RENDER_OPTIONS, { qrDataUri });

    if (typeof window !== 'undefined' && (window as any).api) {
      if (typeof (window as any).api.print.toPrinter === 'function') {
        await (window as any).api.print.toPrinter(html);
      } else {
        await (window as any).api.print.ticket(html);
      }
    }
  };

  const confirmarEliminar = (id: string) => {
    setIdToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const getMetodoPagoIcon = (metodo: string) => {
    switch (metodo) {
      case "efectivo":
        return <Banknote className="h-4 w-4" />
      case "tarjeta":
        return <CreditCard className="h-4 w-4" />
      case "transferencia":
        return <Smartphone className="h-4 w-4" />
      default:
        return <Banknote className="h-4 w-4" />
    }
  }

  const getEstadoDianBadge = (estado: string) => {
    switch (estado) {
      case "enviado":
        return (
          <Badge className="bg-emerald-500 hover:bg-emerald-600 border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Enviado
          </Badge>
        )
      case "anulada":
        return (
          <Badge className="bg-destructive hover:bg-destructive/90 border-0">
            <Trash2 className="h-3 w-3 mr-1" />
            Anulada
          </Badge>
        )
      case "pendiente":
        return (
          <Badge variant="secondary" className="bg-warning/20 text-warning border-0">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return null
    }
  }

  const exportarExcel = async () => {
    try {
      toast.loading("Generando archivo de Excel...", { id: "export-excel" });
      const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      let nameStr = "general";
      if (filtroFecha) {
        const parts = filtroFecha.split('-');
        if (parts.length === 3) {
          nameStr = `${parts[2]}_de_${monthNames[parseInt(parts[1], 10)-1]}_${parts[0]}`;
        } else if (parts.length === 2) {
          nameStr = `${monthNames[parseInt(parts[1], 10)-1]}_${parts[0]}`;
        } else {
          nameStr = parts[0];
        }
      }
      const fileName = `Reporte_ventas_${nameStr}.xlsx`;
      
      const res = await (window as any).api.ventas.exportarExcel({ ventas: ventasFiltradas, fileName });
      if (res.ok) {
        toast.success(`Exportación guardada en: ${res.path}`, { id: "export-excel" });
      } else {
        toast.error(`Exportación cancelada o fallida: ${res.error}`, { id: "export-excel" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al exportar a Excel", { id: "export-excel" });
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden p-3 gap-3 sm:p-4 sm:gap-4">
      {/* Header Stats Premium */}
      <div className="shrink-0 grid grid-cols-1 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
          <CardContent className="p-4 sm:p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center shadow-inner">
              <Receipt className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Transacciones</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{ventasFiltradas.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-success/10 rounded-full blur-2xl"></div>
          <CardContent className="p-4 sm:p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-success/20 flex items-center justify-center shadow-inner">
              <Banknote className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Ventas</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{formatCurrency(totalVentas)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
          <CardContent className="p-4 sm:p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Enviados DIAN</p>
              <p className="text-2xl font-black text-foreground tracking-tight">
                {ventas.filter((v) => !!v.dian?.cufe).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-warning/10 rounded-full blur-2xl"></div>
          <CardContent className="p-4 sm:p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-warning/20 flex items-center justify-center shadow-inner">
              <AlertCircle className="h-7 w-7 text-warning" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pendientes DIAN</p>
              <p className="text-2xl font-black text-foreground tracking-tight">
                {ventas.filter((v) => !v.dian?.cufe && !debeBloquearDIAN(v)).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions Premium */}
      <div className="shrink-0 flex flex-col min-[1180px]:flex-row gap-3 sm:gap-4 items-stretch min-[1180px]:items-center justify-between bg-card/80 backdrop-blur-xl p-4 rounded-[2rem] border border-border/50 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 min-[1180px]:flex gap-3 sm:gap-4 items-stretch min-[1180px]:items-center">
          <Select value={tipoPeriodo} onValueChange={(val: any) => { setTipoPeriodo(val); setFiltroFecha(""); }}>
            <SelectTrigger className="w-full min-[1180px]:w-32 bg-background border-border/50 rounded-xl h-11 focus:ring-primary/50 font-medium">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Por Día</SelectItem>
              <SelectItem value="mes">Por Mes</SelectItem>
              <SelectItem value="ano">Por Año</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            {tipoPeriodo === 'dia' && (
              <Input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="pl-11 w-full min-[1180px]:w-44 bg-background border-border/50 rounded-xl h-11 font-medium shadow-sm focus:ring-primary/50" />
            )}
            {tipoPeriodo === 'mes' && (
              <Input type="month" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="pl-11 w-full min-[1180px]:w-44 bg-background border-border/50 rounded-xl h-11 font-medium shadow-sm focus:ring-primary/50" />
            )}
            {tipoPeriodo === 'ano' && (
              <Input type="number" min="2020" max="2100" placeholder="Ej: 2024" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="pl-11 w-full min-[1180px]:w-44 bg-background border-border/50 rounded-xl h-11 font-medium shadow-sm focus:ring-primary/50" />
            )}
          </div>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-full min-[1180px]:w-48 bg-background border-border/50 rounded-xl h-11 focus:ring-primary/50 font-medium shadow-sm">
              <SelectValue placeholder="Estado DIAN" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <Button variant="outline" onClick={exportarExcel} className="h-11 rounded-xl font-bold border-border/50 shadow-sm hover:bg-secondary/40 w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Exportar a Excel
          </Button>
          <Button onClick={emitirPendientes} className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md shadow-primary/20 w-full sm:w-auto">
            <Send className="mr-2 h-4 w-4" />
            Emitir Pendientes
          </Button>
        </div>
      </div>

      {/* Table Premium */}
      <Card className="flex-1 min-h-0 flex flex-col bg-card/50 backdrop-blur-md border-border/50 rounded-[2rem] shadow-sm overflow-hidden">
        <CardHeader className="shrink-0 border-b border-border/50 py-4 sm:py-5 bg-card/80">
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Registro de Operaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0 overflow-auto touch-pan-y overscroll-contain">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-secondary/20">
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-bold h-12 w-[120px]">Factura N°</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Fecha y Hora</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Resumen</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Total</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">Pago</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12">DIAN</TableHead>
                <TableHead className="text-muted-foreground font-bold h-12 text-right pr-6">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-16">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 bg-secondary/30 rounded-full flex items-center justify-center">
                        <Receipt className="h-8 w-8 text-muted-foreground opacity-50" />
                      </div>
                      <p className="font-medium">No hay ventas registradas en este periodo</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                ventasFiltradas.map((venta, idx) => {
                  const estado = venta.estado === 'anulada' ? 'anulada' : (venta.dian?.cufe ? "enviado" : "pendiente");
                  const vFechaObj = new Date(venta.fecha);
                  const fechaFormat = vFechaObj.toLocaleDateString('es-CO');
                  const horaFormat = vFechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                  return (
                  <TableRow key={venta.id} className={`border-border/50 hover:bg-secondary/40 transition-colors group ${venta.estado === 'anulada' ? 'opacity-50' : ''}`} style={{ animationDelay: `${idx * 30}ms` }}>
                    <TableCell className="font-mono text-[15px] font-black text-primary">
                      #{venta.id.substring(0, 6)}...
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-background border border-border/50 flex flex-col items-center justify-center shadow-sm">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">{fechaFormat.split('/')[1]}</span>
                          <span className="text-sm font-black leading-none">{fechaFormat.split('/')[0]}</span>
                        </div>
                        <div>
                          <p className="text-foreground font-semibold text-[14px]">{fechaFormat}</p>
                          <p className="text-xs font-medium text-muted-foreground">{horaFormat}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground text-[14px] max-w-[200px] truncate" title={venta.resumen}>
                      {venta.resumen}
                    </TableCell>
                    <TableCell className="font-black text-foreground text-[15px]">
                      {formatCurrency(venta.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-secondary/30 w-fit">
                        {getMetodoPagoIcon((venta.metodo_pago || "efectivo").toLowerCase())}
                        <span className="capitalize text-[13px] font-bold">{venta.metodo_pago || "Efectivo"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getEstadoDianBadge(estado)}</TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg hover:bg-secondary/50"
                          onClick={() => verDetalle(venta.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!venta.dian?.cufe && !debeBloquearDIAN(venta) && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10" onClick={() => emitirDian(venta)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {usuario?.rol === 'admin' && venta.estado !== 'anulada' && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                            onClick={() => confirmarEliminar(venta.id)}
                            title="Anular Venta"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {venta.dian?.cufe && (
                          <>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 rounded-lg text-orange-500 hover:bg-orange-500/10"
                              title="Nota Crédito"
                              onClick={() => setNotaState({ isOpen: true, type: 'credito', venta, motivo: 'Devolución parcial de los bienes' })}
                            >
                              <FileMinus className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 rounded-lg text-blue-500 hover:bg-blue-500/10"
                              title="Nota Débito"
                              onClick={() => setNotaState({ isOpen: true, type: 'debito', venta, motivo: 'Ajuste a mayor valor' })}
                            >
                              <FilePlus className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )})
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogo Confirmación Eliminación */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que deseas anular esta venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará la venta como anulada y devolverá los productos e insumos al inventario. Si la factura ya fue enviada a la DIAN, recuerda que debes emitir una Nota Crédito además de anularla localmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={anularVenta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Anular Venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Detalle Venta */}
      <Dialog open={!!ventaDetalle} onOpenChange={() => setVentaDetalle(null)}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Detalle de Venta #{ventaDetalle?.id}
            </DialogTitle>
          </DialogHeader>

          {ventaDetalle && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Fecha y Hora</p>
                  <p className="font-medium text-foreground">
                    {new Date(ventaDetalle.fecha).toLocaleString('es-CO')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Resumen Items</p>
                  <p className="font-medium text-foreground text-sm line-clamp-2" title={ventaDetalle.resumen}>
                    {ventaDetalle.resumen}
                  </p>
                </div>
              </div>

              <div className="space-y-2 p-4 rounded-lg bg-secondary/50">
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                  <span className="text-foreground">Total Pagado</span>
                  <span className="text-primary">{formatCurrency(ventaDetalle.total)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Método de Pago</p>
                  <div className="flex items-center gap-2 mt-1 text-foreground">
                    {getMetodoPagoIcon((ventaDetalle.metodo_pago || "efectivo").toLowerCase())}
                    <span className="capitalize">{ventaDetalle.metodo_pago || "Efectivo"}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estado DIAN</p>
                  <div className="mt-1">{getEstadoDianBadge(ventaDetalle.dian?.cufe ? "enviado" : "pendiente")}</div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => imprimirReimpresion(ventaDetalle)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Imprimir Ticket
                </Button>
                {!ventaDetalle.dian?.cufe && !debeBloquearDIAN(ventaDetalle) && (
                  <Button className="flex-1" onClick={() => emitirDian(ventaDetalle)}>
                    <Send className="mr-2 h-4 w-4" />
                    Emitir DIAN
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Modal Emitir Nota (Crédito/Débito) */}
      <Dialog open={notaState.isOpen} onOpenChange={(open) => setNotaState(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Emitir Nota {notaState.type === 'credito' ? 'Crédito' : 'Débito'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Se emitirá una Nota {notaState.type === 'credito' ? 'Crédito' : 'Débito'} para la factura asociada a esta venta.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo</label>
              <Input 
                value={notaState.motivo}
                onChange={(e) => setNotaState(prev => ({ ...prev, motivo: e.target.value }))}
                placeholder="Ej. Devolución de producto"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotaState(prev => ({ ...prev, isOpen: false }))}>
              Cancelar
            </Button>
            <Button className={notaState.type === 'credito' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'} onClick={handleEmitirNota}>
              <Send className="mr-2 h-4 w-4" />
              Generar Nota
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
