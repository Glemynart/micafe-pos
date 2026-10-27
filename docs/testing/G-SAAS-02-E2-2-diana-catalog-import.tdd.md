# TDD — Importador revisable del catálogo de Diana

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2 — Configuración inicial`

**Alcance:** sugerencias locales para la taxonomía de 17 categorías aprobada para
este catálogo e importación secuencial desde un plan offline previamente
revisado. No añade APIs, persistencia ni autoridad nueva; usa las callables Bodega
existentes.

## Comportamiento

- El preflight local conserva ambas listas por canal y registra SHA-256 de la
  fuente. Sugiere categorías mediante reglas locales; una fila sin coincidencia
  queda en revisión. El plan solo incluye decisiones explícitas del archivo de
  revisión.
- La taxonomía específica de Diana contiene 17 categorías. Smirnoff Tamarindo
  Picante queda en `Vodka` por confirmación expresa del responsable. Corona Cero
  prevalece sobre la regla general de Corona.
- El plan v2 crea una presentación por cada fila de `PRECIOS A TIENDA` sin
  inferir agrupación de productos. `PRECIO VENTA` de esa hoja abastece el canal
  tienda y `AL COSTO` se conserva como costo exacto por presentación/empaque,
  conforme a ADR-SAAS-093. El costo base del producto queda en cero cuando la
  fuente no permite obtener un costo base exacto; no se divide ni redondea el
  costo del empaque.
- `PRECIOS CONS FINAL` solo completa `precioConsumidorFinalCOP` si la revisión
  confirma `SI - MISMA PRESENTACION` y una asociación de origen verificable.
  Presentaciones distintas o no resueltas y filas consumidor sin producto base
  quedan diferidas; el plan no inventa costos, factores ni asociaciones.
- El importador solo aparece para el tenant `distribuidora-las-jimenez` en
  Catálogo. Lee un plan JSON de hasta 2 MiB y realiza preflight con lecturas
  tenant-scoped del catálogo actual antes de habilitar la confirmación.
- Crea primero las categorías necesarias, luego los productos y al final sus
  presentaciones, mediante `crearCategoriaBodegaV1`,
  `crearArticuloInventarioV1` y `crearPresentacionComercialV1`. No usa escrituras
  directas a Firestore. Las callables resuelven el tenant desde la sesión activa.
- El stock y stock mínimo empiezan en cero. Los conteos ausentes del nombre
  quedan como `assumed_single_unit`, con factor uno y aviso para que Diana los
  corrija después de la carga. El plan no establece existencias físicas.
- Los IDs de documentos son tenant-scoped; los command IDs son deterministas a
  partir del SHA-256 de origen y la fila o categoría. El preflight detecta
  nombres existentes ajenos al lote, discrepancias en una reanudación y una
  categoría del lote que aparezca en un espacio distinto al seleccionado. La
  reanudación debe conservar el espacio original. No borra ni revierte registros
  creados parcialmente.
- La ejecución usa en serie las callables `crearCategoriaBodegaV1`,
  `crearArticuloInventarioV1` y `crearPresentacionComercialV1`; no escribe
  directamente en Firestore. Si se interrumpe, se reanuda con el mismo plan y
  las mismas claves idempotentes después de volver a leer el catálogo.
- Las reglas locales no consultan Internet. La búsqueda web aparece como enlace
  voluntario para revisar filas sin sugerencia o con una diferencia entre el plan
  y la regla local.

## Procedimiento previsto

1. Completar la plantilla de revisión preservando el Excel original. Confirmar
   categoría, unidad, presentación, factor y costo exacto de cada fila de tienda.
   Cuando el nombre no informe unidades, el responsable autorizó el factor uno
   señalado para que Diana lo corrija después. Revisar por separado las
   asociaciones consumidor; no cargar las que no estén confirmadas.
2. Validar el archivo localmente. No continuar si el código de salida no es cero:

   ```powershell
   npm run g-saas-02:catalog-review-validate -- --source "<excel-original.xlsx>" --review "<excel-revisado.xlsx>"
   ```

3. Generar un JSON nuevo y mantenerlo fuera del repositorio:

   ```powershell
   npm run g-saas-02:catalog-review-plan -- --source "<excel-original.xlsx>" --review "<excel-revisado.xlsx>" --out "<ruta-nueva.json>"
   ```
4. En la aplicación, abrir Admin → Catálogo dentro del tenant de Diana, escoger
   el espacio operativo y cargar el JSON. Comparar los hashes y revisar las filas,
   sugerencias, diferencias, precios, costos y conteos marcados para corrección.
5. Marcar la confirmación explícita y ejecutar el lote solo cuando el operador
   haya aprobado los datos y el release aplicable esté disponible. Mantener el
   mismo espacio durante todo el lote. La pantalla deshabilita las altas manuales
   locales mientras importa; otras sesiones no quedan bloqueadas, así que no
   deben hacer cambios de catálogo concurrentes.
6. Después, conciliar categorías, productos y presentaciones en la interfaz. El
   inventario físico se registra más adelante por el flujo aprobado; Diana
   actualizará los conteos después de cargar los productos. El importador no
   ajusta existencias.

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

## Límites operativos

Un plan local completo no equivale a `Gate I`, no certifica el release, no
garantiza que el tenant de destino esté vacío o sin duplicados y no autoriza por
sí solo una escritura. Antes de importar se exige el release aplicable, sesión
admin del tenant correcto, espacio operativo seleccionado, snapshot actualizado
sin conflictos y confirmación visible del resumen. El éxito del lote no
certifica ventas, compras, Nevera ni precios consumidor que quedaron diferidos.
