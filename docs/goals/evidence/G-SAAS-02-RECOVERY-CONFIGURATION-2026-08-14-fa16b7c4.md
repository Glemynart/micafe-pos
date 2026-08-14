# G-SAAS-02 — Evidencia de configuración de recovery — 2026-08-14

## Estado

`CONFIGURADO_ESPERANDO_PRIMER_BACKUP`

La política aceptada en `ADR-SAAS-031` quedó configurada para la base
`(default)`. El primer backup todavía no es observable, por lo que el restore,
la medición de RPO/RTO y la atestación independiente de recovery permanecen
pendientes.

- **Proyecto:** `micafe-pos`
- **Base origen:** `(default)`
- **Ubicación:** `southamerica-east1`
- **SHA de código observado:** `origin/main @ 60ee6653091649eb22198a1b7f311ecdba582e23`
- **Tenant:** Café Atrato (`1ae0rD9H8t3ZFSBKrrHR`)
- **Escrituras de tenant:** `false`
- **Inicio del Trial anual:** no iniciado

## Preflight read-only

Antes de configurar el schedule se verificó:

- sesión Firebase CLI autenticada;
- base `(default)` existente en `southamerica-east1`;
- `pointInTimeRecoveryEnablement = POINT_IN_TIME_RECOVERY_DISABLED`;
- billing habilitado (`HTTP 200`, `billingEnabled = true`);
- cero schedules existentes;
- cero backups observables.

La comprobación de billing se ejecutó mediante la sesión OAuth existente sin
imprimir ni guardar tokens. El fallo local de certificado de `gcloud` no alteró
la verificación ni la configuración: Firebase CLI autenticó y ejecutó la
operación correctamente.

## Cambio autorizado

Se creó el único schedule previsto por `ADR-SAAS-031`:

- **ID:** `fa16b7c4-ecb8-418f-bf3a-815da592fabc`
- **Recurso:** `projects/micafe-pos/databases/(default)/backupSchedules/fa16b7c4-ecb8-418f-bf3a-815da592fabc`
- **Frecuencia:** diaria
- **Retención:** `3024000s` (`35 días`)
- **Creado:** `2026-08-14T13:34:14.218278Z`
- **PITR:** no habilitado

La verificación posterior observó exactamente un schedule con esos valores.
La base origen no fue reemplazada y no se modificó ningún documento del
tenant.

## Backup y restore pendientes

La lectura posterior a la creación devolvió cero backups. El servicio no
ofrece un comando de creación manual de backups en las herramientas disponibles
(`firebase firestore:backups` y `gcloud firestore backups`); por tanto, el
restore no se fuerza ni se simula.

La sintaxis del restore quedó verificada con:

```text
gcloud firestore databases restore \
  --source-backup=projects/micafe-pos/locations/southamerica-east1/backups/BACKUP_ID \
  --destination-database=gsaas02-recovery-20260814
```

Cuando aparezca el primer backup, se usará una base nueva
`gsaas02-recovery-20260814` en la misma ubicación, sin sobrescribir `(default)`
ni cambiar el tráfico de la aplicación. Solo después se medirán integridad,
aislamiento, RPO y RTO, y se publicará la atestación independiente.

## Resultado de esta ejecución

`RECOVERY_CONFIGURATION_OBSERVED = PASS`

`RECOVERY_POINT_OBSERVED = PENDING_FIRST_SCHEDULED_BACKUP`

`RECOVERY_INDEPENDENT_ATTESTATION = PENDING_RESTORE_TEST`

El smoke productivo continúa siendo un gate independiente. Esta evidencia no
autoriza el inicio del Trial anual, no reinicia el Trial histórico y no
autoriza escrituras de transición del tenant antes del `2026-09-02`.
