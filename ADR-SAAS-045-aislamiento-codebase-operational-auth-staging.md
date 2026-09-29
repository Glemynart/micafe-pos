# ADR-SAAS-045 — Aislamiento de autenticación operativa SaaS

## Estado

**Aceptado.**

**Fecha de aceptación formal:** 2026-09-21.

La aceptación autoriza la implementación controlada del boundary
`saas-operational-auth` dentro de `G-SAAS-02 → M2 → E2.2`. No declara creado el
codebase fuera de la regularización, no autoriza despliegues ni escrituras
remotas y no cierra E2.2.

### Trazabilidad de gobernanza

- **Revisión formal 1:** `REQUIRES CHANGES`; se corrigieron las precisiones de
  contrato, reintentos, cutover, rollback, evidencia y criterios de aceptación.
- **Revisión formal 2:** `APPROVE — READY FOR FORMAL ACCEPTANCE`, 2026-09-21.
- **Aceptación formal:** `Aceptado`, 2026-09-21.

La regularización de fuente permanece separada de cualquier operación remota:
no modifica el endpoint activo ni habilita nuevos despliegues fuera de sus
gates operativos.

### Regularización de fuente y topología

La secuencia histórica `94d492d` provee la fuente de
`functions-operational-auth`, `saas-operational-auth` y el ejecutor neutral
`functions/src/operational-auth-executor.ts`. E2.2 la incorpora a Git junto
con el manifiesto y el retiro de `autenticarOperativo` de `saas-auth`, para que
la topología pueda reconstruirse desde `main`. La correspondencia Git directa
con el artefacto remoto histórico sigue siendo `UNKNOWN`; esta regularización
no la presenta como demostrada ni realiza cambios en staging, Secrets, IAM o
producción.

## Goal, alcance y relación

- **Goal rector:** `G-SAAS-02`.
- **Milestone relacionado:** `M2 — Provisioning y onboarding`.
- **Epic relacionado:** `E2.2 — Configuración inicial`.
- **Función afectada:** `autenticarOperativo`, región `us-central1`.
- **Complementa:** ADR-SAAS-011, ADR-SAAS-013, ADR-SAAS-017 y ADR-SAAS-043.
- **Relaciona:** ADR-SAAS-044, sin modificar su decisión ni su estado.

La implementación solo podrá comenzar después de la aprobación formal de este
ADR y de la sincronización de los documentos maestros que correspondan.

## Contexto

`saas-auth` contiene actualmente la superficie de autenticación operativa junto
con otras Functions. El análisis realizado sobre el código y el entorno de
staging estableció:

- `autenticarOperativo` vive en `functions/src/operational-auth.ts` y es
  exportada por el entrypoint de `saas-auth`.
- El codebase local descubre 85 endpoints.
- `autenticarOperativo` requiere `OPERATIONAL_PIN_PEPPER`, pero no utiliza
  `WOMPI_EVENTS_SECRET`.
- El despliegue targeted dentro de `saas-auth` queda condicionado por el
  discovery global de `wompiReservasWebhookV1`, que declara
  `WOMPI_EVENTS_SECRET`.
- Aprovisionar ese Secret solo para desplegar autenticación operativa acoplaría
  una capacidad no relacionada y ampliaría la superficie sensible.
- En staging no está materializada remotamente `autenticarOperativo`.
- La certificación post-Bootstrap del tenant sintético depende de esta callable.

El problema es de frontera de discovery, despliegue y configuración. No se
propone cambiar la lógica de autenticación, el modelo de datos ni la autoridad
de negocio.

## Decisión propuesta

Crear un codebase Firebase dedicado, **`saas-operational-auth`**, que exponga
exactamente una callable:

```text
autenticarOperativo
```

El codebase usará la región `us-central1` y declarará únicamente el Secret
lógico `OPERATIONAL_PIN_PEPPER`. No será un microservicio ni una segunda
implementación del dominio: será una frontera mínima de discovery y despliegue
dentro del mismo repositorio y proyecto Firebase.

La implementación propuesta tendrá un adaptador dedicado y una frontera
neutral compartida. El entrypoint nuevo no importará el entrypoint completo de
`saas-auth` ni módulos de dominios ajenos.

## Contrato preservado

La callable conservará sin cambios:

- nombre público `autenticarOperativo`;
- región `us-central1`;
- payload exacto `{ codigo: string, pin: string }`;
- normalización del código y validación del PIN;
- uso de `OPERATIONAL_PIN_PEPPER`;
- resolución y validación de la credencial operativa;
- bloqueo y contador de fallos;
- validación de Empresa y de su estado operativo;
- validación de membresía tenant-aware;
- credencial temporal e incorporación `DIRECTA`;
- validación de TTL;
- claims tenant y `authStage`;
- emisión de `createCustomToken`;
- errores y códigos públicos existentes;
- semántica observable de reintentos, contadores y bloqueo.

No se agregará `empresaId` al payload ni se confiará en un tenant enviado por el
cliente.

### Respuesta pública observable

La respuesta exitosa conserva exactamente este shape, con los campos
condicionales que ya produce la implementación:

```ts
{
  customToken: string;
  requiereCambio?: boolean;
  incorporacionId?: string;
  restablecimientoId?: string;
}
```

En el camino normal solo se devuelve `customToken`. Para una credencial
temporal de incorporación DIRECTA se devuelve `customToken`,
`requiereCambio: true` e `incorporacionId`. Para una credencial temporal de
restablecimiento se devuelve `customToken`, `requiereCambio: true` y
`restablecimientoId`. El ADR no agrega campos ni cambia la activación posterior.

### Errores públicos y detalles internos

La implementación observable de esta callable expone:

- `unauthenticated`: payload/PIN inválido, credencial inexistente, inactiva o
  bloqueada, Empresa no operativa, membresía inválida, incorporación temporal
  inválida/expirada o cualquier error no clasificado que el handler normaliza
  a credenciales inválidas.
- `internal`: Secret no disponible o invariantes de unicidad/consistencia que
  el backend detecta durante la resolución. El mensaje es genérico y no forma
  parte de un contrato de detalle.

No se consideran contrato público los nombres de logs, stack traces, consultas,
mensajes internos ni los errores de otras callables del módulo. La equivalencia
posterior debe comprobar los códigos anteriores contra la implementación y sus
pruebas, sin inventar códigos adicionales.

### Reintentos y ausencia de idempotency key

`autenticarOperativo` no recibe ni genera `idempotencyKey` y este ADR no
introduce uno. Un PIN incorrecto o una credencial no coincidente incrementa el
contador cuando existe una única candidata; al alcanzar el umbral vigente la
credencial queda bloqueada durante el periodo ya definido por el código. Una
autenticación correcta limpia los fallos y emite un nuevo `customToken`.

Repetir una autenticación correcta no crea Empresa, membresía, credencial ni
incorporación nuevas; vuelve a ejecutar la validación vigente y emite el token
correspondiente. En los caminos temporales se devuelve el mismo identificador
persistido (`incorporacionId` o `restablecimientoId`) mientras la credencial y
el estado temporal sigan siendo válidos. Esta semántica es seguridad funcional
de reintentos, no idempotencia formal por clave. Cualquier comportamiento no
demostrado por código o pruebas queda como límite de evidencia y no se
convertirá en un nuevo contrato.

## Implementación única y frontera neutral

Debe existir una única implementación ejecutora de la autenticación operativa.
Los codebases serán adaptadores delgados. La relación objetivo es:

```text
saas-operational-auth/src/index.ts
        │
        └── adaptador de autenticarOperativo
                │
                └── frontera neutral compartida
                        │
saas-auth/src/operational-auth.ts ── adaptador legacy durante la transición
```

La frontera compartida solo podrá contener las dependencias necesarias para la
callable. No se permite duplicar lógica de PIN, bloqueo, claims, errores,
auditoría o resolución de credencial.

El codebase nuevo no importará:

- `functions/src/index.ts`;
- el entrypoint completo de `saas-auth`;
- Wompi;
- Dusema;
- email/invitaciones;
- Bootstrap;
- comandos comerciales;
- módulos que declaren Secrets ajenos.

La ubicación física concreta de la frontera neutral se decidirá durante la
implementación, respetando el criterio de una única implementación y sin
importaciones frágiles entre entrypoints desplegables.

## Boundary de Secrets

El manifiesto de `saas-operational-auth` deberá demostrar:

```text
Secrets = [OPERATIONAL_PIN_PEPPER]
parámetros sensibles adicionales = []
```

No declarará ni arrastrará:

- `WOMPI_EVENTS_SECRET`;
- `EMAIL_INVITATION_TOKEN_PEPPER`;
- `DUSEMA_*`;
- Secrets de Bootstrap;
- Secrets comerciales.

El mismo Secret lógico puede tener bindings independientes por codebase. Esta
propuesta no crea, modifica ni rota ningún Secret.

## Boundary de module-load

El entrypoint y todo su cierre de imports deberán demostrar, mediante prueba
aislada, que el import no ejecuta llamadas a Firestore, Auth, Secret Manager,
HTTP ni lectura de Secrets. Los efectos legítimos ocurrirán únicamente durante
la ejecución de la callable.

## Autoridad y seguridad

La autoridad seguirá siendo server-side:

- la credencial se resuelve en el backend;
- la Empresa se deriva de la credencial y se valida en servidor;
- membresía, rol y estado se leen y validan en servidor;
- los claims se emiten únicamente desde el backend;
- el PIN nunca se persiste en claro ni se envía a auditoría;
- ningún guard visual del cliente sustituye la autoridad de la callable.

El aislamiento no crea permisos, claims, membresías ni relaciones nuevas.

## Topología

La topología propuesta quedaría:

```text
saas-commercial
└── ejecutarComandoComercialSaas

saas-bootstrap
└── solicitarBootstrapEmpresarialSaas

saas-operational-auth
└── autenticarOperativo

saas-auth
└── superficie legacy restante durante la transición
```

ADR-SAAS-043 permanece vigente para la superficie comercial. ADR-SAAS-044
permanece separado para Bootstrap y no se modifica mediante esta propuesta.

## Convivencia y migración controlada

La implementación compartida y la declaración/exportación de una callable son
fronteras distintas. Puede existir temporalmente un adapter legacy local para
comparación y rollback, pero nunca dos endpoints públicos materializados ni dos
manifiestos desplegables que declaren el mismo nombre.

El cutover se ejecutará en este orden, solo después de que el ADR y su
implementación sean aprobados:

A. Preparar y validar el cierre neutral y el nuevo codebase sin materializar una
   segunda ruta pública.
B. Mantener el adapter legacy y el executor compartido únicamente como soporte
   local de equivalencia/rollback.
C. Retirar `autenticarOperativo` de la exportación y declaración del manifiesto
   de `saas-auth`, sin retirar `bootstrapEmpresarialCallable` ni otras Functions.
D. Verificar en el manifiesto compilado que `saas-auth` ya no declara esa
   callable.
E. Declarar `autenticarOperativo` exclusivamente en `saas-operational-auth`.
F. Ejecutar discovery local y remoto/read-only, comprobando exactamente un
   endpoint y ningún endpoint duplicado.
G. Ejecutar plan Firebase, pruebas de contrato y smoke sin operaciones mutantes;
   cualquier eliminación, reasignación o colisión detiene el cutover.
H. Solo con esa evidencia se considera el endpoint materializable en staging;
   producción requiere un gate separado.

## Rollback

El rollback será una secuencia explícita y verificable, no un efecto implícito
del CLI:

1. Detener el cutover ante fallo de discovery, build, IAM, healthcheck o
   materialización del endpoint nuevo. No reintentar con `--force` ni ejecutar
   otro target automáticamente.
2. Si el nuevo codebase aún no materializó una Function usable, restaurar en la
   rama la declaración/exportación legacy de `autenticarOperativo` y retirar la
   declaración del nuevo codebase antes de cualquier redeploy autorizado.
3. Ejecutar discovery local y plan Firebase para demostrar que queda una sola
   declaración, sin borrados o reasignaciones implícitas.
4. Desplegar solo la ruta legacy mediante un gate operativo independiente,
   usando una revisión conocida y el target explícito de `saas-auth`.
5. Verificar que el endpoint legacy está activo, en `us-central1`, con su
   contrato y Secret autorizado, y que no existe el endpoint nuevo simultáneo.
6. Registrar revisión, artifact, IAM y resultado del smoke de contrato sin
   ejecutar operaciones de tenant.

Si el plan exige borrar/reasignar una Function, si la revisión conocida no está
disponible, si el endpoint legacy no puede descubrirse o si no puede probarse
la unicidad de la ruta, el rollback se detiene y requiere decisión operativa.
No se borran Secrets, tenants, membresías, auditoría ni documentos Firestore.

## Alternativas evaluadas

### Provisionar `WOMPI_EVENTS_SECRET` y desplegar `saas-auth` completo

Mantiene la topología actual, pero introduce en staging un Secret de una
capacidad no relacionada y conserva el bloqueo de discovery global. No se
considera una solución de frontera.

### Mantener `autenticarOperativo` dentro de `saas-auth`

No requiere migración, pero mantiene el acoplamiento que impide el deploy
targeted cuando falta un Secret de Wompi.

### Duplicar la implementación en un codebase nuevo

Podría desbloquear discovery, pero produciría divergencia de PIN, bloqueo,
claims, errores e idempotencia. Se rechaza.

### Frontera neutral compartida más codebase dedicado

Conserva una implementación única, limita Secrets y permite discovery aislado.
Es la opción propuesta, sujeta a los criterios y a la aprobación de este ADR.

## Criterios de aceptación para implementación posterior

- discovery del nuevo codebase = exactamente una callable;
- endpoint = `autenticarOperativo`;
- región = `us-central1`;
- Secrets = únicamente `OPERATIONAL_PIN_PEPPER`;
- module-load sin I/O;
- cierre de imports sin Wompi, Dusema, email, Bootstrap ni comercial;
- contrato y errores públicos equivalentes;
- pruebas de PIN válido/inválido y credencial activa/bloqueada;
- pruebas de Empresa `trial`/`activa`, membresía y TTL;
- pruebas de credencial temporal e incorporación `DIRECTA`;
- pruebas de claims, `authStage` y `createCustomToken`;
- respuesta exitosa con `customToken` y los campos condicionales exactos;
- códigos públicos `unauthenticated` e `internal` preservados, sin exponer
  detalles internos;
- semántica comprobada de reintento, limpieza de contador, bloqueo y emisión de
  token;
- ausencia de `idempotencyKey` nuevo;
- ausencia de doble implementación y doble exportación;
- TypeScript, lint, build, tests y `git diff --check` en verde;
- plan Firebase sin colisión ni eliminación accidental;
- rollback verificable si el endpoint nuevo falla antes de ser usable;
- validación staging antes de cualquier consideración de producción.

## Decisiones pendientes

1. Aprobar o rechazar este ADR.
2. Confirmar el nombre final `saas-operational-auth`.
3. Confirmar la ubicación física de la frontera neutral compartida.
4. Confirmar la definición contractual de reintento/autenticación repetida,
   sin introducir `idempotencyKey`.
5. Confirmar el orden definitivo del cutover y la retirada de la exportación
   legacy en `saas-auth`.
6. Confirmar el criterio de éxito/fallo para materializar el endpoint nuevo.
7. Confirmar el rollback operativo si el endpoint nuevo falla antes de quedar
   usable.
8. Confirmar el preflight remoto y el rollback operativo antes del primer
   despliegue.

Estas decisiones no se resuelven mediante código en esta propuesta.

## Referencias

- `docs/governance/METODOLOGIA-GOAL.md`.
- `docs/goals/GOAL-MVP-COMERCIAL.md`.
- `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`.
- `ADR-SAAS-043-aislamiento-codebase-comercial-staging.md`.
- `ADR-SAAS-044-aislamiento-codebase-bootstrap-staging.md`.
- `functions/src/operational-auth.ts`.
- `lib/operational-auth-service.ts`.
- `functions/src/index.ts`.
- `functions/src/contracts.ts`.
- `functions/src/pin-security.ts`.
- `functions/src/platform/vigencia-credencial-temporal.ts`.
- `functions/src/credential-recovery-service.ts`.
- `firebase.json`.

## Evidencia y límites de esta propuesta

Las afirmaciones técnicas se respaldan así:

- El endpoint, su exportación y el cierre de imports se inspeccionan en
  `functions/src/operational-auth.ts`, `functions/src/index.ts`,
  `functions/src/contracts.ts`, `functions/src/pin-security.ts`,
  `functions/src/platform/vigencia-credencial-temporal.ts` y
  `functions/src/credential-recovery-service.ts`.
- La declaración de `OPERATIONAL_PIN_PEPPER` está en
  `functions/src/operational-auth.ts`; la comparación de dominios se realiza
  contra `firebase.json` y los entrypoints de los codebases dedicados.
- La evidencia de discovery de `saas-auth` (85 endpoints) y la ausencia remota
  de `autenticarOperativo` provienen de consultas read-only del análisis de
  staging. No hay un artefacto versionado con la salida completa; estas dos
  afirmaciones quedan marcadas como evidencia limitada hasta que se adjunte un
  manifiesto reproducible.
- El dry-run focalizado utilizado durante el análisis fue:
  `npx --no-install firebase deploy --project micafe-pos-staging --only functions:saas-auth:autenticarOperativo --dry-run --non-interactive`.
  Su bloqueo por `WOMPI_EVENTS_SECRET` demuestra el acoplamiento de discovery,
  no un consumo de ese Secret por la callable objetivo.
- Las pruebas existentes de activación DIRECTA, TTL y credencial temporal en
  `functions/src/email-integration.test.ts` y las pruebas de servicios de
  incorporación respaldan la semántica temporal; la implementación futura
  deberá añadir las pruebas específicas de la callable enumeradas arriba.

Este ADR no implementa `saas-operational-auth`, no modifica el entrypoint
legacy, no modifica `firebase.json`, no crea Secrets y no realiza despliegues ni
escrituras remotas.
