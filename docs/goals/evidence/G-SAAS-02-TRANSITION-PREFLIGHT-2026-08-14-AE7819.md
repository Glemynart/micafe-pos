# G-SAAS-02 — Preflight read-only de transición — 2026-08-14

## Resultado

```text
observedAt: 2026-08-14T14:35:14.044Z
projectId: micafe-pos
tenantId: 1ae0rD9H8t3ZFSBKrrHR
mainSha: ae7819b45acbbb8014398c53b0bd135742d068c3
asOf: 2026-08-14
readOnly: true
productionWrites: false
commandExecutionAllowed: false
status: ESPERAR_VENTANA
readyForCanonicalCommands: false
```

La lectura fue ejecutada contra el Firestore productivo usando únicamente
solicitudes `GET`; la credencial se entregó fuera del repositorio y no se
imprimió ni se guardó en la evidencia.

## Hallazgos

| Código | Severidad | Resultado |
|---|---|---|
| `PROJECT_CONFIRMED` | PASS | Proyecto `micafe-pos`. |
| `TENANT_IDENTITY_CONFIRMED` | PASS | Café Atrato, CO. |
| `ROOT_HISTORICAL_SUBSCRIPTION_INTACT` | PASS | Raíz plan v1, fechas `2026-08-03`–`2026-09-02`, sin snapshot. |
| `HISTORIC_TRIAL_STILL_OPEN` | WAITING | La ventana histórica permanece protegida hasta `2026-09-02`. |
| `ANNUAL_PLAN_CONFIRMED` | PASS | Plan v2 publicado, ANUAL, `1.800.000 COP`, nueve capacidades. |
| `HISTORIC_CONFIGURATION_INTACT` | PASS | Se conservan los siete módulos históricos. |
| `NO_CONTRACTUAL_RELATION_EXISTS` | PASS | No existe relación anual previa. |
| `OPERATOR_AUTHORITY_CONFIRMED` | PASS | Operador activo con `COMERCIAL_GOBERNAR` y `LIFECYCLE_GOBERNAR`. |
| `RELEASE_EVIDENCE_COMPLETE` | PASS | SHA, CI, Functions, Rules, Storage y Vercel referenciados. |
| `RECOVERY_EVIDENCE_PRESENT` | PASS | Recovery configurado y documentado en ADR-SAAS-031. |

## Conclusión

El preflight confirma que el tenant sigue intacto y listo para la ventana
contractual, pero no autoriza comandos porque el Trial histórico aún está
abierto. No existe relación anual materializada, no se reinició el Trial y no
se modificó ningún documento productivo.

La evidencia de recovery confirma únicamente la configuración del schedule;
el primer backup, el restore aislado, la medición de RPO/RTO y la atestación
independiente siguen pendientes.
