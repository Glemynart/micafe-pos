# G-SAAS-02 / M2 / E2.2 — Gate A: auditoría de estado y documentación (2026-10-12)

## Dictamen

`DOCUMENTATION = CONSISTENT` para el estado documentado por esta reconciliación.
Gate A queda pendiente de integración: el Goal y esta nota deben estar en
`main` antes de considerar cerrado el gate. No se encontró un conflicto entre
ADRs aceptados que requiera una nueva decisión.

## Alcance y fuentes revisadas

- Goal vivo: `docs/goals/GOAL-MVP-COMERCIAL.md`.
- Decisiones: ADR-SAAS-048, ADR-SAAS-049, ADR-SAAS-070, ADR-SAAS-074 y
  ADR-SAAS-076.
- Evidencia posterior: aceptación ADR-SAAS-076, inventario read-only de Gate C
  posterior a #574 y reconciliación de Gate I que registra las confirmaciones
  comerciales y de catálogo reportadas por el responsable.
- Runbook de onboarding/Trial: `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`.
- Estado GitHub observado: PR #577 y PR #578; estado de `origin/main` y
  `firebase.json` del SHA auditado.

## Hallazgos reconciliados

| Tema | Evidencia actual | Reconciliación |
|---|---|---|
| Estado de `main` | PR #577 está integrado por `e087cb5a3c1bbd2029c64a3953742da4692f9f1f`; su CI post-merge, run `38317187343`, seguía `in_progress` al hacer esta lectura. | El bloque vivo del Goal deja de identificar `05d6f1c` como base actual e incorpora #577. No se afirma que la CI post-merge haya terminado. |
| Implementación de ADR-SAAS-073 | PR #578 está abierto en `f0410f85b1b1b844babd674c2aaefbaec8dbd957`; Vercel y Vercel Preview Comments están en `success`, mientras CI `38317752879` sigue `in_progress`. | ADR-SAAS-073 está aceptado; su implementación no está integrada ni desplegada. El Goal ya no la enumera como decisión pendiente y no marca #578 como completado. |
| ADR-SAAS-049 y cantidad de callables | ADR-SAAS-049 define el corte original de cinco y cita expresamente el complemento ADR-SAAS-052 para seis. Los cambios posteriores de nombres se rigen por ADR-SAAS-074 y ADR-SAAS-076. | El número cinco se conserva como snapshot del corte original; no se presenta como inventario operativo vigente ni se modifica la decisión aceptada. |
| ADR-SAAS-070 y catálogo | ADR-SAAS-070 acepta un único precio por presentación y distingue el precio de producto de la oferta SaaS. Su texto original deja la transcripción pendiente de validación. La reconciliación posterior de Gate I registra que el responsable reportó la aprobación de Diana de los 110 productos, empaques y precios impresos como precio de venta, con stock inicial cero. | La aprobación posterior resuelve la frase temporal de “pendiente de validación”; no significa que el catálogo se haya importado ni autoriza escrituras. ADR-SAAS-070 no se reescribe. |
| ADR-SAAS-074 y ADR-SAAS-076 | ADR-SAAS-076, aceptado el 2026-10-12, amplía explícitamente el inventario de cuatro IDs inicialmente afectados a once y preserva la decisión de no modificar `saas-auth`. La evidencia de Gate C observó en staging los once IDs anteriores activos y los once nuevos ausentes. | Se conserva ADR-SAAS-074 como decisión inicial y se trata ADR-SAAS-076 como alcance vigente para los once IDs. Esta auditoría documental no convierte el Gate C incompleto en PASS ni autoriza deploy. |
| Gates de ADR-SAAS-048 | ADR-SAAS-048 usa gates internos A–F para la aprobación de superficie/fixture. La secuencia operativa de E2.2 en el Goal es A–L. | Se mantienen ambas nomenclaturas en su contexto; no se interpretan como una única secuencia ni se alteran los snapshots históricos. |
| Onboarding y tenant | El runbook remite al perfil comercial de primer acceso aprobado en ADR-SAAS-073 y a la responsabilidad de Diana de crear usuarios/roles. El alta real, oferta/Trial y catálogo no están persistidos. | Se conserva el requisito operativo, pero no se afirma que el perfil nuevo esté integrado, desplegado ni que exista tenant real. |

## Estado operativo separado de Gate A

Esta auditoría no cierra ni altera otros gates. La evidencia read-only de Gate C
posterior a #574 sigue indicando que los IDs nuevos están ausentes de staging;
por tanto Gate C permanece `INCOMPLETE`, Gate D para el namespace nuevo sigue
sin ejecutar y las repeticiones de F/G/H siguen pendientes. Gate I continúa
bloqueado para escrituras de producción y creación del tenant real. La
reconciliación del Goal identifica esos estados y no convierte la aprobación
comercial o de catálogo en autorización de persistencia.

## Cambios realizados y mutation audit

- Se actualiza solamente el bloque vivo de `docs/goals/GOAL-MVP-COMERCIAL.md`
  con el SHA/PR #577, estado observado de PR #578/ADR-SAAS-073 y referencia a
  esta nota.
- Se agrega esta evidencia documental fechada.
- Sin cambios en código, ADR aceptados, Firebase, Functions, Rules, IAM,
  Secrets, Firestore/Auth, inventario, fixture, tenant, tráfico o producción.
- Sin deploy, push, creación de PR ni merge.

## Revisión

- **Fecha:** 2026-10-12.
- **Base auditada:** `origin/main @ e087cb5a3c1bbd2029c64a3953742da4692f9f1f`.
- **Rama de reconciliación:** `codex/e2-2-gate-a-reconciliation-20261012`.
- **Siguiente paso:** integrar esta reconciliación mediante el flujo gobernado;
  después continuar con la CI/auditoría de PR #578 y con Gate C read-only para
  el artefacto integrado. Esta nota no autoriza esas operaciones.
