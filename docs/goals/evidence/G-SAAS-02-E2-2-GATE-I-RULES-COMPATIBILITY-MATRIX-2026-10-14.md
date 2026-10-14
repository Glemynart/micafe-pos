# G-SAAS-02 / M2 / E2.2 — Gate I: matriz de compatibilidad de Firestore Rules

**Fecha de revisión:** 2026-10-14 09:51 UTC

**SHA de código revisado:** `main @ 2727b55aeb8e4068bb2666d53b76478638ce557d` (PR #592 integrado)

**Proyecto remoto observado:** `micafe-pos`
**Dictamen:** preparación completada; Gate I sigue `INCOMPLETE`. Este documento no autoriza despliegues, altas, escrituras ni cambios de seguridad en producción.

## Resumen ejecutivo

La petición de publicar las trece rutas Bodega objetivo ya está satisfecha en
producción: las trece callables objetivo y once funciones de soporte están
`ACTIVE` en `us-central1`, Node.js 22. En total se observaron 104/104 Functions
activas. Las comprobaciones HTTP sin credenciales de las callables devolvieron
401, que es el comportamiento esperado para esas sondas; no se ejecutó ninguna
operación de negocio.

Esto no cierra el corte de Gate I. `registrarCompraOperativaV1` continúa activa
con hash anterior al guard de ADR-SAAS-075; la versión desplegada no rechaza aún
las compras Bodega por esa barrera. El preflight de deploy de `saas-auth` quedó
detenido porque el codebase también declara `WOMPI_EVENTS_SECRET` y el secreto
no está disponible en el entorno consultado. No se creó ni cambió ningún
secreto y no se usó un valor sustituto. Las Firestore Rules activas tampoco
coinciden con `main`; abajo se clasifican las catorce rutas diferentes para
preparar pruebas y un corte controlado. Vercel no acreditó un deployment
productivo para el SHA objetivo, y siguen faltando smoke y restore
independientes.

## Evidencia de solo lectura y límites

La revalidación del colector a las `2026-10-14T09:40:38.858Z` observó las
Rules y el estado del release; una segunda lectura a las
`2026-10-14T09:51:01.917Z` revalidó Functions y CI:

| Superficie | Resultado observado |
|---|---|
| `origin/main` | `2727b55aeb8e4068bb2666d53b76478638ce557d` |
| CI del merge #592 | Relectura a `09:51:01Z`: run `38542261848`, `completed/success`, SHA `2727b55aeb8e4068bb2666d53b76478638ce557d`. |
| Functions | Relectura a `09:51:01Z`: 104/104 `ACTIVE`, Node.js 22; las 24 funciones Bodega (13 objetivo + 11 soporte) `ACTIVE`. |
| Compras legacy | Relectura a `09:51:01Z`: `registrarCompraOperativaV1` sigue `ACTIVE`; hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard de ADR-SAAS-075 en el código de `main`. |
| Firestore Rules | `MISMATCH`; release `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizada `2026-08-15T04:20:46Z`. SHA fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`; SHA remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. |
| Storage Rules | Coinciden con la fuente revisada. |
| Vercel | No se observó un deployment productivo exitoso para el SHA objetivo. La lectura previa registró como último `READY` el SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d` del 6-oct; debe revalidarse al preparar release. |
| Smoke independiente | Falta evidencia para el artefacto productivo objetivo. |
| Recuperación | PITR está deshabilitado; se observaron un backup schedule y 35 backups en `southamerica-east1`, pero no un restore independiente. ADR-SAAS-031 mantiene PITR fuera de alcance. |

Las trece rutas objetivo activas son `crearClienteVendedorBodegaV1`,
`crearPresentacionComercialBodegaV1`, `actualizarPresentacionComercialBodegaV1`,
`crearArticuloInventarioBodegaV1`, `confirmarVentaVendedorBodegaV1`,
`consultarCatalogoPresentacionesVendedorBodegaV1`,
`consultarClientesVendedorBodegaV1`, `consultarMisVentasVendedorBodegaV1`,
`actualizarArticuloInventarioBodegaV1`, `abrirTurnoBodegaV1`,
`cerrarTurnoBodegaV1`, `registrarCompraBodegaV1` y
`registrarPerfilComercialBodegaV1`. Las once funciones activas de soporte son
`crearCategoriaBodegaV1`, las cuatro rutas de solicitudes
(`crearSolicitudVentaBodegaV1`, `consultarSolicitudesVentaBodegaV1`,
`resolverSolicitudVentaBodegaV1`, `cancelarSolicitudVentaBodegaV1`) y las seis
de agenda (`crearProgramacionPedidoBodegaV1`, `resolverProgramacionPedidoBodegaV1`,
`cancelarProgramacionPedidoBodegaV1`, `consultarAgendaPedidosBodegaV1`,
`convertirProgramacionPedidoBodegaV1`, `reconciliarAgendaPedidosBodegaV1`).
El reconciliador durable de agenda usa Scheduler; el trigger inmediato de
notificación no forma parte de este release.

La recopilación consultó metadatos y reglas, no documentos de negocio. No se
invocaron callables autenticadas ni se modificaron Functions, Rules, IAM,
Secrets, Vercel, Auth, Firestore, Storage, tenants, oferta/Trial, usuarios,
catálogo o inventario. El resultado fue `readOnly=true` y
`productionWrites=false`.

## Matriz de compatibilidad de Rules

“Producción” describe el ruleset remoto observado; “main” describe la fuente en
el SHA objetivo. `GENERAL` conserva el flujo LEGACY cuando se especifica. La
presencia de una regla en `main` no autoriza desplegarla: los hallazgos y gates
por ruta son parte del preflight.

| Path | Rules de producción | Rules en `main @ 2727b55` | Consumidor / impacto | Gate antes del corte |
|---|---|---|---|---|
| `/categorias/{id}` | Lectura tenant; admin puede crear, actualizar y borrar. | Lectura tenant; escritura admin excluida para `BODEGA_MVP1`. | Bodega administra por callables; confirmar que el admin `GENERAL` sigue usando su ruta directa. | Emulator por vertical/rol; comprobar escrituras admin `GENERAL` permitidas y Bodega directas denegadas. |
| `/clientes/{id}` | Lectura para usuarios autenticados del tenant. | Igual, excepto vendedor Bodega; vendedor GENERAL preservado por #592. | POS LEGACY consulta clientes directamente; Bodega vendedor usa callable. | Pruebas Emulator para consultas y documentos de ambos verticales, incluido tenant/membresía inactivos. |
| `/compras/{id}` | Lectura tenant; admin puede crear y borrar directamente. | Lectura tenant; escritura directa excluida para Bodega, conservada para otros verticales. | Bodega usa `registrarCompraBodegaV1`; historial administrativo lee directamente. Legacy callable permanece activa con hash antiguo. | Bloqueante: desplegar y verificar guard server-side de `registrarCompraOperativaV1` también en replay antes de aplicar Rules. Preflight `saas-auth` detenido por `WOMPI_EVENTS_SECRET` no disponible. |
| `/empresas/{empresaId}/bodega_senales/{canal}` | Denegada por catch-all. | `get` Bodega autenticado/membresía activa: canal de disponibilidad para vendedor y solicitudes para admin; sin list ni escritura. | Sincronización viva de disponibilidad y solicitudes; expone únicamente señal técnica, no datos de negocio. | Tests de rol, membresía revocada, canal cruzado, tenant ajeno y denegación de list/escritura. |
| `/empresas/{empresaId}/bodega_senales_vendedor/{signalId}` | Denegada por catch-all. | `get` solamente del documento cuyo ID coincide con el UID del vendedor Bodega activo; sin list ni escritura. | Aviso de solicitudes dirigido al vendedor. | Tests de UID propio/ajeno, membresía activa/inactiva y denegación de enumeración/escritura. |
| `/intenciones_pago_reserva/{id}` | Denegada por catch-all. | Denegación explícita de lectura y escritura. | No hay cambio efectivo observado; la autoridad es backend. | Conservar test explícito de denegación y comprobar que no existe consumidor cliente que dependa de lectura. |
| `/movimientos_inventario/{id}` | Lectura a cualquier usuario autenticado del tenant. | Lectura tenant para autenticados que no sean vendedor, sin condición de vertical. | Kardex administrativo lee directamente; no se encontró consumidor directo de vendedor GENERAL. Es una restricción global, no verticalizada, y reduce exposición de costos/ledger. | Confirmar inventario completo de consumidores; Emulator debe probar admin/cajero y vendedor GENERAL/Bodega. No ampliar acceso por suposición. |
| `/presentaciones_producto/{id}` | Denegada por catch-all. | Lectura tenant a autenticados no vendedores; sin escrituras. | Admin Bodega se suscribe directamente; vendedor Bodega obtiene catálogo por callable. La regla fuente también permite lectura de otros roles no vendedores en otros verticales. | Verificar consumidores por vertical y roles no vendedores; mantener Bodega admin operable y negar vendedor Bodega; decidir si el permiso debe ser específico a Bodega antes del deploy. |
| `/productos/{id}` | Lectura tenant para autenticados. | Igual, salvo vendedor Bodega; vendedor GENERAL preservado por #592. | POS LEGACY GENERAL lee directamente; catálogo de vendedor Bodega va por callable. | Cobertura Emulator GENERAL/Bodega, membresía/tenant y consultas de colección; #592 corrige la regresión general conocida. |
| `/saas_platform_binding_external_tenants/{id}` | Denegada por catch-all. | Denegación explícita de lectura y escritura. | Sin diferencia efectiva de permiso; metadatos de vinculación quedan server-side. | Conservar test de aislamiento y denegación a cliente. |
| `/saas_platform_bindings/{id}` | Denegada por catch-all. | Denegación explícita de lectura y escritura. | Sin diferencia efectiva de permiso; metadatos de vinculación quedan server-side. | Conservar test de aislamiento y denegación a cliente. |
| `/turnos/{id}` | Lectura a usuarios autenticados del tenant. | Vendedor Bodega solo lee documentos cuyo `cajeroId` es su UID; GENERAL conserva lectura LEGACY. | Admin y operación consultan turnos; el vendedor Bodega queda limitado a su turno. | Tests Emulator por vertical, dueño/no dueño, turno propio y consulta de colección; validar reglas de query. |
| `/usuarios/{uid}` | Usuario autenticado del tenant puede leer perfiles del tenant. | `get` propio; sin `list`, alta ni borrado cliente; update propio solo de `ultimoAcceso` y `fcmTokens`. | Perfil/FCM actualizan el propio documento; directorio admin usa backend. Endurecimiento global de privacidad. | Tests de perfil propio/ajeno, FCM/último acceso y denegación de list/escrituras sensibles. |
| `/ventas/{id}` | Lectura tenant autenticada; transición limitada `PENDIENTE_EFECTOS → COMPLETO` permite actualizar con snapshot fiscal/consecutivo estable. | Lectura igual salvo vendedor Bodega; vendedor GENERAL preservado por #592; todas las escrituras cliente denegadas. | POS/admin consultan ventas; `guardarMetadatosDian()` todavía usa `setDoc` cliente. La transición no debe retirarse sin verificar su reemplazo server-side y el flujo DIAN. | Bloqueante de compatibilidad: probar venta GENERAL, Bodega, transición fiscal permitida/no permitida e invocación DIAN; verificar que efectos y metadatos se guardan por autoridad canónica. |

El ruleset activo también carece de los helpers de vertical/membresía y de las
reglas de señales Bodega presentes en `main`. PR #592 ya resolvió para
`/productos`, `/clientes`, `/ventas` y `/turnos` la compatibilidad de vendedor
GENERAL bajo ADR-SAAS-077; esta matriz reemplaza la conclusión histórica que
suponía que las cuatro lecturas seguían denegadas globalmente. Permanecen las
preguntas de corte anotadas arriba para lecturas de ledger, presentaciones,
usuarios, escritura DIAN y compras.

## Evaluación de seguridad resumida

**Alcance:** análisis de compatibilidad de autorización y metadatos de release
en solo lectura; no es pentest ni prueba de callables autenticadas. No se
consultaron secretos, datos de negocio o credenciales.

| STRIDE | Amenaza en esta superficie | Mitigación/verificación pendiente |
|---|---|---|
| Spoofing | Token válido de otro usuario/tenant o membresía Bodega revocada podría intentar leer señales/documentos. | Emulator con UID propio/ajeno, tenant cruzado, membresía activa/revocada; sondas sin auth ya devolvieron 401, pero no sustituyen pruebas autenticadas. |
| Tampering | La callable legacy antigua sigue aceptando el código desplegado sin el guard ADR-SAAS-075; una repetición también debe bloquearse. | Actualizar y verificar hash del handler para operación nueva y replay antes de Rules; no desplegar con secreto sustituto. |
| Repudiation | Un retry de compra/venta puede ocultar duplicación o falta de auditoría. | Smoke autorizado debe conciliar idempotencia, auditoría y ledger con un único conjunto de efectos. |
| Information disclosure | Rules activas conceden lecturas tenant más amplias para compras, ventas, turnos, movimientos y usuarios; señales Bodega siguen denegadas. | Acordar rol/vertical por path, ejecutar Emulator y aplicar mínimo privilegio sin romper consumidores GENERAL. |
| Denial of service | Trigger inmediato puede amplificar reintentos/costo; Scheduler también depende de límites y observabilidad. | Mantener trigger fuera del release, revisar frecuencia/límites/error handling del Scheduler durable. |
| Elevation of privilege | Reglas por rol sin condición de vertical podrían mezclar permisos GENERAL y Bodega. | PR #592 verticalizó productos/clientes/ventas/turnos; cubrir el resto de rutas, membresías y consultas antes del corte. |

| Área de revisión | Estado de esta revisión |
|---|---|
| Autenticación y sesión | Las sondas callable sin credenciales retornaron 401; la sesión productiva de usuario no fue probada. |
| Autorización | 14 paths comparados; varios roles/verticales y cambios de escritura aún requieren fixtures/test. |
| Manejo de entradas | Payloads autenticados no fueron ejecutados; validar en pruebas Emulator y Functions existentes antes de release. |
| Exposición de datos | Riesgos de lecturas amplias y perfiles/ledger identificados en la matriz. |
| Criptografía | Sin cambio ni revisión criptográfica; no se leyeron ni alteraron llaves. |
| Integraciones de terceros | El deploy de `saas-auth` depende de `WOMPI_EVENTS_SECRET`; no disponible para el preflight observado. No se alteró. |
| Manejo de errores | No se observó exposición de secretos; el fallo de preflight detuvo el deploy. Los errores autenticados de Functions quedan fuera de esta revisión. |

| ID / severidad | Hallazgo | Remediación requerida |
|---|---|---|
| I-01 / HIGH — A01, Tampering | La callable legacy de compras está activa con hash previo al guard ADR-SAAS-075, mientras el source ya lo implementa. | Resolver de forma legítima la dependencia de `saas-auth`, desplegar la actualización de guard y comprobar operación nueva + replay por hash y tests. |
| I-02 / HIGH — A01, A04 | Rules remoto difiere de `main`; todavía permite escritura directa admin de compras y deniega señales Bodega. Un deploy completo también modifica otros paths. | Completar pruebas por vertical y gates de corte; solo aplicar Rules tras guard legacy y preflight exacto aprobado. |
| I-03 / MEDIUM — A01 | Algunas restricciones de `main` son globales (movimientos, presentaciones, usuarios/ventas) y tienen consumidores o roles aún por clasificar. | Conciliar cada consumidor y conservar explícitamente GENERAL; migrar escritura DIAN por autoridad canónica si aplica antes de quitar el permiso. |
| I-04 / MEDIUM — A05 | No se acreditó el SHA Vercel objetivo ni existen atestaciones independientes de smoke y restore. | Alinear Vercel al SHA de release y probar smoke/restore con identidad aprobada y destino aislado, sin usar `(default)`. |

## Orden recomendado para el corte y reversión

1. Mantener esta fase sin cambios remotos. Resolver el bloqueo del codebase
   `saas-auth` por la dependencia `WOMPI_EVENTS_SECRET` mediante disponibilidad
   legítima del secreto existente o una decisión arquitectónica separada; no
   copiar secretos ni inventar un valor. La actualización de la callable legacy
   solo se considera lista cuando el hash remoto contiene y las pruebas
   confirman el guard para operación nueva y replay.
2. Completar Emulator para cada fila con fixtures explícitos `BODEGA_MVP1` y
   `GENERAL`, roles admin/vendedor/cajero, tenant ajeno y membresía activa,
   inactiva o revocada. Corregir consumidores directos pendientes (DIAN,
   presentaciones y permisos globales) bajo ADR/alcance aprobado, no dentro de
   una publicación improvisada de Rules.
3. Congelar el SHA y la carpeta aislada de producción; validar proyecto literal
   `micafe-pos`, hashes fuente/Functions, export de Rules, release activa,
   Storage, CI, Vercel, índice y ausencia de deltas no autorizados. La lectura
   actual no es un preflight de deploy.
4. Aplicar Functions compatibles antes del cliente; publicar Vercel del mismo
   SHA certificado; luego desplegar Rules como unidad atómica tras confirmar el
   guard legacy y compatibilidad. La autorización a las trece rutas no equivale
   a autorización para cambiar las Rules completas, IAM, Secrets o Vercel.
5. Hacer smoke independiente con identidad y tenant de producción aprobados,
   siguiendo el runbook y el límite de no crear movimientos no autorizados.
   Para recuperación, ensayar restore en destino aislado; no restaurar sobre
   `(default)` ni inferir un restore exitoso por la existencia de backups.

Las Rules son atómicas, así que el rollback no puede ser “volver sin más” a la
release anterior si eso reabre escrituras directas Bodega. Antes del corte debe
estar probado el procedimiento de forward-fix y definido quién congela
operaciones de compra si el release se degrada. Una restauración temporal del
ruleset antiguo requeriría detener primero esas operaciones y aprobación
operativa explícita. Esto no es una matriz reversible ya aprobada ni permiso
para ejecutar el corte.

## Estado que queda

Las rutas Bodega solicitadas ya están publicadas. Lo pendiente para completar
Gate I es actualizar y verificar la callable legacy bajo el preflight de
`saas-auth`, cerrar la compatibilidad de las catorce rutas y su rollback,
certificar un deployment Vercel del mismo SHA, y obtener smoke y restore
independientes para un tenant/identidad autorizados. PITR permanece desactivado
según ADR-SAAS-031. No se ha creado el tenant de Diana ni iniciado su Trial;
esta evidencia no los provisiona ni autoriza datos reales.
