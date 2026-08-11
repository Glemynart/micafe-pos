# ADR-SAAS-027 — Ejecución productiva controlada del cierre B3-026

- **Estado:** Propuesto
- **Fecha:** 2026-08-11
- **Decision makers:** propietario del Goal; Lead Engineer
- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial
- **Milestone:** `M4` — Certificación comercial
- **Epic:** `E4.2` — Release readiness
- **Relacionados:** `ADR-SAAS-024`, `ADR-SAAS-025`, `ADR-SAAS-026`, `B3-A`, `B3-B`

> Este ADR no autoriza ninguna escritura productiva. Propone únicamente el
> contrato para una futura ejecución operativa, después de su aceptación y de
> una autorización explícita separada para la limpieza concreta.

## 1. Contexto y problema

ADR-SAAS-026 y PR #226 implementaron el manifiesto congelado, el dry-run
read-only, el bundle de recovery, el journal y la ejecución segura en
Emulator. El dry-run productivo posterior confirmó un conjunto exacto de
cuatro objetivos, pero el ejecutor integrado bloquea por diseño cualquier
`--execute` fuera de Firebase Emulator.

El Goal no puede cerrar el seguimiento B3-026 mientras esos objetivos de
prueba permanezcan pendientes, pero habilitar el ejecutor actual contra
producción modificaría el contrato aceptado y mezclaría una autoridad
operativa de alto privilegio con la herramienta de certificación Emulator.

Se necesita decidir si el cierre productivo debe existir y, en caso
afirmativo, bajo qué frontera, controles y evidencia.

## 2. Decisión propuesta

Se propone crear una operación de cierre productivo separada del ejecutor de
Emulator de ADR-SAAS-026. La operación no será una funcionalidad del POS ni
una callable; será una herramienta de operador ejecutada manualmente en un
entorno controlado.

La operación solo podrá ejecutarse si se cumplen **todos** estos controles:

1. El manifiesto externo coincide byte a byte con el hash aprobado y contiene
   exactamente el allowlist de ADR-SAAS-026: un Evento legacy y tres objetos
   Storage de Eventos no referenciados.
2. El proyecto y el bucket activos coinciden con el manifiesto; no se
   aceptarán selección por prefijo, fecha, nombre, slug, tenant o similitud.
3. El operador ejecuta un preflight final read-only que vuelve a comprobar el
   snapshot completo del Evento, los fingerprints de Storage, las referencias,
   la ausencia de `empresaId` y la exclusión de cualquier recurso canónico.
4. El bundle de recovery se crea fuera del repositorio, se verifica por hash y
   queda disponible antes de cualquier eliminación.
5. La operación exige una confirmación humana inequívoca que incluya proyecto,
   cantidad exacta de objetivos y hash del plan. Una variable de entorno común,
   una sesión previa o la existencia de credenciales no equivalen a dicha
   confirmación.
6. La credencial operativa es temporal o de mínimo privilegio, no se almacena
   en el repositorio, no se imprime en logs y se retira o invalida conforme al
   procedimiento operativo posterior.
7. El journal externo registra `PREPARADO`, `ELIMINADO`,
   `IDEMPOTENTE_NOOP` u `ABORTADO` por objetivo. Un drift, una referencia nueva,
   una ausencia inesperada o un error parcial detiene los objetivos restantes.
8. La operación usa un orden determinista y verifica después de cada objetivo;
   Firestore y Storage no se tratarán como una transacción común.
9. La evidencia final demuestra que solo los cuatro objetivos permitidos fueron
   considerados, que no quedan objetivos canónicos afectados y que la
   operación recibió autorización explícita. La evidencia no contendrá tokens
   ni credenciales.

La ejecución productiva no estará disponible en CI, no se incorporará al flujo
de usuario y no sustituirá el guard Emulator-only de PR #226. El dry-run
seguirá siendo read-only y el ejecutor de Emulator seguirá sin permitir
escrituras productivas.

## 3. Invariantes

- Nunca se elimina un Evento que tenga `empresaId`.
- Nunca se elimina un Evento tenant-aware ni un asset referenciado.
- Solo pueden tratarse los cuatro objetivos presentes en el manifiesto
  aprobado; cualquier objetivo adicional aborta todo el plan.
- La visibilidad pública, el nombre de un tenant, un slug o una ruta no son
  fuentes de autorización.
- La operación no modifica documentos, Rules, Bootstrap, autoridades de
  dominio, reservas, landing, marketing, productos ni datos fiscales.
- Un reintento no repite un objetivo ya confirmado y una ausencia inesperada
  no se interpreta como autorización para continuar.
- La recuperación nunca sobrescribe una identidad que ya esté ocupada por un
  documento u objeto distinto.
- La autorización de este ADR, si se acepta, no autoriza por sí sola la
  eliminación: cada ejecución requiere una confirmación operativa separada.

## 4. Alternativas consideradas

### A. Mantener el cierre Emulator-only

Es la opción más segura para producción y conserva intactas las garantías
actuales, pero deja sin cerrar el allowlist legacy confirmado y mantiene el
seguimiento de E4.2 abierto.

### B. Ejecutar eliminaciones manualmente desde Firebase Console

Evita modificar el código, pero no ofrece preflight reproducible, allowlist
verificable, journal por objetivo ni recovery comprobable. No satisface el
contrato auditable de ADR-SAAS-026.

### C. Añadir `--execute` productivo al ejecutor existente

Reutiliza código, pero mezcla la superficie Emulator con una autoridad
destructiva productiva y aumenta el riesgo de que una variable de entorno o un
proyecto equivocado habilite una eliminación. Se rechaza.

### D. Herramienta operativa productiva separada — recomendada

Mantiene el ejecutor de certificación protegido, permite controles específicos
de producción y deja una frontera clara de autorización, recovery y journal.
Tiene el coste de una nueva herramienta, revisión de permisos y procedimiento
de operación.

## 5. Consecuencias

### Positivas

- Mantiene intacto el contrato seguro de PR #226.
- Hace explícita la autoridad operativa necesaria para cerrar el allowlist.
- Reduce el riesgo de apuntar por error a otro proyecto o de ampliar el alcance.
- Conserva recovery, idempotencia y evidencia sin introducir una autoridad de
  producto.

### Costes y riesgos

- Firestore y Storage no proporcionan una transacción común; un fallo parcial
  sigue requiriendo recovery y revisión del journal.
- La herramienta necesita custodiar temporalmente un bundle que contiene datos
  completos del Evento y bytes de Storage.
- La configuración de permisos y la confirmación humana deben auditarse antes
  de la primera ejecución.
- No puede garantizarse rollback automático; la recuperación es condicional a
  que las identidades estén ausentes.

## 6. Alcance y fuera de alcance

Incluye la definición de una frontera operativa separada para ejecutar, si se
aprueba después, el cierre exacto de ADR-SAAS-026.

Queda fuera de este ADR propuesto:

- aceptar o ejecutar la eliminación productiva;
- cambiar el allowlist o inferir otros targets;
- modificar Firestore Rules o Storage Rules;
- cambiar el dominio, UI, callable, Bootstrap o migraciones;
- limpiar otros Eventos, Storage, reservas, landing o marketing;
- crear un sistema genérico de borrado o retención;
- incluir credenciales, manifiestos productivos o bundles de recovery en Git.

## 7. Requisitos para una implementación posterior

Si este ADR se acepta, el PR de implementación deberá incluir únicamente la
herramienta operativa separada, pruebas con adapters simulados/Emulator,
verificación de drift, confirmación explícita, journal, recovery y evidencia.
Deberá mantener `productionWrites: false` en las suites automatizadas y no
podrá ejecutar contra producción durante CI.

La primera operación real seguirá necesitando una autorización posterior que
identifique el proyecto, el hash del manifiesto y los cuatro objetivos; antes
de ella se repetirá el dry-run read-only final.

## 8. Criterio de aceptación del ADR

- Se acepta explícitamente la frontera entre certificación Emulator y
  herramienta operativa productiva.
- Se acepta que el allowlist no puede ampliarse y que la ejecución real exige
  confirmación independiente.
- Se acepta la custodia externa del recovery y del journal.
- Se acepta que un fallo parcial detiene la operación y requiere revisión.
- Se mantiene la prohibición de escrituras productivas hasta una autorización
  posterior y específica.

## 9. Estado

Este ADR queda **PROPUESTO**. No cambia el comportamiento actual, no autoriza
escrituras productivas y no habilita ninguna ejecución. La implementación solo
podrá comenzar después de una aceptación explícita y de actualizar el Goal y
la documentación de E4.2 conforme a la decisión.
