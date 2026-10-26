# Reportes operativos Bodega y auxiliar contable

Goal → Milestone → Epic: `G-SAAS-02 → M2 → E2.2`.

Solicitud del responsable del 2026-10-26: mostrar al admin resultados mensuales, ventas por vendedor, medios de pago y productos más/menos vendidos; preparar un Excel útil para organizar información con su contador. Base de este corte: `main@392abd8d77e4d23792367978892741ccd106cb34`. PR #675 de rediseño sigue separado: el responsable pidió dejar su merge pendiente y continuar trabajo independiente, sin esperar sus checks.

## Alcance y autoridades existentes

- `/admin/reportes` conserva la implementación GENERAL y presenta el reporte Bodega únicamente al admin con el módulo `reports` habilitado. El enlace Bodega respeta ese módulo; este PR no lo habilita mediante escrituras.
- `leerReporteBodega` deriva el tenant con el helper canónico, comprueba desde servidor la membresía propia activa de admin y lee exclusivamente ventas del mes y productos de ese tenant. Las Rules existentes siguen siendo la frontera de acceso. No hay nueva callable ni nuevas facultades.
- Las lecturas exigen servidor, no fallback de caché. Se consultan como máximo 1.001 ventas y 2.001 productos; si se exceden los límites útiles de 1.000/2.000 se muestra un error y ningún total parcial. Se utiliza el índice vigente `empresaId,fecha` de ventas. No se crean índices remotos.
- Las consultas identifican su tenant, usuario y momento; la interfaz oculta respuestas anteriores al cambiar identidad, tenant, mes o actualización. Los nombres usan los perfiles mínimos tenant-aware existentes, sin leer perfiles globales; un nombre histórico conserva precedencia.
- ADR-SAAS-041/042 ya definen presentación, unidad base, precio y costo snapshot al vender. Este corte calcula una proyección de lectura sobre esos hechos; no introduce persistencia, método nuevo de valoración, autoridad contable ni modificaciones de contratos. No requiere sustituir esas decisiones.

## Cálculos y límites

| Indicador | Definición verificable |
|---|---|
| Ventas del mes | Suma de `totales.total` de ventas `BODEGA_MVP1_V1`, `pagada` y `estadoOperativo=COMPLETO`, dentro del mes colombiano. |
| Efectivo / transferencia | Suma del total de cada venta según `metodoPago`; el billete recibido y su cambio no se suman como ingreso adicional. No se ofrece pago mixto Bodega. |
| Utilidad bruta registrada | Ingreso menos suma de `items.costoTotalLineaCOP`. No usa costo actual del catálogo ni supone margen de 10%. |
| Costos ausentes o inválidos | La utilidad mensual queda sin determinar; no se convierte un costo desconocido en cero. Los ceros explícitos se conservan y se advierten, pues pueden corresponder a costos no preparados. |
| Vendedores | Actor `cajeroId` de la venta, incluyendo administración; no se atribuye al administrador que aprobó una solicitud. |
| Más/menos vendidos | Selección por ingresos COP o cantidad base. En cantidad se filtra una sola unidad; no se mezclan kg con unidades ni presentaciones con diferentes factores. Incluye productos activos sin ventas entre los de menor venta; conserva históricos vendidos aunque su producto se desactive. |
| Anulaciones / incompletas | Se excluyen del ingreso y del costo vendido. Se informa el número de anuladas del mes. No se reescribe historial ni se registra una compensación. |
| Período | Inicio inclusivo y siguiente mes exclusivo, medianoche Colombia (UTC−05:00), incluidos cambios de año. Años 2020–2100. |

Se rechazan fuentes con tenant incorrecto, IDs de venta duplicados, totales inconsistentes, unidades/factores incoherentes, impuestos no soportados en este esquema Bodega y métodos de pago ajenos al contrato. El error no se sustituye por un reporte vacío. La lectura de varias colecciones no representa una instantánea contable transaccional ni un cierre fiscal.

**No se calcula utilidad neta, renta líquida ni impuesto a pagar.** Los gastos, activos, pasivos, retenciones, otras rentas y ajustes contables/fiscales no se deducen automáticamente de las ventas. Un ledger de tesorería no demuestra por sí solo el reconocimiento de un gasto; no se resta una compra de inventario adicionalmente al costo vendido. Este corte no redefine esas autoridades ni certifica compras/ventas de Diana.

ADR-SAAS-016 mantiene separados los registros DEMO de la fiscalidad. La pantalla y el CSV están identificados como operativos, no fiscales; no convierten ventas Bodega o DEMO en facturas válidas ni las publican como una declaración.

## Exportación y plantilla

- CSV UTF-8 con BOM y separador `;`: una fila por línea, referencia de venta, fecha UTC explícita, vendedor, producto, presentación, cantidades, ingreso, costo histórico, utilidad y medio. Los textos potencialmente interpretables como fórmulas se neutralizan y se escapan comillas; costos desconocidos permanecen vacíos. No incluye datos del cliente ni credenciales. Se genera localmente después de una lectura autorizada.
- XLSX público y vacío: `public/templates/dusema-auxiliar-contable.xlsx`. No contiene información real de Diana ni conexión a Firebase. La excepción explícita a `.gitignore` se limita a este archivo. No se incluyen otros Excel privados.
- Hojas: Resumen, Desgloses, Ventas, Gastos, Patrimonio y Guía. Incluye fórmulas mensuales, medios de pago, vendedores y productos/presentaciones; soportes y revisión fiscal permanecen como datos a completar. Las tablas de entrada tienen 1.000 filas, el desglose admite 50 vendedores y 200 presentaciones. Los rangos deben ampliarse antes de superar esos límites.
- El CSV y la plantilla son entregas separadas: no existe una importación automática del CSV a la plantilla ni un exportador fiscal. La plantilla se completa con registros conciliados y soportados; no se presenta en DIAN.
- SHA-256 de la plantilla: `03b62f416b394051b64c2dede3a10466858568dfab325d77c2a8d4673dcdd880`.

La guía cita las páginas oficiales consultadas el 2026-10-26: [DIAN, preparación de renta de personas naturales](https://micrositios.dian.gov.co/renta-personas-naturales-ag-2025/como-hacer-su-declaracion/) y [DIAN, renta de personas jurídicas](https://www.dian.gov.co/impuestos/sociedades/Paginas/Renta-personas-juridicas.aspx). No se ha verificado el RUT, régimen, residencia ni clasificación tributaria de Diana para elegir formulario. No se fijan tasas, topes, deducciones ni vencimientos.

## Criterios de aceptación y validación

1. Un vendedor o usuario sin membresía administradora activa no obtiene el reporte; no se permite elegir otro `empresaId` desde la interfaz ni como argumento del servicio.
2. Cambio de sesión/tenant/período no muestra la respuesta anterior, tampoco tras un fallo o respuesta tardía.
3. Una venta y sus líneas se cuentan una sola vez; sumas por vendedor y medio reconcilian con el total de ventas pagadas.
4. Cambiar el costo actual del producto no altera el reporte histórico. Costo ausente, negativo y cero se distinguen.
5. Anulaciones, operaciones incompletas y otro esquema no inflan ingreso/utilidad.
6. Rankings incluyen cero ventas y no mezclan unidades. Los filtros no modifican los datos de origen.
7. Sin red, permisos insuficientes, límite excedido o inconsistencia se presenta un error, sin totales parciales ni falsos ceros.
8. CSV neutraliza fórmulas en nombres; la plantilla conserva fechas/importes numéricos y deja utilidad desconocida en blanco.
9. No hay nuevos imports de escritura, comandos comerciales, despliegues, Rules, IAM ni cambios de suscripción.

Pruebas del cálculo: `lib/bodega/financial-report.test.ts`, incorporadas por el patrón existente de `npm run test:bodega-ui`. Cubren snapshots, efectivo/cambio, transferencia, vendedor/admin, aislamiento, duplicados, ceros, anulaciones, límites temporales, factores, reconciliación, rankings y CSV. Ejecutar además TypeScript, build, lint de archivos afectados y `npm run test:reportes` para preservar GENERAL.

La plantilla se verificó con entradas ficticias transitorias: venta pagada de 100.000, costo 60.000, gasto 10.000 y venta anulada separada; utilidad bruta 40.000 y resultado tras gastos 30.000. Se probaron costo ausente y cero. Se retiraron esos datos antes de exportar y se reabrió el XLSX con 5.581 fórmulas sin errores. Las seis hojas se renderizaron y revisaron visualmente. No se afirma validación en la instalación de Excel de Diana ni adecuación fiscal de sus datos.

La revisión visual del panel utiliza componentes reales y fixtures ficticios, sin red Firebase ni comandos de negocio. La evidencia provisional y checks del SHA final se registran en el PR; no se infiere ejecución por este documento.

## Integración y recuperación

PR independiente desde `main`: no copia los cambios de #675. Ambos modifican la navegación; tras integrar #675 se debe actualizar esta rama y conservar el enlace condicionado por `reports` en los menús nuevos, repitiendo solo las verificaciones afectadas. No se evita el gate de CI por existir autorización de trabajo.

Reversión: revertir este PR y volver a la ruta GENERAL anterior. No hay esquema, datos ni migración que restaurar. Cualquier publicación de App Hosting requiere su corte separado; no se ha desplegado este reporte ni ejecutado un smoke con datos productivos.
