# Revisión visual responsive de G-SAAS-02

- Goal → Milestone → Epic: `G-SAAS-02 → M2 → E2.2`.
- Base: `392abd8d77e4d23792367978892741ccd106cb34` (PR #674).
- Alcance aprobado por el responsable el 2026-10-26: rediseño de administración, POS Bodega de vendedores y Backoffice para PC y celular.
- Integración: **PR abierto, sin merge hasta revisión del responsable**.
- Publicación autorizada: únicamente App Hosting de `micafe-pos-staging`, desde el SHA validado de la rama. No autoriza producción ni cambios de Functions, Rules, datos o identidad.

## Resultado visual

La administración deja el contenedor fijo de 512 px y pasa a un espacio de trabajo con navegación lateral en escritorio y navegación inferior en móvil. El catálogo ofrece editores de categoría, producto y presentación en diálogos con foco y desplazamiento propio. La carga masiva y el asistente local se despliegan cuando se necesitan; las fichas de producto separan existencias de la edición de presentaciones y precios. El directorio de clientes ofrece búsqueda y un editor enfocado. Inicio e inventario incorporan orientación útil para un negocio todavía vacío.

El POS Bodega de vendedores utiliza el mismo vocabulario visual, conserva el catálogo y el resumen de pedido, incorpora navegación lateral en PC y controles inferiores en móvil. En celular, un acceso fijo permite llegar al pedido sin recorrer todo el catálogo; los controles de cantidad tienen objetivos táctiles de 44 px. Agenda, solicitudes y ventas conservan sus comandos y estados. Los accesos de administración y POS usan una composición de dos paneles en PC y un formulario compacto en celular.

Backoffice organiza navegación por operación, comercial y gestión, con menú móvil accesible. El inicio combina indicadores reales y accesos autorizados; el directorio empresarial usa filas adaptables para identificar negocios y estados. Formularios, fichas, tablas y diálogos comparten espaciado y controles táctiles. La visibilidad de operaciones sigue usando las facultades existentes.

El aviso de notificaciones pasa a ocupar espacio en el contenido, con opción temporal de recordar después. No solicita permisos automáticamente al pulsar ese cierre. Se inicializa `--radius` en el tema neutral: el valor faltante invalidaba el redondeado de numerosos controles. Los tokens de branding de cada tenant continúan siendo la autoridad visual.

## Compatibilidad y límites

- No se agregan endpoints, esquemas, persistencia de dominio ni integraciones.
- Se conservan los payloads y servicios de productos, presentaciones, clientes, inventario, venta, agenda, ofertas y suscripciones.
- Búsquedas y estados de apertura de editores son locales. La creación de clientes bloquea envíos simultáneos mientras su petición está pendiente.
- Los fixtures de diseño están fuera del código desplegable y usan datos ficticios; sus operaciones remotas están desactivadas.
- El rediseño no certifica importación, catálogo, stock, ventas, compras, aislamiento ni Gate I.

## Hallazgo durante la publicación de staging

La primera comprobación del corte `070542c` encontró una página detenida en «Verificando acceso al tenant…». El HTML que devolvía la caché del service worker v2 referenciaba un chunk JavaScript y una hoja CSS que respondían 404; una petición de red a la misma ruta no referenciaba esos archivos. Cargar la ruta con una URL nueva mostró el acceso rediseñado. No era evidencia de un fallo de credenciales.

El shell admin v3 prioriza HTML de red y conserva la copia como fallback de error de conexión. Solo intercepta navegaciones GET del mismo origen bajo `/admin`; no intercepta RSC, chunks ni operaciones mutantes. Su activación elimina exclusivamente cachés antiguas `micafe-admin-*`, sin borrar cookies, identidad, datos tenant ni cachés ajenas. No fuerza recargas que puedan perder formularios abiertos. Las pruebas verifican la espera por el HTML nuevo, fallback, errores HTTP y alcance de la limpieza; la prueba de Firebase Messaging se conserva.

## Matriz de revisión

Validar a 390 px, 768 px y 1440 px, incluyendo un ancho intermedio con navegación lateral. Revisar:

1. Navegación visible y sección activa; cambio de ancho sin recargar.
2. Ausencia de desbordamiento horizontal del documento y campos legibles.
3. Abrir y cerrar editores con mouse, teclado y Escape; foco inicial y retorno al control que abrió el diálogo.
4. Formulario de producto completo accesible con desplazamiento en celular.
5. Búsqueda local, cero coincidencias y catálogos/directorios vacíos.
6. Presentaciones y precios desplegables; conservación de equivalencias y estimaciones existentes.
7. POS: catálogo, carrito, solicitudes, agenda, clientes e historial. Agregar/quitar productos solo en el fixture local.
8. Backoffice: inicio, empresas, planes, suscripciones y menú móvil; ninguna operación de datos durante la revisión visual remota.
9. Modos claro/oscuro y nombres largos.

## Validaciones y publicación

El PR registra los resultados de TypeScript, build, suites de Bodega y Backoffice y revisión visual. No se infiere éxito por este documento. Antes del rollout se verifica el SHA de la rama y que el destino y la configuración pública Firebase correspondan a staging. Después se comprueban build, rollout y tráfico servido. Las pruebas autenticadas en staging requieren su identidad QA existente; no se reutilizan credenciales productivas ni se crean usuarios como parte de este corte.

El CLI instalado admite el corte dirigido desde un commit publicado de la rama, sin merge:

```powershell
firebase --project micafe-pos-staging apphosting:rollouts:create micafe-pos --git-commit <SHA-completo-validado> --force --non-interactive
```

## Recuperación

El cambio es de presentación, sin migración. Conservar el build y la revisión activos de staging antes del corte. Si la publicación no queda saludable, abortar esa etapa y restaurar el build previo mediante el mecanismo de App Hosting. No se modifica el código de `main`, no se fusiona el PR y no se restauran datos. Es un procedimiento previsto; no se declara ensayado por estar escrito.
