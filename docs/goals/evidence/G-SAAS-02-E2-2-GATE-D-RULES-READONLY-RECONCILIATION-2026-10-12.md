# G-SAAS-02 / M2 / E2.2 — Gate D: reconciliación read-only de Rules de staging (2026-10-12)

## Dictamen

`STAGING_FIRESTORE_RULES_PARITY = PASS` para el release activo observado en
`micafe-pos-staging`: el contenido desplegado coincide exactamente, tras
normalizar saltos de línea, con `firestore.rules` de `main` en
`ecd2bcc48ee4888b7493b810a8f54b6a5e8127ad`. La lectura demuestra el estado
actual y su compatibilidad con la compra canónica posterior; no afirma que este
agente ejecutara el despliegue ni certifica por sí sola el rechazo remoto de
escrituras directas.

Gate I de producción permanece bloqueado por divergencias independientes y no
se hizo ninguna mutación productiva.

## Identidad y fuentes

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos-staging`.
- **`main` observado:** `ecd2bcc48ee4888b7493b810a8f54b6a5e8127ad` (merge de
  PR #560; cambio documental respecto del SHA de producción observado en la
  evidencia Gate I).
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

La lectura read-only del inventario de Functions de staging encontró
`registrarCompraBodegaV1` y no encontró `registrarCompraOperativaV1`. La
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
  - Se evaluaron `create` y `delete` sobre rutas sintéticas de
    `/compras/{id}`, con expectativa `DENY` y un contexto de autenticación
    simulado (`rol=admin`, tenant `E2_2-BODEGA-STAGING-FIXTURE`).
  - `exists()` y `get()` se simularon para que la configuración del tenant
    devolviera `vertical=BODEGA_MVP1`; las dos evaluaciones terminaron
    `SUCCESS`, sin `debugMessages`, y visitaron las expresiones de denegación
    de `allow create` (línea 205) y `allow delete` (línea 207), ambas `false`.
  - Firebase informó la advertencia no bloqueante `Unused function:
    esMarketing`; no hubo errores de evaluación. La prueba no creó, borró ni
    modificó documentos de negocio.
- La pestaña Edge del admin de staging quedó autenticada en `/admin/compras`,
  pero no se registró una compra ni se hizo una llamada directa desde ese
  cliente.
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
  simulados; no es una solicitud de Firestore autenticada por un usuario real.
- `BODEGA_DIRECT_WRITE_DENIAL_CLIENT_SMOKE = NOT RUN`: no se intentó crear ni
  borrar `/compras` desde el cliente autenticado de Edge. La prueba remota
  sintética, Rules Emulator `42/42` y la revisión del diff son evidencia de la
  política, pero no reemplazan ese smoke de extremo a extremo.
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

**Resultado:** el estado remoto de Rules de staging queda reconciliado con el
código actual. No se declara Gate I ni el Goal completos.
