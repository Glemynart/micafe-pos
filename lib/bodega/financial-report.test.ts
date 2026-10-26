import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularReporteBodega, csvReporteBodega, ordenarProductosReporte, rangoMesBogota, type FuenteReporte } from './financial-report';
const producto:FuenteReporte={id:'agua',data:{empresaId:'a',nombre:'Agua',unidad:'unidad',activo:true,costo:999999}};
function venta(overrides:Record<string,unknown>={}):FuenteReporte{return{id:'v1',data:{empresaId:'a',schemaVersion:'BODEGA_MVP1_V1',fecha:new Date('2026-10-01T05:00:00Z'),estado:'pagada',estadoOperativo:'COMPLETO',cajeroId:'vendedor-a',totales:{total:10000,impuestos:0},metodoPago:'efectivo',pago:{montoRecibidoCOP:20000,cambioCOP:10000},items:[{productoId:'agua',productoNombreSnapshot:'Agua',presentacionId:'caja',presentacionNombreSnapshot:'Caja',unidadBaseSnapshot:'unidad',factorUnidadBase:24,cantidadPresentaciones:2,cantidadUnidadBase:48,subtotalCOP:10000,costoTotalLineaCOP:6000}],...overrides}};}
const run=(ventas:FuenteReporte[],productos:FuenteReporte[]=[producto],extras: {mes?:string;movimientos?:FuenteReporte[];clientes?:FuenteReporte[]}={})=>calcularReporteBodega({empresaId:'a',mes:extras.mes??'2026-10',ventas,productos,movimientos:extras.movimientos,clientes:extras.clientes});
test('usa costos históricos, contabiliza la venta una vez y descuenta el cambio del cobro',()=>{
 const r=run([venta()]);assert.equal(r.ingresoCOP,10000);assert.equal(r.recaudadoCOP,10000);assert.equal(r.costoRegistradoCOP,6000);assert.equal(r.utilidadBrutaCOP,4000);assert.equal(r.pagos.efectivo,10000);assert.equal(r.productos[0].unidadesBase,48);assert.equal(r.ventas,1);
});
test('mantiene efectivo y transferencia separados y atribuye al vendedor, incluyendo ventas del admin',()=>{
 const r=run([venta(),{...venta({cajeroId:'admin',metodoPago:'transferencia'}),id:'v2'}]);assert.equal(r.vendedores.length,2);assert.equal(r.pagos.transferencia,10000);assert.equal(r.vendedores.reduce((n,v)=>n+v.ventas,0),2);
});
test('costo ausente oculta utilidad, costo cero explícito se conserva y señala',()=>{
 const v=venta();const l=(v.data.items as Record<string,unknown>[])[0];delete l.costoTotalLineaCOP;
 assert.equal(run([v]).utilidadBrutaCOP,null);assert.equal(run([v]).lineasSinCosto,1);
 l.costoTotalLineaCOP=0;assert.equal(run([v]).utilidadBrutaCOP,10000);assert.equal(run([v]).lineasCostoCero,1);
});
test('anuladas y operaciones incompletas no incrementan ventas ni utilidad',()=>{
 const r=run([venta({estado:'anulada'}),{...venta({estadoOperativo:'PENDIENTE'}),id:'v2'}]);assert.equal(r.ventas,0);assert.equal(r.anuladas,1);assert.equal(r.utilidadBrutaCOP,null);
});
test('no incluye otras versiones de ventas',()=>assert.equal(run([venta({schemaVersion:'OTRO'})]).ventas,0));
test('ADR-091: cuenta ventas a crédito al entregar, separa recaudado y muestra saldo abierto vigente',()=>{
 const credit=venta({schemaVersion:'BODEGA_MVP1_V2',estado:'pendiente',metodoPago:'cuenta_cobro',totalAbonadoCOP:2000,saldoPendienteCOP:8000,pago:{metodo:'cuenta_cobro'}});
 const r=run([credit],[producto],{clientes:[{id:'cliente',data:{empresaId:'a',saldoPendienteBodegaCOP:8000}}]});
 assert.equal(r.ventas,1);assert.equal(r.ingresoCOP,10000);assert.equal(r.recaudadoCOP,0);assert.equal(r.saldoPendienteBodegaCOP,8000);
 assert.equal(r.vendedores[0].ingresoCOP,10000);assert.equal(r.pagos.efectivo,0);assert.equal(r.productos[0].ingresoCOP,10000);
});
test('ADR-091: los abonos cuentan por su fecha real y medio, aunque la venta fuera de otro mes',()=>{
 const credit=venta({fecha:new Date('2026-10-02T12:00:00Z'),schemaVersion:'BODEGA_MVP1_V2',estado:'pagada',metodoPago:'cuenta_cobro',totalAbonadoCOP:10000,saldoPendienteCOP:0,pago:{metodo:'cuenta_cobro'}});
 const movement:FuenteReporte={id:'abono',data:{empresaId:'a',fecha:new Date('2026-11-04T12:00:00Z'),tipo:'ingreso',categoria:'cuentas_cobro',referenciaColeccion:'ventas',ventaId:'v1',monto:10000,cuentaClaveSnapshot:'bancolombia'}};
 const r=run([credit],[producto],{mes:'2026-11',movimientos:[movement]});
 assert.equal(r.ventas,0);assert.equal(r.ingresoCOP,0);assert.equal(r.recaudadoCOP,10000);assert.equal(r.pagos.transferencia,10000);
});
test('ADR-091: una cuenta de cobro con saldos incoherentes no aparece como total fiable',()=>{
 const credit=venta({schemaVersion:'BODEGA_MVP1_V2',estado:'pendiente',metodoPago:'cuenta_cobro',totalAbonadoCOP:2000,saldoPendienteCOP:7000});
 assert.throws(()=>run([credit]),/inconsistentes/);
});
test('rechaza fuentes de otro tenant en ventas y catálogo',()=>{
 assert.throws(()=>run([venta({empresaId:'b'})]),/tenant/);assert.throws(()=>run([],[{...producto,data:{...producto.data,empresaId:'b'}}]),/tenant/);
});
test('rechaza IDs duplicados para evitar doble conteo',()=>assert.throws(()=>run([venta(),venta()]),/duplicada/));
test('incluye productos activos sin ventas y excluye inactivos sin ventas',()=>{
 const r=run([],[producto,{id:'x',data:{empresaId:'a',activo:false}}]);assert.equal(r.productos.length,1);assert.equal(r.productos[0].ingresoCOP,0);
});
test('ranking por ingreso COP conserva cantidad de la unidad base y no compara cajas con unidades',()=>{
 const otra={id:'jugo',data:{empresaId:'a',activo:true,nombre:'Jugo',unidad:'unidad'}};
 const v2=venta();v2.id='v2';const l=(v2.data.items as Record<string,unknown>[])[0];l.productoId='jugo';l.productoNombreSnapshot='Jugo';l.subtotalCOP=20000;v2.data.totales={total:20000,impuestos:0};
 assert.deepEqual(run([venta(),v2],[producto,otra]).productos.map(p=>p.id),['jugo','agua']);
});
test('usa límites inclusivo/exclusivo de Bogotá al cambio de mes y año',()=>{
 assert.equal(rangoMesBogota('2026-12').fin.toISOString(),'2027-01-01T05:00:00.000Z');
 const r=run([venta({fecha:new Date('2026-10-01T04:59:59Z')}),{...venta({fecha:new Date('2026-11-01T04:59:59Z')}),id:'v2'},{...venta({fecha:new Date('2026-11-01T05:00:00Z')}),id:'v3'}]);assert.equal(r.ventas,1);
 assert.throws(()=>rangoMesBogota('2026-13'));
});
test('rechaza totales, factores y medios incompatibles en vez de mostrar datos parciales',()=>{
 assert.throws(()=>run([venta({totales:{total:9999,impuestos:0}})]),/inconsistentes/);
 assert.throws(()=>run([venta({metodoPago:'mixto'})]),/inconsistentes/);
 const v=venta();(v.data.items as Record<string,unknown>[])[0].cantidadUnidadBase=1;assert.throws(()=>run([v]),/inconsistentes/);
});
test('CSV neutraliza fórmulas textuales y deja costo desconocido vacío',()=>{
 const v=venta({cajeroNombre:'=HYPERLINK("https://example.com")'});(v.data.items as Record<string,unknown>[])[0].costoTotalLineaCOP=undefined;
 const csv=csvReporteBodega(run([v]));assert.match(csv,/'=HYPERLINK/);assert.match(csv,/OPERATIVO NO FISCAL/);assert.match(csv,/"10000";"";""/);
});
test('ranking por cantidad no mezcla unidades y conserva productos sin ventas',()=>{
 const productos=[{id:'a',nombre:'A',activo:true,ingresoCOP:100000,unidadesBase:2,unidad:'unidad'},{id:'b',nombre:'B',activo:true,ingresoCOP:2000,unidadesBase:20,unidad:'unidad'},{id:'c',nombre:'C',activo:true,ingresoCOP:0,unidadesBase:0,unidad:'unidad'},{id:'kg',nombre:'D',activo:true,ingresoCOP:5000,unidadesBase:500,unidad:'kg'}];
 assert.deepEqual(ordenarProductosReporte(productos,{criterio:'cantidad',unidad:'unidad'}).map(p=>p.id),['b','a','c']);
 assert.equal(ordenarProductosReporte(productos,{criterio:'cantidad',unidad:'unidad',ascendente:true})[0].id,'c');
 assert.throws(()=>ordenarProductosReporte(productos,{criterio:'cantidad'}),/unidad base/);
 assert.deepEqual(productos.map(p=>p.id),['a','b','c','kg']);
});
