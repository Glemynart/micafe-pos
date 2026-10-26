/** Proyección operativa, sin escrituras ni autoridad fiscal. ADR-SAAS-041/042/016. */
export interface FuenteReporte { id: string; data: Record<string, unknown> }
export interface ProductoReporte { id: string; nombre: string; activo: boolean; ingresoCOP: number; unidadesBase: number; unidad: string }
export interface LineaReporte {
  ventaId: string; fecha: string; vendedor: string; productoId: string; producto: string;
  presentacion: string; cantidad: number; unidadesBase: number; ingresoCOP: number;
  costoCOP: number | null; utilidadCOP: number | null; metodo: string;
}
export interface ReporteBodega {
  mes: string; ventas: number; ingresoCOP: number; recaudadoCOP: number; saldoPendienteBodegaCOP: number; costoRegistradoCOP: number;
  utilidadBrutaCOP: number | null; lineasSinCosto: number; lineasCostoCero: number;
  pagos: { efectivo: number; transferencia: number };
  vendedores: Array<{ id: string; nombre: string; ventas: number; ingresoCOP: number }>;
  productos: ProductoReporte[]; lineas: LineaReporte[]; anuladas: number;
}
const numero = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const texto = (n: unknown): n is string => typeof n === 'string' && n.trim().length > 0;
const mapa = (n: unknown): Record<string, unknown> => n && typeof n === 'object' && !Array.isArray(n) ? n as Record<string, unknown> : {};
const sumar = (a: number, b: number) => { const n=a+b; if (!Number.isSafeInteger(n)) throw new Error('El reporte excede el rango numérico seguro.'); return n; };
function invalidar(): never { throw new Error('Hay ventas Bodega con datos incompletos o inconsistentes. No se puede mostrar un total fiable.'); }

export function rangoMesBogota(mes: string): { inicio: Date; fin: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mes inválido.');
  const [a,m]=mes.split('-').map(Number);
  if(a<2020 || a>2100) throw new Error('Año fuera del rango del reporte.');
  return {inicio:new Date(Date.UTC(a,m-1,1,5)),fin:new Date(Date.UTC(a,m,1,5))};
}
function fecha(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value==='object' && 'toDate' in value && typeof value.toDate==='function') return fecha(value.toDate());
  return null;
}
function verificarTenant(fuente: FuenteReporte, empresaId: string) {
  if (fuente.data.empresaId!==empresaId) throw new Error('La fuente no corresponde al tenant activo.');
}
/** No recibe precios/costos actuales: solo snapshots canónicos de cada venta. */
export function calcularReporteBodega(input: {
  empresaId: string; mes: string; ventas: readonly FuenteReporte[];
  productos: readonly FuenteReporte[]; movimientos?: readonly FuenteReporte[]; clientes?: readonly FuenteReporte[];
  nombres?: ReadonlyMap<string,string>;
}): ReporteBodega {
  if (!texto(input.empresaId)) throw new Error('Tenant no disponible.');
  const {inicio,fin}=rangoMesBogota(input.mes);
  const resultado: ReporteBodega={mes:input.mes,ventas:0,ingresoCOP:0,recaudadoCOP:0,saldoPendienteBodegaCOP:0,costoRegistradoCOP:0,utilidadBrutaCOP:null,lineasSinCosto:0,lineasCostoCero:0,pagos:{efectivo:0,transferencia:0},vendedores:[],productos:[],lineas:[],anuladas:0};
  const productos=new Map<string,ProductoReporte>();
  for(const fuente of input.productos){
    verificarTenant(fuente,input.empresaId);
    if(productos.has(fuente.id)) throw new Error('Producto duplicado en el reporte.');
    const p=fuente.data;
    productos.set(fuente.id,{id:fuente.id,nombre:texto(p.nombre)?p.nombre:'Producto sin nombre',activo:p.activo===true,ingresoCOP:0,unidadesBase:0,unidad:texto(p.unidadMedida)?p.unidadMedida:texto(p.unidad)?p.unidad:'unidad'});
  }
  const ids=new Set<string>();const vendedores=new Map<string,ReporteBodega['vendedores'][number]>();
  for(const fuente of input.ventas){
    verificarTenant(fuente,input.empresaId);
    if(ids.has(fuente.id)) throw new Error('Venta duplicada en el reporte.');
    ids.add(fuente.id);
    const v=fuente.data;
    if(v.schemaVersion!=='BODEGA_MVP1_V1' && v.schemaVersion!=='BODEGA_MVP1_V2') continue;
    const cuando=fecha(v.fecha); if(!cuando) invalidar();
    if(cuando<inicio || cuando>=fin) continue;
    if(v.estado==='anulada'){resultado.anuladas++;continue;}
    if(v.estadoOperativo!=='COMPLETO') continue;
    const totales=mapa(v.totales);
    if(!numero(totales.total) || totales.total===0 || totales.impuestos!==0 || !Array.isArray(v.items) || v.items.length===0) invalidar();
    const esCreditoBodega=v.schemaVersion==='BODEGA_MVP1_V2';
    if(esCreditoBodega){
      if(v.metodoPago!=='cuenta_cobro' || (v.estado!=='pendiente' && v.estado!=='pagada')
        || !numero(v.totalAbonadoCOP) || !numero(v.saldoPendienteCOP)
        || v.totalAbonadoCOP+v.saldoPendienteCOP!==totales.total
        || (v.estado==='pendiente' && v.saldoPendienteCOP===0)
        || (v.estado==='pagada' && v.saldoPendienteCOP!==0)) invalidar();
    }else{
      if(v.estado!=='pagada') continue;
      if(v.metodoPago!=='efectivo' && v.metodoPago!=='transferencia') invalidar();
      resultado.recaudadoCOP=sumar(resultado.recaudadoCOP,totales.total);
      resultado.pagos[v.metodoPago]=sumar(resultado.pagos[v.metodoPago],totales.total);
    }
    const metodo=esCreditoBodega?'cuenta_cobro':v.metodoPago as 'efectivo'|'transferencia';
    const actor=texto(v.cajeroId)?v.cajeroId:'sin-identificar';
    const snapshot=texto(v.cajeroNombre) && v.cajeroNombre!==actor?v.cajeroNombre.trim():null;
    const actual=input.nombres?.get(actor)?.trim();
    const nombre=snapshot || (actual && actual!==actor?actual:null) || (actor.length>6?`Operador · …${actor.slice(-6)}`:'Operador sin identificar');
    let sumaLineas=0;
    for(const raw of v.items){
      const l=mapa(raw);
      if(!texto(l.productoId) || !texto(l.presentacionId) || !texto(l.productoNombreSnapshot) || !texto(l.unidadBaseSnapshot) || !texto(l.presentacionNombreSnapshot)
        || !numero(l.cantidadPresentaciones) || l.cantidadPresentaciones===0 || !numero(l.factorUnidadBase) || l.factorUnidadBase===0
        || !numero(l.cantidadUnidadBase) || l.cantidadUnidadBase!==l.cantidadPresentaciones*l.factorUnidadBase || !numero(l.subtotalCOP)) invalidar();
      sumaLineas=sumar(sumaLineas,l.subtotalCOP);
      const costo=numero(l.costoTotalLineaCOP)?l.costoTotalLineaCOP:null;
      if(costo===null) resultado.lineasSinCosto++;
      else {resultado.costoRegistradoCOP=sumar(resultado.costoRegistradoCOP,costo);if(costo===0)resultado.lineasCostoCero++;}
      let producto=productos.get(l.productoId);
      if(!producto){producto={id:l.productoId,nombre:l.productoNombreSnapshot,activo:false,ingresoCOP:0,unidadesBase:0,unidad:l.unidadBaseSnapshot};productos.set(l.productoId,producto);}
      // No mezclar unidades históricas con una unidad cambiada en el catálogo.
      if(producto.unidad!==l.unidadBaseSnapshot && producto.unidadesBase>0) invalidar();
      producto.unidad=l.unidadBaseSnapshot;
      producto.ingresoCOP=sumar(producto.ingresoCOP,l.subtotalCOP);producto.unidadesBase=sumar(producto.unidadesBase,l.cantidadUnidadBase);
      resultado.lineas.push({ventaId:fuente.id,fecha:cuando.toISOString(),vendedor:nombre,productoId:l.productoId,producto:l.productoNombreSnapshot,presentacion:l.presentacionNombreSnapshot,cantidad:l.cantidadPresentaciones,unidadesBase:l.cantidadUnidadBase,ingresoCOP:l.subtotalCOP,costoCOP:costo,utilidadCOP:costo===null?null:l.subtotalCOP-costo,metodo});
    }
    if(sumaLineas!==totales.total) invalidar();
    resultado.ventas++;resultado.ingresoCOP=sumar(resultado.ingresoCOP,totales.total);
    const vendedor=vendedores.get(actor)??{id:actor,nombre,ventas:0,ingresoCOP:0};
    vendedor.ventas++;vendedor.ingresoCOP=sumar(vendedor.ingresoCOP,totales.total);vendedores.set(actor,vendedor);
  }
  const movimientosIds=new Set<string>();
  for(const fuente of input.movimientos??[]){
    verificarTenant(fuente,input.empresaId);
    if(movimientosIds.has(fuente.id)) invalidar();
    movimientosIds.add(fuente.id);
    const m=fuente.data;
    if(m.categoria!=='cuentas_cobro' || m.tipo!=='ingreso' || m.referenciaColeccion!=='ventas') continue;
    const cuando=fecha(m.fecha); if(!cuando) invalidar();
    if(cuando<inicio || cuando>=fin) continue;
    if(!numero(m.monto) || m.monto===0) invalidar();
    const cuenta=m.cuentaClaveSnapshot;
    const metodo=cuenta==='caja-principal'?'efectivo':cuenta==='bancolombia'?'transferencia':null;
    if(!metodo) invalidar();
    resultado.recaudadoCOP=sumar(resultado.recaudadoCOP,m.monto);
    resultado.pagos[metodo]=sumar(resultado.pagos[metodo],m.monto);
  }
  for(const fuente of input.clientes??[]){
    verificarTenant(fuente,input.empresaId);
    const saldo=fuente.data.saldoPendienteBodegaCOP;
    if(saldo===undefined || saldo===null) continue;
    if(!numero(saldo)) invalidar();
    resultado.saldoPendienteBodegaCOP=sumar(resultado.saldoPendienteBodegaCOP,saldo);
  }
  resultado.utilidadBrutaCOP=resultado.ventas>0 && resultado.lineasSinCosto===0?resultado.ingresoCOP-resultado.costoRegistradoCOP:null;
  resultado.vendedores=[...vendedores.values()].sort((a,b)=>b.ingresoCOP-a.ingresoCOP || a.nombre.localeCompare(b.nombre,'es'));
  resultado.productos=[...productos.values()].filter(p=>p.activo || p.ingresoCOP>0).sort((a,b)=>b.ingresoCOP-a.ingresoCOP || a.nombre.localeCompare(b.nombre,'es'));
  return resultado;
}

export function ordenarProductosReporte(productos: readonly ProductoReporte[], opciones: {
  criterio: 'ingreso' | 'cantidad'; unidad?: string; ascendente?: boolean;
}): ProductoReporte[] {
  if(opciones.criterio==='cantidad' && !texto(opciones.unidad)) throw new Error('Selecciona una unidad base para comparar cantidades.');
  const seleccion=opciones.criterio==='cantidad'?productos.filter(p=>p.unidad===opciones.unidad):[...productos];
  return seleccion.sort((a,b)=>{
    const diferencia=opciones.criterio==='cantidad'?a.unidadesBase-b.unidadesBase:a.ingresoCOP-b.ingresoCOP;
    return (opciones.ascendente?diferencia:-diferencia) || a.nombre.localeCompare(b.nombre,'es');
  });
}

/** CSV para Excel. Neutraliza texto interpretable como fórmula, conserva importes numéricos. */
export function csvReporteBodega(reporte: ReporteBodega): string {
  const celda=(value:string|number|null) => {
    if(value===null)return '""';
    let text=String(value);
    if(typeof value==='string' && /^[\s\uFEFF]*[=+@-]/.test(text))text=`'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  const filas:Array<Array<string|number|null>>=[['Venta ID','Fecha UTC','Vendedor','Producto ID','Producto','Presentación','Cantidad presentaciones','Cantidad unidad base','Ingreso COP','Costo histórico COP','Utilidad bruta COP','Medio de pago','Tipo de reporte']];
  for(const l of reporte.lineas)filas.push([l.ventaId,l.fecha,l.vendedor,l.productoId,l.producto,l.presentacion,l.cantidad,l.unidadesBase,l.ingresoCOP,l.costoCOP,l.utilidadCOP,l.metodo,'OPERATIVO NO FISCAL']);
  return '\uFEFF'+filas.map(row=>row.map(celda).join(';')).join('\r\n');
}
