# Matriz de ejecución legal — 24 de noviembre de 2026

Alcance: G-SAAS-02 / M2 / E2.2, rama `codex/e2-2-legal-acceptance`,
PR #706, candidato `3140e92472a5bcdeb499bf38ba51b8c682b67217`.
La matriz registra observaciones y no constituye dictamen ni aprobación jurídica.
El apéndice “Actualización de staging — 2026-11-25 UTC” al final de
`CIERRE-COMPROBACIONES-2026-11.md` supersede el estado de staging y App Hosting
de esta instantánea; el resto de los pendientes aquí listados sigue vigente.

La [Ley 527 de 1999, artículos 5 a 8](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276)
reconoce los mensajes de datos y establece condiciones para identificar al
iniciador, reflejar su aprobación y preservar integridad. Los hashes y la sesión
aportan evidencia técnica; no prueban por sí solos representación legal, control
exclusivo de credenciales ni equivalencia automática con firma digital certificada.

| Requisito | Estado y evidencia | Riesgo | Acción y criterio de cierre |
|---|---|---|---|
| Cuatro documentos | Versiones 0.2 en `docs/legal` y `public/legal/v0.2`, catálogo con hashes y estado BORRADOR | Prometer capacidades inexistentes o condiciones sin verificar | Contrastar cada afirmación, preparar versión revisable y obtener aprobación aplicable antes de EXIGIBLE |
| Aceptación | `functions/src/legal/handler.ts` exige administrador, relación contractual y bundle publicado. La rama agrega historial paginado por tenant, con validación de recibos y visualización administrativa; el cursor por ID se probó con 52 recibos sintéticos en Firestore Emulator | No existe versión definitiva activa; historial y bloqueo de acceso no están demostrados en producción | Ensayar lectura, aceptación, reaceptación, historial y controles en staging; no registrar aceptación de clientes de prueba como real |
| Consultas y reclamos | `privacy-claims.ts` y Backoffice cubren reclamos de clientes; ensayo autenticado sintético de staging documentado en PR. ADR-SAAS-103 añade consulta separada, recepción pendiente, facultad específica, interfaz y ensayo en Emulator | Aún no está desplegado ni ensayado en staging; la reasignación de consultas necesita procedimiento externo. Otros dominios no están cubiertos por ADR-SAAS-102 | Verificar gobierno de facultades, ejecutar recorrido sintético de interfaz en staging y comprobar otros tipos de registros antes de ampliar cobertura |
| Correo | Autoenvío y respuesta en la misma cuenta observados el 24 de noviembre. Posteriormente Gmail mostró almacenamiento agotado (166,15 GB de 15 GB) y aviso de interrupción de envíos y recepción desde el 24 de diciembre de 2026 | No demuestra entrega desde remitente externo; el canal puede dejar de operar según el aviso | Resolver la cuota por un mecanismo autorizado y verificarla; prueba externa autorizada de ida y vuelta con contenido sintético y evidencia mínima. No borrar datos ni contratar un plan sin decisión específica |
| Exportación | Adaptadores cerrados, aislamiento y export sintético en Emulator, CI verde | Metadatos de raíces no prueban campos, referencias, archivos ni lectura histórica en Cloud | Ensayo autorizado y restringido sobre datos reales pertinentes; validar integridad y entrega sin exponer datos de terceros |
| Conservación y supresión | `retention-plan.mjs` es PREVIEW_ONLY; borrado limitado a fixtures Emulator | No hay ejecución real certificada; respaldos tienen ciclos propios | Implementar procedimiento controlado y verificable por categorías; probar solo con fixtures o autorización específica |
| Reglas, autenticación y aislamiento | Suites de Rules y pruebas legales pasan en CI. Inventario gcloud 2026-11-24: en producción `consultarEstadoLegalTenant` y `aceptarDocumentosLegalesTenant` están ACTIVE, GEN_2; en staging también está ACTIVE `tramitarReclamoPrivacidadSaas` | La callable de reclamos no aparece en el inventario productivo; las funciones de aceptación productivas anteceden al último commit de la rama. ACTIVE no acredita su SHA ni disponibilidad funcional | Comparar código, permisos, Rules y revisión; desplegar dependencias en el orden autorizado y ejecutar pruebas negativas y smoke autenticado sin tocar datos reales |
| Dependencias | `npm audit --omit=dev` del codebase legal: cero avisos. En la aplicación raíz se actualizó `fast-xml-parser` de 5.11.2 a 5.12.1 y pasó la prueba de su lector; el nuevo lockfile informa cuatro moderados y ningún bajo, alto o crítico | `glob`, `google-gax`, `minimatch` y `rimraf` presentan avisos moderados según la auditoría. El reporte no demuestra explotabilidad de cada ruta ni cubre otros codebases | Revisar las rutas y actualizaciones compatibles restantes y verificar CI del candidato exacto; no declarar ausencia global de vulnerabilidades |

Las cuatro alertas moderadas de la raíz forman una cadena transitiva: `glob` y
`minimatch` son dependencias de herramientas y de `rimraf`, que llega mediante
`google-gax` desde Firestore. La consulta del registro no encontró un parche
posterior a `google-gax` 5.0.8 en su serie ni `glob` posterior a 10.5.0 en la
serie 10. Un ensayo `npm audit fix --dry-run --package-lock-only` no propuso
cambios. No se fuerza una versión mayor transitiva sin revisar compatibilidad;
esta observación no demuestra que las rutas afectadas sean o no explotables.
| Proveedores y Vercel | Firebase/App Hosting identificados; Vercel Hobby y previews previos documentados en `OPERACION-Y-CONSERVACION.md` | No se comprobó contenido o eliminación de previews históricos; no asumir DPA | Inventariar configuración y exposición actuales y aplicar medidas proporcionadas autorizadas |
| Release | PR #706 draft; `main` aa1c4fe, HEAD 3140e92; CI 45489048596 exitosa | Merge activa App Hosting; frontend y funciones de reclamos pueden divergir | Verificar compatibilidad, auditoría, checks y secuencia; integrar y comprobar rollout solo tras resolver gates |
| Vigencia y aprobación | Bundle `PREPARACION`; no se acepta como contrato vigente | Publicación prematura o confusión entre contrato y consentimiento | Aprobación humana que corresponda, versión inmutable, fechas y recorrido verificable sin aceptar por terceros |

## Prioridades

1. Comprobar las superficies y entornos actuales y cerrar brechas de aislamiento y
   completitud de exportación con pruebas reproducibles.
2. Completar consultas, historial/versionamiento y procedimientos dentro de las
   decisiones arquitectónicas aprobadas; identificar cualquier nueva frontera.
3. Contrastar textos y proveedores contra hechos y fuentes vigentes; mantener los
   documentos como borrador hasta que estén listos y aprobados.
4. Preparar ensayo de salida, seguridad, despliegue coordinado y recuperación;
   después ejecutar los cortes autorizados y verificar resultados.

## Apéndice operativo — staging, 2026-11-25 UTC

PR #706 sigue en borrador. El SHA `6e63c172d4cba7cc68c6f756148c84a79589e44e`
pasó CI y se desplegó en `micafe-pos-staging`: la revisión App Hosting
`micafe-pos-build-2026-11-25-001` quedó Ready con 100 % del tráfico. La interfaz
pública sirve los cuatro documentos 0.2 como borradores no exigibles. Las nuevas
callables rechazan peticiones anónimas con 401. La ruta de consultas se negó a la
sesión autenticada de prueba por no tener la facultad específica; no se la amplió.

El preflight no pudo determinar si Firebase reutilizó o creó identidades de
servicio Pub/Sub/Eventarc: faltó permiso IAM de lectura y las consultas de logs
disponibles no devolvieron eventos. El límite no demuestra que no hubiera cambios.
No se alteró IAM ni se desplegó a producción. Véase la evidencia detallada en
`CIERRE-COMPROBACIONES-2026-11.md`.

## Revalidación de estado — 2026-11-25 20:55 UTC

Este apéndice reemplaza las filas anteriores cuando describen estados de staging,
exportación, Vercel o PR que ya cambiaron. La evidencia cronológica completa está
en [Cierre de comprobaciones](CIERRE-COMPROBACIONES-2026-11.md).

| Requisito | Estado verificado | Pendiente para cierre |
|---|---|---|
| Documentos y aceptación | Staging sirve v0.3 como `BORRADOR`/no exigible; producción conserva `/terminos` histórico y las otras tres rutas no están publicadas. Aceptación versionada está implementada; no se registró aceptación real. | Verificar los datos del prestador contra RUT y cerrar revisión factual/jurídica antes de publicar o exigir aceptación. |
| Consultas y reclamos | Las cuatro callables legales están `ACTIVE` en staging; sin autenticación devolvieron 401. El grant de consultas/reclamos para el operador de prueba consta en Firestore y Auth. La captura confirma que la bandeja abre, no que una callable autenticada escriba o lea un expediente. Producción carece de las dos callables de consultas/reclamos. | Completar smoke autenticado sintético de staging y luego el corte productivo autorizado. No hay expedientes reales creados. |
| Exportación | 48/48 raíces están clasificadas; las seis raíces históricamente pendientes tienen allowlists. La suite local `scripts/legal/legal-tools.test.mjs` pasó 26/26. `productionExportCertified=false`. | Ensayar payloads históricos, referencias, subcolecciones, archivos y `readTime` con datos reales autorizados y alcance mínimo; no hay exportación integral real. |
| Supresión y conservación | Planificador permanece `PREVIEW_ONLY`; el ejecutor está limitado a fixtures sintéticos en Emulator. | Falta procedimiento y evidencia de supresión real; no se ejecutó borrado de datos productivos ni se certificaron límites de backups. |
| Vercel | `git.deploymentEnabled=false`; el inventario read-only devolvió 0 previews. El alias antiguo del PR responde 404. Cuatro deployments `production` permanecen `READY`; su alias compartido redirige a SSO. | Resolver la aptitud contractual del plan Hobby para cualquier uso remanente. No se borraron los cuatro deployments. |
| Release | PR #706 sigue `OPEN`/`DRAFT`, base `main@aa1c4fe`; el SHA `cea9bcd` tiene CI `45698887417` en curso. `main` remoto continúa en `aa1c4fe`. | Esperar CI del SHA exacto, completar gates externos, auditar y no fusionar ni desplegar documentos borrador. |
| Hechos y canales | No apareció un RUT de Sebastián en los nombres de archivo revisados; los documentos llamados `RUT LAURA` no se abrieron. No hay conexión Gmail confirmada para la prueba externa. | Aportar/verificar el RUT y completar ida y vuelta desde una cuenta externa; no se cambia el plan ni se da por probado el canal. |

## Revalidación de producción — 2026-11-26 UTC

La evidencia read-only más reciente está en
[`PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md`](evidence/PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md).
App Hosting sirve `main@aa1c4fe` y no el HEAD de #706; las dos Functions de
aceptación legal están activas desde el 2026-11-24. No se pudo leer el release
activo de Firestore Rules por HTTP 403. Las 117 Functions observadas comparten
la cuenta Compute predeterminada con `roles/editor`; ADR-SAAS-105 fue aceptado
para piloto por codebase en staging, sin permiso de IAM o deploy productivo.
Continúan sin smoke autenticado y sin exportación integral con datos/archivos
reales.

## Revalidación de identidades runtime — 2026-11-26 04:38 UTC

ADR-SAAS-105 alternativa C fue aceptado para implementación y pruebas; el
responsable no autorizó cambios IAM ni despliegues productivos. La consulta
read-only confirmó 117 Functions en `us-central1` con la cuenta Compute y
`roles/editor`, además de seis jobs de Scheduler que la usan como identidad
OIDC. Cloud Run devolvió 118 servicios en 42 de 43 ubicaciones consultadas: las
117 Functions y un servicio Firebase App Hosting con identidad separada. No se
encontraron Cloud Run Jobs en las 42 ubicaciones respondidas. No existe una
cuenta runtime `saas-legal` en staging. `compute.googleapis.com` y
`cloudasset.googleapis.com` están deshabilitadas; no se activaron, así que el
inventario de VMs y global de recursos sigue incompleto. No se creó identidad ni
binding. `roles/datastore.user` y `roles/firebaseauth.viewer` son candidatos
documentados para revisión, no permisos ya aprobados o concedidos. Véase el
[preflight de solo lectura](evidence/PREFLIGHT-PRODUCCION-READONLY-2026-11-26.md).

## Reconciliación factual y de release — 2026-11-26 13:49 UTC

Esta sección supersede los estados anteriores de rutas, CI y verificación de
identidad del prestador; véase el registro con evidencia en
[Cierre de comprobaciones](CIERRE-COMPROBACIONES-2026-11.md).

| Requisito | Estado verificado | Pendiente para cierre |
|---|---|---|
| Identidad del prestador | Imágenes parciales del RUT aportadas por el prestador indican persona natural; los datos ya publicados en el borrador v0.5 coinciden. No se guardó el RUT en Git ni se verificó el QR/DIAN. El prestador designó a Sebastián Agudelo Muñoz como contacto operativo principal; no hay suplente. | Confirmar que el prestador contractual seguirá siendo esa misma persona natural y operar/probar los canales. No hace falta pedir de nuevo el RUT para la consistencia de estos campos; la evidencia no acredita autenticidad independiente ni firma de documentos. |
| RNBD | La orientación pública de la SIC identifica como obligados a sociedades y entidades sin ánimo de lucro con activos superiores a 100.000 UVT y personas jurídicas públicas. La clase de persona natural visible en el RUT no cae en esas categorías por sí sola. | Revisar si cambia la persona que presta el servicio o se crea una persona jurídica; las restantes obligaciones de protección de datos siguen aplicando. |
| Marco legal actualizado | Se cotejaron Leyes 1581/2012, 1480/2011, 2439/2024 y 2573/2026 en fuentes oficiales. La vigencia general de la Ley 2573 inicia seis meses después de su promulgación (19-may-2026); su ámbito de cartera no se presume para todo usuario de crédito comercial. | Mantener evaluación específica por rol, servicio y hecho; no tratar la mención legal como certificación ni como habilitación de reportes de crédito. |
| Sitio y documentos | `pos.dusema.com` redirige a `/pos`; `/terminos` productivo sirve todavía título de Café Atrato y las otras tres rutas legales devuelven 404. Las cuatro rutas de staging responden 200. | Publicar documentos solo después de revisión factual/jurídica, vigencia y cierre de operación de canales. |
| Vercel | El alias público `cafeatrato.vercel.app` ahora responde 404. | No acredita borrado de los cuatro deployments `production` protegidos ni resuelve compatibilidad comercial de Hobby/DPA. No se cambió el plan ni se borraron artefactos. |
| PR y CI | #706 está OPEN/DRAFT, HEAD `f8ede4e`, base `main@aa1c4fe`, sin revisiones humanas. CI `45826327305` terminó success (128 pasos). | Smoke autenticado de staging, gates de exportación/supresión, revisión de proveedores y cierre de textos. Sin merge ni producción. |

Fuentes primarias y evidencia técnica enlazadas en el apartado de revalidación del
cierre. Las sondas HTTP prueban disponibilidad de rutas, no aceptación, roles,
persistencia, aislamiento ni cumplimiento legal integral.
