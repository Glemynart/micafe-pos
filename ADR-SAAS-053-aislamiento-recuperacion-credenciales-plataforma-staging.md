# ADR-SAAS-053 — Aislamiento de recuperación de credenciales de plataforma para staging

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-10-02.

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial`.

La aceptación autoriza únicamente la implementación posterior de la frontera
definida aquí. No autoriza por sí sola deploy, tráfico, reemisión, Bootstrap,
Activation, fixtures adicionales ni producción.

## Contexto y evidencia

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` está `ACTIVE` en
`micafe-pos-staging`. Por ello ya no aplica la reemisión de una incorporación
temporal de ADR-SAAS-050: esa operación solo es válida para `TEMP_CREDENTIAL`.

La acción Backoffice de recuperación de un administrador activo invoca el
contrato ya aceptado por ADR-SAAS-017:

- `restablecerCredencialAdministradorTenantSaas`;
- `reemitirRestablecimientoCredencialAdministradorTenantSaas`; y
- `activarRestablecimientoCredencial` tras la autenticación temporal.

Los dos comandos de plataforma y la activación siguen exportados localmente por
el codebase legacy `saas-auth`, pero el primero no existe en staging. La
consulta remota devuelve `404`; el navegador lo presenta como un preflight CORS
sin `Access-Control-Allow-Origin`. El error observable `internal` no es una
prueba de un defecto del PIN ni se corrige cambiando CORS.

Desplegar `saas-auth` para recuperar la credencial no permite demostrar un
delta limitado y contradice ADR-SAAS-048. Escribir una credencial, un PIN, un
hash o un restablecimiento directamente también contradice ADR-SAAS-013 y
ADR-SAAS-017.

`consultarAuditoriaPlataformaSaas` también está ausente y produce un fallo
independiente en el historial Backoffice. No forma parte de esta propuesta: su
superficie se evaluará en un gate separado y no bloquea la emisión canónica.

## Problema

ADR-SAAS-017 ya define la recuperación segura, pero sus endpoints continúan en
un monolito que no puede desplegarse de forma dirigida. E2.2 necesita recuperar
exclusivamente el fixture sintético sin reabrir Bootstrap, reutilizar PIN alguno
ni modificar la autoridad del tenant.

## Decisión

Crear un codebase dedicado:

```text
saas-platform-credential-recovery
└── functions-platform-credential-recovery/src/index.ts
    ├── restablecerCredencialAdministradorTenantSaas
    ├── reemitirRestablecimientoCredencialAdministradorTenantSaas
    └── activarRestablecimientoCredencial
```

Los tres endpoints conservan exactamente sus nombres públicos, contratos,
errores observables, región `us-central1` y runtime Node.js 22.

### Autoridad y contratos preservados

| Callable | Autoridad servidor | Datos de cliente permitidos | Efecto |
| --- | --- | --- | --- |
| `restablecerCredencialAdministradorTenantSaas` | Auth + `ACCESO_RESTABLECER` | envelope, `empresaId`, evidencia fuera de banda | Inactiva la credencial activa del owner y emite una temporal de recuperación. |
| `reemitirRestablecimientoCredencialAdministradorTenantSaas` | Auth + `ACCESO_RESTABLECER` | mismo contrato | Reemplaza únicamente una recuperación pendiente compatible. |
| `activarRestablecimientoCredencial` | Auth temporal `RESTABLECIMIENTO_TEMP` derivada por servidor | `pinActual`, `pinNuevo` | Activa una recuperación vigente y emite la sesión tenant canónica. |

El cliente no puede aportar UID objetivo, rol, claims, membresía, empresa
efectiva ni `restablecimientoId` como autoridad. La validación fuera de banda,
el owner, los estados, la unicidad de credencial, el hash, la idempotencia, la
auditoría y la revocación de tokens continúan en los servicios canónicos de
ADR-SAAS-017.

### Closure, Secrets y límites

El codebase declara exclusivamente el Secret existente `OPERATIONAL_PIN_PEPPER`
en los endpoints que lo consumen. No declara Secrets adicionales, parámetros
globales ni I/O en module-load.

La implementación deberá extraer o reutilizar helpers neutrales mínimos para:

- autorización de plataforma y contrato de envelope;
- servicio canónico de recuperación, auditoría y reserva de código;
- validación del token temporal; y
- emisión de la sesión tenant posterior a la activación.

Quedan prohibidos imports transitivos de `functions/src/index.ts`,
`credential-recovery-callables.ts` completo, `operational-auth.ts` completo,
Bootstrap, Bodega, comercial, Wompi, Dusema, email, schedules, configuración
Web y cualquier inicialización no necesaria. Si el emisor de sesión está dentro
de `operational-auth.ts`, se extraerá una unidad neutral que conserve el
contrato actual y no arrastre el adapter operativo completo.

No se migra en esta decisión `restablecerCredencialOperativa` (recuperación
entre miembros del mismo tenant), ni `consultarAuditoriaPlataformaSaas`, ni
otras callables legacy.

## Alternativas evaluadas

| Alternativa | Resultado |
| --- | --- |
| Desplegar `saas-auth` | Rechazada: closure, discovery y Secrets ajenos no permiten un deploy dirigido. |
| Cambiar CORS del endpoint inexistente | Rechazada: el origen de la respuesta es 404, no una política CORS de una Function desplegada. |
| Reemitir una incorporación temporal | Rechazada: el fixture está `ACTIVE`; no cumple el contrato de ADR-SAAS-050. |
| Escribir PIN, hash o credencial directamente | Rechazada: viola autoridad, auditoría e invariantes de ADR-SAAS-013/017. |
| Boundary dedicado de recuperación | Recomendada: conserva una única implementación canónica y limita la superficie desplegable. |

## Migración, validación y rollback

La implementación posterior debe realizarse en un PR aislado. Añadirá el
source y codebase dedicados, retirará únicamente estas tres exportaciones
legacy de `saas-auth` y mantendrá los servicios compartidos sin duplicación.

Debe demostrar: build reproducible; TypeScript; lint; tests de autoridad,
evidencia, idempotencia, activación y aislamiento; discovery de exactamente tres
endpoints; module-load sin I/O; cierre de imports; y cero Secrets distintos de
`OPERATIONAL_PIN_PEPPER`.

El preflight de staging deberá probar que solo cambia
`saas-platform-credential-recovery`, sin deletes, replacements, tráfico manual,
codebases ajenos ni producción. La recuperación del fixture será un gate mutante
posterior, único y auditado; no ocurre durante el deploy ni se automatiza.

Antes del primer deploy, rollback es revertir el cambio técnico. Después del
deploy, cualquier rollback de revisión requiere un gate operativo explícito y
una revisión conocida. Una recuperación emitida no se deshace: queda auditada,
la temporal anterior permanece inválida y el fixture se retiene conforme
ADR-SAAS-048.

## Consecuencias

La decisión desbloquea la implementación de una ruta canónica para recuperar
un fixture `ACTIVE` sin tocar `saas-auth`. No autoriza el deploy ni una
reemisión; tampoco cierra Gate E ni E2.2. Producción y Distribuidora Las
Jiménez permanecen fuera de alcance.
