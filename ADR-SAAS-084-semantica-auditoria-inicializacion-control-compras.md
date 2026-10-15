# ADR-SAAS-084 — Semántica y versionado de auditoría del control de compras

## Estado

**PROPUESTO — pendiente de aceptación formal.** Esta propuesta no modifica código ni evidencia remota y no autoriza despliegues o escrituras.

- **Fecha de propuesta:** 2026-10-15.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial` / Gate I.
- **Relacionados:** [ADR-SAAS-012](ADR-SAAS-012-auditoria-plataforma-evidencia-no-repudio.md), [ADR-SAAS-060](ADR-SAAS-060-auditoria-membresia-bodega-staging.md) y [ADR-SAAS-081](ADR-SAAS-081-pausa-tecnica-compras-corte-rules.md).
- **Alcance:** contrato y clasificación de evidencias emitidas por `transicionarPausaComprasSaas`, y propuesta de aclaración histórica append-only.
- **Fuera de alcance:** implementación, cambios de Functions o Rules, despliegues, escrituras remotas, compras, pausas/reanudaciones, facultades, operadores, tenants y datos de Diana.

## Contexto y observaciones contractuales

ADR-SAAS-081 define la inicialización explícita del control, incluida la transición de revisión `0 → 1`, y exige una obligación de auditoría durable. La callable canónica es `transicionarPausaComprasSaas`.

El código inspeccionado clasifica actualmente la evidencia por el estado destino: `PAUSADA` produce `COMPRAS_PAUSADAS` y cualquier otro destino produce `COMPRAS_REANUDADAS`. Por tanto, crear por primera vez el control en `ACTIVA` puede quedar descrito falsamente como reanudación. La evidencia ya emitida es append-only y no se corregirá in-place.

ADR-SAAS-012 establece que los campos no enumerados se rechazan, fija `schemaVersion: 1` para el contrato de evidencia vigente y exige un `schemaVersion` nuevo si cambia el esquema. También define `causacionId` como ID de una intención/proceso causal previo —nunca el `evidenciaId` de la propia evidencia—, y exige timestamps de servidor para `ocurrioEn` y `registradoEn`.

Hay además una divergencia contractual vigente: ADR-SAAS-012 §3.1 no enumera `COMPRAS_PAUSADAS` ni `COMPRAS_REANUDADAS`, y §3.2 no enumera `CONTROL_RELEASE_COMPRAS`, aunque el código ya los escribe. ADR-SAAS-081 requiere obligación de auditoría pero no modifica esas listas. ADR-SAAS-060 aceptó otros valores de tipo/agregado, pero no declara que toda extensión sea compatible con `schemaVersion: 1`, no documenta una excepción a ADR-SAAS-012 ni la supersede expresamente. Esta propuesta hace visible la divergencia y somete a aceptación una corrección contractual explícita; no afirma que los registros históricos hubieran cumplido las listas vigentes.

## Decisión propuesta

### Semántica de eventos

Las evidencias de transición confirmada se clasifican por el hecho y el estado anterior, no solo por el destino:

| Estado previo | Resultado confirmado | Tipo de evidencia |
|---|---|---|
| Control inexistente; `expectedRevision: 0` | Creación del control en `ACTIVA` o `PAUSADA` | `COMPRAS_CONTROL_INICIALIZADO` |
| `ACTIVA` | Transición real a `PAUSADA` | `COMPRAS_PAUSADAS` |
| `PAUSADA` | Transición real a `ACTIVA`, con la atestación exigida por ADR-SAAS-081 | `COMPRAS_REANUDADAS` |

La creación inicial en `PAUSADA` es inicialización, no una pausa: no existe un estado anterior `ACTIVA`. Solo se permite si el contrato vigente de la callable admite esa transición y se satisfacen sus controles.

Un conflicto de revisión, un destino inválido, una transición redundante, un comando sin cambio de estado o un replay idempotente no produce una nueva evidencia de transición con ninguno de esos tres tipos. El replay devuelve el resultado durable y la evidencia ya asociada, si la hay; nunca inventa una transición nueva. Cuando otro requisito contractual obligue a registrar una denegación o conflicto, ese hecho debe usar su tipo y resultado propios, sin etiquetarlo como pausa, reanudación o inicialización confirmada.

### Versionado de la evidencia

Se propone `schemaVersion: 2` para toda nueva evidencia de la familia del control de compras, incluidos `COMPRAS_CONTROL_INICIALIZADO`, `COMPRAS_PAUSADAS` y `COMPRAS_REANUDADAS`. La nueva categoría, la habilitación explícita de los tipos existentes y el agregado usado por la familia son una evolución contractual; no se presume que añadir valores a los enums sea compatible con v1.

Si se acepta esta ADR, su efecto contractual queda limitado a lo siguiente: (a) para evidencia v2 de esta familia, sustituye el valor fijo `1` de ADR-SAAS-012 §2.2 por `schemaVersion: 2` y define el campo adicional `detalle` que sigue; (b) añade los tres tipos de transición indicados a la taxonomía de §3.1; (c) permite `CONTROL_RELEASE_COMPRAS` en §3.2; y (d) permite leer sin reescritura las evidencias v1 históricas de esta familia que ya contienen esos tipos/agregado, como compatibilidad de legado. Esa lectura no declara conformidad retroactiva ni permite nuevas escrituras v1. Las demás familias y valores de ADR-SAAS-012 permanecen sin cambios. La copia anidada de la evidencia en la obligación se rige por la versión de evidencia así delimitada; la versión exterior de obligación permanece 1.

| Documento o evidencia | Versión y tratamiento propuestos |
|---|---|
| Evidencias históricas existentes de cualquier familia | Se conservan exactamente con el `schemaVersion` persistido. Las evidencias de compras ya emitidas como v1 siguen siendo v1; no se reescriben, migran ni reinterpretan en almacenamiento. |
| Nuevas evidencias del control de compras | v2, con el contrato de esta ADR tras su aceptación e implementación. |
| Otras familias de evidencia | Conservan la versión contractual que ya tengan; esta ADR no las migra a v2. |
| Documento externo `saas_auditoria_obligaciones` | Mantiene `schemaVersion: 1`: su esquema exterior no cambia. |
| Campo anidado `obligacion.evidencia` | Lleva la versión de la evidencia que materializará: v2 para una nueva transición del control; v1 para obligaciones históricas. No se cambia la versión exterior por inferencia. |

El contrato v2 propuesto conserva los campos base de ADR-SAAS-012 §2.2, con `schemaVersion: 2`, y define para esta familia `agregado.tipo = CONTROL_RELEASE_COMPRAS` y `detalle` como objeto permitido con `estado` (`ACTIVA` o `PAUSADA`) y `fingerprint`, más `verificacionRelease` únicamente cuando corresponda según ADR-SAAS-081. Esta última conserva solo `functionArtifactSha`, `rulesetHash` y `releaseReferencia`. No se admiten otros campos en `detalle`; tipos, límites, presencia condicional y validación deben quedar codificados antes de emitir v2. Los valores existentes de `detalle` en registros v1 se tratan como datos históricos del escritor, no como permiso para ampliar silenciosamente el esquema v1.

Los lectores deben:

1. conservar y validar `schemaVersion` antes de proyectar el documento;
2. leer v1 según el contrato histórico aplicable y v2 según el contrato explícito de esta ADR;
3. mantener legibles los eventos históricos v1, incluidos los tipos que existían antes de esta propuesta;
4. rechazar o mostrar explícitamente como no soportada una versión desconocida; no degradarla a v1, omitirla ni reinterpretar su tipo;
5. conservar en las proyecciones los campos contractuales necesarios, incluidos `schemaVersion` y, para v2, `detalle`.

La inspección del lector actual encontró que la lista de saneamiento de consultas conserva `tipo` pero no `schemaVersion` ni `detalle`. El endpoint de consulta proyecta documentos mediante ese saneamiento y las pantallas de historial/auditoría presentan el valor de tipo sin un `switch` exhaustivo localizado; el filtro de tipo acepta una cadena. No se encontró un validador runtime que rechace tipos desconocidos en esos consumidores. Esto demuestra tolerancia de presentación, no compatibilidad contractual con v2. Antes de implementar el escritor v2 se requerirá actualizar y probar las proyecciones/lectores afectados. No se confirmó el comportamiento de consumidores externos al repositorio.

La obligación anidada continúa siendo la copia completa e inmutable de la evidencia definida por ADR-SAAS-012, excepto `registradoEn`, con su `schemaVersion` propio dentro de `evidencia`. La obligación exterior conserva su clave de deduplicación y versión 1. El escritor canónico debe reservar, persistir y emitir de forma coherente la evidencia v2 sin alterar la semántica append-only.

## Aclaración histórica append-only

La evidencia original permanece intacta. Una aclaración futura, únicamente después de aceptación del contrato y autorización operativa separada, deberá crear nueva evidencia mediante el escritor canónico; no se ejecuta ni autoriza esa escritura aquí.

La propuesta de reconciliación exige:

- un comando correctivo nuevo, con su propio `comando.id`, distinto del comando original;
- `causacionId` igual al ID verificable del comando/proceso causal original, nunca al ID del documento de evidencia;
- una referencia inequívoca al documento original, por ejemplo `detalle.evidenciaOriginalId`, sin confundirla con `causacionId`;
- la correlación original cuando esté verificada, y los datos históricos verificables: revisión `0 → 1` y destino `ACTIVA`;
- `ocurrioEn` y `registradoEn` generados por el mecanismo de timestamp de servidor al registrar la aclaración. El tiempo histórico del evento original, si se conserva como dato de contexto, será un campo distinto y claramente nombrado, nunca el `ocurrioEn` de la aclaración ni un timestamp falsificado;
- una explicación de que la clasificación histórica fue semánticamente imprecisa y de que la nueva anotación no afirma que hubo pausa o reanudación.

**Decisión contractual pendiente:** ADR-SAAS-012 exige un tipo enumerado y un contrato exacto, pero no define la categoría ni el formato de una aclaración semántica. Por ello, esta propuesta no declara que la anotación pueda emitirse ya. Una aclaración que se materialice como evidencia canónica requiere una categoría/contrato propio, distinto de los tres eventos de transición; se recomienda someter a aceptación `COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA`, con versión 2 y campos explícitos para referenciar la evidencia original, conservar los hechos comprobados y explicar la clasificación corregida. La forma exacta de ese contrato queda pendiente de aprobación formal. Alternativas para la revisión: (a) aceptar esa categoría y definir el esquema exacto en esta ADR o en una ADR posterior; (b) adoptar otro contrato/versionado mediante ADR; o (c) no crear evidencia correctiva hasta una decisión posterior. Reutilizar `COMPRAS_CONTROL_INICIALIZADO` sin una marca contractual específica podría contarse como una segunda inicialización y se considera ambiguo; no se adopta por defecto.

Si no puede verificarse el comando causal o el ID de la evidencia original, la aclaración no se emite hasta resolver la referencia; nunca se inventan identificadores para completar el registro.

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
8. Si se acepta el contrato correctivo: prueba de los enlaces entre comando correctivo, `causacionId` original, `evidenciaOriginalId`, correlación y timestamps de servidor, preservando el documento original.

Esta ADR no afirma que esas pruebas ya se ejecutaron.

## Alternativas

1. **Mantener v1 y añadir únicamente el tipo.** No recomendada: ADR-SAAS-012 exige versión nueva para una evolución contractual, y ADR-SAAS-060 no documenta una excepción.
2. **Migrar o reescribir evidencias históricas a v2.** Rechazada: contradice append-only y altera la historia.
3. **Etiquetar la inicialización como pausa o reanudación.** Rechazada: atribuye una transición que no necesariamente ocurrió.
4. **Emitir una aclaración correctiva reutilizando el tipo de inicialización sin contrato propio.** No recomendada y pendiente de decisión: puede confundir una anotación con otra inicialización.
5. **Evolucionar a v2 solo la familia de control de compras y preservar v1 histórico.** Recomendada: versiona el contrato afectado y mantiene lectura retrospectiva sin migración masiva.

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
