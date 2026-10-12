# G-SAAS-02 / M2 / E2.2 — Gate D: reconciliación read-only de Rules de staging (2026-10-12)

## Dictamen

`GATE_D_STAGING = PASS` para el corte de compras Bodega en
`micafe-pos-staging`: Functions y Rules están activas, los índices requeridos
están `READY`, la compra canónica posterior confirmó la ruta autorizada y las
evaluaciones remotas con contexto admin sintético denegaron create/delete de
Bodega, preservando create/delete para otro vertical. La regla activa coincide
exactamente, tras normalizar saltos de línea, con `firestore.rules` de
`main @ d5328125efb01fe15da08ad3f426c4b4c7100d5a`. No se hizo una escritura
directa desde el cliente Edge, ya que una regresión podría persistir una compra;
la prueba API de Rules fue no mutante y usó contexto sintético.

Gate I de producción permanece bloqueado por divergencias independientes y no
se hizo ninguna mutación productiva.

## Identidad y fuentes

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos-staging`.
- **`main` observado:** `d5328125efb01fe15da08ad3f426c4b4c7100d5a` (PR #560 y
  #570 ya integrados; ambos cambios posteriores relevantes para Rules fueron
  documentales).
- **Release activa:** `projects/micafe-pos-staging/releases/cloud.firestore`.
- **Ruleset activo:**
  `projects/micafe-pos-staging/rulesets/72d0ba53-83a4-443d-80c4-6db682a96553`.
- **`updateTime`:** `2026-10-11T14:56:13.380503Z`.
- **SHA-256 normalizado remoto y local:**
  `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`.
- **Registro de auditoría de Rules:** CreateRuleset a las
  `2026-10-11T14:56:12.342748Z` y UpdateRelease a las
  `2026-10-11T14:56:12.934777Z`. Este reconocimiento no atribuye esos eventos
  al agente que redacta esta evidencia.

## Reconciliación del corte

El preflight anterior de ADR-SAAS-072 observó el ruleset previo
`30df41d0-bd59-4c91-80ea-65576afd436b`, cuyo contenido todavía no incluía el
corte de escrituras directas. En el release actualmente activo, el hash del
contenido remoto es igual al de `firestore.rules` en el SHA vivo de `main`.
PR #560 solo cambió documentación; no modificó el artefacto de Rules.

La lectura read-only de `us-central1` encontró 44 Functions: las 44 están
Gen2, `ACTIVE`, Node.js 22. `registrarCompraBodegaV1` está presente y
`registrarCompraOperativaV1` no aparece. También hay 11 índices compuestos y
los 11 están `READY`. La
conciliación funcional independiente de Gate F registra que, después del
`updateTime` del release de Rules, la compra sintética del fixture se confirmó
por la callable Bodega y produjo un único recibo, auditoría y movimiento de
inventario. La compra ocurrió a `2026-10-11T17:45:36Z`; dejó tres unidades
físicas disponibles y continúa persistida en staging. Véanse [Gate D deploy de
compras](G-SAAS-02-E2-2-GATE-D-PURCHASES-STAGING-DEPLOY-2026-10-11.md) y [la
conciliación de Gate F](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md).

## Alcance de la verificación

- Consultas read-only del release y ruleset activos de Firestore en staging.
- Comparación del contenido normalizado con `firestore.rules` del `main`
  observado.
- Consulta read-only del inventario de Functions, logs de auditoría y evidencia
  ya existente de la compra canónica posterior.
- Prueba sintética contra el ruleset activo con la API de Rules, sin enviar
  operaciones de escritura a Firestore:
  - Para el tenant Bodega se evaluaron `create` y `delete` sobre rutas
    sintéticas de `/compras/{id}`, con expectativa `DENY` y contexto de
    autenticación simulado (`rol=admin`, tenant
    `E2_2-BODEGA-STAGING-FIXTURE`).
  - `exists()` y `get()` se simularon para que la configuración del tenant
    devolviera `vertical=BODEGA_MVP1`; las dos evaluaciones terminaron
    `SUCCESS`, sin `debugMessages`, y visitaron las expresiones de denegación
    de `allow create` (línea 205) y `allow delete` (línea 207), ambas `false`.
  - Para preservar ADR-SAAS-072 fuera de Bodega, se repitieron los dos métodos
    con un tenant sintético `RESTAURANTE`, autenticación admin y estado de
    empresa `trial`. Ambos casos terminaron `SUCCESS`, sin `debugMessages`, y
    visitaron `allow create`/`allow delete` con valor `true`.
  - Firebase informó la advertencia no bloqueante `Unused function:
    esMarketing`; no hubo errores de evaluación. La prueba no creó, borró ni
    modificó documentos de negocio.
- La sesión Edge actual se comprobó en el preview indicado para la revalidación,
  pero el navegador todavía mostró `/admin/login?from=%2Fadmin%2Fcompras`.
  Por eso no se cuenta como una nueva inspección autenticada. El PASS visual
  que completa Gate D es el checkpoint previo posterior al deploy de índices,
  documentado en [revalidación autenticada de Compras](G-SAAS-02-E2-2-GATE-D-PURCHASES-UI-2026-10-11.md).
- Lecturas REST de solo lectura del tenant confirmaron
  `configuraciones/E2_2-BODEGA-STAGING-FIXTURE.vertical=BODEGA_MVP1` y
  `empresas/E2_2-BODEGA-STAGING-FIXTURE.estado=trial`, coincidentes con los
  valores usados por los mocks.
- Sin deploy de Rules/Functions, escrituras de negocio, cambios IAM/Secrets,
  Auth, fixtures, datos de clientes, tenant real ni producción durante este
  reconocimiento.

## Límites y trabajo restante

- `STAGING_FIRESTORE_RULES_PARITY = PASS` describe paridad de fuente/release.
- `BODEGA_DIRECT_WRITE_DENIAL_RULES_API_SIMULATION = PASS` describe una
  evaluación sintética del ruleset remoto activo con claims y lecturas
  simulados; se confirmó tanto la denegación Bodega como la compatibilidad de
  otro vertical.
- `BODEGA_DIRECT_WRITE_DENIAL_CLIENT_SMOKE = NOT RUN`: no se intentó enviar una
  escritura desde Edge porque una regresión podría persistir una compra y el
  alcance de esta revisión excluía cambios de datos. Este smoke no forma parte
  de los criterios de Gate D (deploy staging); no se usa como evidencia de
  denegación desde un token real. El control de política se respalda por Rules
  Emulator y evaluación remota sintética; la UI read-only autenticada posterior
  al deploy se documenta por separado, en el checkpoint previo de #548.
- La evaluación utilizó el endpoint de pruebas de la [Firebase Rules REST
  API](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test)
  sobre el ruleset staging observado, con identidad autenticada sintética y
  lecturas de configuración simuladas. No se usó una credencial Firebase real
  del admin en las solicitudes `projects.test`.
- La compra canónica posterior prueba que la ruta autorizada continuó operando;
  no prueba todos los roles, verticales o casos de rechazo de Rules.
- En producción, el ruleset observado aún diverge del SHA de `main`, según el
  [reconocimiento read-only de Gate I](G-SAAS-02-E2-2-GATE-I-PRODUCTION-READONLY-RECONNAISSANCE-2026-10-12.md).
  Esta evidencia de staging no autoriza copiar el corte a producción.

**Resultado:** Gate D staging queda `PASS` con evidencia del ruleset remoto,
inventario de Functions/índices, evaluación de autorización para Bodega y
compatibilidad del otro vertical, y compra canónica posterior. No se declara
Gate I ni el Goal completos.
