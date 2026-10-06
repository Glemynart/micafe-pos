# ADR-SAAS-049 — Aislamiento de codebase Bodega MVP-1 para staging

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-09-29.

Esta aceptación constituye una nueva decisión formal de gobernanza. Autoriza
la implementación de la frontera `saas-bodega` únicamente dentro del alcance
definido por este ADR. No autoriza por sí misma deploy, tráfico, fixture,
Bootstrap, Activation ni producción.

Esta decisión pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding →
E2.2 — Configuración inicial`. La autorización de implementación fue consumida
por el PR técnico #400, integrado en `main` mediante
`a89b5f17567abd45e1b177b76c9822c4add985ee` el 2026-09-30, con CI post-merge
`36740060340` en `PASS`. Esa autorización cubrió exclusivamente el boundary
`saas-bodega` y los cambios de manifest necesarios para implementarlo; no
autoriza despliegues, fixtures, Bootstrap, Activation, Firestore, Auth, Rules,
IAM, Secrets ni producción.

**Complemento vigente.** El alcance original de cinco callables fue ampliado
de forma explícita y acotada por ADR-SAAS-052, aceptada posteriormente. PR
#409 integró en `main` la sexta callable `crearCategoriaBodegaV1`, con Rules y
adaptador administrativo estrictamente necesarios. Las menciones a “cinco” en
esta ADR describen el corte original de PR #400 y no limitan la superficie
vigente de seis endpoints. ADR-SAAS-052 no autoriza por sí misma deploy,
tráfico, fixture, Bootstrap, Activation ni producción.

La propuesta responde al bloqueo documentado por ADR-SAAS-048 en el Gate B.
No modifica las decisiones aceptadas de ADR-SAAS-043 a ADR-SAAS-048, ni
convierte una fuente local en evidencia de staging.

## 1. Contexto y problema

Las cinco callables Bodega originales necesarias para el ensayo E2.2 estaban declaradas en
`functions/src/index.ts`, dentro de `saas-auth`:

- `crearClienteVendedorV1`;
- `crearPresentacionComercialV1`;
- `actualizarPresentacionComercialV1`;
- `crearArticuloInventarioV1`; y
- `confirmarVentaBodegaV1`.

El Gate B comprobó que no están materializadas en `micafe-pos-staging` y que
`saas-auth` descubre, junto a ellas, recovery, incorporaciones, Bootstrap,
Wompi, Dusema, plataforma, callables POS ajenas y schedules. Aunque Bodega no
consume funcionalmente Wompi, Dusema, email ni Bootstrap, el codebase
monolítico declara o alcanza parámetros ajenos. No existe un plan de Firebase
Functions inequívocamente read-only que pruebe que un deploy de `saas-auth`
afectaría solamente estas cinco funciones.

Además, no existe una revisión staging conocida de `saas-auth` ni un artefacto
atestado que permita rollback de código antes de un primer despliegue. Un
despliegue experimental para obtener esa evidencia está prohibido por
ADR-SAAS-048.

## 2. Decisión

La frontera de discovery y despliegue dedicada autorizada es:

```text
saas-bodega
└─ functions-bodega/src/index.ts
   ├─ crearClienteVendedorV1
   ├─ crearPresentacionComercialV1
   ├─ actualizarPresentacionComercialV1
   ├─ crearArticuloInventarioV1
   └─ confirmarVentaBodegaV1
```

La frontera es Gen 2, `us-central1`, Node.js 22 y
`ZERO_SECRETS_REQUIRED`. No es un microservicio, una segunda implementación
del dominio ni una autorización de despliegue; es una unidad mínima de
discovery para conservar los contratos Bodega existentes sin descubrir
capacidades ajenas.

Los nombres públicos de las cinco callables, sus contratos, códigos de error,
autoridad server-side, transacciones, idempotencia, snapshots, auditoría y
efectos canónicos permanecen sin cambios. No forman parte de esta propuesta
`consultarClientesVendedorV1`, las lecturas de catálogo, la actualización de
artículo ni la merma: cualquier migración de esas superficies requiere una
decisión posterior explícita.

## 3. Alcance exacto

| Callable | Entrypoint actual | Responsabilidad conservada |
| --- | --- | --- |
| `crearClienteVendedorV1` | `bodega-vendedor/clientes.ts` | Alta tenant-aware de cliente Bodega. |
| `crearPresentacionComercialV1` | `bodega-vendedor/presentaciones.ts` | Alta de presentación, factor y precio canónicos. |
| `actualizarPresentacionComercialV1` | `bodega-vendedor/presentaciones.ts` | Cambio autorizado de presentación existente. |
| `crearArticuloInventarioV1` | `inventario/callables.ts` | Alta server-authoritative de artículo e inventario inicial. |
| `confirmarVentaBodegaV1` | `bodega-vendedor/ventas-confirmation.ts` | Venta de contado atómica, idempotente y auditada. |

Quedan fuera: UI, Rules, clientes reales, fixture staging, Bootstrap,
autenticación operativa, activación, configuración de planes, Wompi, Dusema,
email, recovery, schedules, plataforma, comercial, fiscalidad y producción.

## 4. Dependency closure propuesta

La implementación autorizada no copia módulos completos solo para conservar
compilación. Debe extraer o reutilizar unidades con la siguiente
clasificación:

| Dependencia actual | Clasificación | Tratamiento requerido |
| --- | --- | --- |
| `firebase-admin` y `firebase-functions/v2/https` | NEUTRAL / REUSABLE | Inicialización idempotente en el runtime; handlers Gen 2 delgados. |
| Contratos, normalizadores y resoluciones Bodega | BODEGA-SPECIFIC | Mover una sola implementación canónica, sin duplicarla. |
| `tenant-configuration/authority.ts` | NEUTRAL / REUSABLE | Usar la primitiva tenant-aware directamente, después de demostrar equivalencia. |
| `operational-auth.ts` completo | MUST_NOT_IMPORT | Declara `OPERATIONAL_PIN_PEPPER` e integra autenticación operativa ajena. |
| `configuracion/reader.ts` | NEUTRAL / REUSABLE | Usar solo lectura necesaria de configuración. |
| `configuracion/service.ts` completo | MUST_NOT_IMPORT | Contiene mutaciones e inicialización de configuración ajenas. |
| `executeConContexto` y revalidación financiera | MUST_EXTRACT | Extraer una primitiva neutral sin handlers financieros ni ruta Wompi. |
| cuentas, movimiento financiero e idempotencia | MUST_EXTRACT | Conservar semántica de cuenta lógica, ledger, receipts y auditoría. |
| `inventario/ledger.ts` | NEUTRAL / REUSABLE, sujeto a audit | Reutilizar solo sus primitivas transaccionales si el closure permanece secret-free. |
| identificadores internos y contratos de turno | NEUTRAL / REUSABLE | Mantener IDs y comprobación de turno canónicos. |
| Wompi, Dusema, Bootstrap, recovery, email, plataforma y schedules | MUST_NOT_IMPORT | Deben estar ausentes del entrypoint y de todo import transitivo. |

La clasificación `MUST_EXTRACT` no autoriza todavía una extracción: fija el
trabajo de diseño/implementación que debe aparecer en un PR posterior.

## 5. Autoridad tenant

La autoridad seguirá siendo exclusivamente server-side. El nuevo boundary
debe derivar `uid`, `empresaId`, membresía activa, rol, permisos y estado de
Empresa desde Auth y Firestore mediante una primitiva neutral equivalente a
la actual. Cada efecto financiero deberá revalidar la autoridad dentro de su
transacción.

El cliente no puede proporcionar como autoridad `empresaId`, `actorId`, rol,
permisos, precio, costo, factor, stock, total, cuenta física, snapshots ni
efectos derivados. Las cinco callables conservarán sus contratos actuales de
intención y el rechazo explícito de campos autoritativos.

## 6. Configuración

Bodega necesita lectura tenant-aware de Empresa/configuración para comprobar
vertical `BODEGA_MVP1` y capacidades como `clientes`, `inventory` y `sell`.
La unidad permitida será un reader neutral mínimo equivalente a
`configuracion/reader.ts`; no se importará `configuracion/service.ts` ni sus
mutaciones, inicialización, rutas administrativas o lógica fiscal ajena.

## 7. Inventario, finanzas, turnos y auditoría

`crearArticuloInventarioV1` debe conservar la validación financiera,
idempotencia, secuencia, saldo y auditoría de inventario. `confirmarVentaBodegaV1`
debe conservar, dentro de una única transacción, resolución de cliente,
producto y presentación, cálculo server-side del factor/precio/costo, stock,
cuenta lógica, turno de recaudo, movimiento financiero, snapshots, venta y
auditoría.

La frontera nueva no puede reemplazar esos efectos por DTOs del cliente ni
convertir transacciones en escrituras separadas. Las primitivas de ledger,
cuentas, turnos, idempotencia y auditoría se extraerán solo si se puede
demostrar su equivalencia funcional y su ausencia de imports prohibidos.

## 8. Secrets, parámetros y module-load

**ZERO_SECRETS_REQUIRED.** Las cinco callables no requieren consumir
`WOMPI_EVENTS_SECRET`, parámetros Dusema, `OPERATIONAL_PIN_PEPPER`, email,
Bootstrap ni recovery. El nuevo codebase no declarará Secrets ni parámetros
sensibles y no importará módulos que los definan.

El discovery y module-load deberán demostrar que no hay llamadas Firestore,
Auth, Secret Manager, HTTP, Storage ni APIs externas al importar. La
inicialización Admin permitida debe ser idempotente y ocurrir únicamente en el
contexto de runtime, nunca como I/O accidental de una unidad compartida.

## 9. Topología y migración propuestas

La implementación autorizada y los gates posteriores se rigen por esta
secuencia:

1. extraer/reutilizar el closure mínimo y conservar los contratos;
2. añadir `functions-bodega` y `saas-bodega` al manifiesto solo en el PR de
   implementación aprobado;
3. probar contrato, autoridad, equivalencia, aislamiento, idempotencia,
   inventario, finanzas, turnos y auditoría;
4. comprobar build reproducible, discovery de los cinco endpoints del corte
   original y de seis endpoints después de ADR-SAAS-052,
   cero Secrets y module-load sin I/O;
5. capturar attestation `Git → build → artefacto → revisión`;
6. realizar un preflight remoto que demuestre región, runtime, tráfico,
   secretos/parámetros, revisiones y ausencia de deletes o superficies ajenas;
7. autorizar por separado un deploy exclusivo de staging;
8. validar staging mediante fixture sintético autorizado y retenido;
9. efectuar el cutover y retirar las exportaciones legacy únicamente cuando
   exista equivalencia validada, rollback de código y aprobación explícita.

No se permite coexistencia no controlada de dos endpoints con el mismo nombre.
Antes de implementar, el plan técnico debe demostrar cómo Firebase trata el
reasignamiento de codebase para los cinco nombres públicos. Si exige delete,
replacement no aprobado o duplicación, el cutover se bloquea hasta una nueva
decisión operativa; esta ADR no presupone ese comportamiento.

## 10. Rollback

El rollback de deployment/tráfico requiere una revisión staging conocida,
retenida y atestada, y un gate operativo independiente. El rollback de código
requiere un commit, build y artefacto reproducibles. Ninguno revierte ventas,
inventario, cuentas, movimientos, auditoría, Firestore ni Auth: esos hechos
solo pueden corregirse mediante comandos canónicos idempotentes y auditados.

Antes del primer deploy de `saas-bodega`, rollback es revertir la rama técnica.
No se presenta `saas-auth` como baseline remoto ni se inventa una revisión
legacy para staging.

## 11. Validaciones obligatorias

La implementación deberá aportar como mínimo:

- pruebas de contrato y rechazo de campos autoritativos;
- Auth ausente, empresa/membresía/rol inválidos y aislamiento tenant A/B;
- precios, factores, costos, stock y total resueltos server-side;
- idempotencia de altas, inventario y venta;
- secuencia/ledger, cuenta lógica, turno, efectos financieros y auditoría;
- build, TypeScript, lint y suites Bodega/inventario/finanzas afectadas;
- discovery de las cinco callables del corte original y de seis tras
  ADR-SAAS-052, siempre con cero Secrets;
- module-load sin I/O ni imports prohibidos;
- attestation staging, revisión/tráfico esperados y validación funcional con
  fixture sintético autorizado;
- preflight y rollback de código documentados, sin declarar rollback de datos.

## 12. Alternativas evaluadas

| Alternativa | Resultado |
| --- | --- |
| Desplegar `saas-auth` con filtros | Rechazada: Gate B no puede demostrar un delta limitado ni cero efectos ajenos. |
| Aprovisionar secretos ajenos para desbloquear `saas-auth` | Rechazada: amplía privilegio sin necesidad Bodega. |
| Crear `saas-bodega` con closure mínimo | Propuesta recomendada: limita discovery y preserva una implementación canónica. |
| Duplicar handlers o reglas de negocio | Rechazada: provocaría drift de autoridad, finanzas, inventario e idempotencia. |
| Mover otras callables Bodega preventivamente | Rechazada: supera las cinco superficies necesarias y cambia alcance sin decisión. |

## 13. Riesgos y controles

| Riesgo | Control requerido |
| --- | --- |
| Import transitivo residual a secretos o Wompi/Dusema | Discovery y module-load del nuevo codebase; inspección de grafo. |
| Regresión de autoridad/efectos financieros | Equivalencia de primitivas y suites transaccionales existentes. |
| Colisión de endpoint durante cutover | Preflight de Firebase y declaración única antes de deploy. |
| Rollback ficticio | Revisión, artefacto y tráfico atestados antes de declarar reversibilidad. |
| Datos de fixture irreversibles | Lifecycle retenido bajo ADR-SAAS-048; sin cleanup automático. |
| Ampliación a producción o cliente real | Gates posteriores explícitos; producción y Distribuidora Las Jiménez fuera de alcance. |

## 14. Relación con ADRs y Gate B

- **ADR-SAAS-041:** conserva los contratos y efectos Bodega; no lo acepta ni
  reescribe.
- **ADR-SAAS-043 a 047:** reutiliza el patrón de boundary aislado, sin asumir
  que sus codebases autorizan Bodega.
- **ADR-SAAS-048:** permanece aceptado; el Gate B quedó
  `BLOCKED / SUPERADO MEDIANTE DECISIÓN ARQUITECTÓNICA` precisamente por la
  superficie monolítica y la falta de rollback/attestation. Esta ADR formaliza
  la frontera dedicada que ADR-SAAS-048 requería evaluar.

La aceptación de esta ADR autorizó la implementación del boundary en un PR
técnico separado. PR #400 integró esa implementación en `main` mediante
`a89b5f17567abd45e1b177b76c9822c4add985ee`; esta integración no autoriza
deploy, fixture, Bootstrap, Activation, cutover, producción ni el cierre de
E2.2.

## 15. Decisión solicitada

PR #400 implementó e integró el boundary `saas-bodega` bajo las restricciones
de esta ADR. El deploy dirigido de las cinco callables originales quedó
verificado en `micafe-pos-staging` el 2026-09-30; la sexta callable de
ADR-SAAS-052 quedó desplegada por separado el 2026-10-02. Las revisiones
remotas están `ACTIVE`, en `us-central1`, Node.js 22, con 100 % del tráfico en
la revisión más reciente y cero Secrets. Esta evidencia de staging no cierra
el fixture, la validación funcional, el rehearsal, la certificación, el
cutover ni producción.

## 16. Estado vigente de autorización y gates

| Estado | Situación |
| --- | --- |
| Implementación | Autorizada, ejecutada e integrada en `main` mediante PR #400. |
| Preflight de deploy | PASS — superficie dirigida y cero deletes/replacements. |
| Deploy staging | PASS — cinco callables originales; la sexta se reconcilia en ADR-SAAS-052. |
| Fixture | EXISTE Y ESTÁ RETENIDO; validación funcional pendiente. |
| Validación funcional | PENDIENTE. |
| Rehearsal / certificación | PENDIENTE. |
| Cutover y retiro de exports legacy en `saas-auth` | PENDIENTE. |
| Producción | PENDIENTE y fuera de alcance. |

La autorización consumida para implementar `saas-bodega` no concedió por sí
sola ninguno de los gates posteriores. Los gates de preflight y deploy fueron
consumidos mediante decisiones operativas separadas; fixture, validación
funcional, rehearsal, certificación, cutover y producción siguen requiriendo
su propia evidencia y mutation audit.

## Reconciliación post-merge de ADR-SAAS-062 — PR #461 (2026-10-06)

ADR-SAAS-062 amplió de forma acotada el flujo Bodega con cuatro callables de
solicitud, consulta, resolución y cancelación de solicitudes de venta. PR #461
implementó e integró ese alcance en `main`: el HEAD del PR fue
`e7d028a25300117bf1dec800fc01905dff9fdb49` y su merge commit es
`d5cd66e5bc02a06bcb5c318fce989e75e897c8bc`. El CI del PR pasó y el CI
post-merge `37516562659` terminó `success`, incluido el E2E de solicitud,
aprobación y venta canónica.

El discovery vigente de `functions-bodega/src/index.ts` contiene diez
callables Gen 2 en `us-central1`, Node.js 22 y cero Secrets: las seis
superficies del corte previo más las cuatro de ADR-SAAS-062. Por tanto, las
referencias de las secciones 2, 3, 11 y 16 a cinco/seis callables conservan
el historial de los cortes PR #400/ADR-SAAS-052; no describen el total
integrado actual.

La lectura remota de `micafe-pos-staging` del 2026-10-06 encontró seis
callables `saas-bodega` activas en `us-central1`, Node.js 22, cada una con
100 % del tráfico en su revisión lista y sin referencias a Secrets en
variables ni volúmenes de Cloud Run. Las cuatro callables de ADR-SAAS-062 no
están desplegadas. La revisión remota vigente de
`confirmarVentaBodegaV1`, `confirmarventabodegav1-00003-cud`, se creó el
2026-10-03T09:23:50Z, antes del merge de PR #461. Esto confirma que el nuevo
flujo no ha sido publicado en staging; no cambia ni invalida las evidencias
históricas de las seis funciones previas.

**Estado operativo actual:** implementación y CI de Gate B `PASS`; preflight
Gate C para el candidato de diez callables `PENDING`; deploy de esa ampliación
no ejecutado. Gate F, rehearsal G y certificación H deben repetirse después
del deploy staging por el cambio aceptado de ADR-SAAS-062. Esta reconciliación
no autoriza deploy, tráfico adicional, fixture nuevo, Bootstrap, Activation,
cutover ni producción.
