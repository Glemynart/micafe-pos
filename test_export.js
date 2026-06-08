const { exportarVentasExcel } = require('./src/exportador');

const fakeVentas = [
  { id: 101, fecha: '2026-06-01 10:00:00', resumen: 'ITEM A', subtotal_ventas: 100, iva_total: 19, impoconsumo_total: 0, total: 119, metodo_pago: 'Efectivo', cufe: 'abc' },
  { id: 102, fecha: '2026-06-01 11:00:00', resumen: 'ITEM B', subtotal_ventas: 200, iva_total: 38, impoconsumo_total: 0, total: 238, metodo_pago: 'Tarjeta', cufe: '' }
];

async function test() {
  await exportarVentasExcel(fakeVentas, 'test_export.xlsx');
  console.log('Export created');
}

test();
