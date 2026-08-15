# ADR-SAAS-031 — Política de recovery productivo para el Trial

## Estado

**Aceptado.** La autorización explícita del Product
Owner para que Codex revise y resuelva este ADR permite adoptar la política
definida abajo. La aceptación autoriza configurar el mecanismo de recovery y
ejecutar su ensayo conforme a esta política; no autoriza todavía escrituras de
tenant, el inicio del Trial anual ni un restore sobre la base de origen.

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

## Observación read-only adicional — 2026-08-14

La sesión autenticada de Firebase CLI permitió verificar directamente, sin
mutaciones:

- `billingEnabled = true` para el proyecto `micafe-pos`;
- base `(default)` en `southamerica-east1`;
- `pointInTimeRecoveryEnablement = POINT_IN_TIME_RECOVERY_DISABLED`;
- cero schedules de backup y cero backups observables.

Billing habilitado elimina el bloqueo técnico para que el servicio pueda
configurarse, pero no constituye aceptación del costo recurrente ni autoriza
crear schedules, habilitar PITR o ejecutar restores. El costo depende del
volumen almacenado y de la política elegida y debe quedar expresamente
aceptado junto con RPO/RTO, retención, destino, responsable y rollback.

## Resultado de la revisión — 2026-08-14

**Decisión:** `ACEPTADO PARA EJECUCIÓN CONTROLADA`.

Se adopta la alternativa B con los valores operativos concretos de la sección
`Política aceptada`. La aceptación resuelve el mecanismo, la retención, el
RPO/RTO, el destino, el responsable, el rollback y el tratamiento del costo.
La configuración y el ensayo siguen sujetos al preflight read-only y a la
evidencia observable definidos en este ADR.

La revisión también verificó estas restricciones del servicio:

- los backups programados se restauran en una base nueva y permanecen en la
  misma ubicación que la base de origen;
- la retención máxima de un schedule es de 14 semanas;
- backups, PITR y operaciones de restore requieren billing habilitado fuera de
  la cuota gratuita.

Fuentes del proveedor: [backup y restore de Firestore](https://cloud.google.com/firestore/docs/backups),
[precios de Firestore](https://cloud.google.com/firestore/pricing?hl=en).

## Política aceptada

Para el Trial contractual de 30 días se adopta:

1. **Mecanismo:** backup programado de Firestore, una vez al día, sobre
   `(default)`; no se habilita PITR como parte de este ADR.
2. **Retención:** `35 días`, cubriendo los 30 días contractuales y un margen
   operativo de cinco días. Está dentro del máximo documentado de 14 semanas.
3. **RPO:** objetivo de `≤ 24 horas`, medido contra la marca de tiempo del
   backup observable más reciente antes de una operación autorizada.
4. **RTO:** objetivo de `≤ 4 horas`, medido desde la solicitud del restore
   hasta que la base restaurada pueda consultarse en el destino aislado. El
   ensayo debe registrar los timestamps reales; el objetivo no se declara
   cumplido por documentación solamente.
5. **Destino:** base nueva y aislada en el mismo proyecto `micafe-pos` y en
   `southamerica-east1`, conforme a la restricción del servicio. Nunca se
   restaura sobre `(default)`, nunca se cambia el tráfico de la aplicación al
   destino de ensayo y el acceso queda limitado al operador SaaS y soporte
   autorizado.
6. **Responsable:** responsable de plataforma/operador SaaS con acceso cloud
   explícitamente autorizado, acompañado por el responsable de
   soporte/operación del Trial. `CONSERVACION_GOBERNAR` sigue siendo la
   frontera de comandos de conservación del tenant y no se interpreta como
   permiso IAM para administrar Firestore. El responsable registra el comando,
   el backup, el destino, los timestamps y la verificación de aislamiento; no
   modifica directamente datos del tenant.
7. **Rollback:** la base de origen permanece intacta. Si el ensayo falla o
   queda incompleto, se conserva `(default)`, se revoca el acceso de ensayo,
   se aísla y elimina únicamente la base restaurada cuando la evidencia ya
   esté preservada, y se registra el incidente. No hay cutover ni rollback de
   datos productivos mediante escritura directa.
8. **Billing/costo:** `billingEnabled = true` fue verificado read-only. Se
   acepta el costo variable por uso de almacenamiento, operaciones y restore
   que produzca esta política durante el Trial, bajo la cuenta de billing ya
   asociada al proyecto. No se afirma un monto fijo: el valor depende del
   volumen y del uso real.
9. **Evidencia:** antes de configurar, preflight read-only del proyecto, base,
   billing y schedules; después, schedule observable, backup observable,
   restore exitoso, integridad mínima, aislamiento, RPO/RTO medidos y rollback
   documentado, sin secretos ni datos completos del tenant.

Antes del ensayo, `RECOVERY_INDEPENDENT_ATTESTATION` y
`RECOVERY_POINT_OBSERVED` permanecían pendientes y el Trial anual no se
iniciaba.

## Decisión resuelta

La política productiva queda resuelta como:

1. backup diario;
2. retención de 35 días;
3. RPO ≤ 24 horas y RTO ≤ 4 horas;
4. restore a una base nueva aislada en `micafe-pos/southamerica-east1`;
5. responsable de plataforma/operador SaaS con acceso cloud autorizado;
6. rollback sin tocar `(default)`;
7. costo variable aceptado bajo billing habilitado.

## Ejecución controlada y evidencia — 2026-08-15

La política aceptada se ejecutó después del preflight read-only, usando un
principal cloud autorizado y un destino nuevo. El origen `(default)` y el
tenant Café Atrato permanecieron intactos:

- Backup `b660289e-6ec3-4800-a191-b49294242c6f` en `READY`, snapshot
  `2026-08-15T09:37:49.256986Z`.
- Restore solicitado a `gsaas02-recovery-20260814` a las
  `2026-08-15T09:51:00.886Z`; operación `SUCCESSFUL` a las
  `2026-08-15T10:04:54.596776Z`.
- Destino aislado en `southamerica-east1`; la API expuso
  `sourceInfo.progress=COMPLETED` y el backup de origen correcto.
- Verificación read-only: `VERIFIED`, integridad mínima confirmada, `RPO =
  0.220 h` y `RTO = 0.232 h`.
- No hubo cutover, escrituras de tenant, creación de usuarios ni reinicio del
  Trial histórico.

La evidencia detallada está en
`docs/goals/evidence/G-SAAS-02-RECOVERY-OBSERVATION-2026-08-15.md`.
`RECOVERY_INDEPENDENT_ATTESTATION = PASS` y
`RECOVERY_POINT_OBSERVED = PASS` para este ensayo; el smoke productivo y el
Trial anual siguen siendo gates independientes.

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

Adoptar **B** para el Trial: backup diario, retención de 35 días, restore de
prueba en un destino aislado y evidencia sin datos innecesarios. PITR queda
fuera de este ADR y requiere una decisión posterior si el riesgo o el RPO/RTO
lo justifican.

La aceptación permite ejecutar `firestore:backups:schedules:create` y el
restore de prueba únicamente después del preflight read-only. No permite
`firestore:databases:update`, escrituras de tenant ni materializar la relación
anual antes del cierre del Trial histórico el `2026-09-02`.

## Criterios de aceptación

- política B, retención de 35 días y frecuencia diaria registradas;
- destino aislado y procedimiento de restore definidos;
- RPO ≤ 24 horas, RTO ≤ 4 horas y responsable registrados;
- billing habilitado y costo variable aceptado;
- comandos read-only de preflight ejecutados antes del cambio;
- backup o PITR observable después del cambio;
- restore de prueba exitoso, con integridad, aislamiento y rollback verificados;
- evidencia publicada sin secretos ni datos completos del tenant.

## Consecuencias

Este ADR resuelve la política técnica de recovery y su ensayo independiente
ya quedó atestado para el punto observado. El release global de G-SAAS-02
permanece `INCOMPLETE` hasta cerrar también el smoke productivo, el cierre del
Trial histórico, la relación anual y el Trial operativo completo. El smoke
productivo requiere una cuenta/ventana de prueba segura y se mantiene como
gate independiente.
