# ADR-SAAS-047 — Aislamiento de codebase para lectura de configuración tenant SaaS

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-09-28.

Esta es una decisión de gobernanza para `G-SAAS-02 → M2 — Provisioning y
onboarding → E2.2 — Configuración inicial`. La implementación local y la
certificación en staging descritas en este ADR no sustituyen la integración en
`main`, la CI/auditoría del PR ni ningún gate de producción.

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

La implementación aislada materializa el codebase Gen2:

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

## Estado de implementación y certificación staging

- **Implementación local:** `3bc59c2c579ffa7500ea7d041ddd75b6cf436aab`
  (`feat(saass): isolate tenant configuration callable`).
- **Proyecto certificado:** `micafe-pos-staging`.
- **Codebase y callable:** `saas-tenant-configuration` /
  `obtenerConfiguracionEmpresa`.
- **Revisión certificada:** `obtenerconfiguracionempresa-00002-pib`, activa
  con 100 % del tráfico en `us-central1`, runtime Node.js 22 y cero Secrets.
- **Function hash:** `c3443664191198c31cb6a1eee33580e56a17aa63`.
- **Cloud Build:** `092c7526-584b-40a8-917c-8a21de6269c7`.
- **Image digest:**
  `sha256:b934471222f9bb65b42e78c3afcfe01c5593f02ba9bfa5af3006b88506bdf766`.

El controlled update preservó como baseline histórico de staging la revisión
`obtenerconfiguracionempresa-00001-zif`, con function hash
`0f16ca499b262fc4488ca617f4c540870f89bf1b`, estado `READY` y 0 % de tráfico.
Su clasificación es `STAGING HISTORICAL BASELINE — NON-GIT-PROVEN`: se comprobó
equivalencia técnica con la implementación certificada, pero no existe
procedencia Git/source reproducible para esa revisión.

La validación funcional staging usó exclusivamente el fixture sintético
preexistente `adr046-functional-staging-20260925`. El caso autenticado obtuvo
la configuración del tenant autorizado y el caso sin Auth devolvió
`unauthenticated`; ambos llegaron a la revisión certificada. No se crearon
fixtures ni se observaron escrituras de Firestore/Auth. Los escenarios remotos
de claim/Empresa inválidos, Membresía inválida, configuración ausente o inválida
e aislamiento A/B permanecen `NOT EXECUTED — fixture unavailable`: no se
crearon contextos negativos para fabricarlos. Las pruebas locales de contrato
cubren esos casos como evidencia complementaria, sin convertirlos en PASS de
staging.

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

La implementación no puede importar:

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

La migración implementada extrajo las unidades neutrales, declaró exactamente
un endpoint en `saas-tenant-configuration` y retiró únicamente la exportación
legacy de `saas-auth`. El preflight demostró discovery con cero Secrets, una
sola declaración, imports permitidos, module-load sin I/O y un plan dirigido
sin deletes, replacements ni cambios en otros codebases.

Antes del primer deploy, rollback consistía en revertir el cambio técnico. Tras
el controlled update, el rollback de tráfico exige un gate operativo explícito
y la retención de `obtenerconfiguracionempresa-00001-zif`. Esa revisión permite
una posible reasignación de tráfico, pero no constituye rollback reproducible
desde Git/source: su procedencia permanece incompleta. Cualquier retiro,
reasignación o rollback remoto requiere un gate operativo explícito.

El deploy controlado, el cutover de tráfico de este endpoint en staging y la
validación funcional staging están certificados. Permanecen pendientes la
integración de la implementación en `main`, auditoría/CI del PR correspondiente,
cualquier validación posterior ligada a esa integración y toda producción.
Producción continúa fuera de alcance de esta decisión.

## Criterios de implementación y evidencia

- una sola callable `obtenerConfiguracionEmpresa` en `us-central1`, Node.js 22;
- manifiesto con cero Secrets y cero parámetros sensibles;
- lectura tenant-aware sin escrituras;
- contrato y autoridad server-side actuales preservados;
- pruebas de Auth ausente, claims/Empresa/Membresía inválidos, configuración
  ausente o inválida, aislamiento y ausencia de imports prohibidos;
- preflight y validación de staging antes de considerar cualquier producción.

La evidencia local de los criterios anteriores incluye build, typecheck, lint,
tests de autoridad/reader/callable, discovery y module-load. Ninguna de esas
evidencias autoriza producción ni reemplaza los escenarios remotos que figuran
como `NOT EXECUTED`.
