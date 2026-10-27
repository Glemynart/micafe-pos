# ADR-SAAS-093 — Bodega MVP-1: costo exacto por presentación

## Estado

**ACEPTADO — 2026-10-26.**

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor de alcance:** responsable del proyecto.
- **Aprobación:** el responsable confirmó que cada producto debe conservar el
  precio de venta correcto y el precio de costo real pagado por Diana, sin
  redondearlo ni convertirlo artificialmente a unidad base.
- **Relacionados:** ADR-SAAS-041, ADR-SAAS-042, ADR-SAAS-091 y ADR-SAAS-092.

## Contexto

El catálogo de Distribuidora Las Jiménez contiene empaques cuyo costo en COP no
es divisible exactamente por su número de unidades. El contrato anterior solo
persistía `productos.costo` por unidad base; dividir costos como 19.000 COP por
12 unidades produciría una fracción que no puede representarse como COP entero.
Redondear alteraría el margen y la conciliación de compra de Diana.

## Decisión

Una presentación puede persistir `costoPresentacionCOP` como entero COP
positivo y ese valor es el costo canónico de esa presentación cuando existe.
El precio de venta continúa siendo independiente y se conserva por canal según
ADR-SAAS-092.

- Las ventas Bodega congelan el costo exacto de presentación en su snapshot.
- El catálogo anterior sin `costoPresentacionCOP` conserva compatibilidad:
  calcula el costo como `productos.costo × factorUnidadBase`.
- El importador de Diana crea productos con costo base `0` cuando el costo del
  empaque no es exactamente convertible, y adjunta el costo real a su
  presentación. No inventa un costo unitario redondeado.
- Los movimientos legacy que exigen costo por unidad base conservan su contrato
  existente; no se reinterpretan ni se migra historial en este corte.

## Alternativas descartadas

1. Redondear costo por unidad base: descarta COP reales y falsea márgenes.
2. Cambiar todos los empaques a factor uno: oculta la composición física del
   empaque y rompe inventario por presentación.
3. Usar decimales COP: propaga precisión monetaria no soportada por contratos y
   snapshots existentes.

## Seguridad, compatibilidad y rollback

Solo la autoridad administrativa de catálogo puede crear o modificar el costo
de una presentación. El vendedor no recibe costos en su proyección. El campo
es tenant-aware y se resuelve dentro de la transacción server-side de venta.

No se modifica una venta, compra o movimiento histórico. Revertir código deja
el dato adicional inerte para lectores v1; no se borra catálogo ni se alteran
precios. La importación remota requiere un plan validado, preflight y una
confirmación posterior separada.

## Criterios de aceptación

1. Una caja con costo no divisible conserva exactamente su costo de empaque.
2. La venta snapshot usa ese costo exacto y calcula total sin redondeo.
3. Una presentación legacy continúa calculando su costo desde la unidad base.
4. Payloads con costos inválidos, ajenos al tenant o enviados por vendedor se
   rechazan sin mutación.
5. El importador no acepta un plan que sustituya el costo fuente por un valor
   unitario aproximado.
