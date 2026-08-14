# ADR-SAAS-031 — Política de recovery productivo para el Trial

## Estado

**Propuesto.** Este ADR registra la decisión operativa pendiente para poder
certificar recovery en G-SAAS-02. No autoriza todavía cambios de configuración,
creación de backups, restauraciones ni escrituras productivas.

- **Goal:** `G-SAAS-02`
- **Milestone / Epic:** `M4 / E4.2`
- **Tenant de referencia:** Café Atrato (`1ae0rD9H8t3ZFSBKrrHR`)
- **ADRs relacionados:** `ADR-SAAS-028`, `ADR-SAAS-029`
- **Evidencia relacionada:** `docs/goals/evidence/G-SAAS-02-RELEASE-EVIDENCE-2026-08-14-FUNCTIONS.md`

## Contexto observado

La auditoría read-only del proyecto `micafe-pos`, cuya base está en
`southamerica-east1`, confirmó:

- `pointInTimeRecoveryEnablement = POINT_IN_TIME_RECOVERY_DISABLED`;
- cero schedules de backup;
- cero backups observables;
- el Trial anual todavía no ha comenzado.

El runbook de G-SAAS-02 exige un punto de recuperación antes de cualquier
escritura de transición y un ensayo de restore antes de declarar recovery
verificable. La CI de emulator no sustituye la evidencia productiva.

## Decisión pendiente

Seleccionar una política productiva que defina explícitamente:

1. mecanismo: PITR, backup programado o ambos;
2. frecuencia y retención;
3. ubicación y destino aislado del ensayo de restore;
4. RPO/RTO aceptables para el Trial de 30 días;
5. responsable operativo, evidencia y rollback;
6. aceptación del costo recurrente.

## Alternativas

### A. PITR como mecanismo único

Habilitar PITR en `(default)` y ejecutar un ensayo de recuperación usando un
destino aislado autorizado. Tiene operación simple y protege frente a errores
puntuales, pero la ventana y el costo dependen del servicio y debe comprobarse
que cubren el RPO/RTO del Trial.

### B. Backups programados diarios con retención contractual — recomendada

Crear un schedule diario con retención definida para cubrir como mínimo la
ventana operativa de 30 días y restaurar una copia en un destino aislado. Hace
explícitos la frecuencia, la retención y la evidencia de restore, pero introduce
costo de almacenamiento y una política que debe aceptar el Product Owner.

### C. PITR y backups programados

Combina recuperación granular y copia independiente, con mayor resiliencia,
complejidad y costo. Solo se justifica si el RPO/RTO o el riesgo comercial lo
requieren.

## Recomendación

Adoptar **B** para el Trial: backup diario, retención aprobada para cubrir sus
30 días, restore de prueba en un destino aislado y evidencia sin datos
innecesarios. PITR puede añadirse como defensa complementaria si el Product
Owner acepta el costo y el RPO/RTO lo justifican.

La recomendación no se considera aceptación. No se ejecutará
`firestore:databases:update` ni `firestore:backups:schedules:create` hasta que
la política quede aceptada.

## Criterios de aceptación

- política elegida y retención/frecuencia aprobadas;
- destino aislado y procedimiento de restore definidos;
- RPO/RTO y responsable registrados;
- comandos read-only de preflight ejecutados antes del cambio;
- backup o PITR observable después del cambio;
- restore de prueba exitoso, con integridad, aislamiento y rollback verificados;
- evidencia publicada sin secretos ni datos completos del tenant.

## Consecuencias

Mientras este ADR siga `Propuesto`, el release global de G-SAAS-02 permanece
`INCOMPLETE` y no se autoriza iniciar el Trial anual ni materializar la relación
contractual. El smoke productivo requiere además una cuenta/ventana de prueba
segura y se mantiene como gate independiente.
