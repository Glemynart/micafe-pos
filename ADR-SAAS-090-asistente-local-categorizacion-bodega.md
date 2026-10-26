# ADR-SAAS-090 — Ayuda local para categorizar productos Bodega

## Estado

**ACEPTADO — 2026-10-26 por aprobación expresa del responsable del producto.**

- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial`.
- **Decisión de producto:** reemplazar el diseño de Vertex AI de ADR-SAAS-089 por reglas locales y búsqueda web iniciada manualmente.
- **Alcance funcional:** ayudar a clasificar nombres de producto en el Backoffice Bodega sin crear ni modificar productos o categorías.
- **Relación con ADR-SAAS-089:** esta decisión supersede ADR-SAAS-089. La implementación queda limitada a los criterios de este ADR; no autoriza despliegues ni cambios de recursos remotos.
- **Límite operativo:** no habilita APIs, IAM, costos de proveedor, despliegues, importaciones, escrituras en Firebase ni operaciones comerciales.

## Contexto

El catálogo de Distribuidora Las Jiménez requiere asignar categorías, pero el Backoffice registra productos manualmente y no hay importación masiva aprobada. ADR-SAAS-089, aceptado el 2026-10-25, eligió una callable que envía nombres a Gemini en Vertex AI y requiere API, identidad de runtime e IAM. El 2026-10-26, el responsable aprobó reemplazar esa solución por reglas locales y búsqueda web manual en casos dudosos.

El cambio presentado en el PR #673 agrupa la implementación local con otros cambios de configuración inicial. No se afirma que la callable Vertex o sus recursos estén desplegados; su estado remoto se debe verificar antes de cualquier limpieza. La integración del PR y cualquier despliegue posterior son decisiones operativas separadas.

El sistema ya tiene una taxonomía inicial para Bodega: aguas, gaseosas y sodas, jugos y bebidas de fruta, hidratantes, energizantes, cervezas, licores, maltas y otros por revisar. Ejemplos expresos del dominio incluyen aguardiente, ron y vodka como licores, y Vive 100 y Speed Max como energizantes.

## Impulsores de decisión

- Dar a Diana una ayuda rápida para clasificar los nombres del catálogo actual.
- Evitar un proveedor de inferencia, API habilitada, identidad de runtime, permisos IAM y costo por solicitud.
- No enviar automáticamente nombres de productos fuera del navegador.
- Mantener al administrador como responsable de aceptar y corregir cada categoría.
- No introducir escritura, importación o cambios a contratos de producto/categoría.
- Resolver con cambios pequeños y reversibles dentro de E2.2.

## Opciones consideradas

### A. Reglas locales y búsqueda web manual — recomendada

Un clasificador determinista en el cliente reconoce alias y términos versionados para la taxonomía vigente. Cuando no hay una coincidencia única, ofrece un enlace que abre una búsqueda web al hacer clic el administrador. La aplicación no obtiene ni procesa resultados web.

**Ventajas:** sin servicio, credenciales, IAM, costo de inferencia o petición automática; resultado reproducible; la búsqueda ayuda con nombres desconocidos.

**Costos:** la cobertura depende de mantener un diccionario de alias; las coincidencias siempre requieren revisión; al hacer clic, el motor de búsqueda recibe el nombre consultado.

### B. Solo reglas locales

El clasificador determinista no ofrece salida a Internet.

**Ventajas:** máxima privacidad en ejecución y comportamiento estable sin conexión.

**Costos:** los nombres desconocidos quedan para clasificación manual, sin ayuda adicional para investigarlos.

### C. Búsqueda web automatizada o scraping

Un servicio consulta un proveedor/API y resume o clasifica los resultados.

**Ventajas:** más automatización para productos fuera del diccionario.

**Costos:** añade proveedor, contrato y posibles cuotas/credenciales; envía nombres automáticamente; los resultados pueden cambiar o ser ambiguos; scraping es frágil y no tiene un contrato estable. Se excluye de esta primera versión.

### D. Vertex AI/Gemini según ADR-SAAS-089

Callable server-side con inferencia y confirmación humana.

**Ventajas:** cubre variantes sin mantener manualmente todos los alias y mantiene la clave fuera del cliente.

**Costos:** requiere servicio, permisos, identidad y costo operativo; envía nombres a Google Cloud. El responsable del producto pidió retirarlo para este alcance.

## Decisión

Se adopta la opción A para la primera versión:

1. La clasificación se ejecuta completamente en el navegador sobre los nombres ingresados por el administrador. Normaliza mayúsculas/minúsculas, acentos y separadores, y evalúa alias versionados con límites de palabra para reducir coincidencias parciales accidentales.
2. Solo una coincidencia no ambigua puede producir una sugerencia de categoría y una explicación basada en la regla coincidente. Si no hay coincidencia o se activan reglas incompatibles, el resultado es `OTROS_REVISAR`; nunca se fuerza una categoría.
3. Para los casos por revisar, la UI puede ofrecer **Buscar en la web**. Al activarlo, abre una búsqueda normal del navegador con el nombre del producto y contexto genérico. La primera versión usaría un enlace a Google Search; la aplicación no llama una API, no descarga, raspa ni interpreta resultados y no envía los nombres hasta que el administrador hace clic.
4. La persona revisa las fuentes y elige o corrige la categoría en el formulario manual existente. Una sugerencia o una búsqueda nunca crea una categoría/producto, no asigna automáticamente una categoría y no persiste resultados.
5. Se conserva la taxonomía existente. La lista inicial de alias se limita a términos inequívocos y ejemplos ya documentados; los nombres ambiguos —por ejemplo `Light 330` o `Saviloe`— quedan para revisión.
6. No se añade callable, dependencia de inferencia, API, secreto, cuenta de servicio, permiso IAM, almacenamiento ni nuevo contrato remoto.
7. ADR-SAAS-089 queda supersedida por esta decisión. El PR #673 retira la callable Vertex y actualiza esa ADR para mantener la trazabilidad histórica.

## Seguridad y privacidad

- La sugerencia local no cruza la red y no sustituye la autorización de las operaciones existentes.
- El enlace externo solo se activa por acción deliberada del administrador y contiene únicamente el texto del nombre ingresado más términos de búsqueda genéricos. No incluye tenant, identidad, precios, costos, inventario, presentación ni IDs internos.
- La UI debe avisar que el clic envía el texto consultado al motor de búsqueda elegido. No se deben registrar nombres ni consultas en logs de la aplicación.
- El enlace se abre de forma segura en una pestaña nueva, sin exponer la ventana origen al sitio externo.
- Las sugerencias quedan separadas de los flujos server-authoritative de alta de categorías y productos. El sistema conserva sus verificaciones y validaciones existentes.
- No se modifica el alcance de usuarios ni la autoridad de otros tenants; la ayuda se presenta dentro de la interfaz administrativa Bodega existente.

## Criterios de aceptación para la implementación posterior

1. Pruebas locales demuestran que aguardiente, ron y vodka sugieren `LICORES`, y Vive 100 y Speed Max sugieren `ENERGIZANTES`.
2. La normalización tolera variaciones de capitalización, acentos y separadores, pero los límites de palabra evitan falsos positivos por subcadenas.
3. Entradas desconocidas o con señales contradictorias quedan en `OTROS_REVISAR`; ninguna regla de baja certeza se confirma automáticamente.
4. El enlace de búsqueda no aparece como llamada automática; solo se navega a la URL externa después de una acción explícita. La URL incluye el nombre consultado y no información de tenant, usuario, fila interna, precio, costo o inventario.
5. No hay `fetch`, scraping, callable, acceso a Vertex/Gemini, dependencia de inferencia ni escritura Firestore asociada a la sugerencia.
6. La falla de clasificación o la falta de red no impide el alta manual del producto.
7. La UI permite corregir la categoría sugerida; crear o modificar producto/categoría sigue requiriendo la acción explícita del administrador por los flujos existentes.
8. Las pruebas existentes de aislamiento y autorización de las callables de categorías/productos continúan pasando sin cambios de contrato.
9. El build, typecheck y pruebas focalizadas de Functions/UI pasan antes de solicitar merge. La auditoría confirma que no se habilitaron APIs, IAM, servicios cloud ni escrituras.

## Consecuencias

### Positivas

- No hay costo de modelo ni nueva dependencia operativa en GCP.
- Los resultados de reglas son reproducibles y pueden probarse offline.
- El administrador puede investigar manualmente nombres que no estén en el diccionario.

### Negativas

- La cobertura no es general: depende del diccionario local y requiere mantenimiento.
- La búsqueda no devuelve una clasificación al POS; la persona debe valorar los resultados y elegir.
- Un clic de búsqueda revela el nombre consultado al motor externo.

### Neutras

- Esta ayuda no corrige las excepciones de unidad, presentación/factor, costo base o inventario que existan en la plantilla de Diana; esos datos siguen sujetos a revisión independiente.

## Implementación y rollback

Solo después de aprobar esta ADR, un PR de implementación podrá retirar la callable Vertex/UI correspondiente y `google-auth-library` si se confirma que no tiene otros usos; agregar el clasificador local, sus pruebas y el enlace de búsqueda; y actualizar ADR-SAAS-089 a `Superseded by ADR-SAAS-090`. El PR también verificará el estado real de cualquier recurso remoto relacionado antes de afirmar que puede omitirse o retirarse.

El rollback retira la UI de ayuda y el diccionario local. No requiere migración de datos, porque la sugerencia no se persiste. No se despliega ni se cambia IAM como parte automática de la implementación.

## Referencias

- [ADR-SAAS-089 — Sugerencias de categorías Bodega con Gemini en Vertex AI](ADR-SAAS-089-asistente-ia-categorizacion-bodega.md).
- [ADR-SAAS-088 — Diferir el perfil comercial inicial de Distribuidora Las Jiménez](ADR-SAAS-088-diferir-perfil-comercial-diana.md).
- [ADR-SAAS-049 — Boundary Bodega](ADR-SAAS-049-aislamiento-codebase-bodega-staging.md).
- [ADR-SAAS-052 — Creación de categorías](ADR-SAAS-052-categoria-bodega-tenant-aware.md).
