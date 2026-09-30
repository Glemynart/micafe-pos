# ADR-SAAS-050 — Aislamiento de acceso de plataforma al tenant para staging

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-09-30.

La aceptación autoriza únicamente la implementación posterior de la frontera
`saas-platform-tenant-access` dentro del alcance definido aquí. **No autoriza
por sí sola** cambios de `firebase.json`, deploy, tráfico, reemisión de
credenciales, Bootstrap, Activation, fixtures adicionales ni producción.

Esta decisión pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding →
E2.2 — Configuración inicial`.

## Contexto y evidencia

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` fue creado mediante
el Bootstrap canónico en `micafe-pos-staging`: Empresa `trial`, configuración
`BODEGA_MVP1`, suscripción `mvp_comercial` v2, owner admin, membresía activa,
incorporación `TEMP_CREDENTIAL`, credencial temporal, provisionamiento
`COMPLETED` y auditoría de inicio/completado. No contiene datos de un cliente
real y no se ejecutó Activation.

El PIN temporal se entrega una sola vez y nunca se persiste, conforme a
ADR-SAAS-013. Por tanto, una vez que la entrega no está disponible, no puede
recuperarse desde Firestore, Auth, logs ni un reintento idempotente de
Bootstrap. La operación canónica prevista por ADR-SAAS-013 para este caso es
`reemitirCredencialInicialTemporalSaas`: invalida la temporal vigente, emite
una nueva y registra auditoría.

El Backoffice necesita además `obtenerDetalleEmpresaPlataformaSaas` para
obtener el `incorporacionId` y el estado derivado necesarios para presentar la
acción administrativa. En `micafe-pos-staging` ambas callables están ausentes.
La función local legacy `saas-auth` tampoco está desplegada y no es una
superficie apta para un deploy dirigido: descubre capacidades ajenas y
parámetros/Secrets no relacionados. Desplegarla para recuperar una credencial
violaría los controles de ADR-SAAS-048 y no constituye evidencia de una
superficie limitada.

La ausencia de estas callables bloquea la continuación canónica del fixture:
no se puede entregar una credencial temporal recuperable ni validar el detalle
de empresa en Backoffice. No bloquea el Bootstrap ya completado.

## Problema

Las dos operaciones de plataforma existen en
`functions/src/platform/callables.ts`, dentro del monolito `saas-auth`:

- `obtenerDetalleEmpresaPlataformaSaas`, consulta tenant-aware; y
- `reemitirCredencialInicialTemporalSaas`, rotación administrativa de una
  temporal no entregada.

Ambas dependen de contratos y servicios canónicos ya implementados, pero su
ubicación actual no permite construir, descubrir ni desplegar un artefacto de
staging limitado a estos dos endpoints. No se puede sustituir esa evidencia
con escrituras directas, lecturas de secretos o una segunda implementación de
la emisión de credenciales.

## Decisión

Crear, en una implementación posterior, el codebase dedicado:

```text
saas-platform-tenant-access
└─ functions-platform-tenant-access/src/index.ts
   ├─ obtenerDetalleEmpresaPlataformaSaas
   └─ reemitirCredencialInicialTemporalSaas
```

Los dos endpoints conservarán sus nombres públicos, contratos, errores,
región `us-central1` y runtime Node.js 22. No se incorporan provisionamiento
fundacional, recuperación general de credenciales, comandos comerciales,
soporte, Dusema, Wompi, Bootstrap, Bodega ni operaciones de tenant.

### Autoridad y contratos preservados

| Callable | Autoridad servidor | Datos cliente permitidos | Efecto |
| --- | --- | --- | --- |
| `obtenerDetalleEmpresaPlataformaSaas` | Auth + `PLATAFORMA_CONSULTAR` | `empresaId` válido | Solo lectura y proyección sin PIN ni `pinHash`. |
| `reemitirCredencialInicialTemporalSaas` | Auth + `LIFECYCLE_GOBERNAR` | envelope canónico, `empresaId`, `incorporacionId` | Rotación transaccional exclusivamente de la temporal vigente, con auditoría e idempotencia existente. |

`empresaId`, actor, facultades, estado de incorporación, owner y cualquier
efecto derivado se validan en el servidor. La reemisión conserva la
compare-and-swap de la incorporación observada por la UI y no acepta PIN,
claims, rol ni UID aportados como autoridad por el cliente.

### Secrets y closure

El codebase no define Secrets globales ni parámetros ajenos. Solo
`reemitirCredencialInicialTemporalSaas` declara el Secret ya existente
`OPERATIONAL_PIN_PEPPER`; `obtenerDetalleEmpresaPlataformaSaas` declara cero
Secrets. La implementación deberá extraer/reutilizar únicamente:

- autorización y contratos de plataforma;
- auditoría y confirmación canónicas;
- query read-only de detalle y sus lectores estrictamente necesarios; y
- operación canónica de reemisión y emisor de credencial.

Quedan prohibidos imports transitivos de `functions/src/index.ts`,
`platform/callables.ts` completo, `operational-auth.ts` completo,
`configuracion/service.ts` completo, Bootstrap, Bodega, comercial, Wompi,
Dusema, email, recovery, schedules y cualquier I/O durante module-load.
Reutilizar un helper exige demostrar que no arrastra esos módulos; no se
permite copiar ni reimplementar reglas de emisión, hash, autoridad, auditoría
o idempotencia.

## Alternativas evaluadas

| Alternativa | Resultado |
| --- | --- |
| Desplegar `saas-auth` para dos endpoints | Rechazada: su discovery/Secret closure no permite demostrar un delta seguro. |
| Escribir credencial, incorporación o PIN directamente | Rechazada: viola ADR-SAAS-013, autoridad y auditoría; el PIN no se recupera desde persistencia. |
| Reejecutar Bootstrap | Rechazada: el flujo es idempotente y no debe reexponer ni regenerar una temporal. |
| Añadir ambas operaciones a `saas-platform-resources` o `saas-platform-context` | Rechazada: cambia límites de boundaries ya certificados y mezclaría la rotación con superficies que declaran cero Secrets. |
| Boundary dedicado con los dos contratos existentes | Recomendada: limita discovery, mantiene compatibilidad y deja explícito el único Secret requerido por el endpoint mutante. |

## Migración y deploy posterior

Una vez aceptada esta ADR, la implementación deberá realizarse en un PR único
y aislado. Debe añadir el source y codebase dedicados, pruebas de contrato,
discovery de exactamente dos endpoints, module-load sin I/O y build
reproducible. Retira exclusivamente las dos exportaciones legacy de
`saas-auth` en la misma migración, sin retirar código compartido ni otras
callables.

Antes de staging habrá un preflight explícito que demuestre:

1. commit, build y artefacto atestados;
2. exactamente ambos endpoints, `us-central1` y Node.js 22;
3. `OPERATIONAL_PIN_PEPPER` únicamente en la reemisión y cero Secrets en el
   detalle;
4. ausencia de deletes, replacements, tráfico o codebases ajenos;
5. que `saas-auth` no tiene revisiones remotas de esos nombres que provoquen
   colisión; y
6. revisión de rollback conocida antes de cualquier actualización posterior.

El deploy de staging, si se autoriza después del preflight, será dirigido solo
a `saas-platform-tenant-access`. La reemisión del fixture será un gate mutante
independiente posterior al deploy: crea una nueva credencial temporal y
registra hechos administrativos; no debe ejecutarse durante el deploy ni por
reintento automático.

## Validación requerida

La implementación posterior deberá demostrar:

- detalle autorizado, no autorizado y empresa inexistente;
- proyección que nunca expone PIN, `pinHash` o secretos;
- reemisión autorizada de una `TEMP_CREDENTIAL` vigente;
- rechazo de incorporación/empresa incoherente, payload autoritativo y actor
  sin facultad;
- idempotencia y auditoría de reemisión;
- ausencia de duplicación de membresía, claims o identidades;
- aislamiento tenant A/B;
- build, TypeScript, lint, discovery, module-load y cierre de imports;
- preflight/deploy staging dirigidos; y
- validación funcional del fixture sin datos reales ni producción.

## Rollback y lifecycle de datos

Antes del primer deploy, rollback es revertir la rama técnica. Después de un
deploy, el rollback exige una revisión conocida y un gate operativo; no se
declara rollback reproducible sin una revisión/artefacto atestado. Una
reemisión no se revierte: invalida de forma intencional la temporal anterior;
el hecho queda auditado y el fixture se retiene conforme ADR-SAAS-048.

No existe cleanup destructivo automático del fixture, Firestore, Auth,
credenciales, auditoría o datos Bodega. Producción y Distribuidora Las Jiménez
permanecen fuera de alcance.

## Consecuencias

Esta ADR autoriza únicamente la planificación e implementación de una frontera
técnica mínima. No cierra Gate E, no autoriza el deploy de la frontera, no
reemite una credencial, no ejecuta Activation y no declara E2.2 completo.
Hasta que los gates posteriores estén cerrados, el fixture permanece retenido
en `TEMP_CREDENTIAL` y E2.2 permanece `EN EJECUCIÓN`.
