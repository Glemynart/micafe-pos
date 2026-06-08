"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { useAuthContext } from '@/contexts/auth-context'
import { useEspacios } from '@/contexts/espacios-context'
import { suscribirHistorialVentas, obtenerVentaPorId, eliminarVenta as eliminarVentaFirebase } from '@/lib/ventas-service'
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

  const handleEmitirNota = async () => {
    if (!notaState.venta || !notaState.venta.cufe) return;
    
    toast.loading(`Emitiendo Nota ${notaState.type === 'credito' ? 'Crédito' : 'Débito'}...`, { id: 'dian-nota' });
    try {
      // Necesitamos los items de la venta
      let ventaCompleta = await obtenerVentaPorId(notaState.venta.id);
      
      const payload = {
        numeroFacturaRef: ventaCompleta.numero_electronico || notaState.venta.numero || `SETP${notaState.venta.id}`,
        cufeRef: notaState.venta.cufe,
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

  useEffect(() => {
    const unsubscribe = suscribirHistorialVentas(espacioActivo?.id, (data) => {
      setVentas(data || []);
    });
    return () => unsubscribe();
  }, [espacioActivo?.id])

  const loadVentas = async () => {
    // Función mantenida por retrocompatibilidad visual en otras funciones
  }

  const ventasFiltradas = ventas.filter((v) => {
    const vFecha = v.fecha ? v.fecha.split(" ")[0] : "";
    const matchFecha = !filtroFecha || vFecha.startsWith(filtroFecha);
    
    // Si la venta tiene CUFE o qr_dian es "enviado", sino "pendiente"
    const estadoDian = v.cufe ? "enviado" : "pendiente";
    const matchEstado = filtroEstado === "todos" || estadoDian === filtroEstado;
    return matchFecha && matchEstado;
  })

  const totalVentas = ventasFiltradas.reduce((acc, v) => acc + (v.total || 0), 0)

  const formatCOP = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(value || 0)
  }

  const eliminarVenta = async () => {
    if (!idToDelete) return;
    try {
      await eliminarVentaFirebase(idToDelete);
      toast.success("Venta eliminada exitosamente.");
      setIsDeleteDialogOpen(false);
      setIdToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Ocurrió un error al intentar eliminar la venta.");
    }
  };

  const emitirDian = async (venta: any) => {
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
        metodoPago: ventaCompleta.metodo_pago
      });

      if (factusRes.ok) {
        toast.success(`Factura emitida exitosamente.`, { id: 'dian' });
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
    const pendientes = ventasFiltradas.filter(v => !v.cufe);
    if (pendientes.length === 0) {
      toast.info("No hay facturas pendientes por enviar.");
      return;
    }
    
    let success = 0;
    let failed = 0;
    
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
          metodoPago: ventaCompleta.metodo_pago
        });
        
        if (factusRes.ok) {
          success++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }
    
    toast.success(`Proceso finalizado. Exitosas: ${success}, Fallidas: ${failed}`, { id: 'dian-batch' });
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
    try {
      const config = await (window as any).api.config.get();
      // En el historial la venta ya viene con items detallados si usamos ventas.get()
      await imprimirTicketHTML({
        ...venta,
        metodoPago: venta.metodo_pago,
        numFactura: venta.numero_electronico || venta.id, // Usar número electrónico si existe
      }, config);
    } catch (err) {
      console.error(err);
      toast.error("Error al imprimir el ticket.");
    }
  };

  const imprimirTicketHTML = async (data: any, config: any) => {
    const { items, total, pago, cambio, metodoPago: mp, fecha, numFactura } = data;
    
    const fechaStr    = new Date(fecha).toLocaleString('es-CO');
    const storeName   = config.nombre_tienda        || 'MiTienda';
    const propietario = config.nombre_propietario   || '';
    const nit         = config.nit_tienda           || '';
    const direccion   = config.direccion_tienda     || '';
    const ciudad      = config.ciudad               || '';
    const tel         = config.telefono             || '';
    const resolucion  = config.resolucion_dian      || '';
    const respIva     = config.responsable_iva === '1';
    const tipoContr   = config.tipo_contribuyente   || '';

    const prefijo = config.prefijo_dian || config.prefijo_factura || 'SETT';
    let cleanNum = numFactura;
    if (typeof cleanNum === 'string') {
      const cleanPref = prefijo.trim().toUpperCase();
      const cleanVal = cleanNum.trim().toUpperCase();
      if (cleanVal.startsWith(cleanPref)) {
        cleanNum = cleanNum.trim().substring(cleanPref.length).trim();
      }
    }
    const numStr = cleanNum ? String(cleanNum).padStart(6, '0') : '';
    
    // Si es Factura Electrónica (DIAN habilitada, Factus configurado, o CUFE/QR presentes)
    const isDian = !!data.cufe || !!data.qr
               || config.facturacion_dian === 'true' || config.facturacion_dian === true
               || (!!config.factus_client_id && config.factus_client_id.length > 10);
    
    let cufe = '';
    let qrData = '';
    
    if (isDian) {
      cufe = data.cufe || 
             Array.from(`${prefijo}${numStr}${fechaStr}${total}${nit}`)
                  .reduce((a,b)=>(((a<<5)-a)+b.charCodeAt(0))|0,0)
                  .toString(16).padStart(40, '0');
      qrData = data.qr || `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentKey=${cufe}`;
    }

    const compradorNombre = data.cliente?.nombre || "CONSUMIDOR FINAL";
    const compradorDoc = data.cliente?.identificacion || "222222222222";

    const subtotalVal = data.subtotal_ventas || total;
    const ivaVal = data.iva_total || 0;
    const impoVal = data.impoconsumo_total || 0;

    const itemsHtml = items.map((i: any) => {
      const nombre = (i.nombre || i.descripcion || '').toUpperCase();
      const cant = i.cantidad || 1;
      const precioVal = Math.round(i.precio || i.precio_unitario || 0);
      const subtotalVal = Math.round(i.subtotal || (cant * precioVal));
      const cod = i.codigo || i.barcode || i.producto_id || i.id || '';
      return `
        <div class="row3">
          <span class="desc">${nombre}<br>
            <span style="font-size: 11.5px; font-weight: bold; color: #000;">Cod: ${cod} | CANT: ${cant}</span>
          </span>
          <span class="unit">$${precioVal.toLocaleString('es-CO')}</span>
          <span class="sub">$${subtotalVal.toLocaleString('es-CO')}</span>
        </div>
      `;
    }).join('');

    let taxesHtml = '';
    if (isDian) {
      if (ivaVal > 0) {
        taxesHtml += `<tr><td>IVA</td><td>19%</td><td>$${Math.round(subtotalVal).toLocaleString('es-CO')}</td><td>$${Math.round(ivaVal).toLocaleString('es-CO')}</td></tr>`;
      }
      if (impoVal > 0) {
        taxesHtml += `<tr><td>INC</td><td>8%</td><td>$${Math.round(subtotalVal).toLocaleString('es-CO')}</td><td>$${Math.round(impoVal).toLocaleString('es-CO')}</td></tr>`;
      }
      if (ivaVal === 0 && impoVal === 0) {
        taxesHtml += `<tr><td>EXENTO</td><td>0%</td><td>$${Math.round(total).toLocaleString('es-CO')}</td><td>$0</td></tr>`;
      }
    }

    const html = `<html><head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px;
          line-height: 1.35;
          width: 280px;
          margin: 0;
          padding: 0 4px;
          color: #000;
        }
        .center  { text-align: center; }
        .bold    { font-weight: bold; }
        .uppercase { text-transform: uppercase; }
        .titulo  {
          text-align: center;
          font-size: 13px;
          font-weight: bold;
          margin: 8px 0;
          border-top: 1.5px dashed #000;
          border-bottom: 1.5px dashed #000;
          padding: 6px 0;
        }
        .store   { text-align: center; font-size: 15px; font-weight: bold; margin: 6px 0 2px 0; }
        .sub     { text-align: center; font-size: 11px; margin: 2px 0; line-height: 1.25; }
        .sep     { text-align: center; margin: 8px 0; border-top: 1.5px dashed #000; }
        .row2    { display: flex; justify-content: space-between; margin: 3px 0; }
        .row3    { display: flex; margin: 6px 0; border-bottom: 0.5px solid #ddd; padding-bottom: 4px; }
        .row3 .desc { flex: 1; padding-right: 4px; }
        .row3 .unit { width: 70px; text-align: right; font-size: 12px; }
        .row3 .sub  { width: 75px; text-align: right; font-size: 12px; font-weight: bold; }
        .hdr3    { display: flex; font-weight: bold; border-bottom: 1.5px dashed #000; padding-bottom: 5px; margin-bottom: 6px; font-size: 12px; }
        .hdr3 .desc { flex: 1; }
        .hdr3 .unit, .hdr3 .sub { width: 75px; text-align: right; }
        .total-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
        .total-main{ font-weight: bold; font-size: 15px; border-top: 1.5px dashed #000; padding-top: 6px; margin-top: 6px; }
        .tax-table { width: 100%; font-size: 11px; margin-top: 8px; border-collapse: collapse; }
        .tax-table th { border-bottom: 1.5px dashed #000; text-align: left; font-weight: bold; padding-bottom: 4px; }
        .tax-table td { padding: 4px 0; }
        .cufe    { font-size: 10px; word-break: break-all; text-align: justify; margin: 6px 0; line-height: 1.2; font-family: monospace; }
        .qr-container { text-align: center; margin: 12px 0; }
        .qr-image { display: inline-block; width: 140px; height: 140px; }
        .res     { font-size: 10px; line-height: 1.4; margin-top: 8px; border-top: 1.5px dashed #000; padding-top: 6px; }
        .footer  { text-align: center; margin-top: 15px; font-size: 11px; line-height: 1.4; }
      </style></head><body>
      
      <div class="store uppercase">${storeName}</div>
      ${propietario ? `<div class="sub uppercase">${propietario}</div>` : ''}
      ${nit ? `<div class="sub">NIT: ${nit}</div>` : ''}
      ${direccion ? `<div class="sub uppercase">${direccion}</div>` : ''}
      ${ciudad ? `<div class="sub uppercase">${ciudad} - COLOMBIA</div>` : ''}
      ${tel ? `<div class="sub">TEL: ${tel}</div>` : ''}
      <div class="sub">${tipoContr ? tipoContr : (respIva ? 'Responsable de IVA' : 'No Responsable de IVA')}</div>
      
      <div class="titulo">${isDian ? 'FACTURA ELECTRÓNICA DE VENTA' : 'TICKET DE VENTA'}</div>
      
      <div class="row2"><span class="bold">N° ${isDian ? 'FACTURA' : 'TICKET'}:</span><span class="bold">${isDian ? prefijo + ' ' : ''}${numStr}</span></div>
      <div class="row2"><span>FECHA:</span><span>${fechaStr.split(',')[0]}</span></div>
      <div class="row2"><span>HORA:</span><span>${fechaStr.split(',')[1] || ''}</span></div>
      
      ${isDian ? `
        <div class="sep"></div>
        <div class="sub" style="text-align:left"><span class="bold">ADQUIRIENTE:</span> ${compradorNombre.toUpperCase()}</div>
        <div class="sub" style="text-align:left"><span class="bold">NIT/CC:</span> ${compradorDoc}</div>
      ` : ''}
      
      <div class="sep"></div>
      <div class="hdr3">
        <span class="desc">DESCRIPCIÓN</span>
        <span class="unit">UNIT.</span>
        <span class="sub">TOTAL</span>
      </div>
      
      ${itemsHtml}
      
      <div class="sep"></div>
      <div class="total-row"><span>SUBTOTAL:</span><span>$${Math.round(subtotalVal).toLocaleString('es-CO')}</span></div>
      ${ivaVal > 0 ? `<div class="total-row"><span>IVA:</span><span>$${Math.round(ivaVal).toLocaleString('es-CO')}</span></div>` : ''}
      ${impoVal > 0 ? `<div class="total-row"><span>IMPOCONSUMO:</span><span>$${Math.round(impoVal).toLocaleString('es-CO')}</span></div>` : ''}
      <div class="total-row total-main"><span>TOTAL A PAGAR:</span><span>$${Math.round(total).toLocaleString('es-CO')}</span></div>
      
      <div class="row2" style="margin-top: 6px;"><span class="bold">FORMA PAGO:</span><span class="bold uppercase">${mp}</span></div>
      ${pago > 0 && cambio >= 0 ? `
        <div class="row2"><span>RECIBIDO:</span><span>$${Math.round(pago).toLocaleString('es-CO')}</span></div>
        <div class="row2"><span class="bold">CAMBIO:</span><span class="bold">$${Math.round(cambio).toLocaleString('es-CO')}</span></div>
      ` : ''}
      
      ${isDian ? `
        <div class="sep"></div>
        <div class="bold center" style="font-size:11px;">DETALLE DE IMPUESTOS</div>
        <table class="tax-table">
          <thead>
            <tr><th>TIPO</th><th>TASA</th><th>BASE</th><th>VALOR</th></tr>
          </thead>
          <tbody>
            ${taxesHtml}
          </tbody>
        </table>
        
        <div class="sep"></div>
        <div class="bold">CUFE:</div>
        <div class="cufe">${cufe}</div>
        
        <div class="qr-container">
          <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}" />
        </div>
        
        <div class="res">
          <div>Resolución DIAN N° ${config.resolucion_dian || '187640000001'} Prefijo: ${prefijo} Habilitada del ${config.rango_inicio || '1'} al ${config.rango_fin || '10000'}</div>
          ${config.resolucion_vigencia ? `<div>Vigencia: ${config.resolucion_vigencia}</div>` : ''}
          <div class="bold" style="margin-top:4px">Proveedor Tecnológico: FACTUS S.A.S. NIT: 901724254-1</div>
        </div>
      ` : ''}
      
      <div class="footer">
        <p class="bold">MiTienda POS</p>
        <p>Desarrollado por Sebastian Agudelo Muñoz - NIT: 1000292576-3</p>
        <p style="margin-top:6px; font-weight: bold;">¡GRACIAS POR SU COMPRA!</p>
      </div>
      <div style="height:35px"></div>
    </body></html>`;

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
    <div className="space-y-6">
      {/* Header Stats Premium */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
          <CardContent className="p-5 relative z-10 flex items-center gap-4">
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
          <CardContent className="p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-success/20 flex items-center justify-center shadow-inner">
              <Banknote className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Ventas</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{formatCOP(totalVentas)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
          <CardContent className="p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Enviados DIAN</p>
              <p className="text-2xl font-black text-foreground tracking-tight">
                {ventas.filter((v) => !!v.cufe).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 via-background to-background border-border/50 rounded-[2rem] shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-warning/10 rounded-full blur-2xl"></div>
          <CardContent className="p-5 relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-warning/20 flex items-center justify-center shadow-inner">
              <AlertCircle className="h-7 w-7 text-warning" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pendientes DIAN</p>
              <p className="text-2xl font-black text-foreground tracking-tight">
                {ventas.filter((v) => !v.cufe).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions Premium */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card/80 backdrop-blur-xl p-4 rounded-[2rem] border border-border/50 shadow-sm mt-2">
        <div className="flex flex-wrap gap-4 items-center">
          <Select value={tipoPeriodo} onValueChange={(val: any) => { setTipoPeriodo(val); setFiltroFecha(""); }}>
            <SelectTrigger className="w-32 bg-background border-border/50 rounded-xl h-11 focus:ring-primary/50 font-medium">
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
              <Input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="pl-11 w-44 bg-background border-border/50 rounded-xl h-11 font-medium shadow-sm focus:ring-primary/50" />
            )}
            {tipoPeriodo === 'mes' && (
              <Input type="month" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="pl-11 w-44 bg-background border-border/50 rounded-xl h-11 font-medium shadow-sm focus:ring-primary/50" />
            )}
            {tipoPeriodo === 'ano' && (
              <Input type="number" min="2020" max="2100" placeholder="Ej: 2024" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="pl-11 w-44 bg-background border-border/50 rounded-xl h-11 font-medium shadow-sm focus:ring-primary/50" />
            )}
          </div>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-48 bg-background border-border/50 rounded-xl h-11 focus:ring-primary/50 font-medium shadow-sm">
              <SelectValue placeholder="Estado DIAN" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportarExcel} className="h-11 rounded-xl font-bold border-border/50 shadow-sm hover:bg-secondary/40">
            <Download className="mr-2 h-4 w-4" />
            Exportar a Excel
          </Button>
          <Button onClick={emitirPendientes} className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md shadow-primary/20">
            <Send className="mr-2 h-4 w-4" />
            Emitir Pendientes
          </Button>
        </div>
      </div>

      {/* Table Premium */}
      <Card className="flex-1 flex flex-col bg-card/50 backdrop-blur-md border-border/50 rounded-[2rem] shadow-sm overflow-hidden mt-4">
        <CardHeader className="border-b border-border/50 py-5 bg-card/80">
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Registro de Operaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          <Table>
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
                  const estado = venta.cufe ? "enviado" : "pendiente";
                  const vFechaObj = new Date(venta.fecha);
                  const fechaFormat = vFechaObj.toLocaleDateString('es-CO');
                  const horaFormat = vFechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                  return (
                  <TableRow key={venta.id} className="border-border/50 hover:bg-secondary/40 transition-colors group" style={{ animationDelay: `${idx * 30}ms` }}>
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
                      {formatCOP(venta.total)}
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
                        {!venta.cufe && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10" onClick={() => emitirDian(venta)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {usuario?.rol === 'admin' && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                            onClick={() => confirmarEliminar(venta.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {venta.cufe && (
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
            <AlertDialogTitle>¿Seguro que deseas eliminar esta venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si la venta ya fue enviada a la DIAN, 
              esta eliminación solo afectará al registro local.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarVenta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
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
                  <span className="text-primary">{formatCOP(ventaDetalle.total)}</span>
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
                  <div className="mt-1">{getEstadoDianBadge(ventaDetalle.cufe ? "enviado" : "pendiente")}</div>
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
                {!ventaDetalle.cufe && (
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
