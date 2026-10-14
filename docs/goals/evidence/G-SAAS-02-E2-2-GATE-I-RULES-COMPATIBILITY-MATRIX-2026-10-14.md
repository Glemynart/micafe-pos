# G-SAAS-02 / M2 / E2.2 — Gate I: matriz de compatibilidad de Firestore Rules

**Fecha de revisión:** 2026-10-14 15:18 UTC

**SHA de código revisado:** `main @ 34fc2da84836b77b8320df32c05a22aad0158227` (PR #593 solo documental; código igual a #592)

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

La relectura read-only del colector a las `2026-10-14T15:18:29.390Z` verificó
SHA, CI, Functions, Rules, Storage y metadatos de recuperación
(`collectionErrors=[]`). La API de estado de GitHub no reportó un check Vercel
exitoso para el SHA objetivo; la última consulta directa de deployments Vercel
disponible es de las `2026-10-14T11:42:17Z` y debe repetirse antes del release.

| Superficie | Resultado observado |
|---|---|
| `origin/main` | `34fc2da84836b77b8320df32c05a22aad0158227` |
| CI post-merge de #593 | Run `38556393442`, SHA `34fc2da84836b77b8320df32c05a22aad0158227`, terminó `completed/success`. |
| Functions | A las 15:18Z, 104/104 `ACTIVE`, Node.js 22, hashes reconciliados por Function. Las 24 funciones Bodega (13 objetivo + 11 soporte) están `ACTIVE`; el inventario de las 15:16Z no mostró `wompiReservasWebhookV1`. |
| Compras legacy | A las 15:18Z, `registrarCompraOperativaV1` sigue `ACTIVE`; hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard ADR-SAAS-075 en el código de `main`. |
| Firestore Rules | `MISMATCH`; release `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizada `2026-08-15T04:20:46Z`. SHA fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`; SHA remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. Confirmado por lectura directa 15:18Z. |
| Storage Rules | `PASS`; release `projects/micafe-pos/releases/firebase.storage/micafe-pos.firebasestorage.app`, actualizada `2026-08-14T01:09:03.64385Z`; SHA fuente y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. Confirmado por lectura directa 15:18Z. |
| Vercel | El estado consultado a las 15:18Z no acredita un check Vercel exitoso para el SHA objetivo. La consulta directa de las 11:42Z vio 73 deployments y como último `READY` productivo el SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d` del 6-oct; revalidar antes del release. |
| Smoke independiente | Falta evidencia para el artefacto productivo objetivo. |
| Recuperación | A las 15:18Z, PITR está deshabilitado; hay un backup schedule y 35 backups en `southamerica-east1`. Existe evidencia de restore aislado independiente PASS del 15-ago; el colector informa `MISSING` porque no recibió una atestación vigente para este release. ADR-SAAS-031 mantiene PITR fuera de alcance. |

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

| Path | Rules de producción | Rules en `main @ 34fc2da` | Consumidor / impacto | Gate antes del corte |
|---|---|---|---|---|
| `/categorias/{id}` | Lectura tenant; admin puede crear, actualizar y borrar. | Lectura tenant; escritura admin excluida para `BODEGA_MVP1`. | Bodega administra por callables; confirmar que el admin `GENERAL` sigue usando su ruta directa. | Emulator por vertical/rol; comprobar escrituras admin `GENERAL` permitidas y Bodega directas denegadas. |
| `/clientes/{id}` | Lectura para usuarios autenticados del tenant. | Igual, excepto vendedor Bodega; vendedor GENERAL preservado por #592. | POS LEGACY consulta clientes directamente; Bodega vendedor usa callable. | Pruebas Emulator para consultas y documentos de ambos verticales, incluido tenant/membresía inactivos. |
| `/compras/{id}` | Lectura tenant; admin puede crear y borrar directamente. | Lectura tenant; escritura directa excluida para Bodega, conservada para otros verticales. | Bodega usa `registrarCompraBodegaV1`; historial administrativo lee directamente. Legacy callable permanece activa con hash antiguo. | Bloqueante: desplegar y verificar guard server-side de `registrarCompraOperativaV1` también en replay antes de aplicar Rules. El bloqueo anterior por `WOMPI_EVENTS_SECRET` quedó supersedido por ADR-SAAS-078 y PR #594, que excluyeron el export ausente y conservaron módulo/pruebas; falta completar preflight dirigido. |
| `/empresas/{empresaId}/bodega_senales/{canal}` | Denegada por catch-all. | `get` Bodega autenticado/membresía activa: canal de disponibilidad para vendedor y solicitudes para admin; sin list ni escritura. | Sincronización viva de disponibilidad y solicitudes; expone únicamente señal técnica, no datos de negocio. | Tests de rol, membresía revocada, canal cruzado, tenant ajeno y denegación de list/escritura. |
| `/empresas/{empresaId}/bodega_senales_vendedor/{signalId}` | Denegada por catch-all. | `get` solamente del documento cuyo ID coincide con el UID del vendedor Bodega activo; sin list ni escritura. | Aviso de solicitudes dirigido al vendedor. | Tests de UID propio/ajeno, membresía activa/inactiva y denegación de enumeración/escritura. |
| `/intenciones_pago_reserva/{id}` | Denegada por catch-all. | Denegación explícita de lectura y escritura. | No hay cambio efectivo observado; la autoridad es backend. | Conservar test explícito de denegación y comprobar que no existe consumidor cliente que dependa de lectura. |
| `/movimientos_inventario/{id}` | Lectura a cualquier usuario autenticado del tenant. | Lectura tenant para autenticados que no sean vendedor, sin condición de vertical. | El servicio de consulta del Kardex existe, pero no se encontró una llamada desde la aplicación; tampoco un consumidor directo de vendedor GENERAL. La regla global protege costos/ledger. | Emulator confirma admin Bodega/GENERAL permitido y vendedor Bodega/GENERAL denegado. No ampliar acceso por suposición; el servicio sin consumidor actual no bloquea este corte. |
| `/presentaciones_producto/{id}` | Denegada por catch-all. | Lectura tenant a autenticados no vendedores; sin condición de vertical y sin escrituras. | El único consumidor directo localizado es el backoffice Bodega; vendedor Bodega usa callable. No se encontró lector directo de vendedor GENERAL en `app`, `lib` o `components`. | Emulator confirma admin Bodega/GENERAL permitido y vendedor Bodega/GENERAL denegado. Conservar el permiso observado; no hay un consumidor conocido que se rompa en GENERAL. |
| `/productos/{id}` | Lectura tenant para autenticados. | Igual, salvo vendedor Bodega; vendedor GENERAL preservado por #592. | POS LEGACY GENERAL lee directamente; catálogo de vendedor Bodega va por callable. | Cobertura Emulator GENERAL/Bodega, membresía/tenant y consultas de colección; #592 corrige la regresión general conocida. |
| `/saas_platform_binding_external_tenants/{id}` | Denegada por catch-all. | Denegación explícita de lectura y escritura. | Sin diferencia efectiva de permiso; metadatos de vinculación quedan server-side. | Conservar test de aislamiento y denegación a cliente. |
| `/saas_platform_bindings/{id}` | Denegada por catch-all. | Denegación explícita de lectura y escritura. | Sin diferencia efectiva de permiso; metadatos de vinculación quedan server-side. | Conservar test de aislamiento y denegación a cliente. |
| `/turnos/{id}` | Lectura a usuarios autenticados del tenant. | Vendedor Bodega solo lee documentos cuyo `cajeroId` es su UID; GENERAL conserva lectura LEGACY. | Admin y operación consultan turnos; el vendedor Bodega queda limitado a su turno. | Tests Emulator por vertical, dueño/no dueño, turno propio y consulta de colección; validar reglas de query. |
| `/usuarios/{uid}` | Usuario autenticado del tenant puede leer perfiles del tenant. | `get` propio; sin `list`, alta ni borrado cliente; update propio solo de `ultimoAcceso` y `fcmTokens`. | Perfil/FCM actualizan el propio documento; directorio admin usa backend. Endurecimiento global de privacidad. | Tests de perfil propio/ajeno, FCM/último acceso y denegación de list/escrituras sensibles. |
| `/ventas/{id}` | Lectura tenant autenticada; transición limitada `PENDIENTE_EFECTOS → COMPLETO` permite actualizar con snapshot fiscal/consecutivo estable. | Lectura igual salvo vendedor Bodega; vendedor GENERAL preservado por #592; todas las escrituras cliente denegadas (`allow update: if false`). | POS/admin consultan ventas. `guardarMetadatosDian()` sigue invocado desde UI con `setDoc` cliente y reintento; P0 lo clasifica como writer legado que Rules endurecidas rechazan. La indisponibilidad DIAN fue aceptada solo para las dos empresas actuales de la evidencia post-merge; el ruleset es global y no implementa por sí solo ese alcance. | Emulator confirma ventas read-only y metadatos DIAN denegados para todos los roles/verticales. Antes del corte, aplicar el bloqueo previo a Factus aprobado para esos dos IDs, reenumerar tenants activos/trial y detenerse si el conjunto cambió. No reabrir la escritura cliente ni afirmar que el flujo fiscal funciona con estas Rules. |

El ruleset activo también carece de los helpers de vertical/membresía y de las
reglas de señales Bodega presentes en `main`. PR #592 ya resolvió para
`/productos`, `/clientes`, `/ventas` y `/turnos` la compatibilidad de vendedor
GENERAL bajo ADR-SAAS-077; esta matriz reemplaza la conclusión histórica que
suponía que las cuatro lecturas seguían denegadas globalmente. Permanecen las
preguntas de corte anotadas arriba para compras y para el impacto DIAN en
tenants existentes. El propietario aceptó la indisponibilidad fiscal temporal
solo para las empresas `1ae0rD9H8t3ZFSBKrrHR` (Cafe Atrato, `activa`) y `Prueba`
(`trial`), identificadas en la evidencia post-merge del 2026-10-14. Esta
aceptación operativa fue seguida por la aceptación de ADR-SAAS-079 para
implementar el guard reversible antes de Factus. La aceptación y el código no
autorizan Rules ni despliegues. El alcance está en
[ADR-SAAS-079](../../../ADR-SAAS-079-indisponibilidad-temporal-dian-gate-i.md)
y su registro en [evidencia de aceptación](G-SAAS-02-E2-2-ADR-SAAS-079-ACCEPTANCE-2026-10-14.md).
El backoffice Bodega es el único lector directo encontrado
para presentaciones; no se encontró llamada de aplicación al servicio de
Kardex.

## Revalidación y cobertura Emulator — 2026-10-14

La suite completa `npm run test:rules` pasó en el Emulator del proyecto demo:
45/45 pruebas, 0 fallas. Se añadieron dos casos Gate I en
`firestore-rules/role-invariants.test.ts`: lecturas de presentaciones/ledger
por documento y consulta tenant-scoped para rol y vertical; ventas read-only y
rechazo de `setDoc(..., { merge: true })` para metadatos DIAN. No se cambió
`firestore.rules` ni se contactaron documentos de negocio.

El responsable aprobó explícitamente ADR-SAAS-078 Opción 1 el `2026-10-14`.
La aprobación autoriza preparar la PR, pero no desplegar. El candidato de esta rama conserva
`functions/src/reservas-publicas/wompi.ts` y sus pruebas, pero elimina
`wompiReservasWebhookV1` del barrel de `saas-auth`; todavía no se hizo deploy
ni se alteró el proyecto productivo.
`npm --prefix functions run build` pasó y `npm --prefix functions test` terminó
con 436 pruebas pasadas, 0 fallas y 5 skips; la suite incluye una regresión que
comprueba que el módulo y pruebas Wompi se conservan, pero el webhook no queda
exportado desde `saas-auth`.

El preflight `firebase deploy --dry-run` limitado a las trece callables objetivo
terminó correctamente sin `--force`; las trece ya están activas, por lo que no
hay una creación pendiente que justifique republicarlas. El preflight de ambos
codebases Bodega completos se detuvo porque incluye un trigger de notificación
fuera del alcance que recibiría retry automático y requiere `--force`. La CLI
también ejecutó comprobaciones de APIs e invocó la generación de identidades de
servicio Pub/Sub/Eventarc. Las APIs aparecen activas al finalizar, pero la
cuenta disponible no tiene `iam.serviceAccounts.get`, por lo que no se pudo
verificar si esas identidades ya existían antes. No se desplegó ninguna
Function; este dry-run no se registra como prueba de cero mutaciones IAM.

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
| Autorización | 14 paths comparados; lecturas de vendedor, presentaciones, ledger y escrituras DIAN cuentan con cobertura Emulator 45/45; las diferencias productivas de compras aún bloquean el corte. |
| Manejo de entradas | Payloads autenticados no fueron ejecutados; validar en pruebas Emulator y Functions existentes antes de release. |
| Exposición de datos | Riesgos de lecturas amplias y perfiles/ledger identificados en la matriz. |
| Criptografía | Sin cambio ni revisión criptográfica; no se leyeron ni alteraron llaves. |
| Integraciones de terceros | El preflight de `saas-auth` se detuvo al resolver `WOMPI_EVENTS_SECRET`; no se leyó ni cambió el secreto. ADR-SAAS-078 Opción 1 fue aprobada explícitamente y el candidato retira solo el export del webhook no desplegado, conservando módulo y pruebas. |
| Manejo de errores | No se consultaron secretos. El preflight histórico de `saas-auth` se detuvo por `WOMPI_EVENTS_SECRET`; el candidato de Gate I ya lo excluye del discovery. Falta verificar el delta productivo después de integrar y antes de cualquier deploy. |

| ID / severidad | Hallazgo | Remediación requerida |
|---|---|---|
| I-01 / HIGH — A01, Tampering | La callable legacy de compras está activa con hash previo al guard ADR-SAAS-075, mientras `main` ya contiene el guard. ADR-SAAS-078 Opción 1 está integrada por PR #594: el webhook Wompi no se exporta y su módulo/pruebas se conservan; el bloqueo anterior por secreto no es el estado actual. | Confirmar el inventario remoto del webhook y completar preflight exacto de `registrarCompraOperativaV1`. Un deploy solo podría ocurrir con autorización explícita, luego de demostrar operación nueva + replay por hash/tests. Detener ante cualquier otro delta. |
| I-02 / HIGH — A01, A04 | Rules remoto difiere de `main`; todavía permite escritura directa admin de compras y deniega señales Bodega. Un deploy completo también modifica otros paths. | Completar pruebas por vertical y gates de corte; solo aplicar Rules tras guard legacy y preflight exacto aprobado. |
| I-03 / MEDIUM — A01 | `guardarMetadatosDian()` conserva un writer cliente que las Rules de `main` niegan. La indisponibilidad temporal fue aceptada únicamente para Cafe Atrato (`1ae0rD9H8t3ZFSBKrrHR`) y Prueba (`Prueba`), el conjunto `activa`/`trial` observado el 2026-10-14; no cubre empresas futuras. La UI usa `window.api.factus`, pero para este caso el propietario confirmó que el producto es web, no Electron; el repositorio no contiene proveedor web de Factus en `app/api` ni Functions. | ADR-SAAS-079 y PR #595 bloquean el UI para los dos IDs. La falta de una ruta web significa que no se acredita emisión DIAN funcional para otros tenants tampoco. Definir autoridad server-side web en un ADR separado, conservar el guard actual, demostrar ausencia de efectos fiscales parciales y regresión no fiscal; no reabrir el writer cliente. Rules, código y deploy requieren aprobaciones propias. |
| I-04 / MEDIUM — A05 | No se acreditó el SHA Vercel objetivo ni existen atestaciones independientes de smoke y restore. | Alinear Vercel al SHA de release y probar smoke/restore con identidad aprobada y destino aislado, sin usar `(default)`. |

## Orden recomendado para el corte y reversión

1. Mantener esta fase sin cambios remotos. Integrar el candidato de ADR-SAAS-078
   y, desde la carpeta aislada de producción, confirmar que el endpoint Wompi
   no existe en remoto. Ejecutar un preflight exacto del target
   `registrarCompraOperativaV1`; no leer ni inventar `WOMPI_EVENTS_SECRET` y
   detenerse ante eliminación, creación o actualización adicional. La callable
   solo se considera lista cuando el hash remoto y pruebas confirman el guard
   tanto en operación nueva como en replay.
2. La suite Emulator cubre lecturas de vendedor por vertical,
   presentaciones/ledger y denegación de escritura de ventas. El propietario
   acepta temporalmente la indisponibilidad DIAN solo para las dos empresas
   de la evidencia post-merge; esta aceptación no equivale a autorización
   técnica. ADR-SAAS-079 acepta bloquear emisión individual, lote y notas
   antes de llamar a Factus para esos IDs y conservar el código fiscal actual.
   Implementar/probar el guard es prerrequisito previo a
   Rules. Reenumerar empresas `activa`/`trial` inmediatamente antes del corte;
   detenerse si la lista difiere. No reabrir el permiso cliente inseguro.
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
Gate I es actualizar y verificar la callable legacy mediante un camino
aprobado que no dependa de `WOMPI_EVENTS_SECRET`, aprobar e implementar el
guard DIAN propuesto para el alcance exacto observado, terminar el preflight de
Rules y su rollback, certificar un deployment Vercel del mismo SHA y cerrar
las atestaciones independientes de smoke/recovery requeridas por el release.
El corte de Rules requiere además autorización de despliegue explícita y una
relectura que confirme que no hay empresas `activa`/`trial` nuevas fuera de las
dos cubiertas por la aceptación. PITR permanece desactivado según ADR-SAAS-031.
No se ha creado el tenant de Diana ni iniciado su Trial; esta evidencia no los
provisiona ni autoriza datos reales.

## Addendum post-merge #595 — 2026-10-14T18:36Z

Este addendum actualiza el estado posterior sin reescribir las observaciones
históricas de la matriz. PR #595 quedó integrado en
`origin/main @ f08fa1ca6466bfc84c39d771f34e494aaf9b2386`. ADR-SAAS-079 está
Aceptado y el guard reversible de interfaz ya bloquea las cuatro acciones
Factus únicamente para `1ae0rD9H8t3ZFSBKrrHR` y `Prueba`. La CI post-merge
`38615549091` seguía `in_progress` al corte; no se reporta como `PASS` hasta su
conclusión definitiva.

La lectura directa de Rules sigue mostrando `MISMATCH` en 14 paths; su corte
global sigue sin autorización y depende de resolver compatibilidad y autoridad
servidor de DIAN. El propietario confirmó que para este caso (Gate I / Diana)
el destino es web, no Electron.
Hay cuatro callsites de `window.api.factus` en `components/pos/historial.tsx`,
pero no existe proveedor web de Factus en `app/api` ni en Functions. Por tanto,
el guard de PR #595 protege los dos tenants aprobados en UI, pero no acredita
una ruta DIAN web funcional para tenants ajenos al allowlist. La callable
legacy de compra remota conserva el hash
`9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, mientras la fuente integrada
contiene el guard ADR-SAAS-075 para operación nueva y replay. Functions
continúa sin autorización productiva de despliegue.

El restore aislado de `2026-10-14` está `VERIFIED` con `RPO=8.307 h`,
`RTO=0.220 h`, `sourceUntouched=true` y `applicationCutover=false`; por ello,
la afirmación histórica de que faltaba recovery quedó supersedida. El collector
no importó la atestación externa (`MISSING`) porque su interfaz no ingiere el
resultado del verificador; esto no invalida la evidencia independiente de
recovery. PITR permanece deshabilitado conforme a ADR-SAAS-031 y no se considera
un bloqueo.

Vercel producción sigue en `main @ 1c2f155` del 6-oct; no hay publicación ni
smoke autenticado del SHA actual. La publicación y el smoke requieren
autorizaciones/identidad independientes. La fecha objetivo interna del Trial
es `2026-10-15`; no consta confirmación directa de Diana y debe mantenerse
pendiente. No se inició ni se provisionó el tenant. No hubo deploy, escritura
productiva, cambio IAM/Secrets o restauración de `(default)`.

El dictamen de Gate I permanece `INCOMPLETE`.
