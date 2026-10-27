# TDD — Importador revisable del catálogo de Diana

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2 — Configuración inicial`

**Alcance:** sugerencias locales para la taxonomía de 17 categorías aprobada para
este catálogo e importación secuencial desde un plan offline previamente
revisado. La política de dos catálogos de ADR-SAAS-094 supersede las reglas
anteriores de precio por canal de ADR-SAAS-092. No añade APIs ni autoridad nueva;
usa las callables Bodega existentes.

## Comportamiento

- El preflight local conserva ambas listas como catálogos independientes y registra SHA-256 de la
  fuente. Sugiere categorías mediante reglas locales; una fila sin coincidencia
  queda en revisión. El plan solo incluye decisiones explícitas del archivo de
  revisión.
- La taxonomía específica de Diana contiene 17 categorías. Smirnoff Tamarindo
  Picante queda en `Vodka` por confirmación expresa del responsable. Corona Cero
  prevalece sobre la regla general de Corona.
- El plan actual crea identidades independientes para las 107 filas de
  `PRECIOS A TIENDA` (Bodega) y las 55 de `PRECIOS CONS FINAL` (Nevera). Los
  nombres coincidentes no comparten productos, IDs, categorías, precios, costo
  o existencias.
- En Bodega, `PRECIO VENTA` es el precio de venta del empaque completo y `AL
  COSTO` es el costo exacto de compra de ese empaque, conforme a ADR-SAAS-093;
  no se divide ni redondea por unidad base. Los aguardientes, rones y vodkas
  quedan como presentación individual según la confirmación del administrador.
  Para otros productos Bodega sin cantidad en el nombre, el plan propone factor
  uno y deja la fila señalada para corrección posterior.
- En Nevera, `PRECIOS CONS FINAL` aporta el precio retail de su propia
  presentación. Se importa con existencias cero y sin costo asignado; no se
  vende hasta que exista una transferencia autorizada con correspondencia,
  factor y costo aprobados.
- No se guarda `precioConsumidorFinalCOP` como una segunda tarifa operativa de
  Bodega. Los valores legados se advierten y preservan intactos durante la
  importación de Bodega; no se trasladan automáticamente a Nevera.
- El importador solo aparece para el tenant `distribuidora-las-jimenez` en
  Catálogo. Lee un plan JSON de hasta 2 MiB y realiza preflight con lecturas
  tenant-scoped y por catálogo del estado actual antes de habilitar la
  confirmación. Las categorías visibles y el filtro de categoría dependen del
  catálogo seleccionado.
- Crea primero las categorías necesarias de cada catálogo, luego los productos
  y al final sus
  presentaciones, mediante `crearCategoriaBodegaV1`,
  `crearArticuloInventarioV1` y `crearPresentacionComercialV1`. No usa escrituras
  directas a Firestore. Las callables resuelven el tenant desde la sesión activa.
- El stock y stock mínimo empiezan en cero. Los conteos ausentes del nombre en
  productos Bodega no alcohólicos quedan como `assumed_single_unit`, con factor
  uno y aviso para que Diana los corrija después de la carga. El preflight del
  Excel vigente identifica 12 filas de este tipo. El plan no establece
  existencias físicas.
- Los aguardientes, rones y vodkas de Bodega usan una presentación individual
  por la confirmación del administrador, incluso si el nombre no trae conteo.
  En Nevera, la venta individual también es la regla aprobada; un sixpak
  explícito conserva el factor 6.
- `Club Colombia Dorada x 330` se interpreta como botella de 330 ml (factor
  uno), no como empaque de 330 unidades. La [ficha oficial del fabricante](https://www.clubcolombia.com.co/node/93126)
  respalda esta lectura y hay una prueba de regresión para el patrón del nombre.
- Los IDs de documentos son tenant-scoped y catálogo-scoped; los command IDs son deterministas a
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
   categoría, unidad, presentación, factor y costo exacto de cada fila de
   Bodega; revisar por separado la categoría, unidad, presentación y precio de
   cada fila Nevera. Cuando el nombre no informe unidades, el factor uno queda
   señalado para que Diana lo corrija después. No crear asociaciones entre las
   dos listas durante la importación.
2. Validar el archivo localmente. No continuar si el código de salida no es cero:

   ```powershell
   npm run g-saas-02:catalog-review-validate -- --source "<excel-original.xlsx>" --review "<excel-revisado.xlsx>"
   ```

3. Generar un JSON nuevo y mantenerlo fuera del repositorio:

   ```powershell
   npm run g-saas-02:catalog-review-plan -- --source "<excel-original.xlsx>" --review "<excel-revisado.xlsx>" --out "<ruta-nueva.json>"
   ```
4. En la aplicación, abrir Admin → Catálogo dentro del tenant de Diana, escoger
   el espacio operativo y cargar el JSON. Comparar los hashes mostrados con el
   Excel y la revisión validados fuera de la aplicación; los hashes del JSON son
   referencias, no una firma criptográfica. Revisar las filas, sugerencias,
   diferencias, precios, costos y conteos marcados para corrección.
5. Marcar la confirmación explícita y ejecutar el lote solo cuando el operador
   haya aprobado los datos y el release aplicable esté disponible. Mantener el
   mismo espacio durante todo el lote y una ventana exclusiva: la pantalla
   deshabilita las altas manuales locales, pero no bloquea otras sesiones ni
   cambios concurrentes de otro administrador.
6. Después, conciliar categorías, productos y presentaciones en la interfaz. El
   inventario físico se registra más adelante por el flujo aprobado; Diana
   actualizará los conteos después de cargar los productos. El importador no
   ajusta existencias.

Una interrupción puede dejar una secuencia parcial. Reanudar con el mismo plan y
con el resultado del preflight actualizado; si encuentra cualquier payload
distinto, detenerse para revisión manual. El importador no contiene una operación
de borrado para “deshacer” la carga.

## Validaciones locales ejecutadas

- `npm run test:g-saas-02:catalog-import`: 47/47.
- `npm run test:bodega-ui`: 86/86.
- `npm run build:functions`: PASS.
- `npm run build`: PASS; TypeScript y 51 páginas/rutas estáticas completadas.
- El preflight local del Excel actual: 107 filas Bodega, 55 Nevera; 107/107 y
  55/55 categorías con sugerencia local; 12 presentaciones Bodega sin conteo
  explícito quedan como unidad presumida para corrección posterior; costo base
  ambiguo 0; `importReady=false`, sin acceso ni escrituras Firebase.
- `git diff --check`: PASS.

La lista anterior registra las validaciones locales de esta rama. El CI del PR
corrió por separado y terminó en verde para el commit `6d0f136` (run
`40513627187`); cualquier commit posterior requiere verificar su propio CI.

Estas validaciones no equivalen a una llamada remota, una importación real,
disponibilidad de inventario ni certificación de Gate I. No se invocaron
callables remotas ni se hicieron escrituras Firebase.

## Límites operativos

Un plan local completo no equivale a `Gate I`, no certifica el release, no
garantiza que el tenant de destino esté vacío o sin duplicados y no autoriza por
sí solo una escritura. Antes de importar se exige el release aplicable, sesión
admin del tenant correcto, espacio operativo seleccionado, snapshot actualizado
sin conflictos y confirmación visible del resumen. El éxito del lote no
certifica ventas, compras, transferencias a Nevera ni disponibilidad retail.
