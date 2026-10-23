# ADR-SAAS-086 — Resolución de cardinalidad de `saas-commercial` y consulta de oferta

## Estado

**Propuesto — pendiente de revisión y aprobación humana explícita.**

La autorización recibida el 2026-10-23 permite preparar la Opción A como
propuesta documental. No acepta este ADR, no cambia ADR-SAAS-043 ni autoriza
implementación, despliegue, invocación remota u operaciones comerciales.

- **Fecha de propuesta:** 2026-10-23.
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

Si se acepta la Opción A, esta ADR **supersede únicamente** la restricción de
ADR-SAAS-043 que limita `saas-commercial` a una callable. ADR-SAAS-043
conserva sus demás controles de frontera, discovery, Secrets, región,
preflight y despliegue. Hasta esa aceptación, ADR-SAAS-043 sigue vigente y la
diferencia con el export actual permanece abierta.

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
| `functions/src/platform/commercial-offer-read.test.ts` | Prueba allowlist, referencias leídas, proyección de respuesta, rechazo de aprobación desconocida, control/tenant/puntero inválidos y schemaVersion. El cambio de prueba incluido en PR #636 siembra además un tenant vecino y afirma que solo se leen las referencias aprobadas. | Prueba la función de dominio, no el wrapper callable ni el comportamiento A/B a través de Firestore Emulator. |
| PR #636, `functions/src/platform/commercial-callable.emulator.test.ts` (no integrado en la base) | En el head `4b5d8a19a4cd7dd6d4146169412369775cd1a1f8`, contiene nueve casos de callable con Firestore Emulator: no autenticado; facultad ausente; operador canónico ausente; operador suspendido; UID canónico divergente; contexto obsoleto; entradas ausentes, de tipo incorrecto o vacías; lectura de oferta aprobada sin mutación comercial ni filtración del sentinel; código no aprobado. El paso dedicado del run `39940320433` terminó con 9 pruebas, 9 aprobadas, 0 fallidas y 0 omitidas; el workflow completo también concluyó `success`. | PR #636 sigue abierto y sus cambios no forman parte de `origin/main`. La evidencia es del head del PR en Emulator, no de staging. En el límite callable aún no cubre campos adicionales, longitud/ASCII, errores inesperados sanitizados, tenant A/B ni fallo del escritor de auditoría; la prueba A/B del helper no sustituye esa cobertura. |
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

## Decisión solicitada — Opción A

Autorizar exactamente dos exports en `saas-commercial`:

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

La evidencia estática confirma algunos controles del contrato actual, pero no
todos. PR #636 aporta cobertura directa del wrapper en Emulator para los nueve
casos descritos en la tabla; el paso dedicado registró 9 aprobados, 0 fallidos
y 0 omitidos, y el workflow completo concluyó `success`. Como el PR sigue
abierto, esa evidencia no está integrada en `origin/main` y no acredita el
comportamiento remoto. La prueba de dominio de lectura sí cubre referencias
exactas y un tenant vecino sintético, pero no invoca la callable. Permanecen
sin demostrar la validación estricta del objeto de entrada (incluidos campos
adicionales, ASCII y longitud máxima), el manejo sanitizado de errores
inesperados, el aislamiento A/B a través de la callable y el orden de lecturas
del wrapper. La auditoría de denegación cubre varios motivos de rechazo, pero
no demuestra aún el comportamiento ante fallo del escritor de auditoría.

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

## Recomendación

Recomiendo la Opción A, pendiente de aprobación. Es el cambio documental mínimo
que permite alinear la frontera de oferta aprobada por ADR-SAAS-061 con los dos
exports presentes en el candidato, sin inferir que el código aprobó su propia
arquitectura.

La recomendación depende de que quien apruebe acepte expresamente que “solo
lectura” excluye mutaciones comerciales, pero permite la escritura de auditoría
de seguridad ante una denegación. La revisión debe rechazar o pausar esta opción
si requiere cero escrituras de auditoría.

## Criterios de aceptación arquitectónica

La arquitectura solo se considerará conforme después de que se cumplan todos
estos puntos:

1. Aprobación humana expresa de la Opción A, incluido el límite de auditoría
   denegada; el estado de esta ADR cambia a `Aceptado` solo después de esa
   decisión.
2. ADR-SAAS-043 se sincroniza mediante una nota/enmienda trazable que indique
   que su cardinalidad fue supersedida solo para permitir estos dos exports;
   sus demás restricciones permanecen vigentes.
3. `saas-commercial` descubre exactamente las dos callable aprobadas en
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
- **Conformidad arquitectónica:** permanece pendiente mientras esta propuesta
  no se acepte y mientras no se demuestren los controles requeridos.
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

La persona responsable debe aceptar expresamente la Opción A y su excepción
limitada de auditoría, elegir la Opción B o proponer otra resolución. El merge
de este PR, el CI verde, las pruebas de discovery y la presencia de código no
constituyen aceptación. Hasta que exista esa decisión, ADR-SAAS-043 conserva
precedencia y ningún despliegue de `saas-commercial` queda autorizado.
