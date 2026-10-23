# ADR-SAAS-086 — Resolución de cardinalidad de `saas-commercial` y consulta de oferta

## Estado

**Aceptado — 2026-10-23.**

El usuario delegó expresamente al Lead Engineer la elección de la alternativa
más conveniente. Se adopta la Opción A, incluida la excepción
limitada de auditoría append-only descrita en esta ADR. Esta aceptación resuelve
la cardinalidad documental; no demuestra conformidad de la implementación ni
autoriza implementación, invocación remota, despliegue u operaciones
comerciales.

- **Fecha de propuesta:** 2026-10-23.
- **Fecha de aceptación:** 2026-10-23, por delegación expresa del usuario
  para elegir la alternativa técnica más conveniente.
- **Base documental revisada:** `origin/main @
  bdbf069db0329f81f5b00c949ae2c435097469b9`, verificada antes de crear la
  rama.
- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 — Provisioning y onboarding →
  E2.2 — Configuración inicial`.
- **Trazabilidad:** PR #630, #631, #632 y #633 están fusionados. El checkpoint
  vigente en el Goal registra ADR-SAAS-086 como la siguiente decisión humana.
- **ADRs relacionados:** [ADR-SAAS-043](ADR-SAAS-043-aislamiento-codebase-comercial-staging.md),
  [ADR-SAAS-061](ADR-SAAS-061-oferta-comercial-tenant-especifica.md),
  [ADR-SAAS-063](ADR-SAAS-063-politica-release-vercel-main.md) y
  [ADR-SAAS-083](ADR-SAAS-083-app-hosting-produccion.md).

Esta ADR **supersede únicamente** la restricción de ADR-SAAS-043 que limita
`saas-commercial` a una callable. ADR-SAAS-043 conserva sus demás controles de
frontera, discovery, Secrets, región, preflight y despliegue. La implementación
actual todavía debe demostrar los criterios de conformidad y pruebas de esta
ADR antes de poder considerarse arquitectónicamente conforme.

## Contexto y problema

ADR-SAAS-043, aceptada, establece que el codebase Firebase `saas-commercial`
declare exclusivamente `ejecutarComandoComercialSaas`. Esa cardinalidad
protegía una frontera de discovery y despliegue independiente de Secrets
ajenos.

ADR-SAAS-061, aceptada, crea la oferta comercial específica por tenant y
requiere que su consulta administrativa use `COMERCIAL_GOBERNAR`
revalidada en servidor. No modifica expresamente la cardinalidad aprobada en
ADR-SAAS-043.

En `origin/main @ bdbf069d`, `functions-commercial/src/index.ts` exporta:

- `ejecutarComandoComercialSaas`
- `consultarOfertaComercialTenantSaas`

La existencia del código, sus pruebas o un build exitoso no resuelven el
conflicto documental ni demuestran conformidad arquitectónica.

## Evidencia revisada

La revisión de código fue estática, sobre los archivos integrados en el SHA
indicado. La observación de runtime abajo fue solo de lectura y no consultó
variables de entorno ni identificó el commit del despliegue. Las pruebas de
Emulator se ejecutaron en el workflow CI indicado; no son una validación de
staging.

| Archivo | Evidencia observada | Límite de la evidencia |
|---|---|---|
| `functions-commercial/src/index.ts` | Exporta exactamente las dos callables anteriores. | No demuestra qué revisión está desplegada. |
| `firebase functions:list --project micafe-pos-staging` (2026-10-23) | `saas-commercial` reporta activas `ejecutarComandoComercialSaas` y `consultarOfertaComercialTenantSaas`, ambas en `us-central1`, Node.js 22 y con el mismo hash CLI `c9a4f86d04ac3754bfb76879f1639f6820485e9`. | Ese hash no identifica un commit Git ni demuestra que el runtime corresponda a `origin/main`; la observación no resuelve conformidad arquitectónica ni autoriza un despliegue. |
| `functions/src/platform/commercial-callable.ts` | Ambas usan `us-central1`. La consulta exige `request.auth`, llama `autorizarPlataforma(..., "COMERCIAL_GOBERNAR")`, comprueba el proyecto runtime y comprueba que `codigoAprobacion` sea string. | El wrapper no rechaza explícitamente propiedades adicionales. La cobertura directa del wrapper está en el PR abierto #636 y es parcial; sus límites se especifican en la fila correspondiente. |
| `functions/src/platform/authorization.ts` | La autorización valida documento del operador, UID, estado `ACTIVO`, marca de operador del token, versión de autorización y facultad. | Es una facultad global de plataforma; no es una membresía del usuario en el tenant objetivo. |
| `functions/src/platform/approved-tenant-offers.ts` | Resuelve términos desde una allowlist server-side; rechaza código vacío/desconocido y ofrece un helper que rechaza campos comerciales no confiables cuando recibe el objeto completo. | La consulta actual invoca el resolver solo con el código; por ello no se verificó que el endpoint rechace campos adicionales del request. |
| `functions/src/platform/commercial-offer-read.ts` | Lee el control y la oferta mediante dos referencias derivadas del mapeo aprobado en servidor; valida identificadores y términos persistidos y construye una proyección de campos permitidos. | Esta función de dominio no cubre por sí sola autenticación ni autorización. |
| `functions/src/platform/commercial-callable.ts` y `commercial-offer-read.ts` | El camino autorizado de consulta no llama comandos mutantes ni ejecuta Bootstrap. La consulta de dominio usa lecturas Firestore. | `autorizarPlataforma` puede emitir un evento de auditoría durable cuando deniega. La callable no es estrictamente “cero escrituras” en todas las rutas. |
| `functions/src/platform/commercial-offer-read.test.ts` | Prueba allowlist, referencias leídas, proyección de respuesta, rechazo de aprobación desconocida, control/tenant/puntero inválidos y schemaVersion. El cambio de prueba incluido en PR #636 siembra además un tenant vecino y afirma que solo se leen las referencias aprobadas. | Prueba la función de dominio con `fakeDb`; no prueba por sí sola el wrapper ni autenticación/autorización. |
| PR #636 (snapshot histórico), `functions/src/platform/commercial-callable.emulator.test.ts` (no integrado en la base) | En el head `5756fcb32dc91764f610989b345f248226b3876d`, contiene nueve casos de callable con Firestore Emulator: no autenticado; facultad ausente; operador canónico ausente; operador suspendido; UID canónico divergente; contexto obsoleto; entradas ausentes, de tipo incorrecto o vacías; lectura aprobada sin mutación comercial ni filtración de sentinels de credenciales o tenant vecino; código no aprobado. El paso dedicado del run `39952474302` terminó con 9 pruebas, 9 aprobadas, 0 fallidas y 0 omitidas; el workflow completo también concluyó `success`. | PR #636 sigue abierto y sus cambios no forman parte de `origin/main`. La evidencia es del head del PR en Emulator, no de staging. En el límite callable aún no cubre campos adicionales, longitud/ASCII, errores inesperados sanitizados, el orden de lecturas ni fallo del escritor de auditoría. |
| `functions/src/platform/authorization.test.ts` | Prueba autorización con operador activo, UID/facultad/contexto válidos y denegaciones por operador o contexto. | Prueba el helper aislado; no prueba que la callable invoque el helper ni el side effect de auditoría. |
| `functions/src/platform/approved-tenant-offers.test.ts` | Prueba que comandos de oferta resuelven términos desde la allowlist y rechazan campos comerciales aportados por el cliente. | No demuestra que el wrapper de consulta rechace campos adicionales: no pasa el request completo al resolver. |
| `functions-commercial/src/discovery.test.ts` | Prueba targets, región, cardinalidad observada, manifest sin params y nombres de Secrets ausentes. | Es evidencia de discovery local; no acredita deploy, IAM ni estado remoto. |

La autorización denegada llama `registrarHechoAuditoria`, que crea y emite
una obligación de auditoría. Por tanto, la interpretación propuesta de
**solo lectura** es: no modificar estado comercial de oferta, tenant,
suscripción o Trial; la única escritura permitida es el evento de seguridad
append-only de una denegación. Si el requisito humano fuera cero escrituras de
cualquier tipo, incluida auditoría, esta Opción A no puede aceptarse sin una
decisión arquitectónica adicional sobre ese comportamiento.

## Decisión adoptada — Opción A (2026-10-23)

Se autorizan exactamente dos exports en `saas-commercial`:

1. `ejecutarComandoComercialSaas`, manteniendo el contrato, los controles y
   el alcance ya aceptados por ADR-SAAS-043.
2. `consultarOfertaComercialTenantSaas`, como consulta administrativa
   limitada por ADR-SAAS-061 y las condiciones de esta ADR.

No se autoriza una tercera callable. Cualquier export adicional requiere una
nueva decisión arquitectónica.

### Contrato y límites de `consultarOfertaComercialTenantSaas`

1. **Solo lectura de negocio.** Una llamada autorizada puede leer el documento
   canónico de control y la oferta aprobada de un tenant. No crea, aprueba,
   modifica, revoca ni consume ofertas; no muta tenant, suscripción, Trial o
   Bootstrap; no invoca una operación comercial mutante. Se permite únicamente
   la auditoría append-only de una denegación producida por el helper de
   autorización compartido.
2. **Autenticación.** Requiere una identidad autenticada de Firebase. Una
   llamada anónima debe fallar antes de cualquier lectura de oferta.
3. **Autorización.** Requiere que el operador canónico esté activo, que su UID
   corresponda al autenticado, que el contexto de autorización del token esté
   vigente y que el operador tenga `COMERCIAL_GOBERNAR`. Esta es una
   facultad global de plataforma conforme a ADR-SAAS-061, no autorización por
   membresía de tenant. El tenant queda limitado separadamente por la
   aprobación allowlisted resuelta en servidor.
4. **Entrada.** El request aceptado tiene exactamente una propiedad:
   `codigoAprobacion`, string ASCII no vacío de hasta 64 bytes y coincidente
   exactamente con una entrada aprobada del allowlist server-side. Se rechazan
   propiedades adicionales y cualquier intento de aportar
   `empresaId`, `ofertaId`, nombre, Plan, periodicidad, precio, moneda,
   vigencia o referencia de aprobación. El cliente no selecciona el tenant ni
   los términos.
5. **Vinculación e aislamiento tenant.** El código aprobado determina en
   servidor el par `empresaIdObjetivo/ofertaId`. La consulta solo accede a
   sus referencias canónicas. Debe rechazar, de forma cerrada, un control cuya
   identidad o puntero no corresponda a la ruta, y una oferta cuyos IDs,
   referencia, Plan, periodicidad o precio no coincidan con la aprobación
   durable. No se aceptan IDs arbitrarios ni se consultan tenants vecinos.
6. **Respuesta mínima.** Se devuelve únicamente la autorización aprobada, el
   estado de la oferta como proyección explícita, la revisión del control y el
   puntero de oferta activa que el contrato administrativo requiera. No se
   serializa el documento Firestore completo ni se devuelven credenciales,
   tokens, Secrets, datos personales innecesarios o campos internos.
7. **Errores.** Las entradas inválidas usan error de argumento inválido; la
   ausencia de identidad usa error de no autenticado; falta de facultad usa
   denegación; código no aprobado o estado persistido inconsistente falla
   cerrado como precondición incumplida. Los errores inesperados de Firestore
   o runtime no deben revelar paths, contenido de documentos, credenciales,
   stack ni detalles internos. La respuesta no debe convertir un fallo parcial
   en una lectura exitosa.
8. **Región y superficie.** La callable permanece en `us-central1`; el
   manifiesto declara exactamente los dos exports autorizados y cero Secrets
   y cero parámetros sensibles, preservando el objetivo secret-free de
   ADR-SAAS-043.

La evaluación inicial de los límites del wrapper quedó registrada para el head histórico
`5756fcb32dc91764f610989b345f248226b3876d` de PR #636. En ese head la suite tenía
nueve casos; en esa instantánea aún no cubría validación estricta de campos,
ASCII/longitud, sanitización de errores, orden de lecturas ni fallo del escritor
de auditoría. Esa observación no describe el head actual.

**Actualización de evidencia (2026-10-23).** El head actual de PR #636 es
`77af89e71e37e20c227ff54be7b2fd8f5c5ae6c8`. La suite callable de Firestore
Emulator pasó 10/10; las pruebas unitarias inyectadas del contrato pasaron 6/6;
`test:auth-foundation` terminó con 494 aprobadas, 0 fallidas y 25 omitidas. El CI
completo de ese head, [run #39981847145](https://github.com/Glemynart/micafe-pos/actions/runs/39981847145),
terminó `success`, incluidos build web/Functions, build y discovery secret-free
de Commercial, Emulator de la callable y las suites E2E/E4.1/E4.2. El código y
las pruebas de esa rama cubren ahora campos adicionales y ASCII/límite de
entrada, autorización antes de la lectura, auditoría denegada fail-closed,
errores inesperados sanitizados, proyección permitida, ausencia de escrituras
comerciales y tenant vecino sin exposición ni mutación.

PR #636 continúa abierto y sus cambios no están integrados en `origin/main`. La
evidencia anterior prueba ese head en CI y Emulator, no el runtime remoto ni
staging. La prueba `commercial-offer-read.test.ts` verifica las referencias
exactas leídas con un `fakeDb`; la prueba callable en Emulator verifica
aislamiento observable y ausencia de mutaciones, pero no instrumenta cada
lectura interna del wrapper. La conformidad del código queda pendiente de
integración y revisión; no se autoriza despliegue por esta evidencia.

## Opción B conservada como alternativa

Mantener literalmente ADR-SAAS-043: `saas-commercial` solo declara
`ejecutarComandoComercialSaas`. Antes de cualquier despliegue de este
codebase, una propuesta separada tendría que retirar la segunda callable de
esa frontera o asignarla a otra autoridad, definiendo ownership, consumidores,
compatibilidad y migración. Esta ADR no propone ejecutar ese cambio.

- **Consecuencia:** preserva sin excepción la decisión aceptada y evita ampliar
  el codebase.
- **Riesgo/costo:** requiere una decisión de arquitectura y cambios de
  compatibilidad adicionales; una reubicación apresurada podría romper
  consumidores o duplicar autoridad.

## Justificación de la decisión

La Opción A es la resolución documental mínima que alinea la frontera de
oferta aprobada por ADR-SAAS-061 con los dos exports presentes en el candidato,
sin inferir que el código aprobó su propia arquitectura. Mantiene una sola
frontera comercial, acota la cardinalidad a dos operaciones nombradas y
conserva las demás restricciones de aislamiento de ADR-SAAS-043.

La decisión incorpora expresamente que “solo lectura” excluye mutaciones
comerciales, pero permite la escritura de auditoría de seguridad ante una
denegación. Si una política futura exige cero escrituras de cualquier clase,
incluida auditoría, deberá abrirse otra decisión arquitectónica antes de cambiar
ese comportamiento.

## Criterios de aceptación arquitectónica

La arquitectura solo se considerará conforme después de que se cumplan todos
estos puntos:

1. La decisión arquitectónica de esta ADR está aceptada, incluido el límite de
   auditoría denegada; esto resuelve la cardinalidad, pero no acredita la
   implementación.
2. ADR-SAAS-043 contiene una nota trazable que limita la supersession a la
   cardinalidad y mantiene vigentes sus demás restricciones.
3. `saas-commercial` descubre exactamente las dos callables aprobadas en
   `us-central1`, sin parámetros ni Secrets.
4. El endpoint respeta autenticación, `COMERCIAL_GOBERNAR`, allowlist,
   validación de request, tenant binding y respuesta mínima descritos arriba.
5. La consulta exitosa no escribe estado de negocio; una denegación solo puede
   añadir el evento de auditoría permitido.
6. El código, pruebas, manifiestos y documentación describen la misma
   cardinalidad y frontera. Un build verde por sí solo no basta.

## Pruebas requeridas antes de considerar un despliegue

Un PR de implementación posterior —solo tras la aceptación de esta ADR— deberá
demostrar como mínimo:

- **Discovery/package:** exports exactos, `FUNCTION_TARGET` correcto,
  región `us-central1`, cero Secrets y cero params sensibles.
- **Autenticación y autoridad de callable:** no autenticado; operador
  inexistente/inactivo; UID no coincidente; contexto obsoleto; facultad ausente;
  permiso válido. Verificar que la autorización ocurra antes de cualquier
  lectura de oferta.
- **Auditoría denegada:** la denegación falla cerrada; el único efecto
  persistente permitido es la evidencia de seguridad append-only y un fallo de
  su escritor no concede acceso.
- **Validación de entrada:** propiedad ausente, tipo incorrecto, vacío,
  longitud fuera del límite, código desconocido y campos adicionales,
  especialmente cualquier campo que intente fijar tenant u oferta.
- **Tenant binding:** aprobación a otro tenant, ID de oferta divergente,
  control con empresa/puntero inválido, oferta con tenant/ID/Plan/periodicidad/
  precio/referencia divergentes y tenant vecino sin lectura. Verificar la ruta
  exacta de los documentos leídos.
- **Respuesta y privacidad:** solo campos permitidos; propiedades internas,
  credenciales y datos no incluidos en el contrato nunca aparecen.
- **Solo lectura comercial:** en el camino autorizado no se llama a métodos de
  escritura ni a comandos mutantes, Bootstrap, consumo o revocación. Comprobarlo
  con mocks/fakes y una prueba pertinente con Firestore Emulator.
- **Errores:** códigos estables para los casos previstos y error inesperado
  sanitizado; no filtrar path, documento, stack ni dato sensible.
- **Regresión:** preservar contratos y suites del ejecutor y confirmar que el
  cambio no incorpora Imports o Secrets de capacidades ajenas.

Las pruebas unitarias de autorización, proyección/tenant binding y discovery,
junto con la cobertura parcial de la callable propuesta en PR #636, no
satisfacen por sí solas la matriz anterior. El resultado verde de ese PR es
evidencia de su head y su ejecución en Emulator, no de `main`, staging ni de
conformidad arquitectónica.

## Gate de despliegue separado

La aceptación de esta ADR permitiría preparar un PR técnico; no autoriza
despliegue. Antes de autorizar una ejecución en staging se requerirían:

1. PR técnico integrado o aprobado para revisión operativa, con auditoría de
   arquitectura y seguridad, pruebas aplicables verdes y SHA exacto.
2. Preflight read-only actualizado del proyecto destino, Functions existentes,
   codebases, IAM, revisión/traffic y plan Firebase CLI; detenerse ante
   eliminación, colisión, cambio de identidad o permisos no aprobados.
3. Artefacto y manifiesto vinculados al SHA candidato y evidencia de rollback/
   recuperación para el endpoint existente.
4. Autorización operativa independiente, entorno y ventana explícitos.
5. Si se autoriza staging, verificación posterior de revisión/target, dos
   exports, cero Secrets y smoke únicamente de lectura. No invocar operaciones
   mutantes como smoke.

La publicación en producción requiere una autorización posterior, específica e
independiente, más el preflight productivo vigente y los gates de release de
ADR-SAAS-043/063/083. Esta ADR y su eventual aceptación no conceden esa
autorización.

## Estados que no se deben confundir

- **Build y pruebas:** acreditan los bytes y checks concretos ejecutados.
- **Decisión arquitectónica:** aceptada para la cardinalidad y los límites
  descritos en ADR-SAAS-086.
- **Conformidad arquitectónica:** permanece pendiente hasta que el código,
  manifiesto y pruebas demuestren todos los criterios y gates de esta ADR.
- **Autorización de despliegue:** no concedida por este ADR, su aprobación, el
  merge de un PR documental ni un CI verde.

El checkpoint de Goal registra el preflight histórico de App Hosting en
`39aa469…`, distinto del candidato de entonces `0ccaddf…`. Esta propuesta
no usa esa observación para afirmar estado actual ni alineación de staging.
Cualquier preflight de despliegue deberá repetirse para el SHA y entorno
efectivamente autorizados.

## Fuera de alcance

- Cambiar exports, callable, contratos, permisos, datos, Rules, IAM, Secrets,
  manifiestos o despliegues.
- Crear, aprobar, revocar o consumir ofertas; crear tenant; ejecutar Bootstrap
  o iniciar Trial.
- Autorizar invocaciones remotas, tráfico, staging, producción o el acceso de
  Diana.
- Declarar listo Gate I, E2.2, el tenant o cualquier entorno.

## Revisión y aprobación

El usuario delegó expresamente el 2026-10-23 al Lead Engineer la elección de
la alternativa más conveniente; en ejercicio de esa autorización se adoptó
la Opción A, incluida su excepción limitada de auditoría. La decisión está
tomada y registrada aquí. El PR sigue sujeto a su revisión y merge normales. El
merge, CI verde, pruebas de discovery y presencia de código no demuestran por
sí solos conformidad arquitectónica. Ningún despliegue de `saas-commercial`
queda autorizado por esta aceptación.
