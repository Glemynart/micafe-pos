# ADR-SAAS-056 — Consulta de auditoría de plataforma en staging

## Estado

**ACEPTADO — 2026-10-03.**

Esta propuesta pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding →
E2.2 — Configuración inicial`.

La aceptación autoriza únicamente la implementación posterior de esta frontera
dentro del alcance descrito. No autoriza por sí sola deploy, tráfico,
Firestore, Auth, Rules, IAM, Secrets, fixture, Bootstrap, Activation ni
producción.

## Contexto y evidencia

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` avanzó por Gate F
con ventas, inventario, turnos, ledger, idempotencia y efectos financieros
server-authoritative validados en `micafe-pos-staging`. La verificación del
Backoffice de plataforma no puede completar su panel **Historial** porque el
cliente invoca la callable existente:

```text
consultarAuditoriaPlataformaSaas
```

La callable sigue exportada localmente desde `functions/src/index.ts`, a través
de `functions/src/platform/callables.ts`, pero no existe en staging:

- `gcloud functions describe consultarAuditoriaPlataformaSaas --v2` devuelve
  recurso no encontrado;
- no existe un Cloud Run service correspondiente en `us-central1`; y
- el Backoffice muestra el error derivado al cargar `AggregateHistory`.

La implementación legacy pertenece al codebase monolítico `saas-auth`. Ese
entrypoint descubre módulos y parámetros ajenos a la consulta, incluidos
`OPERATIONAL_PIN_PEPPER` y parámetros Dusema. Desplegar `saas-auth` para una
sola lectura de auditoría viola los controles de superficie limitada de
ADR-SAAS-048 y no demuestra un deploy dirigido seguro.

La ausencia remota no invalida los hechos de auditoría ya persistidos ni
autoriza una lectura directa de `saas_auditoria` desde el cliente. ADR-SAAS-012
exige una proyección backend-only, selectiva, paginada y protegida por la
facultad `PLATAFORMA_CONSULTAR`.

## Problema

Gate F exige validar auditoría y Backoffice. La única superficie local que
expone dicha proyección no está materializada en staging y su ubicación legacy
no es desplegable de modo acotado. Corregir la UI, relajar Rules, consultar
Firestore desde el cliente o desplegar el monolito no son alternativas
admisibles.

## Decisión propuesta

Extender el boundary read-only ya certificado `saas-platform-resources` con
una única callable adicional:

```text
saas-platform-resources
└── consultarAuditoriaPlataformaSaas
```

La migración futura conserva exactamente el nombre público, contrato, región
`us-central1`, runtime Node.js 22 y semántica observable de la callable legacy.
El entrypoint dedicado reutilizará exclusivamente la autorización de
plataforma, la validación de filtro y el lector read-only de auditoría ya
existentes. No define ni enlaza Secrets.

`saas-platform-resources` es el boundary apropiado porque ya aloja una
proyección backend-only de recursos de plataforma, exige la misma facultad
`PLATAFORMA_CONSULTAR` y declara cero Secrets. Esta decisión no reabre
ADR-SAAS-050: allí se rechazó añadir dos endpoints heterogéneos —uno mutante y
con Secret— a ese boundary. Esta ADR propuesta solo incorpora la lectura de
auditoría, con la misma naturaleza read-only y de proyección que su superficie
existente.

### Contrato y autoridad preservados

| Aspecto | Regla preservada |
| --- | --- |
| Autenticación | Falta Auth → `unauthenticated` conforme al adapter vigente. |
| Facultad | Auth + `PLATAFORMA_CONSULTAR`, revalidada server-side mediante `autorizarPlataforma`. |
| Request | Solo `filtro`, `limite` y `cursor` del contrato vigente. |
| Filtros | Únicamente los selectivos permitidos por ADR-SAAS-012; no hay scan ni búsqueda libre. |
| Datos | Proyección sanitizada, sin PIN, token, secreto, payload operativo o acceso directo de cliente. |
| Escrituras | Cero; la lectura ordinaria no crea evidencia. |
| Tenant | `empresaObjetivoId` filtra/correlaciona evidencia; nunca concede contexto tenant. |

Los códigos de error y los límites existentes no se rediseñan. La futura
implementación debe probar compatibilidad contra la closure legacy, incluido
`FILTRO_AUDITORIA_INVALIDO`, autorización denegada, cursor inválido, límite y
paginación.

### Closure obligatoria

La nueva exportación puede importar únicamente unidades neutrales necesarias
para:

- inicialización Admin SDK sin I/O remoto durante module-load;
- `autorizarPlataforma` y sus contratos/tipos;
- `validarFiltroAuditoria` y `consultarAuditoriaPlataforma`; y
- `HttpsError`/`onCall` de Firebase Functions v2.

Quedan prohibidos imports transitivos de `functions/src/index.ts`,
`platform/callables.ts` completo, Bootstrap, Bodega, comercial, Dusema, Wompi,
email, recovery, activation, schedules y módulos con `defineSecret`.

## Migración futura

Tras aceptación formal, un PR técnico único y acotado deberá:

1. añadir la exportación al entrypoint de `functions-platform-resources`;
2. retirar exclusivamente la exportación legacy de `functions/src/index.ts`;
3. mantener `saas-auth` y todas sus demás exports intactas;
4. añadir pruebas de contrato, autorización, filtros, límites, cursor,
   discovery y module-load; y
5. demostrar discovery local con exactamente dos callables en
   `saas-platform-resources`, ambas en `us-central1`, Node.js 22 y cero
   Secrets.

Un preflight posterior deberá demostrar un deploy dirigido solo a
`saas-platform-resources/consultarAuditoriaPlataformaSaas`, sin deletes,
replacements, tráfico manual, otros codebases, Rules, IAM, Secrets ni
producción. El deploy y la validación del Backoffice serán gates separados.

## Alternativas

| Alternativa | Resultado |
| --- | --- |
| Desplegar `saas-auth` | Rechazada: discovery y Secrets ajenos; contradice ADR-SAAS-048. |
| Lectura directa desde Backoffice/Firestore | Rechazada: contradice ADR-SAAS-012, Rules deny-by-default y minimización. |
| Crear `saas-platform-audit-read` | No recomendada: duplica una frontera read-only de plataforma ya existente sin reducir una dependencia real. |
| Añadir la consulta read-only a `saas-platform-resources` | **Recomendada:** mínima extensión coherente de un boundary de proyecciones ya certificado, sin Secrets. |
| Omitir la verificación visual | Rechazada: Gate F exige auditoría y Backoffice demostrados. |

## Rollback y consecuencias

Antes del primer deploy, rollback es revertir el cambio técnico. Después del
deploy, el rollback requiere una revisión conocida y un gate operativo
explícito; no elimina evidencia de `saas_auditoria` ni modifica el fixture.

Esta decisión no autoriza por sí sola un deploy, consulta contra producción,
creación de otro fixture, Bootstrap, Activation, reemisión de credenciales,
cleanup destructivo ni el cierre de Gate F, Gate G, Gate H o E2.2.

## Reconciliación posterior

La implementación de `consultarAuditoriaPlataformaSaas` quedó integrada y
desplegada en `saas-platform-resources` en `micafe-pos-staging`,
`us-central1`, Node.js 22 y cero Secrets. La revisión activa respondió la
consulta del panel Historial con HTTP `200` después de crear el índice definido
por ADR-SAAS-057; la llamada sin Auth fue rechazada con `401`. Esta evidencia
no cambia la callable legacy ni autoriza producción.

El subgate de auditoría de Gate F queda `PASS`; el resto de la validación
funcional de E2.2 continúa pendiente.

## Compatibilidad

Preserva ADR-SAAS-012 (auditoría append-only y backend-only), ADR-SAAS-048
(superficie staging limitada), ADR-SAAS-049 (Bodega aislada), ADR-SAAS-050
(fronteras de acceso de plataforma), ADR-SAAS-054 (operaciones Bodega) y
ADR-SAAS-055 (provisionamiento de cuenta). No modifica sus contratos,
autoridades, Secrets ni estados.

## Gates posteriores si se acepta

1. implementación y PR técnico;
2. CI, auditoría y merge;
3. preflight staging dirigido;
4. deploy staging dirigido;
5. validación autorizada/no autorizada, filtros y panel Historial del
   Backoffice con el fixture retenido;
6. reanudación de Gate F.
