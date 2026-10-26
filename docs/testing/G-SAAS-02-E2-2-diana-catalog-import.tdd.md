# TDD — Importador revisable del catálogo de Diana

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2 — Configuración inicial`

**Alcance:** sugerencias locales para la taxonomía de 17 categorías aprobada para
este catálogo e importación secuencial desde un plan offline previamente
revisado. No añade APIs, persistencia ni autoridad nueva; usa las callables Bodega
existentes.

## Comportamiento

- El preflight local agrega una columna de sugerencia de categoría, sin completar
  automáticamente la decisión humana ni exponer nombres o precios en su reporte.
- La taxonomía específica de Diana contiene 17 categorías. Smirnoff Tamarindo
  Picante queda en `Vodka` por confirmación expresa del responsable. Corona Cero
  prevalece sobre la regla general de Corona.
- El importador solo aparece para el tenant `distribuidora-las-jimenez` en
  Catálogo. Lee un plan JSON de hasta 2 MiB y realiza preflight con lecturas
  tenant-scoped del catálogo actual antes de habilitar la confirmación.
- Crea primero las categorías necesarias, luego los productos y al final sus
  presentaciones, mediante `crearCategoriaBodegaV1`,
  `crearArticuloInventarioV1` y `crearPresentacionComercialV1`. No usa escrituras
  directas a Firestore. Las callables resuelven el tenant desde la sesión activa.
- El stock y stock mínimo empiezan en cero. Solo se importa el precio tienda como
  tarifa única y el costo por unidad base ya validado; no se cargan precios de
  consumidor, productos agrupados ni inventario inicial.
- Los IDs de documentos son tenant-scoped; los command IDs son deterministas a
  partir del SHA-256 de origen y la fila o categoría. El preflight detecta
  nombres existentes ajenos al lote, discrepancias en una reanudación y una
  categoría del lote que aparezca en un espacio distinto al seleccionado. La
  reanudación debe conservar el espacio original. No borra ni revierte registros
  creados parcialmente.
- Las reglas locales no consultan Internet. La búsqueda web aparece como enlace
  voluntario para revisar filas sin sugerencia o con una diferencia entre el plan
  y la regla local.

## Procedimiento previsto

1. Completar la plantilla de revisión preservando el Excel original y revisar
   categoría, unidad, presentación, factor entero y base de `AL COSTO` en todas
   las filas de tienda.
2. Validar el archivo localmente. No continuar si el código de salida no es cero:

   ```powershell
   npm run g-saas-02:catalog-review-validate -- --source "<excel-original.xlsx>" --review "<excel-revisado.xlsx>"
   ```

3. Generar un JSON nuevo y mantenerlo fuera del repositorio:

   ```powershell
   npm run g-saas-02:catalog-review-plan -- --source "<excel-original.xlsx>" --review "<excel-revisado.xlsx>" --out "<ruta-nueva.json>"
   ```
4. En la aplicación, abrir Admin → Catálogo dentro del tenant de Diana, escoger
   el espacio operativo y cargar el JSON. Revisar los hashes, todas las filas,
   sugerencias, diferencias, precios, costos y conteos diferidos.
5. Marcar la confirmación explícita y ejecutar el lote solo cuando el operador
   haya aprobado los datos y el release aplicable esté disponible. Mantener el
   mismo espacio durante todo el lote. La pantalla deshabilita las altas manuales
   locales mientras importa; otras sesiones no quedan bloqueadas, así que no
   deben hacer cambios de catálogo concurrentes.
6. Después, conciliar categorías, productos y presentaciones en la interfaz. El
   inventario físico se registra más adelante por el flujo aprobado; no se usa
   este importador para ajustar existencias.

Una interrupción puede dejar una secuencia parcial. Reanudar con el mismo plan y
con el resultado del preflight actualizado; si encuentra cualquier payload
distinto, detenerse para revisión manual. El importador no contiene una operación
de borrado para “deshacer” la carga.

## Validaciones locales ejecutadas

- `npm run test:g-saas-02:catalog-import`: 34/34.
- `npm run test:bodega-ui`: 55/55.
- `npx tsc --noEmit`: PASS.
- ESLint focalizado sobre los archivos de interfaz, importador y preflight: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

Estas validaciones no equivalen a una llamada remota, una importación real,
disponibilidad de inventario ni certificación de Gate I. No se invocaron
callables remotas ni se hicieron escrituras Firebase.

## Bloqueos de datos vigentes

La evidencia registrada en `GOAL-MVP-COMERCIAL.md` mantiene las 107 filas de
tienda sin mapeo operativo completo. Antes de generar un plan deben confirmarse
las categorías, unidades base, presentaciones, factores y base de costo. Las filas
sin coincidencia local o con categoría distinta requieren revisión manual. Las
filas solo consumidor y el stock inicial permanecen excluidos.
