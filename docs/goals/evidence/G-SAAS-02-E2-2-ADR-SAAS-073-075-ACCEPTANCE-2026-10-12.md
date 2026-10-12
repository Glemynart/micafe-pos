# G-SAAS-02 / M2 / E2.2 — Aceptación de ADR-SAAS-073/074/075

**Fecha:** 2026-10-12
**Resultado:** las tres opciones arquitectónicas fueron aceptadas explícitamente por el responsable del producto.
**Alcance de autorización:** preparar PRs de implementación. No incluye deploy, cambios remotos de Rules/IAM/Secrets, escrituras de datos, creación del tenant real ni incorporación de usuarios.

## Decisiones

| ADR | Opción aceptada | Límite de la decisión |
|---|---|---|
| ADR-SAAS-073 | Opción 1: perfil comercial de primer acceso Bodega por callable aislada, separado de readiness fiscal. | Preparar implementación usando campos canónicos; no crear tenant, recibir PII, habilitar facturación electrónica ni desplegar. |
| ADR-SAAS-074 | Opción 1: IDs únicos para los cuatro endpoints Bodega en conflicto y adaptación del dispatcher. | Preparar cambios de código/cliente y gates; no desplegar ni alterar Functions remotas. |
| ADR-SAAS-075 | Opción 1: la callable legacy de compras rechaza Bodega en operación nueva y replay, preservando los otros verticales. | Se acepta una excepción mínima de comportamiento de `saas-auth`; preparar implementación aislada, sin deploy, Rules, Secrets ni escrituras. |

## Registro de respuesta

El 2026-10-12, en respuesta a las tres preguntas de decisión, el responsable
confirmó: “Aceptar Opción 1: callable aislada”, “Aceptar Opción 1: IDs
únicos” y “Aceptar Opción 1: bloquear Bodega”. Estas respuestas fijan las
decisiones de arquitectura descritas arriba. La aprobación no elimina los
gates de implementación, pruebas, auditoría, CI, Gate C ni la autorización
operativa separada exigida antes de un despliegue o alta real.

## Estado operativo posterior

- ADR-SAAS-073, ADR-SAAS-074 y ADR-SAAS-075 pasan a `ACEPTADO`.
- Este registro y la sincronización de documentos maestros pertenecen al PR
  documental abierto; las implementaciones se prepararán después de integrar
  sus decisiones conforme al proceso del repositorio.
- Gate I sigue bloqueado por las brechas de producción documentadas en la
  [revalidación read-only](G-SAAS-02-E2-2-GATE-I-PRODUCTION-READONLY-REVALIDATION-380928-2026-10-12.md).
- No se ejecutaron despliegues, comandos de escritura ni cambios de datos por
  esta aceptación.
