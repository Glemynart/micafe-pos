# ADR-SAAS-086 — Cardinalidad de `saas-commercial` y consulta de oferta

## Estado

**Propuesto — pendiente de aprobación humana explícita.**

Esta propuesta no modifica el estado aceptado de ADR-SAAS-043, no cambia código,
no declara conformidad arquitectónica, y no autoriza un despliegue ni una
operación comercial. ADR-SAAS-043 sigue siendo la decisión vigente hasta que el
responsable acepte expresamente una resolución.

- **Fecha de propuesta:** 2026-10-23.
- **Revisión:** posterior a la integración de PR #630, #631 y #632 en
  `origin/main @ 0ccaddfd12765328e7eafe8ec1a5c595cba40032`.
- **Goal:** `G-SAAS-02`.
- **Milestone:** `M2 — Provisioning y onboarding`.
- **Epic activo:** `E2.2 — Configuración inicial`.
- **Relación:** si se acepta la Opción A, esta ADR modifica y supersede
  únicamente la restricción de cardinalidad de
  [ADR-SAAS-043](ADR-SAAS-043-aislamiento-codebase-comercial-staging.md). ADR-SAAS-043 no
  queda supersedida por la mera existencia de esta propuesta ni por el código.
- **ADRs relacionados:** [ADR-SAAS-043](ADR-SAAS-043-aislamiento-codebase-comercial-staging.md)
  (codebase y discovery comercial),
  [ADR-SAAS-061](ADR-SAAS-061-oferta-comercial-tenant-especifica.md)
  (oferta comercial específica por tenant) y
  [ADR-SAAS-085](ADR-SAAS-085-alcance-control-compras-bodega-e2-2.md) (alcance
  de control de compras Bodega, sin decidir la cardinalidad del codebase).

## Contexto y problema

La [ADR-SAAS-043](ADR-SAAS-043-aislamiento-codebase-comercial-staging.md),
aceptada, establece que el codebase Firebase `saas-commercial`
declara exclusivamente la callable `ejecutarComandoComercialSaas`. La
restricción es explícita y protege una frontera mínima de discovery y
despliegue sin Secrets ajenos.

En el candidato actual, `functions-commercial/src/index.ts` exporta dos
callables:

- `ejecutarComandoComercialSaas`
- `consultarOfertaComercialTenantSaas`

La prueba de discovery del paquete espera precisamente esos dos endpoints y
cero parámetros/Secrets. La segunda callable está implementada como consulta
en `us-central1`: exige autenticación y la facultad `COMERCIAL_GOBERNAR`,
resuelve un código de aprobación permitido, lee el control y la oferta
correspondientes y devuelve campos permitidos. No escribe datos, no crea ni
revoca ofertas, no ejecuta Bootstrap ni inicia el Trial. PR #632 añadió
validación y pruebas para la correspondencia tenant/oferta en consulta y
Bootstrap, pero excluyó expresamente ADR-SAAS-086.

La [ADR-SAAS-061](ADR-SAAS-061-oferta-comercial-tenant-especifica.md) aprobó la
frontera de oferta por tenant y establece que su
consulta administrativa requiere `COMERCIAL_GOBERNAR`; no modifica ni
supersede la regla de cardinalidad de ADR-SAAS-043. Por tanto, la compilación,
las pruebas y la presencia del export no resuelven la discrepancia ni
demuestran conformidad arquitectónica.

## Decisión solicitada

> **La persona responsable debe elegir expresamente la Opción A o B, o proponer
> otra resolución. Hasta esa decisión, no se debe cambiar la implementación ni
> autorizar `saas-commercial` para despliegue.**

### Opción A — autorizar expresamente dos callables (recomendada)

Aceptar una actualización puntual de la decisión de ADR-SAAS-043 para que
`saas-commercial` pueda declarar exactamente estas dos callables:

1. `ejecutarComandoComercialSaas`, con el contrato y controles preservados por
   ADR-SAAS-043.
2. `consultarOfertaComercialTenantSaas`, limitada a la lectura administrativa
   descrita abajo.

La autorización arquitectónica quedaría sujeta a estos límites:

- `consultarOfertaComercialTenantSaas` requiere usuario autenticado y
  `COMERCIAL_GOBERNAR` revalidado en servidor.
- Solo acepta un código de aprobación reconocido por la allowlist aprobada; el
  tenant y la oferta objetivo se resuelven en servidor, no desde un ID arbitrario
  del cliente.
- Solo lee los documentos canónicos de control/oferta de ese tenant y devuelve
  los campos de vista administrativa permitidos. No devuelve credenciales ni
  datos internos ajenos al contrato de consulta.
- No escribe ni muta ofertas, controles, tenants, suscripciones o Trials; no
  ejecuta Bootstrap ni sustituye la autorización comercial para esas
  operaciones.
- El manifiesto de `saas-commercial` declara exactamente las dos callables
  anteriores y cero Secrets/parámetros sensibles. Cualquier tercera exportación
  requiere una nueva decisión y revisión.
- Mantener región `us-central1`, pruebas de autorización, tenant-binding,
  superficie de respuesta y discovery sin Secrets.
- La autorización de esta frontera no implica autorización de despliegue en
  staging o producción ni de invocación remota.

**Consecuencias y riesgos:** se alinea el empaquetado con la frontera de oferta
aprobada por ADR-SAAS-061 y con el código/pruebas ya integrados, y se evita
reubicar una consulta acotada. Aumenta la superficie pública y la cantidad de
endpoints que deben protegerse; un error de autorización, tenant-binding o
filtrado de respuesta podría exponer información comercial. Los controles
anteriores y las pruebas de discovery, autorización, tenant-binding y respuesta
son condiciones verificables para mantener el alcance. La presencia de esas
pruebas no sustituye revisión humana de la arquitectura.

### Opción B — conservar la cardinalidad aceptada

Mantener ADR-SAAS-043 sin cambios: `saas-commercial` solo declara
`ejecutarComandoComercialSaas`. Antes de considerar cualquier despliegue o
release de ese codebase, una propuesta técnica separada tendría que ajustar la
arquitectura para que la consulta de oferta quede fuera de `saas-commercial` o
deje de exportarse desde él, con una frontera propietaria, compatibilidad de
consumidores, pruebas y migración revisadas. Esta opción no autoriza borrar,
mover ni sustituir la callable ahora.

**Consecuencias y riesgos:** preserva literalmente la decisión aceptada y
evita ampliar el codebase sin aprobación. Requiere un cambio de arquitectura y
posible coordinación de ownership, discovery y consumidores. Si la consulta
continúa siendo necesaria, puede retrasar su disponibilidad hasta definir y
validar otra frontera; una retirada o movimiento apresurado podría romper
consumidores o disponibilidad. Todo cambio requiere un PR propio y preflight de
compatibilidad.

## Recomendación

Recomiendo la Opción A, pendiente de aprobación. ADR-SAAS-061 ya define la
consulta administrativa protegida como parte de la frontera de oferta, y el
código actual la implementa como una lectura acotada con autenticación,
`COMERCIAL_GOBERNAR`, resolución server-side y validación tenant/oferta. Los
tests integrados en PR #632 protegen esa vinculación. Autorizar de forma
explícita esta segunda exportación es el cambio documental mínimo para alinear
ambas decisiones sin inferir aprobación a partir de la implementación.

La recomendación no afirma que el sistema sea arquitectónicamente conforme hoy:
mientras la propuesta siga pendiente, ADR-SAAS-043 y la cardinalidad observada
en el código continúan en conflicto.

## Separación de estados

Estos estados deben informarse por separado:

1. **Build y pruebas:** CI post-merge del candidato `0ccaddf` terminó
   `success` en la ejecución `39715447904`; PR #632 también reportó sus
   validaciones locales. Esto acredita únicamente los checks indicados para
   esos bytes.
2. **Conformidad arquitectónica:** pendiente de resolver la discrepancia entre
   ADR-SAAS-043 y los dos exports. Un build exitoso no la resuelve.
3. **Autorización de despliegue:** no concedida por ADR-SAAS-043, esta propuesta
   ni los PR #630–#632. Requiere decisión y autorización operativa separadas.

El preflight read-only de staging reportó App Hosting en `39aa469…`, no en el
candidato `0ccaddf…`. No se declara staging alineado ni se autoriza un rollout
por esta ADR.

## Criterios para autorizar el siguiente paso

Antes de abrir un PR de implementación que dependa de esta decisión:

1. El responsable selecciona A, B u otra alternativa y acepta expresamente la
   ADR; solo entonces su estado cambia a `Aceptado` y se sincronizan los
   documentos maestros afectados.
2. El Goal registra el siguiente Epic/PR autorizado y mantiene separados los
   gates de arquitectura, implementación y release.
3. El PR técnico declara la opción aceptada, prueba la cardinalidad,
   autorización, tenant-binding, respuesta permitida y ausencia de Secrets que
   correspondan; incluye auditoría, recuperación y checks requeridos.

Para cualquier despliegue posterior se requiere además una solicitud y
autorización operativa específicas, un preflight actual para el proyecto y
entorno destino, evidencia de compatibilidad y recuperación, y comprobaciones
post-deploy. El preflight actual no vincula App Hosting de staging al SHA
`0ccaddf`; por tanto, ese vínculo debe verificarse de nuevo antes de proponer
una acción de release. Esta ADR no autoriza creación de oferta/tenant,
Bootstrap, inicio de Trial, escrituras de datos ni acceso de Diana.

## Fuera de alcance

- Cambiar o eliminar cualquiera de las dos callables.
- Cambiar contratos, permisos, modelo de oferta, persistencia, Rules, IAM o
  secretos.
- Autorizar despliegues, invocaciones remotas, tráfico o acciones productivas.
- Declarar listo staging, producción, Gate I, E2.2 o el acceso de Diana.
- Resolver decisiones fiscales, comerciales o de catálogo.

## Revisión y aprobación

La aprobación debe identificar expresamente la alternativa elegida. No se
consideran aprobación el merge de un PR, un CI verde, la existencia del export,
una prueba de discovery ni el estado remoto observado. Si se elige A, el
responsable confirma los límites de la consulta y la excepción explícita a la
cardinalidad de ADR-SAAS-043. Si se elige B, se mantiene la restricción actual y
se autoriza preparar por separado la arquitectura que la cumpla.
