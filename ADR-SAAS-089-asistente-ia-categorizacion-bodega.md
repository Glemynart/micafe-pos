# ADR-SAAS-089 — Sugerencias de categorías Bodega con Gemini en Vertex AI

## Estado

**ACEPTADO — 2026-10-25 por selección expresa del responsable del producto.**

- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial`.
- **Decisión de producto:** agregar al Backoffice Bodega una ayuda de IA para categorizar nombres de productos.
- **Proveedor elegido:** Vertex AI con Gemini.
- **Diseño aceptado:** callable server-side; la IA sugiere; el administrador revisa; el modelo no guarda ni crea productos/categorías.
- **Límite operativo:** no habilita por sí sola APIs, IAM, facturación, despliegues, importaciones ni escrituras en Firebase.

## Contexto

El catálogo de Distribuidora Las Jiménez todavía tiene filas sin categoría. El Backoffice crea productos y categorías mediante callables server-authoritative, pero hoy no contiene un clasificador ni un flujo masivo de importación. Las reglas deterministas pueden cubrir marcas conocidas, pero no resuelven bien nombres locales, abreviaturas ni presentaciones ambiguas.

El responsable eligió una IA en el POS y, en respuesta a la propuesta explícita de una callable que remite únicamente nombres/descripciones y categorías permitidas, con confirmación del administrador y sin escrituras automáticas, seleccionó Vertex AI con Gemini.

## Decisión

1. Agregar una callable `sugerirCategoriasBodegaV1` al boundary de Bodega, en `us-central1`, que consume Gemini en Vertex AI mediante Application Default Credentials. No se usa una API key ni se añade un secreto.
2. La callable solo admite una identidad autenticada con tenant activo, membresía vigente, rol `admin`, vertical `BODEGA_MVP1` y módulo `inventory` habilitado. La autoridad del tenant se deriva de Auth/Firestore server-side, nunca del payload.
3. El payload contiene como máximo 25 identificadores de fila efímeros, generados localmente (`fila-1`, `fila-2`, etc.), y nombres de producto de hasta 120 caracteres. No acepta IDs de productos existentes, `empresaId`, precio, costo, stock, presentación, contacto, documento, UID u otros campos. A Vertex AI solo se envían esos IDs de fila sin semántica y los nombres; no se envía el nombre/ID del tenant.
4. El resultado es una propuesta estructurada por fila: categoría sugerida, nivel cualitativo de confianza y explicación breve. El backend valida la forma, límites y categorías permitidas antes de responder; toda sugerencia puede ser incorrecta y requiere confirmación del administrador.
5. La primera versión expone el asistente en el panel administrativo Bodega para pegar un lote de nombres y revisar el resultado. No carga Excel, no importa el catálogo, no crea categorías, no asigna productos y no escribe resultado o prompt en Firestore. La creación posterior usa los flujos existentes y requiere confirmación humana.
6. El modelo no puede autorizar ni inferir precio, costo, unidad base, presentación, factor, inventario o aptitud para venta/compra. Las filas ambiguas deben quedar `REVISAR`.
7. La llamada falla sin afectar el flujo manual si Vertex AI está indisponible, la respuesta no cumple el esquema o la entrada excede límites. No se registran prompts, nombres ni salidas en logs.
8. La función usa una identidad de runtime dedicada y permisos mínimos: `aiplatform.endpoints.predict` mediante rol personalizado de inferencia, más únicamente los permisos de lectura que requiera la validación vigente de tenant y membresía. No recibe permisos de escritura Firestore, Storage, Secrets, despliegue o administración de Vertex AI.
9. Antes del primer uso, la UI informa que Google procesa los nombres para generar sugerencias. Google documenta que no usa datos para entrenar o ajustar modelos sin permiso/instrucción previa; puede registrar prompts para supervisar abuso, lo cual queda informado como límite de privacidad.

### Taxonomía inicial de sugerencias

La versión inicial admite estas categorías, normalizadas y versionadas:

- `AGUAS` — agua natural, con gas, saborizada o de coco.
- `GASEOSAS_Y_SODAS` — gaseosas y mezcladores no alcohólicos.
- `JUGOS_Y_FRUTAS` — jugos, néctares y bebidas de fruta.
- `HIDRATANTES` — bebidas isotónicas/electrolíticas.
- `ENERGIZANTES` — por ejemplo, Vive 100 y Speed Max.
- `CERVEZAS` — cervezas y presentaciones de cerveza.
- `LICORES` — aguardiente, ron, vodka y bebidas alcohólicas preparadas.
- `MALTAS` — maltas y bebidas de malta.
- `OTROS_REVISAR` — tipo no identificable con seguridad.

El administrador puede cambiar la sugerencia antes de usar los flujos existentes. `confianza` es una estimación del modelo, no una medida calibrada ni una autorización automática.

## Alternativas consideradas

| Alternativa | Evaluación |
| --- | --- |
| Reglas deterministas solamente | Rechazada como solución única: rápida y sin egress, pero frágil ante nombres locales y variantes; puede mantenerse como ayuda futura no autoritativa. |
| API externa de otro proveedor | Rechazada: introduce otro contrato, credencial de API, salida de datos y operación de secretos. |
| Gemini en Vertex AI, llamado directamente desde el navegador | Rechazada: expondría credenciales o permitiría evitar las verificaciones de tenant/rol, límites y sanitización. |
| Callable server-side con Vertex AI y confirmación humana | Aceptada: usa la plataforma GCP existente, evita credenciales cliente y separa sugerencia de persistencia. |

## Seguridad, IAM y privacidad

- Callable Firebase autenticada y tenant-aware. No se acepta `empresaId` del cliente.
- Entrada en allowlist estricta; los nombres son datos no confiables y nunca se interpretan como instrucciones del modelo.
- Límite de 25 filas por solicitud y nombre de 120 caracteres; sin carga de archivos ni datos económicos.
- Salida restringida a categorías versionadas y respuesta JSON validada. `OTROS_REVISAR` es el fallback para incertidumbre.
- Runtime identity separada para que otorgar inferencia no amplíe la autoridad de las demás Functions. El rol personalizado contiene solo `aiplatform.endpoints.predict`; la identidad conserva exclusivamente lecturas de Firestore necesarias para comprobar Empresa/membresía.
- Sin `roles/aiplatform.admin`, `roles/aiplatform.user`, permisos de escritura en Firestore, Secrets, Storage ni permisos de despliegue.
- Los tests usan un adaptador Gemini simulado. No se manda la planilla real a modelos durante CI.
- Logs sanitizados: conteo de filas, latencia y resultado técnico; nunca nombres ni texto prompt.
- La API `aiplatform.googleapis.com`, la identidad y la política IAM deben habilitarse en una operación separada autorizada. Esta ADR no concede permisos ni cambia recursos.

## Pruebas de aceptación

1. Usuario no autenticado, membresía inactiva, rol distinto de admin, tenant suspendido, vertical distinta o módulo `inventory` deshabilitado son rechazados antes de llamar al modelo.
2. El tenant se deriva del claim y se revalida contra la membresía; payloads con `empresaId`, precios, costos, stock u otros campos son rechazados.
3. Lotes vacíos, mayores de 25, nombres vacíos, mayores de 120 caracteres o IDs repetidos se rechazan antes de la inferencia.
4. Nombres conocidos producen categorías estructuradas dentro de la allowlist; nombres ambiguos, como `Light 330` o `Saviloe`, se devuelven en `OTROS_REVISAR` o con confianza baja.
5. Prompt injection dentro de un nombre no cambia la instrucción ni permite campos adicionales; JSON inválido, categoría desconocida, timeout o error del proveedor se manejan sin escrituras.
6. La prueba afirma que no se llama Firestore `set/create/update/delete` ni se persisten prompts/sugerencias.
7. El UI permite corregir la sugerencia; una propuesta no crea categoría o producto hasta una acción humana separada mediante callables existentes.
8. Se confirma que las funciones actuales de crear categoría/producto conservan sus validaciones y no reciben cambios por esta funcionalidad.

## Consecuencias y límites

- El administrador obtiene clasificación útil para el catálogo colombiano sin dar autoridad de escritura al modelo.
- El uso de Vertex AI genera costo de inferencia, requiere API habilitada y permiso IAM. Sin esos prerrequisitos, la función falla cerrada y el alta manual sigue disponible.
- La primera versión clasifica nombres, pero no resuelve las 107 unidades, presentaciones/factores, base de costo ni inventario físico del Excel. Tampoco importa productos.
- Los nombres de productos se envían a Google Cloud para la inferencia. No se envían precios, costos, stock, identidad personal ni datos del tenant.
- La IA no certifica que la categoría sea correcta y no habilita operación de venta/compra.

## Rollback y gates

El rollback elimina el asistente de la UI y la callable; no hay datos que migrar o revertir. La versión no se considera operativa hasta que el PR tenga pruebas verdes, el servicio Vertex esté autorizado en cada proyecto destino, la identidad dedicada tenga IAM mínimo y el despliegue se autorice por separado. No se despliega en esta decisión.

## Referencias

- [ADR-SAAS-049 — Boundary Bodega](ADR-SAAS-049-aislamiento-codebase-bodega-staging.md).
- [ADR-SAAS-052 — Creación de categorías](ADR-SAAS-052-categoria-bodega-tenant-aware.md).
- [Firebase callable functions](https://firebase.google.com/docs/functions/callable).
- [Cloud Functions for Firebase: service accounts](https://firebase.google.com/docs/functions/manage-functions#set_runtime_options).
- [Vertex AI: IAM para inferencia](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/access-control).
- [Vertex AI: tratamiento y retención de datos](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention).
