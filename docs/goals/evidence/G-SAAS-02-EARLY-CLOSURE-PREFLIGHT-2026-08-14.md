# G-SAAS-02 - Preflight de cierre anticipado de Cafe Atrato

- **Fecha de observacion:** 2026-08-14 UTC
- **Proyecto:** `micafe-pos`
- **Tenant:** Cafe Atrato - `1ae0rD9H8t3ZFSBKrrHR`
- **SHA observado:** `origin/main @ 05f70a84c98a0f30bda3b1151552e541b1e46135`
- **Decision:** `G-SAAS-02-PO-DECISION-CIERRE-ANTICIPADO-2026-08-14`
- **ADR:** `ADR-SAAS-032-cierre-anticipado-trial-historico.md`

## Decision de Product Owner

Cafe Atrato es el primer cliente real. Se solicita cerrar el Trial mensual
historico actualmente vigente y continuar con la transicion al contrato anual.
El cierre debe usar `TransicionarSuscripcion` con destino `canceled`; no se
debe invocar `suspenderTrialVencido` con una fecha futura ni editar Firestore
directamente.

## Estado productivo read-only

| Recurso | Estado observado |
|---|---|
| Empresa | `activa`, revision `2`, nombre `Cafe Atrato`, pais `CO` |
| Suscripcion raiz | `trialing`, `mvp_comercial` v1, revision `1` |
| Fechas historicas | `2026-08-03` a `2026-09-02` |
| Snapshot raiz | ausente, como exige el contrato historico |
| Configuracion | revision `3`, siete capacidades historicas |
| Plan anual | publicado, `ANUAL`, `1.800.000 COP`, nueve capacidades |
| Relaciones contractuales | ninguna |
| Operador | activo con `COMERCIAL_GOBERNAR` y `LIFECYCLE_GOBERNAR` |

## Resultado del preflight

La ruta de preflight anticipada quedó implementada y probada. Con la referencia
de decision explicita puede devolver `LISTO_PARA_CIERRE_ANTICIPADO`; siempre
mantiene `readOnly=true`, `productionWrites=false` y
`commandExecutionAllowed=false`.

La ejecucion productiva se mantiene detenida por estos gates verificables:

1. `ADR-SAAS-031`: existe el schedule diario de 35 dias, pero el listado
   productivo aun devuelve **cero backups observables**. Por tanto no existe
   atestacion independiente de recovery ni un punto de rollback apto para la
   escritura del tenant.
2. La callable productiva exige un Firebase ID token del operador. El token
   OAuth de Firebase CLI solo sirve para lecturas administrativas y fue
   rechazado por la callable como `UNAUTHENTICATED`; no se sustituyó por una
   escritura directa ni por un bypass de autorizacion.
   El preflight anticipado ahora comprueba esa identidad con la callable
   read-only `consultarContextoPlataforma` mediante `FIREBASE_OPERATOR_ID_TOKEN`;
   la fila activa de `saas_operadores` no se considera suficiente.
3. El CI post-merge de SHA `05f70a8` terminó en verde (`31844323881`).

## Escrituras realizadas

Ninguna. No se canceló la suscripcion, no se creó relacion contractual, no se
modificó la Empresa y no se cambió la configuracion.

## Siguiente accion autorizada

Cuando exista un backup observable y el operador pueda invocar la callable con
su identidad Firebase real, ejecutar el envelope idempotente de
`TransicionarSuscripcion(trialing -> canceled)`, verificar inmediatamente la
raiz historica y continuar con `CrearRelacionContractualTrial` solo si todos
los gates del preflight siguen en PASS.
