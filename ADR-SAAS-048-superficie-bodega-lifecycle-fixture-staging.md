# ADR-SAAS-048 — Superficie de despliegue Bodega y lifecycle de fixture staging

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-09-29.

La aceptación cubre exclusivamente el **Gate A — Aprobación documental**.
Esta aceptación **NO autoriza deploy, creación de fixture, Bootstrap,
Activation ni producción**.

Esta propuesta pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding →
E2.2 — Configuración inicial`. Su aceptación por sí sola no autorizó
implementación, cambios de `firebase.json`, despliegues, creación de fixtures,
Bootstrap, activación ni mutaciones en Firebase, Firestore, Auth, Rules, IAM,
Secrets o producción. La decisión arquitectónica posterior de ADR-SAAS-049
autorizó por separado la implementación aislada de `saas-bodega`; no autorizó
ninguno de los gates operativos de esta ADR.

## Contexto y problema

ADR-SAAS-041 implementó Bodega MVP-1 dentro del codebase monolítico
`saas-auth`. Las cinco callables necesarias para el ensayo son:

- `crearClienteVendedorV1`;
- `crearPresentacionComercialV1`;
- `actualizarPresentacionComercialV1`;
- `crearArticuloInventarioV1`;
- `confirmarVentaBodegaV1`.

Todas usan `us-central1`, Node.js 22 y derivan tenant y actor en servidor. No
declaran un Secret propio. Sin embargo, el discovery de `saas-auth` incluye
superficies ajenas: Bootstrap, recovery, plataforma, schedules, Wompi, Dusema
y capacidades legacy. Por ello no existe evidencia actual de que un deploy del
codebase pueda limitarse estrictamente a Bodega, conservar intactas las demás
Functions y evitar la resolución de Secrets o parámetros ajenos.

Las cinco callables no están materializadas en `micafe-pos-staging`.

El ensayo Bodega requiere además un tenant sintético staging. El Bootstrap
canónico puede crear la fundación empresarial, pero no existe un lifecycle
canónico que permita limpiar de forma segura el grafo resultante de Empresa,
Auth, claims, membresías, configuración, cuentas, inventario, turnos, ventas,
movimientos financieros y auditoría. Los fixtures existentes son exclusivos de
Emulator y usan borrado directo protegido para localhost; no son admisibles en
staging. El Goal vigente prohíbe archivado o eliminación automática de tenants
o datos.

## Decisiones propuestas

### 1. Superficie temporal de Bodega

Mientras no exista una decisión posterior aceptada que cree una frontera
dedicada, las cinco callables Bodega **permanecen en `saas-auth` como ubicación
actual y temporal**. Esta afirmación no autoriza desplegarlas desde ese
codebase.

Un despliegue staging será posible únicamente tras un gate técnico que
demuestre, para el SHA candidato:

1. inventario y delta exactos de Functions;
2. build reproducible y artefacto identificable por digest;
3. attestation `Git → build → artifact → revisión`;
4. comparación previa y posterior de tráfico, Secrets y parámetros;
5. cero deletes, replacements, exports legacy afectados o cambios en
   superficies ajenas;
6. rollback staging verificable mediante revisión conocida; y
7. alcance exclusivo de `micafe-pos-staging`, con producción fuera de alcance.

Si cualquiera de esas condiciones no puede demostrarse de modo fiable, el
deploy queda **BLOCKED**. No se permite un deploy experimental como forma de
obtener esa evidencia.

### 2. Fixture `E2.2-BODEGA-STAGING-FIXTURE`

Se propone utilizar un fixture sintético staging con **retención auditada**, no
cleanup destructivo improvisado. La aceptación de esta propuesta no crea el
fixture.

Cada fixture autorizado deberá registrar como mínimo:

- identificador de ejecución único y `empresaId` sintético;
- owner y usuarios exclusivamente sintéticos;
- fecha, responsable y gate que autorizó su creación;
- `vertical: BODEGA_MVP1`, plan y versión publicados;
- recursos creados y operaciones ejecutadas;
- referencias de auditoría, revisiones Functions y resultados;
- declaración explícita de que no representa un cliente ni contiene datos
  reales; y
- estado final conocido y política de retención.

El fixture no se elimina automáticamente. Cualquier eliminación futura exige
una decisión administrativa explícita, un mecanismo canónico scope-bound,
preflight, evidencia y verificación de que no afecta tenants reales.

## Alternativas consideradas

### A. Conservar Bodega en `saas-auth`

Conserva los handlers, contratos, autoridad tenant, configuración, finanzas,
inventario y pruebas de ADR-SAAS-041. Su riesgo es el discovery monolítico y
la imposibilidad actual de demostrar un delta de deploy limitado. Solo puede
usarse bajo las precondiciones de esta ADR.

### B. Extraer un codebase dedicado Bodega

Reduce el discovery ajeno, pero cambia la frontera de despliegue aceptada por
ADR-SAAS-041 y requiere un ADR posterior. No puede importar el entrypoint de
`saas-auth`, `operational-auth.ts` completo ni `configuracion/service.ts`
completo: debe extraer unidades neutrales para autoridad, lectura de
configuración, finanzas, inventario, turnos y contratos Bodega. Requiere
migración, pruebas de equivalencia, discovery, module-load, Secrets, cutover y
rollback propios.

### C. Otra topología existente

No hay una tercera topología Bodega aceptada. Los patrones de ADR-SAAS-043 a
ADR-SAAS-047 son evidencia de aislamiento, no autorización automática para
Bodega.

### D. Cleanup canónico del fixture

No existe actualmente. Una callable o API de eliminación tenant-scoped no se
deduce de este ADR y requeriría diseño, autoridad, invariantes, pruebas y
aprobación propios.

### E. Lifecycle administrativo reversible

El lifecycle conceptual de Empresa no implementa una reversión staging del
grafo completo. Tampoco hay runbook o endpoint aprobado que la materialice.

## Consecuencias y riesgos

- El ensayo E2.2 permanece bloqueado hasta completar sus gates explícitos.
- La retención auditada evita borrar directamente datos financieros, de
  inventario o auditoría y preserva evidencia de certificación.
- La retención obliga a inventario de recursos y a diferenciar visiblemente el
  fixture de un tenant real.
- Un rollback de código nunca revierte automáticamente los hechos Bodega ya
  persistidos.
- No se aprovisionan Secrets adicionales para desbloquear Bodega.

## Gates posteriores

| Gate | Alcance | No autoriza automáticamente |
| --- | --- | --- |
| A — Aprobación documental | Aceptar o rechazar esta ADR propuesta. | Deploy, fixture o rehearsal. |
| B — Preflight técnico `saas-auth` | Comprobar delta, artefacto, Secrets, tráfico y rollback. | Deploy. |
| C — Autorización de deploy staging | Autorizar exclusivamente el delta Bodega demostrado. | Fixture u onboarding. |
| D — Creación de fixture | Crear un único `E2.2-BODEGA-STAGING-FIXTURE` auditado. | Rehearsal completo. |
| E — Rehearsal | Ejecutar Bootstrap, autenticación, activación, configuración, catálogo, inventario, turnos, ventas, idempotencia, aislamiento y autoridad. | Certificación. |
| F — Certificación E2.2 | Evaluar evidencia, retención y estado final del fixture. | Producción. |

Cada gate requiere autorización explícita y una mutation audit independiente.

**Estado de gates:** Gate A `COMPLETED / ACCEPTED`; Gate B
`BLOCKED / SUPERADO MEDIANTE DECISIÓN ARQUITECTÓNICA (ADR-SAAS-049)`.
La implementación aislada quedó integrada en `main` mediante PR #400; ningún
gate operativo posterior queda autorizado por esa integración.

## Criterios de aceptación de esta decisión

- no contradice ADR-SAAS-041 ni modifica sus contratos Bodega;
- reconoce que ADR-SAAS-043 a ADR-SAAS-047 establecen el patrón de discovery
  aislado sin extenderlo automáticamente;
- mantiene `saas-auth` solo como ubicación temporal, no como deploy autorizado;
- establece evidencia previa obligatoria para cualquier deploy;
- formaliza fixture sintético, trazable y retenido sin datos reales;
- prohíbe cleanup automático o borrado directo de Firestore/Auth;
- deja producción y Distribuidora Las Jiménez fuera de alcance; y
- no declara implementación, deploy, fixture ni rehearsal como hechos.

## Relación con ADRs existentes

- **ADR-SAAS-041:** conserva la implementación Bodega actual y sus invariantes.
- **ADR-SAAS-043:** aplica su hallazgo de discovery monolítico y Secrets ajenos.
- **ADR-SAAS-044, 045 y 046:** mantiene intactos Bootstrap, autenticación y
  activación aislados; no importa ni modifica sus boundaries.
- **ADR-SAAS-047:** mantiene intacta la lectura tenant-aware aislada y su
  certificación staging.

## Rollback

Antes de cualquier deploy, rollback consiste en revertir una futura rama
técnica. Tras un deploy staging autorizado, rollback exige un gate operativo,
una revisión conocida y una evaluación separada de los datos persistidos. No
se borran automáticamente tenants, Auth, auditoría, inventario, ventas ni
movimientos financieros.
