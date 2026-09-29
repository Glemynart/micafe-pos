# ADR-SAAS-044 — Aislamiento de codebase para Bootstrap empresarial SaaS

## Estado

**Aceptado.**

**Fecha de aceptación formal:** 2026-09-24.

Esta aceptación es una nueva decisión formal de gobernanza tomada el
2026-09-24; no afirma ni presupone una aceptación histórica anterior.
Autoriza la implementación controlada de `saas-bootstrap` dentro de
`G-SAAS-02 → M2 → E2.2`. La regularización de E2.2 versiona en Git la fuente
reconstruida, el manifiesto y el retiro de la exportación legacy; no ejecuta
un deploy ni cierra los checkpoints operativos de este ADR.

ADR-SAAS-044 y ADR-SAAS-045 son compatibles: `saas-bootstrap` mantiene la
frontera de `solicitarBootstrapEmpresarialSaas`, mientras que el boundary
independiente `saas-operational-auth` de ADR-SAAS-045 conserva
`autenticarOperativo`. Esta aceptación no autoriza Secrets, despliegues,
Bootstrap, provisioning, Firestore ni producción; esas operaciones continúan
sujetas a los gates propios del ADR.

### Regularización de fuente y topología

La fuente de `functions-bootstrap`, su manifest `saas-bootstrap` y la frontera
neutral `lib/bootstrap/shared.ts` se incorporan a la topología gobernada por
Git como regularización de E2.2. La evidencia de reconstrucción se conserva en
`docs/goals/evidence/ADR-SAAS-044-SOURCE-RECONSTRUCTION-2026-09-25.md`: el
artefacto histórico desplegado fue inspeccionado, pero su procedencia Git
original no es demostrable. Esta regularización no modifica staging, Secrets,
IAM ni producción; cualquier cambio remoto continúa requiriendo su propio
gate.

## 1. Contexto

`solicitarBootstrapEmpresarialSaas` está en
`functions/src/platform/callables.ts`, se exporta desde
`functions/src/index.ts`, pertenece a `saas-auth` y usa `us-central1`.
El mismo entrypoint descubre Wompi, Dusema, incorporaciones y otras
superficies que declaran Secrets o parámetros ajenos.

Firebase descubre el manifiesto completo antes de aplicar `--only`. Por ello,
un deploy dirigido a Bootstrap queda condicionado por `WOMPI_EVENTS_SECRET`,
aunque Bootstrap no lo consuma.

Estado observado en `micafe-pos-staging`:

- `OPERATIONAL_PIN_PEPPER`: ausente;
- `WOMPI_EVENTS_SECRET`: ausente;
- Bootstrap: no desplegado;
- build local de `saas-auth`: correcto;
- producción: sin cambios.

El runbook de `G-SAAS-02` exige un ensayo Bodega en staging antes de un tenant
real, usando Bootstrap canónico, `vertical: BODEGA_MVP1`, identidad de prueba
y secretos operativos disponibles.

## 2. Problema

Bootstrap no puede desplegarse de forma targeted dentro de `saas-auth` sin
aprovisionar secretos de capacidades no relacionadas. Aprovisionar
`WOMPI_EVENTS_SECRET` como workaround ampliaría una superficie sensible y
contradiría ADR-SAAS-043.

## 3. Evidencia

- `firebase.json` declara `saas-auth` con source `functions`.
- `functions/src/index.ts` exporta `solicitarBootstrapEmpresarialSaas` y
  `wompiReservasWebhookV1`.
- `functions/src/reservas-publicas/wompi.ts` declara `WOMPI_EVENTS_SECRET`.
- `functions/src/platform/callables.ts` declara `OPERATIONAL_PIN_PEPPER` y
  parámetros Dusema a nivel de módulo.
- `functions/src/platform/operations.ts` importa `bootstrap/service.ts` y
  declara nuevamente `OPERATIONAL_PIN_PEPPER`.
- ADR-SAAS-043 acepta el patrón de aislamiento para `saas-commercial`, pero
  no decide el aislamiento de Bootstrap.

## 4. Boundary funcional

La callable coordina mediante los servicios actuales:

1. autenticación y autorización de plataforma;
2. validación del envelope y de la entrada Bootstrap;
3. resolución o creación idempotente del owner;
4. comprobación de plan publicado;
5. creación atómica de Empresa, configuración, Espacio, numeración, cuentas
   reservadas, membresía `admin` y suscripción Trial;
6. materialización de `vertical`, con `GENERAL` por compatibilidad y
   `BODEGA_MVP1` como valor permitido;
7. emisión de credencial operativa inicial;
8. claims tenant-aware y habilitación del principal;
9. registro de `provisionamientos_empresariales`;
10. auditoría de solicitud y finalización;
11. recuperación mediante estado persistido e idempotencia.

## 5. Contrato público

La callable recibe un objeto que combina el envelope de plataforma con la
entrada Bootstrap:

```ts
{
  commandId: string,
  idempotencyKey: string,
  correlationId: string,
  causationId: string | null,
  motivoCodigo: string,
  empresaId: string,
  nombreComercial: string,
  paisFiscal: string,
  planId: string,
  planVersion: number,
  ownerUid?: string,
  nombreAdministrador?: string,
  vertical?: "GENERAL" | "BODEGA_MVP1",
  trialDias?: number
}
```

Reglas confirmadas por el código:

- los identificadores y `motivoCodigo` se validan con los helpers canónicos;
- `nombreComercial` y `paisFiscal` son strings no vacíos;
- `planVersion` es entero mayor o igual a uno;
- se exige exactamente uno de `ownerUid` y `nombreAdministrador`;
- `ownerUid` reutiliza un principal existente;
- `nombreAdministrador` crea el principal ancla deshabilitado;
- `vertical` es opcional y su ausencia conserva `GENERAL`;
- los únicos valores de `vertical` son `GENERAL` y `BODEGA_MVP1`;
- `trialDias` tiene default operativo de 30 días y para un plan `ANUAL` debe
  ser exactamente 30.

`expectedRevision` **no es parte del payload público de Bootstrap**. El
`expectedRevision: 1` observado se crea internamente para el comando de Trial.
`solicitarBootstrapEmpresarial` normaliza `causationId` a `commandId` al
traducir el envelope cuando el valor recibido es `null`.

## 6. Grafo de dependencias

```text
solicitarBootstrapEmpresarialSaas
└─ platform/callables.ts
   ├─ authorization.ts
   ├─ audit.ts
   ├─ contracts.ts
   ├─ validation.ts
   └─ operations.ts
      ├─ bootstrap/service.ts
      │  ├─ configuracion/service.ts
      │  ├─ suscripciones/service.ts
      │  ├─ operational-auth.ts
      │  ├─ platform/emitir-credencial-inicial.ts
      │  ├─ turnos/identificadores.ts
      │  └─ lib/bootstrap y lib/suscripciones
      ├─ audit-confirmation.ts
      ├─ emitir-credencial-inicial.ts
      ├─ provisionar-credencial-inicial-tenant.ts
      ├─ incorporaciones-service.ts
      ├─ pin-security.ts
      └─ reserva-codigo-operativo.ts
```

El entrypoint futuro no debe importar `functions/src/index.ts`,
`platform/callables.ts` completo, Wompi, Dusema, incorporaciones email, POS ni
módulos que declaren Secrets ajenos.

## 6.1 Convivencia con la ruta de autoservicio existente

`functions/src/bootstrap/callables.ts` exporta
`bootstrapEmpresarialCallable`, y `functions/src/index.ts` la mantiene dentro
de `saas-auth`. Esa callable también invoca `ejecutarBootstrapEmpresarial`,
pero no forma parte de la migración de `solicitarBootstrapEmpresarialSaas`.

La implementación futura debe preservar `bootstrapEmpresarialCallable` en
`saas-auth`, con su contrato y autoridad actuales. El aislamiento de
`saas-bootstrap` no implica eliminarla ni cambiar su comportamiento.

`OPERATIONAL_PIN_PEPPER` seguirá siendo necesario en `saas-auth` mientras esa
callable u otras Functions del codebase lo requieran. `saas-bootstrap` tendrá
su propio binding al mismo secreto lógico; esto no implica crear un segundo
valor ni duplicar el secreto.

En este ADR, "sin exportación residual" significa únicamente que
`solicitarBootstrapEmpresarialSaas` no queda exportada simultáneamente por dos
codebases. `bootstrapEmpresarialCallable` es una callable distinta y no cuenta
como exportación residual.

## 7. Boundary de Secrets

`OPERATIONAL_PIN_PEPPER` es el único candidato específico de Bootstrap. Esta
afirmación queda expresamente pendiente de demostración mediante discovery e
inventario ejecutable.

El nuevo manifiesto debe demostrar ausencia de:

- `WOMPI_EVENTS_SECRET`;
- `EMAIL_INVITATION_TOKEN_PEPPER`;
- `DUSEMA_*`;
- cualquier otro Secret o parámetro ajeno.

Este ADR no aprovisiona Secrets.

## 8. Boundary de module-load

La implementación futura debe importar el entrypoint en un proceso aislado y
demostrar cero llamadas Firestore, Auth, Secret Manager, HTTP o lectura de
Secrets durante el import, además de discovery determinista. Los efectos
legítimos deben ocurrir solo al ejecutar la callable.

## 9. Grafo permitido y prohibido

### Permitido

Autorización, contratos, validación, auditoría, idempotencia, Bootstrap,
configuración, suscripciones, emisión de credencial, PIN y Admin SDK.

### Prohibido

`functions/src/index.ts`, `platform/callables.ts` completo,
`platform/operations.ts` completo si arrastra superficies ajenas, Wompi,
Dusema, email/invitaciones, funciones POS y módulos que declaren Secrets ajenos.

Este boundary es de discovery, despliegue y configuración; no es una
reorganización cosmética.

## 10. Opciones consideradas

### A — Mantener Bootstrap en `saas-auth`

Rechazada: el manifiesto completo seguiría exigiendo Secrets ajenos.

### B — Codebase dedicado `saas-bootstrap`

Recomendada como frontera de despliegue. Debe exportar únicamente
`solicitarBootstrapEmpresarialSaas`, manteniendo nombre y región.

### C — Extraer el cierre mínimo de dependencias

Requerida como técnica de implementación de B; no basta si el endpoint sigue
declarado en `saas-auth`.

### D — Otra arquitectura

No existe evidencia que justifique cambiar contrato, autoridad, persistencia o
modelo de dominio.

## 11. Relación con ADR-SAAS-043

Se reutilizan codebase dedicado, discovery aislado, entrypoint único,
ausencia de I/O durante import, builds reproducibles, preflight remoto,
rollback y staging-only.

No se reutilizan automáticamente la autoridad comercial ni sus módulos.
Bootstrap conserva `BOOTSTRAP_EMPRESARIAL_SOLICITAR`, claims, memberships y su
máquina de estados.

## 12. Arquitectura propuesta

La topología propuesta agrega `saas-bootstrap` a los codebases existentes. El
codebase tendrá source, package, lockfile, TypeScript y entrypoint propios.

El repositorio actual no contiene todavía un package neutral independiente que
pueda ser consumido por ambos codebases. Por tanto, la implementación futura
debe extraer un boundary neutral/shared para alojar una única
`ejecutarBootstrapEmpresarial`, sin importar directamente entre los entrypoints
de `saas-auth` y `saas-bootstrap`.

La relación objetivo es:

```text
ANTES
saas-auth
├─ solicitarBootstrapEmpresarialSaas
├─ bootstrapEmpresarialCallable
└─ ejecutarBootstrapEmpresarial

DESPUÉS
saas-bootstrap
└─ solicitarBootstrapEmpresarialSaas
       │
       └─ implementación común neutral/shared
              ↑
              │
saas-auth
└─ bootstrapEmpresarialCallable
```

La ubicación física final de ese boundary queda pendiente de la implementación
y no se afirma que ya exista. El adapter de cada callable debe limitarse a
resolver su autoridad, validar su request e invocar la misma implementación
común. Ninguna ruta puede desarrollar lógica Bootstrap paralela.

## 13. Boundary de autoridad

Debe preservarse identidad autenticada, resolución server-side del operador,
facultad `BOOTSTRAP_EMPRESARIAL_SOLICITAR`, claims y validación antes de
efectos. Ninguna autoridad puede provenir del payload. El aislamiento no crea
permisos, claims ni memberships nuevos.

## 14. Boundary de auditoría e idempotencia

Debe mantenerse una única ruta:

```text
adapter → operación de plataforma → ejecutarBootstrapEmpresarial
```

No se crean recibos, fingerprints, auditorías, máquinas de estado ni emisiones
de credencial paralelas. Se conservan `provisionamientoId`, `idempotencyKey`,
fingerprint, auditorías de solicitud/finalización, observadores transaccionales
y la regla de no persistir PIN en claro o en auditoría.

## 15. Estados y transiciones

El contrato actual declara:

```text
REQUESTED
CORE_COMMITTED
CREDENTIAL_ISSUED
CLAIMS_ISSUED
COMPLETED
RETRYABLE_FAILURE
REJECTED
```

El código confirma estados persistidos entre `CORE_COMMITTED`,
`CREDENTIAL_ISSUED`, `CLAIMS_ISSUED` y `COMPLETED`, y `RETRYABLE_FAILURE` para
fallos posteriores. `REQUESTED` y `REJECTED` forman parte del contrato, aunque
no necesariamente se materialicen como estado intermedio en cada llamada.
La implementación debe preservar la máquina existente sin añadir transiciones.

## 16. Migración

La migración debe respetar la convivencia siguiente:

```text
ANTES
saas-auth
├─ solicitarBootstrapEmpresarialSaas
├─ bootstrapEmpresarialCallable
└─ ejecutarBootstrapEmpresarial

DESPUÉS
saas-bootstrap
└─ solicitarBootstrapEmpresarialSaas
       │
       └─ implementación común neutral/shared
              ↑
              │
saas-auth
└─ bootstrapEmpresarialCallable
```

El boundary neutral/shared todavía no existe; su ubicación física final es una
decisión pendiente de la implementación. No se permite que ninguno de los dos
codebases importe el entrypoint del otro para obtenerlo.

Antes del deploy se exige:

1. build y discovery del nuevo codebase;
2. retirar la exportación de Bootstrap de `saas-auth` en el mismo cambio en
   que se declara en `saas-bootstrap`;
3. comprobar exactamente un manifiesto declarando la callable;
4. consultar metadata remota de cualquier Bootstrap existente;
5. ejecutar el plan Firebase y verificar que no haya colisión, doble
   exportación o eliminación accidental;
6. verificar IAM, región, trigger, runtime y binding del Secret;
7. desplegar exclusivamente en `micafe-pos-staging`;
8. verificar revisión, endpoint, contrato y logs sin ejecutar Bootstrap;
9. abrir después el gate independiente del ensayo Bodega.

No se permite doble endpoint ni eliminación automática. Si el plan Firebase
implica borrar, reasignar o reemplazar una Function remota, la migración se
detiene para decisión operativa.

## 17. Preflight obligatorio

### Manifiesto local

- inventario de Functions, Secrets y parámetros;
- exactamente una declaración de `solicitarBootstrapEmpresarialSaas`;
- cero declaraciones de Wompi, Dusema, email/invitaciones u otras superficies.

### Discovery y build

- build reproducible;
- discovery determinista de exactamente una callable;
- `OPERATIONAL_PIN_PEPPER` como único secreto permitido, sujeto a la prueba
  ejecutable;
- cero module-load I/O;
- snapshots del contrato y manifiesto.

### Metadata remota

Registrar existencia, nombre, región, Gen 2/runtime, revisión,
artifact/source generation, estado, codebase/labels, tráfico e IAM.

### SHA certificado

El SHA solo puede considerarse certificado con SHA de `main`, CI en verde,
build reproducible, diff limpio y cualquier atestación adicional exigida por
la gobernanza. La mera existencia del SHA no constituye certificación.

## 18. Rollback

Antes del deploy, rollback es revertir el cambio técnico sin efectos remotos.
Después, restaurar una revisión conocida mediante un gate operativo separado.
No se borran Secrets, planes, tenants, memberships, auditoría ni Firestore.
Si Firebase exige eliminar o reasignar el endpoint, se detiene la migración y
se solicita una decisión explícita.

## 19. Criterios de aceptación

- exactamente una Function Bootstrap;
- nombre y región preservados;
- contrato y compatibilidad `GENERAL`/`BODEGA_MVP1` preservados;
- autoridad, claims y memberships preservados;
- estados, reintentos, idempotencia y fingerprint preservados;
- auditoría de solicitud y finalización preservada;
- una sola emisión de credencial;
- PIN nunca persistido en claro ni auditado;
- discovery de una Function y cero Secrets ajenos;
- module-load sin I/O;
- build/typecheck reproducibles;
- plan Firebase sin colisión ni eliminación accidental;
- rollback documentado/probado;
- staging validado antes de producción;
- `saas-auth` sin exportación residual tras la migración.

Además, la implementación debe demostrar verificablemente:

- una única implementación de `ejecutarBootstrapEmpresarial`;
- `solicitarBootstrapEmpresarialSaas` y `bootstrapEmpresarialCallable`
  consumiendo esa implementación común;
- contratos públicos actuales preservados para ambas rutas;
- autoridad `BOOTSTRAP_EMPRESARIAL_SOLICITAR` y autoridad de autoservicio sin
  cambios;
- ninguna segunda máquina de idempotencia;
- ninguna segunda auditoría de dominio;
- ninguna segunda implementación de emisión de credencial;
- `saas-bootstrap` sin Secrets ajenos;
- `saas-auth` pudiendo continuar declarando `OPERATIONAL_PIN_PEPPER` por sus
  propias superficies;
- exactamente una declaración de `solicitarBootstrapEmpresarialSaas` después
  de la migración;
- `bootstrapEmpresarialCallable` excluida explícitamente de la comprobación de
  exportación residual.

## 20. Riesgos

Extracción incompleta de Secrets; duplicación de autoridad, auditoría o
idempotencia; doble exportación; creación duplicada de identidad Auth; claims o
memberships divergentes; imports circulares; eliminación remota accidental;
diferencias entre staging y producción; confusión entre Bootstrap y
reprovisionamiento de credencial.

## 21. Decisiones pendientes

1. Aprobar o rechazar `saas-bootstrap`.
2. Confirmar el nombre final del codebase.
3. Verificar identidad y estado de cualquier codebase remoto stale.
4. Confirmar el cierre exacto de imports permitido.
5. Confirmar la unidad neutral que mantendrá la única implementación.
6. Aprobar retirar la exportación desde `saas-auth`.
7. Aprobar el deploy inicial en staging.
8. Confirmar IAM y rollback operativo.
9. Confirmar la evidencia que certifica el SHA.
10. Definir la ubicación física del boundary neutral/shared que alojará la
    implementación única de `ejecutarBootstrapEmpresarial`.
11. Confirmar que `bootstrapEmpresarialCallable` permanece en `saas-auth` y
    consume ese boundary común.
12. Mantener ADR-SAAS-043 sin modificar.

## 22. Evidencia utilizada

- `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`;
- `ADR-SAAS-043-aislamiento-codebase-comercial-staging.md`;
- `firebase.json`;
- `functions/package.json`;
- `functions/src/index.ts`;
- `functions/src/platform/callables.ts`;
- `functions/src/platform/operations.ts`;
- `functions/src/bootstrap/service.ts`;
- `functions/src/bootstrap/callables.ts`;
- `functions/src/platform/authorization.ts`;
- `functions/src/platform/audit.ts`;
- `functions/src/platform/emitir-credencial-inicial.ts`;
- `functions/src/incorporaciones-service.ts`;
- `lib/bootstrap/contrato.ts`.

## Validación documental

- ADR persistido: PASS;
- contrato documentado: PASS;
- boundary de Secrets: PASS como criterio pendiente de discovery ejecutable;
- criterio de module-load: PASS;
- estados documentados: PASS;
- migración y preflight: PASS;
- autoridad, idempotencia y auditoría: PASS;
- solo documentación modificada: PASS;
- código: SIN CAMBIOS;
- Secrets: SIN CAMBIOS;
- Firestore: SIN ESCRITURAS;
- deploy: NO REALIZADO;
- producción: SIN CAMBIOS.
