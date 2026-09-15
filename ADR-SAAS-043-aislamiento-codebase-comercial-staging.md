# ADR-SAAS-043 — Aislamiento de codebase para comando comercial SaaS

## Estado

**Aceptado.**

Este ADR formaliza una frontera de discovery y despliegue. Autoriza una
implementación local aislada; no autoriza Secrets, despliegues, comandos
comerciales, provisioning, creación de tenants ni producción.

## Goal, alcance y relación

- **Goal rector:** `G-SAAS-02`.
- **Milestone:** `M2 — Provisioning y onboarding`.
- **Epic:** `E2.2 — Configuración inicial`.
- **Función afectada:** `ejecutarComandoComercialSaas` en `us-central1`.
- **Complementa:** ADR-SAAS-011, ADR-SAAS-012, ADR-SAAS-013 y ADR-SAAS-028.
- **Relación con ADR-SAAS-041:** aplica el mismo patrón de aislamiento de
  discovery, pero no amplía ni sustituye su decisión Dusema, que conserva su
  estado `Propuesto` y alcance propio.

## Contexto

El deploy focalizado de `ejecutarComandoComercialSaas` contra staging descubre
primero el manifiesto completo del codebase `saas-auth`. La callable comercial
no declara Secrets, pero su entrypoint y sus imports conviven con capacidades
ajenas que sí los declaran. Firebase resuelve los parámetros del manifiesto
antes de aplicar el filtro `--only`.

La evidencia de discovery sobre `main @ 8a1f4ffa2152c4b97e865b9c20e17e8b2b615993`
identificó esta frontera:

| Secret | Capacidad consumidora | Consumido por `ejecutarComandoComercialSaas` |
|---|---|---|
| `OPERATIONAL_PIN_PEPPER` | Bootstrap, credenciales e incorporaciones directas | No |
| `EMAIL_INVITATION_TOKEN_PEPPER` | Incorporaciones por email | No |
| `WOMPI_EVENTS_SECRET` | `wompiReservasWebhookV1` | No |
| `DUSEMA_*` | `consultarTenantDusemaSaas` | No |

El bloqueo de un Secret ajeno no es un motivo para aprovisionarlo sin decisión
de su capacidad propietaria. Tampoco es un cambio de autoridad, contrato,
persistencia ni lógica comercial.

## Decisión

Se creará un codebase Firebase independiente, **`saas-commercial`**, que
declarará exclusivamente:

```text
ejecutarComandoComercialSaas
```

No es un microservicio ni una segunda implementación del dominio. Es una
frontera mínima de discovery y despliegue dentro del mismo repositorio y
proyecto Firebase.

El nuevo codebase debe cumplir simultáneamente:

1. declarar cero Firebase Secrets y cero parámetros sensibles;
2. cargar únicamente el cierre de imports estrictamente necesario;
3. conservar nombre, región `us-central1`, envelope, autenticación,
   autorizaciones `COMERCIAL_GOBERNAR` y `LIFECYCLE_GOBERNAR`, idempotencia,
   `expectedRevision`, auditoría, comandos y efectos Firestore existentes;
4. contener un adaptador delgado; la única implementación del ejecutor
   comercial continúa siendo compartida y canónica;
5. no importar `functions/src/index.ts` ni `functions/src/platform/callables.ts`;
6. no importar módulos que declaren `defineSecret(...)` ni que introduzcan
   Bootstrap, credenciales, incorporaciones, Wompi o Dusema en el grafo.

Una vez implementada y validada la migración, `saas-auth` deja de exportar e
importar esta callable. La Function se declara en exactamente un manifiesto.

## Frontera técnica propuesta

La separación no puede limitarse a mover el adaptador: hoy el adaptador importa
`platform/operations.ts`, que declara `OPERATIONAL_PIN_PEPPER` para otras
operaciones y carga dependencias de Bootstrap/credenciales.

La implementación deberá extraer solo el cierre comercial secret-free:

```text
functions-commercial/src/index.ts
  └─ platform/commercial-callable.ts
       ├─ platform/authorization.ts
       ├─ platform/command-catalog.ts
       └─ platform/commercial-command-executor.ts
            ├─ suscripciones/service.ts
            ├─ suscripciones/relaciones-service.ts
            ├─ configuracion/service.ts y capacidades derivadas
            ├─ platform/audit.ts
            ├─ platform/contracts.ts
            └─ platform/validation.ts
```

Los helpers de planificación/finalización de auditoría que use el ejecutor se
extraerán una sola vez a una unidad privada secret-free o permanecerán junto al
ejecutor. `platform/operations.ts` conservará Bootstrap y credenciales; no se
duplicará el ejecutor ni sus invariantes.

La inicialización Admin SDK seguirá el patrón idempotente de los codebases
secret-free existentes. Ningún módulo del nuevo closure debe realizar I/O, leer
Secrets, consultar Firestore ni invocar servicios externos durante discovery.

## Topología

Topología actual declarada por `firebase.json`:

| Codebase | Responsabilidad |
|---|---|
| `saas-auth` | Auth, Bootstrap, plataforma, POS y capacidades que incluyen Secrets |
| `saas-dusema-binding` | Binding Dusema aislado |
| `saas-platform-context` | Contexto de plataforma |
| `saas-operator-summary` | Resumen de operador |
| `saas-platform-resources` | Recursos de plataforma |

Topología futura propuesta: las cinco superficies anteriores más
`saas-commercial`, limitado a la callable comercial.

`ADR-SAAS-041` describe una topología futura de dos codebases aunque
`firebase.json` ya declara cinco. Esa reconciliación documental es un trabajo
separado: este ADR no modifica ADR-SAAS-041 ni reescribe su decisión Dusema.
De manera análoga, `functions/README.md` indica que STG-02 no configura Secrets
S2S de Dusema mientras existe metadata de esos Secrets en Secret Manager staging;
la existencia no demuestra uso ni autoriza cambios y debe reconciliarse por
separado.

## Contrato preservado

La migración no cambia:

- el nombre público `ejecutarComandoComercialSaas`;
- la ruta/región de Functions;
- el cliente `lib/platform/client.ts` ni consumidores E2E;
- el allowlist de `obtenerComandoComercial`;
- la resolución especial de facultad para transiciones de Empresa;
- autoridad de operador, claims y revalidación server-side;
- envelopes, `commandId`, `idempotencyKey`, `correlationId`, `causationId`,
  `motivoCodigo` y `expectedRevision`;
- receipts, auditoría durable, revisiones, máquinas de estado y persistencia.

En particular, el codebase no puede recortar silenciosamente los comandos de
lifecycle actualmente admitidos por la callable. Su frontera de despliegue no
altera el contrato funcional.

## Migración controlada

El endpoint de staging está reportado actualmente con codebase remoto stale
`saas-commercial` y artefacto `967a892e…`. Esa metadata no autoriza reutilizar
automáticamente su identidad ni reemplazarlo.

Antes de desplegar se exige un preflight read-only que registre:

1. metadata remota de `ejecutarComandoComercialSaas`: nombre, región, Gen 2,
   revisión, trigger, codebase/labels, servicio y tráfico;
2. manifiestos locales de `saas-auth` y del futuro `saas-commercial`;
3. que solo un manifiesto declara el endpoint;
4. el plan de Firebase CLI para comprobar que no interpreta el cambio como
   eliminación accidental;
5. IAM de invocación y cuenta de servicio gestionada por Firebase;
6. SHA, build reproducible y ausencia de Secrets/params en el manifiesto nuevo.

El despliegue, si es autorizado posteriormente, será exclusivo de staging y de
esa Function. La validación posterior debe confirmar revisión activa, endpoint
sin cambio, código/cierre esperado, cero Secrets declarados y continuidad de la
autorización comercial. No se usarán comandos comerciales mutantes como smoke
sin autorización independiente.

## Rollback

Antes de deploy, rollback es revertir el cambio documental/técnico en la rama.
Después de deploy, rollback requiere un gate operativo independiente y debe
restaurar una revisión conocida sin borrar Functions, Secrets, planes,
suscripciones, tenants ni auditoría. Si Firebase CLI requiere eliminar,
reasignar o reemplazar una Function existente, la migración se detiene hasta una
decisión operativa explícita.

## Producción

Este ADR no autoriza producción. Un despliegue productivo requiere, como mínimo:

1. ADR aceptado e implementación auditada;
2. CI y pruebas de discovery secret-free en verde;
3. validación staging satisfactoria y evidencia de continuidad del endpoint;
4. preflight remoto de producción con metadata, IAM, versión y rollback;
5. ventana, responsable y autorización operacional separados.

## Alternativas evaluadas

| Alternativa | Resultado |
|---|---|
| Provisionar `WOMPI_EVENTS_SECRET` para desbloquear el deploy | Rechazada: acopla una capacidad ajena y amplía superficie sensible sin necesidad comercial. |
| Mover únicamente el adaptador | Rechazada: `operations.ts` aún declara PIN y carga Bootstrap. |
| Duplicar callable o ejecutor | Rechazada: crea drift en autorización, idempotencia, auditoría y lifecycle. |
| Crear un codebase comercial secret-free con un único ejecutor | Decisión aceptada. |
| Manipular filtros, manifiestos o timeouts de CLI | Rechazada: no elimina la resolución global de parámetros ni es una frontera soportada. |

## Riesgos y controles

- **Import residual con Secret:** test de discovery/manifiesto que exige cero
  params y cero `secretEnvironmentVariables`.
- **Drift de dominio:** una sola implementación y suites actuales de Planes,
  Suscripciones, autorización, auditoría e idempotencia.
- **Colisión/eliminación de endpoint:** preflight de metadata y declaración en
  un único codebase antes de deploy.
- **Regresión de cliente:** pruebas que ejercen el mismo nombre, región,
  contrato y errores esperados.
- **IAM inesperado de Gen 2:** verificación y aprobación previa al deploy.
- **Alcance a producción:** ningún deploy productivo queda incluido.

## Criterios de aceptación de implementación

- `saas-commercial` descubre exactamente una callable y cero Secrets/params
  sensibles.
- El cierre de imports no contiene Wompi, Dusema, Bootstrap, credenciales ni
  incorporaciones.
- `saas-auth` ya no declara la callable comercial.
- No hay duplicación del ejecutor ni del dominio comercial.
- Las suites existentes conservan contrato, autoridad, idempotencia,
  `expectedRevision`, auditoría y efectos Firestore.
- Build, typecheck y discovery de cada codebase son reproducibles en CI.
- El preflight remoto demuestra que no existe eliminación o colisión accidental.
- Staging se valida antes de considerar producción.

## Decisiones pendientes

1. Confirmar por metadata remota si el codebase stale `saas-commercial` puede
   ser adoptado, debe migrarse o requiere una identidad nueva.
2. Aprobar por separado el gate de deploy staging y, después, cualquier gate de
   producción.
3. Reconciliar documentalmente ADR-SAAS-041 y la topología de cinco codebases,
   sin mezclarlo con la implementación comercial.

## Evidencia de implementación local

- `firebase.json`;
- `.github/workflows/ci.yml`;
- `functions/src/index.ts`;
- `functions/src/platform/callables.ts`;
- `functions/src/platform/audit-confirmation.ts`;
- adaptador y ejecutor comercial secret-free;
- directorio `functions-commercial/` con package, lockfile, TypeScript,
  entrypoint y discovery;
- pruebas de contrato, build y discovery; y
- automatización CI del codebase.

No se incluye deploy, Secrets, comandos comerciales ni writes de infraestructura.
