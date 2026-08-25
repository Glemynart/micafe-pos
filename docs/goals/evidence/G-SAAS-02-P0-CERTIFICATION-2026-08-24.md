# G-SAAS-02 — Certificación interna P0-01 → P0-06

Fecha: 2026-08-24
Resultado de release: `NO APROBADO PARA ACTIVACIÓN/PRIMER CLIENTE`
Goal: `G-SAAS-02` (permanece activo)
Milestone: M2 / Onboarding y fundaciones SaaS; M3 permanece pendiente
Rama: `codex/g-saas-02-p0-certification`
SHA base y `origin/main`: `a568fdace6ace0e873e1879451b0a8c9c1c8f1e0`
Checkout aislado: `C:\Users\seguc\Downloads\PROYECTOS POS\PROYECTO CAFE-gsaas02-p0-certification`
Worktree histórico: `C:\Users\seguc\Downloads\PROYECTOS POS\PROYECTO CAFE` — se verificó y se dejó intacto.

## Resumen ejecutivo

La certificación local confirma que el contrato P0-01 → P0-06 es ejecutable en emuladores y pruebas automatizadas, con una corrección de seguridad incluida en este corte: el cliente ya no puede transformar una venta `PENDIENTE_EFECTOS` en `COMPLETO` para eludir inventario, tesorería, idempotencia y auditoría server-authoritative.

La certificación no equivale a disponibilidad comercial. Hay dos riesgos MEDIUM abiertos en el estado actual: lectura global de perfiles/FCM en `usuarios` y ausencia de rate limit de aplicación para el hold público. El primero requiere aprobar ADR-SAAS-037; el segundo requiere implementación antes de habilitar P1-09 y evidencia WAF. Wompi, WAF, tenant de prueba, secretos, despliegue y ventana productiva no estuvieron disponibles y la feature permanece `DISABLED / FAIL CLOSED`.

El backlog canónico define P0-06 como turnos, apertura, relevo, cierre y arqueo. Reservas, mesas, comandas y cocina son capacidad suplementaria P1-04/ADR-SAAS-033. `espacioId` sigue siendo una dimensión operativa/analítica; no se implementa multi-sede.

## Documentación y fuentes auditadas

Se leyeron antes de modificar archivos:

- `docs/goals/GOAL-MVP-COMERCIAL.md` y `BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md`.
- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`, `R1-A-DISENO-IMPLEMENTACION-TURNOS-SERVER-AUTHORITATIVE.md` y `R1-B-DISENO-FUNCIONAL-TECNICO-CAJA-LEDGER.md`.
- ADR 001, 002, 006, 007, 008, 010, 013, 014, 015, 016, 019, 020, 021, 022, 023, 030, 033, 036 y 037.
- `MASTER-SECURITY-PLAN.md`, `SECURITY.md`, `MT-U4-firestore-rules-diseno.md` y `MT-U3-helper-tenant-diseno.md`.
- `docs/goals/P0-01-CERTIFICACION-DATOS-INICIALES.md`, auditorías P0-01, P0-02 y P0-03 y evidencia G-SAAS-02 existente.
- Rules Firestore/Storage y tests de autorización, tenant, Functions y E2E relevantes.
- Contrato/código actual de hold público, Wompi, reservas y webhook. P1-09 sigue deshabilitado.

## Artefactos de Codex Security

### Scan histórico de siete findings

Fuente primaria leída completa desde:

`C:\Users\seguc\AppData\Local\Temp\codex-security-scans-OZcP8r\PROYECTO-CAFE\8a68a2397d1abe3617c65030ccd434fb4775d527_20260821T070925Z_k4fobxju`

Se leyeron `report.md`, `findings.json` y `exports/results.sarif` del SHA histórico `8a68a2397d1abe3617c65030ccd434fb4775d527` (3 HIGH, 4 MEDIUM, 7 reportables).

### Scan actual del checkout aislado

- Scan ID: `81e678d4-b2de-4baf-a37b-b7ba21a59080`.
- Revisión: `a568fdace6ace0e873e1879451b0a8c9c1c8f1e0`.
- Snapshot: `codex-security-snapshot/v1:sha256:27df1dc17cde54a4f787be5f2b7dd8a761f65a8f837fecc1f74270e8d42b8fc2`.
- Estado: `completed`, cobertura `partial`, 2 findings MEDIUM con confianza HIGH.
- Artefactos sellados: `report.md`, `findings.json`, `coverage.json`, `scan-manifest.json` y `exports/results.sarif`.
- `report.md`, `findings.json` y SARIF fueron leídos y cotejados; el SARIF contiene 2 rules y 2 results.
- El scan advierte que el worktree cambió mientras se ejecutaba por la limpieza de artefactos generados; los resultados corresponden al snapshot declarado y el cambio funcional quedó limitado a Rules/test antes del corte documental.

## Matriz ejecutiva P0

La tabla completa está en [G-SAAS-02-P0-CERTIFICATION-MATRIX.md](../../../G-SAAS-02-P0-CERTIFICATION-MATRIX.md).

| P0 | Estado local | Estado productivo | Observación decisiva |
|---|---|---|---|
| P0-01 | PASS — LOCAL ONLY | BLOCKED | Onboarding/tenant/claims/configuración y E2E retry pasan; falta evidencia real de tenant/Trial y queda `usuarios` abierto. |
| P0-02 | PASS — LOCAL ONLY | BLOCKED | DEMO puede operar sin fiscalidad; DIAN no se activó ni se probó productivamente. |
| P0-03 | PASS — LOCAL ONLY | BLOCKED | Fase 2 server-authoritative y Rules corregidas; no hay despliegue ni producción. |
| P0-04 | PASS — LOCAL ONLY | BLOCKED | Caja/medios/idempotencia/recovery cubiertos localmente; no se ejecutaron pagos reales. |
| P0-05 | PASS — LOCAL ONLY | BLOCKED | Cuenta financiera tenant-aware revisada; Wompi permanece disabled. |
| P0-06 | PASS — LOCAL ONLY | BLOCKED | E2E local pasa; existe writer administrativo legacy acotado a migración posterior. |

## Triage individual de los siete hallazgos históricos

### 1. B3 Storage emulator guard

- ID: `csf_99a0e401f3be0278650141f0`; occurrence `occ_69cc448e9aa5ef0efbcb2517`.
- Reportado: HIGH; regla `destructive-tool.storage-emulator-guard`.
- Evidencia histórica: `scripts/b3/eventos-legacy-closure.ts:134-135,177-190`.
- Clasificación: **Real, corregido**; la severidad HIGH era defendible porque un script destructivo podía operar contra un Storage no emulado.
- Estado actual: `origin/main` ya exige Firestore y Storage emulator, acepta `FIREBASE_STORAGE_EMULATOR_HOST`/`STORAGE_EMULATOR_HOST` y exige proyecto `demo-b3-eventos-closure-*`. La corrección pertenece al corte histórico/B3 y no se mezcla aquí.
- Amenaza: operador o proceso automatizado con acceso a ejecutar el script; autenticación de aplicación no aplica; privilegio local elevado; superficie Storage/Firestore; blast radius potencial amplio dentro del proyecto equivocado; riesgo de pérdida de datos y recuperación difícil; sin cross-tenant como requisito, pero con impacto transversal.
- Validación: guard revisado y evidencia B3 histórica; no se ejecutó destrucción productiva.

### 2. Monto Wompi controlado por cliente

- ID: `csf_8bb214ae583434dc19716a37`; occurrence `occ_71baf7726e0ef07c54a29fb3`; regla `payment-integrity.unbound-amount`.
- Reportado: HIGH; histórico en `app/api/reservas/hold/route.ts:15-21,49-51`, `app/reservar/page.tsx:281-284`, `app/api/webhooks/wompi/route.ts:257-293`.
- Clasificación: **Real, corregido en el código P1-09 actual**.
- Evidencia actual: `lib/reservas-publicas/contrato.ts` calcula precio autorizado en servidor; el hold conserva monto esperado/moneda; el webhook/Functions verifica `transaction.amount_in_cents` y moneda. El cliente no es autoridad del precio.
- Amenaza histórica: atacante anónimo o usuario que manipule la solicitud; no necesitaba autenticación; podía alterar monto y producir confirmación financiera/fiscal incorrecta; afectaba tenant de la reserva, Wompi, reservas, ledger y posible impacto económico/fiscal; automatizable y con blast radius por cada hold aceptado.
- Severidad: HIGH correcta para una integración habilitable. Actualmente no es un bypass activo porque P1-09 está disabled/fail closed.
- Residual: falta autorización, secretos Wompi, WAF y ventana productiva; no se ejecutó pago real.

### 3. Cuenta bancaria Wompi global

- ID: `csf_bf73f435656ece4ec92efbb5`; occurrence `occ_d0819a010e53278bce054755`; regla `tenant-isolation.global-banking-ledger`.
- Reportado: HIGH; histórico en `app/api/webhooks/wompi/route.ts:289-307`.
- Clasificación: **Real, corregido en el código P1-09 actual**.
- Evidencia actual: el resolver usa contexto `empresaId`, `cuentaClaveOperativa` y cuenta tenant-aware; el contexto System Wompi no convierte una cuenta global fija en autoridad.
- Amenaza histórica: webhook/adversario que consiga enviar una transacción aceptada o provocar reconciliación; autenticación de aplicación no confiable como control suficiente; privilegio de integración; superficie webhook/Functions/ledger; posibilidad de acreditar fondos en cuenta de otro tenant o mezclar saldos; impacto financiero y contable alto, cross-tenant y automatizable.
- Severidad: HIGH correcta si Wompi estuviera activo; con feature disabled queda como gate de activación, no como evidencia de producción.
- Residual: verificar tenant real, secretos y webhook firmado en entorno autorizado; no se ejecutó pago ni escritura.

### 4. Hold público sin rate limit

- ID histórico `csf_315dceb35b51f89f377496a7`; occurrence `occ_79b63999e1bea341f2326e50`; regla `resource-exhaustion.public-reservation-write`.
- Finding actual Codex Security: `csf_a0f567c810adaf46d8a5d8f1`; occurrence `occ_215ec4c478ec1c31f797d73b`.
- Reportado/actual: MEDIUM; clasificación **Real/Parcial condicionada**.
- Ubicación actual: `app/api/reservas/hold/service.ts:31-48,48-107`; `lib/reservas-publicas/contrato.ts:3-10`.
- Evidencia favorable: body máximo 8 KiB, máximo 8 bloques, horizonte de 180 días, claves y slots estrictos, precio derivado en servidor, TTL y transacción Admin SDK.
- Debilidad: antes de las lecturas de disponibilidad y la transacción Admin SDK no existe cuota/rate limit de aplicación por IP, contacto, nonce o tenant.
- Amenaza: atacante anónimo; no autenticación; privilegio indirecto a través del endpoint público que consume Admin SDK; superficie Next route/Firestore; puede agotar recursos y bloquear reservas, pero no cruza tenant si la resolución server-side es correcta; no debería modificar precio ni ledger por sí solo; automatización fácil; blast radius depende de exposición/WAF.
- Severidad real: MEDIUM, no HIGH, porque la entrada está acotada y P1-09 está deshabilitado; subiría a incidente operativo relevante al habilitar sin WAF/cuota.
- Corrección requerida: rate limit/idempotencia server-side y evidencia WAF antes de habilitar; no se implementa diseño nuevo sin contrato aprobado de P1-09.

### 5. Lectura global de `usuarios` y FCM tokens

- ID histórico `csf_adf4f35149dc8683767bb599`; occurrence `occ_88e0dfa63fdfb778fa417426`; regla `tenant-isolation.global-profile-read`.
- Finding actual Codex Security: `csf_79317329808666ebb823ad25`; occurrence `occ_fc414666ec3d1b6f53d8de3d`.
- Reportado/actual: MEDIUM con confianza HIGH; **Real, abierto**.
- Ubicación: `firestore.rules:267-269`, `lib/auth-service.ts:40-58`, `lib/notificaciones-push.ts:41-45`.
- Código: `allow read: if esAutenticado()` no restringe `uid`, membresía, `empresaId` ni proyección sanitizada.
- Amenaza: usuario autenticado de bajo privilegio; no requiere rol admin; superficie Firestore client-readable; puede leer perfiles y FCM tokens de otros tenants; exposición de datos y material de notificación; no habilita por sí sola escritura, escalada de privilegios o impacto financiero, pero permite enumeración y abuso de push; cross-tenant directo; automatización sencilla; blast radius global de la colección.
- Severidad: MEDIUM: confidencialidad y aislamiento, sin evidencia de privilegio financiero. No se cambia la regla en este corte porque ADR-SAAS-037 está `Propuesto` y cambiar el contrato requiere decisión arquitectónica.
- Corrección propuesta: aceptar ADR-SAAS-037, restringir self/proyección tenant-scoped y excluir FCM/sensibles; añadir pruebas de lectura propia, lectura cross-tenant y query.

### 6. `/api/debug-tokens`

- ID: `csf_863ed88949cb4d6327025324`; occurrence `occ_ce2ee8736584f0e87e49870d`; regla `debug-endpoint.cross-tenant-enumeration`.
- Reportado: MEDIUM; ubicación histórica `app/api/debug-tokens/route.ts:5-8,19-25`.
- Clasificación actual: **Falso positivo/stale finding para `origin/main`**.
- Verificación: no existe `app/api/debug-tokens` en el checkout actual; búsqueda de archivos y referencias no encontró la superficie. El finding no se implementa ni se rebaja artificialmente: se marca no aplicable al estado actual y se conserva la trazabilidad histórica.
- Riesgo residual: si una rama antigua vuelve a introducirlo, debe bloquearse cualquier endpoint de tokens/debug no autenticado.

### 7. Service account local ignorada

- ID: `csf_dbd160b74f23770fbaa455ae5`; occurrence `occ_d06cc6a90beec61a5f6af2`; regla `secrets.service-account-key-worktree`.
- Reportado: MEDIUM; archivo histórico `micafe-pos-firebase-adminsdk-fbsvc-643a7af602.json:1`.
- Clasificación actual: **Riesgo operacional/deuda de credenciales, no archivo presente en este checkout**.
- Verificación: el archivo no existe en el worktree aislado y el nombre está ignorado históricamente; no se reprodujo ni se mostró contenido. El worktree histórico pudo conservar un archivo local. No se elimina sin autorización porque es estado local del usuario.
- Amenaza: cualquier proceso/usuario con acceso al equipo; autenticación de Firebase Admin embebida en archivo; privilegio potencial de Admin SDK; superficie local/CI; impacto potencial transversal de todos los tenants, Functions, Storage y Firestore; blast radius alto si la clave fue copiada.
- Acción necesaria: propietario debe localizar, retirar de worktrees, revisar uso, revocar/rotar la clave en IAM/Firebase y confirmar ausencia en CI; no es una escritura productiva ejecutada por esta tarea.

## Corrección implementada en este corte

### `P0-03-RULES-F2-AUTHORITY-001` — HIGH real corregido

Antes, `firestore.rules` permitía a un actor de tenant que pasara `esOperativo()` actualizar una venta de `PENDIENTE_EFECTOS` a `COMPLETO` si preservaba `snapshotFiscal` y `consecutivo`. Esto permitía saltar los efectos server-authoritative de inventario, tesorería, idempotencia y auditoría dentro del mismo tenant.

Se cambió el bloque `match /ventas/{id}` a `allow update: if false` y se añadió en `firestore-rules/role-invariants.test.ts` una regresión que intenta la transición desde un cajero tenant A y espera `PERMISSION_DENIED`. El cambio no modifica el boundary `empresaId`, no habilita acceso cross-tenant y no introduce una nueva arquitectura: aplica el contrato ya aceptado de venta server-authoritative.

### Deuda explícitamente fuera de este corte

- `P0-06-TECH-DEBT-001`: writer administrativo legacy de `turnos_activos`/`turnos`. R1-A difiere el deny final hasta migrar todos los writers de relevo/cierre; se mantiene acotado y debe ir en PR separado.
- `P0-02-DIAN-CLIENT-WRITER-001`: `guardarMetadatosDian` conserva writer cliente histórico, pero Rules endurecidas impiden que se convierta en autoridad. Fiscalidad real requiere decisión/implementación server-side antes de activación DIAN.
- Reconciliador Functions: recorrido Admin SDK sin query tenant-prefijada es una travesía privilegiada de recuperación; cada recibo canónico revalida tenant. No se encontró fuga cross-tenant en la revisión.

## Modelo explícito de aislamiento multiempresa

Para cada superficie revisada:

```text
¿Quién invoca? → sesión autenticada o endpoint público disabled
¿Está autenticado? → Rules/Functions exigen sesión según capacidad; hold no la exige por contrato
¿Qué tenant representa? → membresía y contexto server-side; empresaId no se acepta como autoridad del cliente
¿Cómo se obtiene empresaId? → helper/membresía/registro canónico, no espacioId
¿Quién lo autoriza? → membresía, claims y Functions/Admin SDK
¿Puede sustituirse? → debe rechazarse; los efectos críticos revalidan servidor
¿Rules/Functions vuelven a validar? → Rules para acceso cliente; Functions/Admin SDK para efectos críticos
```

Resultado: P0-01/P0-03/P0-05 conservan `empresaId`; no se observó diseño que convierta `espacioId` en tenant o Sede. El hallazgo abierto de `usuarios` es una excepción de confidencialidad de perfil global y debe resolverse con ADR, no con una reinterpretación silenciosa del modelo.

## STRIDE / OWASP

| Riesgo | Evidencia | Resultado |
|---|---|---|
| Spoofing | claims/membresía y auth foundation | PASS local; producción sin tenant autorizado |
| Tampering | Rules niegan venta client-write y regresión cubre `COMPLETO` | PASS local; efectos finales Admin SDK |
| Repudiation | auditoría/idempotencia/recovery server-side | PASS local; no evidencia productiva |
| Information disclosure | `usuarios` global y FCM | MEDIUM real abierto |
| Denial of service | hold sin rate limit | MEDIUM real condicionado; feature disabled |
| Elevation of privilege | no se encontró escalada por el cambio; venta client-write era bypass de integridad, no rol | P0-03 corregido |

OWASP: Broken Access Control en perfiles globales; Injection no evidenciada en estas superficies; Security Misconfiguration en credencial local como riesgo operacional; Identification/Authentication cubierto localmente; SSRF y exposición de secretos no reproducidos en el checkout; Resource Exhaustion en hold público.

## Validaciones ejecutadas

Todas las siguientes se ejecutaron en el checkout aislado; no se usaron tenants productivos ni se hicieron pagos/escrituras reales.

| Comando | Resultado |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS |
| `npm --prefix functions ci --ignore-scripts --no-audit --no-fund` | PASS |
| `npm run test:rules` | PASS, incluyendo regresión de transición cliente→`COMPLETO` |
| `npm run test:storage-rules` | PASS, 7/7 |
| `npx tsc --noEmit --pretty false` | PASS |
| `npm run lint` | PASS |
| `npm run build:functions` | PASS |
| `npm run build` | PASS |
| `npm run test:auth-foundation` | PASS |
| `npm run test:tenant` | PASS |
| `npm run test:configuracion` | PASS |
| `npm run test:onboarding` | PASS |
| `npm run test:membresias` | PASS |
| `npm run test:p0-01:verifier` | PASS |
| `npm run test:p0-01:plan` | PASS |
| `npm run test:tickets` | PASS |
| `npm run test:reimpresion` | PASS, 19/19 |
| `npm run test:p1-02:unit` | PASS, 5/5 |
| `npm run e2e:p0-01` | PASS en retry limpio, 1/1; primer intento fue interferido por emulador residual |
| `npm run e2e:p0-06` | PASS, exit 0 |
| `npm run e2e:p1-02` | PASS, 1/1 |
| `npm run e2e:p1-04` | PASS, 1/1 |
| `npm run test:g-saas-02:preflight` | PASS, 8/8 |
| `npm run test:g-saas-02:recovery` | PASS, 14/14 |
| `npm run test:g-saas-02:release-evidence` | PASS, 8/8 |
| Codex Security Standard Scan `81e678d4-b2de-4baf-a37b-b7ba21a59080` | PASS técnico: completed; 2 MEDIUM abiertos; no scan limpio |

El primer `e2e:p0-01` no se cuenta como fallo de producto: había un Firestore emulator residual en el puerto 8085; se cerró el PID exacto, se repitió con emuladores limpios y el flujo pasó sin errores de consola, 401/403, 404 ni fallos de página.

## Estado priorizado

### P0 pendientes

- Evidencia de uso real del primer cliente: tenant autorizado, onboarding, Trial de 30 días y operación completa.
- Cierre server-authoritative completo de cualquier writer legacy de turnos antes de declarar P0-06 final de producción.
- Resolver el hallazgo `usuarios` antes de una exposición comercial multiempresa.
- Mantener fiscalidad/DIAN condicionada hasta implementar autoridad server-side y decisión aprobada.

### P1 pendientes

- P1-09: rate limiting/idempotencia del hold público, WAF, secretos Wompi, webhook/cuenta tenant-aware con evidencia autorizada y ventana productiva.
- P1-04: evidencia de primer cliente y migraciones/operación no cubiertas por el E2E local.
- ADR-SAAS-037: aprobación explícita y después implementación/tests de proyección de perfiles.

### P2

- Hardening y observabilidad no bloqueante: métricas de abuso, alertas de reconciliación, validación operativa de rotación de credenciales y documentación de recuperación.

### P3

- Mejoras de documentación y automatización de evidencias, sin introducir multi-sede ni cambiar contratos comerciales.

### Blockers internos

- Hallazgo MEDIUM abierto en lectura global de `usuarios`.
- Falta de rate limit de aplicación para hold público si P1-09 se habilita.
- Writer legacy de turnos pendiente de migración/cutover server-authoritative.
- Writer DIAN cliente pendiente de autoridad server-side antes de fiscalidad real.
- Verificación de service account local y su rotación por el propietario.

### Blockers externos

- `DEPLOYMENT AUTHORIZATION REQUIRED`.
- `WOMPI SECRET CONFIGURATION REQUIRED`.
- `WAF EVIDENCE REQUIRED`.
- `TENANT AUTHORIZATION REQUIRED`.
- `PRODUCTIVE WINDOW REQUIRED`.
- No existe autorización para tenant, pagos, secretos, despliegue o escrituras productivas.

## Próxima unidad ejecutable y orden recomendado

1. PR actual: integrar la corrección P0-03 de Rules, regresión y documentación de esta certificación; ejecutar CI y auditoría limitada.
2. Siguiente PR interno: preparar/aprobar ADR-SAAS-037 y, solo tras aprobación, implementar proyección de perfiles/Rules/tests cross-tenant.
3. PR separado P0-06: migrar writers legacy de turnos y ejecutar Rules/emulator/E2E de cierre y relevo.
4. PR separado P1-09: rate limit/idempotencia del hold, tests de abuso y revisión del contrato; mantener disabled hasta completar gates externos.
5. Verificación operacional de la service account por el propietario: localizar, revocar/rotar y confirmar ausencia en CI/worktrees.
6. Solo con evidencia externa real: checklist de tenant autorizado, WAF, secretos Wompi, autorización de despliegue y ventana productiva; después smoke controlado sin pagos no autorizados.
7. Registrar evidencia del primer cliente y actualizar el Goal únicamente mediante el evento oficial correspondiente. No cerrar G-SAAS-02 con este documento.

## Recomendación de release

`NO APROBADO PARA ACTIVACIÓN/PRIMER CLIENTE`.

La razón no es una compilación ni una preferencia documental: faltan controles internos MEDIUM y toda la evidencia externa de operación. El PR técnico de Rules puede avanzar como iniciativa pequeña y reversible si su auditoría concluye `APROBADO PARA MERGE`, la CI queda completamente verde y no mezcla B3, Wompi, reservas, identidad, debug ni credenciales.

## Riesgo residual y rollback

- Rollback técnico: revertir el commit de Rules/test/documentación si CI o integración descubre una incompatibilidad. El rollback reabriría explícitamente el bypass client-write y por eso no debe usarse para activar producción; debe acompañarse de bloqueo de ventas o de una corrección equivalente server-side.
- No existe rollback productivo ejecutado porque no hubo despliegue.
- Los riesgos de `usuarios`, rate limit, DIAN, writer legacy y service account permanecen visibles y no se ocultan con el estado PASS local.

## Auditoría final

Estado de esta certificación: **NO APROBADO PARA ACTIVACIÓN/PRIMER CLIENTE**.
Estado del PR técnico que contiene solo Rules/test/documentación: podrá ser **APROBADO PARA MERGE** únicamente después de revisar diff, CI y alcance; este documento no autoriza merge automático ni cierra el Goal.
