# G-SAAS-02 — Evidencia de transporte REST de recovery — 2026-08-14

## Estado

TRANSPORTE_LISTO_ESPERANDO_BACKUP

Esta evidencia certifica únicamente que el operador puede consultar el
servicio de backups mediante Firestore Admin REST y que el guard no solicita
restore si el backup no es observable. No certifica un punto de recovery ni un
restore exitoso.

- Proyecto: micafe-pos
- Base origen: (default)
- Ubicación: southamerica-east1
- SHA observado: origin/main @ 649c092230c3f554f6ae89f7a827d45195b2af30
- Tenant: Café Atrato (1ae0rD9H8t3ZFSBKrrHR)
- Observado: 2026-08-14 (sesión read-only)
- Escrituras de tenant: false
- Inicio del Trial anual: no iniciado

## Preflight read-only

La sesión OAuth existente de Firebase CLI se utilizó en memoria y no se
imprimió ni se guardó ningún token.

- GET /v1/projects/micafe-pos/locations/southamerica-east1/backups: HTTP 200.
- Firebase CLI reportó: No backups found.
- El schedule observable permanece:
  projects/micafe-pos/databases/(default)/backupSchedules/fa16b7c4-ecb8-418f-bf3a-815da592fabc.
- Frecuencia: diaria.
- Retención: 3024000s (35 días).
- GET de empresas/1ae0rD9H8t3ZFSBKrrHR: HTTP 200.
- GET de suscripciones/1ae0rD9H8t3ZFSBKrrHR: HTTP 200.
- GET de la subcolección suscripciones/1ae0rD9H8t3ZFSBKrrHR/relaciones:
  HTTP 200.

## Guard REST

El runner scripts/g-saas-02/recovery-restore.ts usa Firestore Admin REST
cuando FIREBASE_ACCESS_TOKEN está entregado fuera de Git. El transporte
corresponde al método oficial projects.databases.restore; el token no se
imprime ni se persiste en la evidencia.

La ejecución controlada contra un identificador de backup inexistente produjo:

    backupObservationTransport: REST
    backupDescribeHttpStatus: 400
    status: BACKUP_NOT_OBSERVED
    restoreInvoked: false
    verificationRequired: false

El guard rechazó continuar y no ejecutó ninguna escritura de restore. El
HTTP 400 corresponde al identificador de prueba inexistente; no se interpreta
como observación de un backup real.

## Resultado

    RECOVERY_CONFIGURATION_OBSERVED = PASS
    RECOVERY_REST_TRANSPORT_OBSERVED = PASS
    RECOVERY_POINT_OBSERVED = PENDING_FIRST_SCHEDULED_BACKUP
    RECOVERY_INDEPENDENT_ATTESTATION = PENDING_RESTORE_TEST
    TENANT_WRITE_OBSERVED = false

Cuando aparezca un backup real, se debe ejecutar el guard contra ese recurso,
verificar la operación de restore y la base nueva aislada, medir RPO/RTO y
publicar la atestación independiente. Esta evidencia no autoriza iniciar el
Trial anual ni modificar el tenant histórico.

Referencia del proveedor:
https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases/restore
