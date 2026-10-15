# ADR-SAAS-084 — Semántica y versionado de auditoría del control de compras

## Estado

**ACEPTADO — 2026-10-15.** El aprobador autorizado aceptó explícitamente la decisión completa en el hilo de trabajo. Esta aceptación fija el contrato documental, pero no autoriza implementación, despliegues ni escrituras remotas.

- **Fecha de propuesta:** 2026-10-15.
- **Fecha de aceptación:** 2026-10-15.
- **Última revisión documental:** 2026-10-15.
- **Supersede parcialmente:** ADR-SAAS-012 §§2.2, 3.1 y 3.2, exclusivamente para el contrato de evidencia de la familia `CONTROL_RELEASE_COMPRAS` definido aquí. El alcance de la supersesión y la compatibilidad histórica v1 se detallan en “Versionado de la evidencia”; el resto de ADR-SAAS-012 permanece vigente sin cambios.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial` / Gate I.
- **Relacionados:** [ADR-SAAS-012](ADR-SAAS-012-auditoria-plataforma-evidencia-no-repudio.md), [ADR-SAAS-060](ADR-SAAS-060-auditoria-membresia-bodega-staging.md) y [ADR-SAAS-081](ADR-SAAS-081-pausa-tecnica-compras-corte-rules.md).
- **Alcance:** contrato y clasificación de evidencias emitidas por `transicionarPausaComprasSaas`, y contrato de aclaración histórica append-only.
- **Fuera de alcance:** implementación, cambios de Functions o Rules, despliegues, escrituras remotas, compras, pausas/reanudaciones, facultades, operadores, tenants y datos de Diana.

## Contexto y observaciones contractuales

ADR-SAAS-081 define la inicialización explícita del control, incluida la transición de revisión `0 → 1`, y exige una obligación de auditoría durable. La callable canónica es `transicionarPausaComprasSaas`.

El código inspeccionado clasifica actualmente la evidencia por el estado destino: `PAUSADA` produce `COMPRAS_PAUSADAS` y cualquier otro destino produce `COMPRAS_REANUDADAS`. Por tanto, crear por primera vez el control en `ACTIVA` puede quedar descrito falsamente como reanudación. La evidencia ya emitida es append-only y no se corregirá in-place.

ADR-SAAS-012 establece que los campos no enumerados se rechazan, fija `schemaVersion: 1` para el contrato de evidencia vigente y exige un `schemaVersion` nuevo si cambia el esquema. También define `causacionId` como ID de una intención/proceso causal previo —nunca el `evidenciaId` de la propia evidencia—, y exige timestamps de servidor para `ocurrioEn` y `registradoEn`.

Hay además una divergencia contractual vigente: ADR-SAAS-012 §3.1 no enumera `COMPRAS_PAUSADAS` ni `COMPRAS_REANUDADAS`, y §3.2 no enumera `CONTROL_RELEASE_COMPRAS`, aunque el código ya los escribe. ADR-SAAS-081 requiere obligación de auditoría pero no modifica esas listas. ADR-SAAS-060 aceptó otros valores de tipo/agregado, pero no declara que toda extensión sea compatible con `schemaVersion: 1` ni constituye una excepción implícita a ADR-SAAS-012. La decisión aceptada aquí resuelve esa divergencia solo para la familia de control de compras y no afirma que los registros históricos hubieran cumplido retroactivamente el contrato anterior.

## Decisión aceptada

### Semántica de eventos

Las evidencias de transición confirmada se clasifican por el hecho y el estado anterior, no solo por el destino:

| Estado previo | Resultado confirmado | Tipo de evidencia |
|---|---|---|
| Control inexistente; `expectedRevision: 0` | Creación del control en `ACTIVA` o `PAUSADA` | `COMPRAS_CONTROL_INICIALIZADO` |
| `ACTIVA` | Transición real a `PAUSADA` | `COMPRAS_PAUSADAS` |
| `PAUSADA` | Transición real a `ACTIVA`, con la atestación exigida por ADR-SAAS-081 | `COMPRAS_REANUDADAS` |

La creación inicial en `PAUSADA` es inicialización, no una pausa: no existe un estado anterior `ACTIVA`. Solo se permite si el contrato vigente de la callable admite esa transición y se satisfacen sus controles.

Un conflicto de revisión, un destino inválido, una transición redundante, un comando sin cambio de estado o un replay idempotente no produce una nueva evidencia de transición con ninguno de esos tres tipos. El replay devuelve el resultado durable y la evidencia ya asociada, si la hay; nunca inventa una transición nueva. Cuando otro requisito contractual obligue a registrar una denegación o conflicto, ese hecho debe usar su tipo y resultado propios, sin etiquetarlo como pausa, reanudación o inicialización confirmada.

La categoría correctiva `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA` definida más abajo es una anotación sobre la calidad semántica de evidencia previa; no es una transición del control, no cambia `estado` ni `revision`, y nunca se cuenta como inicialización, pausa o reanudación.

### Versionado de la evidencia

Se adopta `schemaVersion: 2` para toda nueva evidencia de la familia del control de compras, incluidos `COMPRAS_CONTROL_INICIALIZADO`, `COMPRAS_PAUSADAS`, `COMPRAS_REANUDADAS` y `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA`. La nueva categoría, la habilitación explícita de los tipos existentes y el agregado usado por la familia son una evolución contractual; no se presume que añadir valores a los enums sea compatible con v1.

La supersesión de ADR-SAAS-012 queda limitada a lo siguiente: (a) para nueva evidencia v2 de esta familia, sustituye el valor fijo `1` de §2.2 por `schemaVersion: 2` y define los contratos `detalle` de esta sección; (b) añade los tres tipos de transición y la categoría correctiva a la taxonomía de §3.1; (c) permite `CONTROL_RELEASE_COMPRAS` en §3.2; y (d) permite leer, sin reescritura, evidencias v1 históricas de esta familia que ya contienen los tipos/agregado de compras como compatibilidad de legado. Esa lectura no declara conformidad retroactiva ni permite nuevas escrituras v1. Las demás familias y valores de ADR-SAAS-012 permanecen sin cambios. La copia anidada de la evidencia en la obligación se rige por la versión de evidencia así delimitada; la versión exterior de obligación permanece 1.

| Documento o evidencia | Versión y tratamiento adoptados |
|---|---|
| Evidencias históricas existentes de cualquier familia | Se conservan exactamente con el `schemaVersion` persistido. Las evidencias de compras ya emitidas como v1 siguen siendo v1; no se reescriben, migran ni reinterpretan en almacenamiento. |
| Nuevas evidencias del control de compras | v2, con el contrato de esta ADR una vez implementado y validado. |
| Otras familias de evidencia | Conservan la versión contractual que ya tengan; esta ADR no las migra a v2. |
| Documento externo `saas_auditoria_obligaciones` | Mantiene `schemaVersion: 1`: su esquema exterior no cambia. |
| Campo anidado `obligacion.evidencia` | Lleva la versión de la evidencia que materializará: v2 para una nueva transición del control; v1 para obligaciones históricas. No se cambia la versión exterior por inferencia. |

El contrato v2 adoptado conserva los campos base de ADR-SAAS-012 §2.2, con `schemaVersion: 2`, y define para esta familia `agregado.tipo = CONTROL_RELEASE_COMPRAS` y `detalle` como objeto permitido con `estado` (`ACTIVA` o `PAUSADA`) y `fingerprint`, más `verificacionRelease` únicamente cuando corresponda según ADR-SAAS-081. Esta última conserva solo `functionArtifactSha`, `rulesetHash` y `releaseReferencia`. No se admiten otros campos en `detalle`; tipos, límites, presencia condicional y validación deben quedar codificados antes de emitir v2. Los valores existentes de `detalle` en registros v1 se tratan como datos históricos del escritor, no como permiso para ampliar silenciosamente el esquema v1.

Para evitar que el contrato quede abierto a interpretación, los objetos `detalle` de v2 tienen formas cerradas:

| Tipo | Campos exactos de `detalle` |
|---|---|
| `COMPRAS_CONTROL_INICIALIZADO`, `COMPRAS_PAUSADAS`, `COMPRAS_REANUDADAS` | `estado`: `ACTIVA` o `PAUSADA`; `fingerprint`: SHA-256 hexadecimal minúsculo de 64 caracteres; `verificacionRelease`: objeto opcional solo para reanudación, con exactamente `functionArtifactSha` y `rulesetHash` (SHA-256 hexadecimal minúsculo de 64 caracteres cada uno) y `releaseReferencia` (1–128 caracteres según `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/` de `exigirId`). Si no aplica, `verificacionRelease` se omite; nunca se escribe como `null`. |
| `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA` | `evidenciaOriginalId`: UUID del documento original; `tipoOriginal`: tipo persistido en el documento fuente; `tipoCorregido`: `COMPRAS_CONTROL_INICIALIZADO`; `revisionOriginal`: objeto exacto `{ esperada: 0, resultante: 1 }`; `estadoDestinoOriginal`: `ACTIVA`; `ocurrioEnOriginal`: timestamp servidor copiado sin alteración de la evidencia fuente. |

Para la aclaración descrita en esta ADR, los valores deben ser `tipoOriginal: COMPRAS_REANUDADAS`, `tipoCorregido: COMPRAS_CONTROL_INICIALIZADO`, `revisionOriginal: { esperada: 0, resultante: 1 }` y `estadoDestinoOriginal: ACTIVA`. La categoría correctiva se limita a esta clasificación histórica semánticamente incorrecta cuya fuente demuestra esos valores. No representa una mutación del control ni reemplaza el documento original.

El código actual valida `verificacionRelease` mediante `exigirId`, pero no valida que los campos llamados SHA tengan forma SHA-256. El contrato v2 adoptado es más estricto; esa validación debe incorporarse y probarse antes de emitir evidencias v2. Esta ADR no afirma que la restricción ya esté implementada.

Los lectores deben:

1. conservar y validar `schemaVersion` antes de proyectar el documento;
2. leer v1 según el contrato histórico aplicable y v2 según el contrato explícito de esta ADR;
3. mantener legibles los eventos históricos v1, incluidos los tipos que ya se persistieron para esta familia;
4. rechazar o mostrar explícitamente como no soportada una versión desconocida; no degradarla a v1, omitirla ni reinterpretar su tipo;
5. conservar en las proyecciones los campos contractuales necesarios, incluidos `schemaVersion` y, para v2, `detalle`.

La inspección del lector actual encontró que la lista de saneamiento de consultas conserva `tipo` pero no `schemaVersion` ni `detalle`. El endpoint de consulta proyecta documentos mediante ese saneamiento y las pantallas de historial/auditoría presentan el valor de tipo sin un `switch` exhaustivo localizado; el filtro de tipo acepta una cadena. No se encontró un validador runtime que rechace tipos desconocidos en esos consumidores. Esto demuestra tolerancia de presentación, no compatibilidad contractual con v2. Antes de implementar el escritor v2 se requerirá actualizar y probar las proyecciones/lectores afectados. No se confirmó el comportamiento de consumidores externos al repositorio.

La obligación anidada continúa siendo la copia completa e inmutable de la evidencia definida por ADR-SAAS-012, excepto `registradoEn`, con su `schemaVersion` propio dentro de `evidencia`. La obligación exterior conserva su clave de deduplicación y versión 1. El escritor canónico debe reservar, persistir y emitir de forma coherente la evidencia v2 sin alterar la semántica append-only.

## Aclaración histórica append-only

La evidencia original permanece intacta. Una aclaración futura, únicamente después de implementar y validar el contrato y obtener autorización operativa separada, deberá crear nueva evidencia mediante el escritor canónico; no se ejecuta ni autoriza esa escritura aquí.

El contrato adoptado para una futura reconciliación exige:

| Campo | Valor contractual adoptado |
|---|---|
| `schemaVersion` | `2`. |
| `evidenciaId` | UUID nuevo, igual al ID del documento correctivo y distinto del ID original. |
| `tipo`, `resultado` | `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA`, `CONFIRMADO` (confirma que la anotación quedó durable, no una mutación del control). |
| `origen`, `actor`, `facultad` | Derivados de la sesión/autorización real a través del mecanismo canónico; no se fabrican. Un proceso `SISTEMA` debe usar la combinación permitida por ADR-SAAS-012. La facultad operativa exacta para emitir esta corrección se determina por separado; no se infiere de ADR-SAAS-060/081. |
| `comando` | `{ id: <nuevo commandId>, tipo: "AclararClasificacionAuditoriaCompras" }`; es un comando correctivo nuevo, distinto del causal original. |
| `agregado`, `empresaObjetivoId` | `{ tipo: CONTROL_RELEASE_COMPRAS, id: <empresaId original> }` y el mismo `empresaId`, respectivamente. |
| `revision` | `{ esperada: null, resultante: null }`; la anotación no muta el control. La revisión histórica se conserva solo en `detalle.revisionOriginal`. |
| `correlacionId`, `causacionId` | Correlación original y command/process ID causal original, solo cuando sean verificables. `causacionId` nunca es el ID de evidencia. |
| `motivo` | Código `CORRECCION_SEMANTICA_AUDITORIA` y resumen factual acotado conforme ADR-SAAS-012. |
| `soporte` | `null`, salvo que se ejecute realmente bajo un flujo de soporte aprobado; no se presume ese contexto. |
| `detalle` | Exactamente el esquema de `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA` definido en la tabla v2; incluye `evidenciaOriginalId`, tipo original/corregido, revisión/destino originales y timestamp original. |
| `ocurrioEn`, `registradoEn` | Timestamps asignados por el servidor canónico; el primero es la creación real de esta anotación y el segundo su emisión. El timestamp original se preserva separado como `detalle.ocurrioEnOriginal`. |

El documento original conserva íntegros su ID, tipo, transición y timestamps; la nueva evidencia no lo actualiza, reemplaza ni elimina.

- `evidenciaId`: UUID nuevo, único y propio de la anotación, igual al ID de su nuevo documento y distinto del ID de la evidencia original;
- un comando correctivo nuevo, con su propio `comando.id`, distinto del comando original;
- `causacionId` igual al ID verificable del comando/proceso causal original, nunca al ID del documento de evidencia;
- una referencia inequívoca al documento original, por ejemplo `detalle.evidenciaOriginalId`, sin confundirla con `causacionId`;
- la correlación original cuando esté verificada, y los datos históricos verificables: revisión `0 → 1` y destino `ACTIVA`;
- `ocurrioEn` y `registradoEn` generados por el mecanismo de timestamp de servidor al registrar la aclaración. El tiempo histórico del evento original, si se conserva como dato de contexto, será un campo distinto y claramente nombrado, nunca el `ocurrioEn` de la aclaración ni un timestamp falsificado;
- una explicación de que la clasificación histórica fue semánticamente imprecisa y de que la nueva anotación no afirma que hubo pausa o reanudación.

**Contrato aceptado, implementación pendiente:** la categoría `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA` y el esquema exacto de `detalle` quedan adoptados por esta ADR y por su supersesión acotada de ADR-SAAS-012. No pueden emitirse hasta que un PR técnico implemente y valide el contrato, incluidos escritor, lectores, versionado y persistencia append-only. La autorización operativa para una futura escritura es independiente. No se reutilizará `COMPRAS_CONTROL_INICIALIZADO` para la aclaración.

Si no puede verificarse el comando causal o el ID de la evidencia original, la aclaración no se emite hasta resolver la referencia; nunca se inventan identificadores para completar el registro.

El contrato mínimo de la anotación está aceptado como decisión arquitectónica, pero no implementado. Una futura ejecución requiere que el PR técnico correspondiente esté integrado y que exista autorización operativa independiente; si no se pueden verificar el comando causal o el ID original, la anotación no se emite.

## Compatibilidad, cambios necesarios y pruebas para una implementación posterior

Antes de emitir v2, un PR técnico separado deberá actualizar el contrato compartido, el escritor canónico y las proyecciones/lectores que consumen evidencia. La revisión deberá confirmar que:

- validadores y serializadores aceptan v1 histórico y v2 solo para los tipos/contratos aprobados;
- la proyección del Backoffice conserva versión y campos permitidos, y distingue versiones desconocidas;
- filtros y consultas de auditoría siguen paginados y no ocultan evidencias v2;
- el outbox conserva `schemaVersion: 1` exterior y la evidencia anidada completa lleva la versión correcta;
- replay, conflicto de fingerprint/revisión y fallos de emisión no producen tipos semánticamente falsos ni duplican obligaciones/evidencias;
- tipo, revisión, correlación, comando causal, actor, atestación y timestamps concuerdan entre control, recibo, obligación y evidencia.

Pruebas mínimas:

1. Inicialización `0 → 1` a `ACTIVA` y a `PAUSADA`: tipo de inicialización, evidencia/obligación coherentes y evidencia anidada v2.
2. Transición `ACTIVA → PAUSADA`: solo evento de pausa v2.
3. Transición `PAUSADA → ACTIVA` con atestación válida: solo evento de reanudación v2.
4. Replay idéntico, revisión obsoleta, conflicto de idempotencia, transición redundante y destino inválido: sin nueva evidencia de transición engañosa.
5. Persistencia y correlación del control, comando, recibos, obligación exterior v1, evidencia anidada v2 y documento emitido.
6. Lectura de fixtures v1 históricos y v2; manejo visible/rechazo explícito de versión desconocida en cada lector aplicable.
7. Prueba de concurrencia con transacciones reales del emulador o mecanismo admitido, no solo llamadas secuenciales sobre un fake.
8. Para el contrato correctivo aceptado: prueba de los enlaces entre comando correctivo, `causacionId` original, `evidenciaOriginalId`, correlación y timestamps de servidor, preservando el documento original.

Esta ADR no afirma que esas pruebas ya se ejecutaron.

## Alternativas

1. **Mantener v1 y añadir únicamente el tipo.** No recomendada: ADR-SAAS-012 exige versión nueva para una evolución contractual, y ADR-SAAS-060 no documenta una excepción.
2. **Migrar o reescribir evidencias históricas a v2.** Rechazada: contradice append-only y altera la historia.
3. **Etiquetar la inicialización como pausa o reanudación.** Rechazada: atribuye una transición que no necesariamente ocurrió.
4. **Emitir una aclaración correctiva reutilizando el tipo de inicialización sin contrato propio.** Rechazada: puede confundir una anotación con otra inicialización y no referencia inequívocamente el documento corregido.
5. **Evolucionar a v2 solo la familia de control de compras y preservar v1 histórico.** Adoptada: versiona el contrato afectado y mantiene lectura retrospectiva sin migración masiva.

## Consecuencias y límites

- La implementación deberá coordinar escritor y lectores; hasta entonces v2 no debe emitirse.
- Los informes que filtran solo por `COMPRAS_PAUSADAS` o `COMPRAS_REANUDADAS` deberán decidir si incorporan inicializaciones sin cambiar el significado de los filtros históricos.
- ADR-SAAS-060 se conserva como precedente de extensión de taxonomía, no como dispensa del versionado.
- El rollback de código puede revertir la clasificación para eventos futuros, pero no reescribe evidencias ya emitidas. No existe rollback del historial append-only.
- La aceptación de esta ADR no autoriza implementar, desplegar Functions o Rules, ni corregir evidencia remota. Esas acciones requieren sus propios cambios, pruebas y autorizaciones.

## Referencias contractuales verificadas

- ADR-SAAS-012 §2.2 y §3.1: esquema exacto, versiones y taxonomía.
- ADR-SAAS-012 §4, §5 y Anexo A.1: append-only, timestamps, causalidad y versión fija del documento exterior de obligación.
- ADR-SAAS-060: extensión aceptada de tipos y agregado de membresía, sin excepción explícita de `schemaVersion`.
- ADR-SAAS-081: callable canónica, revisión, idempotencia, atestación de reanudación y obligación durable.
- `functions/src/platform/audit.ts`: escritor y serializador actuales.
- `functions/src/platform/purchase-release-control.ts`: clasificación actual de transiciones.
- `functions/src/platform/queries.ts`: saneamiento/proyección actual de recursos de plataforma.
