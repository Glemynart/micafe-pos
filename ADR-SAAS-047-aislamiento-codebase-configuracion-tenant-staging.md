# ADR-SAAS-047 — Aislamiento de codebase para lectura de configuración tenant SaaS

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-09-28.

Esta es una decisión de gobernanza para `G-SAAS-02 → M2 — Provisioning y
onboarding → E2.2 — Configuración inicial`. La aceptación autoriza una futura
iniciativa de implementación; no confirma que exista código, un endpoint,
despliegue, validación de staging, certificación ni cutover.

## Problema y evidencia

`obtenerConfiguracionEmpresa` es una callable de `us-central1` que reside hoy
en el codebase amplio `saas-auth`. Resuelve la Empresa desde la identidad
autenticada y solo lee `empresas/{empresaId}`, la Membresía correspondiente y
`configuraciones/{empresaId}`. No requiere Secrets funcionales.

El discovery de Firebase se hace sobre el manifiesto completo de `saas-auth`
antes de aplicar un target. Ese codebase contiene capacidades ajenas que
declaran parámetros y Secrets, incluidos Wompi, Dusema y credenciales
operativas. Por ello, desplegar únicamente la callable desde esa superficie no
es un boundary de discovery aislado ni una vía segura para certificar la
lectura de configuración del tenant.

## Decisión

En una implementación futura se creará el codebase Gen2:

```text
codebase: saas-tenant-configuration
source: functions-tenant-configuration
callable única: obtenerConfiguracionEmpresa
región: us-central1
runtime: Node.js 22
Secrets: 0
```

El boundary es estrictamente **read-only**. Su adapter se limita al protocolo
callable, región y runtime. La autoridad de tenant y la lectura/validación de
configuración viven en unidades neutrales compartidas, con una sola
implementación de cada regla.

## Contrato y autoridad preservados

- La request no requiere campos funcionales. Los campos adicionales se ignoran
  y nunca pueden sustituir `empresaId`, UID, rol, claims o Membresía derivados
  por servidor.
- La autoridad se deriva de `request.auth` y de los claims autenticados, y se
  revalida contra Empresa y Membresía.
- Falta de Auth, o Membresía ausente/inválida bajo la semántica vigente de
  `exigirTenantActivo()`: `unauthenticated`.
- Claim `empresaId` ausente o inválido, Empresa inexistente/no operativa, o rol
  incoherente: `permission-denied`.
- Configuración inexistente: `not-found`.
- `failed-precondition` queda limitado a una validación concreta de lectura de
  configuración que ya produzca ese código.
- La callable no crea auditoría, idempotencia, credenciales, claims, tokens ni
  escrituras Firestore/Auth.

ADR-047 no modifica el contrato observable. Cualquier cambio futuro de los
códigos de error o del tratamiento de campos adicionales requiere una decisión
funcional separada, pruebas de compatibilidad y su propio gate.

## Closure y aislamiento

La implementación futura no puede importar:

- `functions/src/index.ts`;
- `functions/src/operational-auth.ts` completo;
- `functions/src/configuracion/callables.ts` completo;
- `functions/src/configuracion/service.ts` completo si conserva mutaciones o
  inicialización ajena al reader;
- Wompi, Dusema, Bootstrap, comercial, email/invitaciones ni adapters que
  registren Secrets.

El cierre permitido contiene exclusivamente la validación de Empresa,
Membresía y rol, y la lectura/validación de Configuración. Debe demostrar
module-load sin I/O remoto, sin lectura de valores de Secret y sin dependencias
cíclicas. No se conceden nuevos permisos IAM manuales ni se declaran Secrets.

## Relación con otros ADR

ADR-SAAS-047 es autónoma y no tiene una dependencia de implementación, código
ni historial Git de ADR-SAAS-044, ADR-SAAS-045 o ADR-SAAS-046. Es compatible
con sus fronteras y permanece fuera de sus dominios: no incorpora Bootstrap,
autenticación operativa ni activación de incorporación. Ninguno de esos ADR es
un prerrequisito para esta decisión ni se integra o modifica por ella.

## Migración, validación y rollback

La futura migración deberá, en el mismo cambio técnico, extraer las unidades
neutrales, declarar exactamente un endpoint en `saas-tenant-configuration` y
retirar únicamente la exportación legacy de `saas-auth`. El preflight deberá
demostrar discovery con cero Secrets, una sola declaración, imports permitidos,
module-load sin I/O y un plan dirigido sin deletes, replacements ni cambios en
otros codebases.

Antes del primer deploy, rollback consiste en revertir el cambio técnico. Si
hay un deploy posterior, cualquier retiro, reasignación o rollback remoto
requiere un gate operativo explícito y una revisión conocida; no se presupone
una revisión legacy utilizable.

Staging, validación funcional, certificación, cutover y producción permanecen
pendientes y requieren autorizaciones separadas. Producción está fuera de
alcance de esta decisión.

## Criterios para la implementación futura

- una sola callable `obtenerConfiguracionEmpresa` en `us-central1`, Node.js 22;
- manifiesto con cero Secrets y cero parámetros sensibles;
- lectura tenant-aware sin escrituras;
- contrato y autoridad server-side actuales preservados;
- pruebas de Auth ausente, claims/Empresa/Membresía inválidos, configuración
  ausente o inválida, aislamiento y ausencia de imports prohibidos;
- preflight y validación de staging antes de considerar cualquier producción.
