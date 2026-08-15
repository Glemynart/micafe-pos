# G-SAAS-02 — Observación del primer backup y permisos de recovery — 2026-08-15

## Resultado

`RECOVERY_CONFIGURATION = PASS`

`FIRST_BACKUP = PENDING_WITHIN_INITIAL_DAILY_WINDOW`

`RECOVERY_INDEPENDENT_ATTESTATION = PENDING`

La observación es read-only. No se modificó el schedule, no se habilitó PITR,
no se solicitó restore y no se escribieron documentos de Café Atrato.

## Evidencia observada

- Proyecto: `micafe-pos`.
- Base: `(default)`.
- Ubicación: `southamerica-east1`.
- Tipo: `FIRESTORE_NATIVE`.
- `backupSchedulesEnabled = true`.
- Schedule observado: `fa16b7c4-ecb8-418f-bf3a-815da592fabc`.
- Frecuencia: diaria (`dailyRecurrence`).
- Retención: `3024000s` (`35 días`).
- `createTime` y vigencia efectiva: `2026-08-14T13:34:14.218278Z`.
- Backups observables en `southamerica-east1`: `0`.
- Backups observables en todas las ubicaciones del proyecto: `0`.
- Hora local de la observación: `2026-08-15T01:16:40-05:00` (`2026-08-15T06:16:40Z`).

Han transcurrido aproximadamente 16 h 42 min desde la creación del schedule.
La documentación oficial indica que el schedule queda efectivo desde
`createTime`, que no se puede fijar la hora exacta del backup y que los backups
diarios se toman en distintos momentos cada día. Por tanto, esta lectura aún
no demuestra un fallo del proveedor. La siguiente comprobación concluyente se
hará después de `2026-08-15T13:34:14Z`; si continúa en cero, se tratará como
incidencia operativa y se escalará con esta evidencia, sin recrear el schedule.

## Dependencia IAM detectada

La cuenta de servicio local
`micafe-pos-firebase-adminsdk-fbsvc` fue probada únicamente en memoria:

- Firestore Admin REST para listar schedules/backups: `HTTP 403`.
- `testIamPermissions` devolvió solamente `datastore.databases.getMetadata`
  entre los permisos de recovery consultados.
- No se observó `datastore.backups.list`, `datastore.backups.get`,
  `datastore.backups.restoreDatabase` ni `datastore.databases.create`.

La sesión autenticada de Firebase CLI observó correctamente el schedule y el
listado vacío. Para ejecutar el restore aislado, el transporte debe usar un
token de operador con permisos de recovery o un principal autorizado con,
como mínimo, `roles/datastore.restoreAdmin` y los permisos de lectura de
backups. No se amplió IAM automáticamente y no se imprimieron ni guardaron
tokens.

## Seguimiento read-only — 2026-08-15T08:40:29Z

- `origin/main`: `027a8170e5df547aca8789737b79a2361df93e23`.
- El schedule único permanece sin cambios y el listado de backups continúa en
  cero en `southamerica-east1`.
- El principal autenticado de Firebase CLI tiene `roles/owner` en el proyecto
  `micafe-pos`; la matriz oficial de permisos de Firestore incluye
  `datastore.backups.restoreDatabase` para Owner. El principal queda disponible
  para solicitar el restore cuando exista un backup `READY`.
- La cuenta de servicio local conserva sus roles previos y no se le concedió
  recovery.
- `RECOVERY_PRINCIPAL_READY = PASS`; `RECOVERY_INDEPENDENT_ATTESTATION = PENDING`.
- La verificación no obtuvo, imprimió ni persistió tokens y no ejecutó ninguna
  escritura de Firestore ni cambio de IAM.

## Siguiente ejecución segura

Cuando exista un backup `READY`:

1. validarlo por metadata y ubicación;
2. solicitar restore solo a `gsaas02-recovery-20260814`;
3. esperar la base destino y medir RTO;
4. comparar muestra mínima de integridad y aislamiento para medir RPO;
5. publicar atestación independiente;
6. repetir preflight antes de cualquier transición del tenant.

El Trial histórico de Café Atrato permanece intacto y no se inicia ni reinicia
el Trial anual mientras `RECOVERY` o `SMOKE` no estén en `PASS`.

Fuentes operativas del proveedor: [backup y restore de Firestore](https://cloud.google.com/firestore/docs/backups) y [roles y permisos de Firestore](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore).
