# ADR-SAAS-058 — Aislamiento de recuperación de credenciales de operador tenant para staging

## Estado

**ACEPTADO — 2026-10-03.**

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial`.

Esta aceptación autoriza únicamente la implementación controlada de la frontera definida aquí. No autoriza por sí sola deploy, tráfico, creación de tenant o fixture, Bootstrap, Activation, cambios de Rules/IAM, ni producción.

## Contexto y evidencia

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` está activo en `micafe-pos-staging`. La recuperación canónica de su administrador ya se materializó mediante `saas-platform-credential-recovery` (ADR-SAAS-053) y el estado de recuperación quedó `ACTIVADO` tras el cambio obligatorio de PIN.

Gate F continúa abierto. Su matriz requiere demostrar en staging que un administrador tenant puede revocar una credencial de vendedor y restaurar el acceso mediante la recuperación temporal canónica. La lógica ya existe en `credential-recovery-service.ts` y el contrato cliente vigente se llama `restablecerCredencialOperativa`, pero el adapter aún vive en `saas-auth`.

La inspección remota confirma que `restablecerCredencialOperativa` no está desplegada en `micafe-pos-staging`, mientras que `autenticarOperativo`, `crearIncorporacionDirecta` y la activación de recuperación sí están activas. Desplegar `saas-auth` para publicar una única superficie no permite demostrar un delta seguro y contradice ADR-SAAS-048. Escribir una credencial, PIN, hash, membership o auditoría directamente no es admisible.

## Decisión

Crear un codebase dedicado:

```text
saas-tenant-credential-recovery
└── functions-tenant-credential-recovery/src/index.ts
    └── restablecerCredencialOperativa
```

La callable conserva su nombre público, región `us-central1`, runtime Node.js 22, contrato de envelope, códigos de error y semántica actuales.

El codebase declara exclusivamente el Secret existente `OPERATIONAL_PIN_PEPPER`; no incorpora Secrets, parámetros ni I/O de carga adicionales.

### Autoridad y contrato

`restablecerCredencialOperativa` requiere una sesión tenant autenticada que el servidor revalida contra Empresa y membresía activa. Solo una membresía con rol `admin` puede solicitar recuperación y solo para otro miembro activo que no sea `admin`. El cliente solo puede suministrar el envelope canónico y `objetivoUid`; no puede elegir empresa efectiva, actor, rol, permisos, claims, código, PIN, hash, estado ni auditoría.

El adapter delega la emisión, revocación de la credencial anterior, idempotencia, reserva global de código, TTL, auditoría y restricciones de recuperación al único `credential-recovery-service.ts` de ADR-SAAS-017.

La autenticación temporal posterior sigue usando `autenticarOperativo`; la activación sigue usando `activarRestablecimientoCredencial` de ADR-SAAS-053. Esta ADR no duplica ni mueve esos dos contratos.

### Closure y migración

El nuevo entrypoint puede reutilizar únicamente unidades neutrales mínimas:

- `credential-recovery-service.ts`;
- `tenant-configuration/authority.ts` para revalidar tenant y membresía; y
- contratos y utilidades estrictamente transitivas de esos módulos.

Quedan prohibidos imports de `functions/src/index.ts`, `credential-recovery-callables.ts` completo, `operational-auth.ts` completo, Bootstrap, comercial, Bodega, Wompi, Dusema, email, schedules, configuración Web y cualquier módulo con Secret ajeno.

La implementación retira únicamente la exportación legacy `restablecerCredencialOperativa` de `saas-auth` para evitar dos definiciones locales del mismo endpoint. No retira otros endpoints legacy ni modifica sus contratos.

## Alternativas evaluadas

| Alternativa | Resultado |
| --- | --- |
| Desplegar `saas-auth` | Rechazada: no ofrece discovery ni delta acotados. |
| Escribir la credencial o membresía directamente | Rechazada: viola autoridad, auditoría y ADR-SAAS-017. |
| Añadir el endpoint a `saas-platform-credential-recovery` | Rechazada: mezclaría la autoridad de plataforma con la autoridad de administrador tenant. |
| Boundary dedicado tenant | Aceptada: conserva la autoridad correcta y una superficie desplegable mínima. |

## Validación, deploy y rollback

La implementación posterior debe demostrar TypeScript, lint, build, tests de autoridad/objetivo/idempotencia/auditoría, discovery de exactamente un endpoint y module-load sin I/O. El preflight debe probar que solo despliega `saas-tenant-credential-recovery → restablecerCredencialOperativa`, en `micafe-pos-staging`, sin deletes, replacements, codebases ajenos ni producción.

La validación funcional posterior usará exclusivamente el fixture retenido y un vendedor sintético ya autorizado. Debe comprobar la revocación del acceso, la recuperación temporal, la activación y la auditoría, sin exponer secretos.

Antes del primer deploy, rollback es revertir el cambio técnico. Tras deploy, cualquier rollback de revisión o tráfico requiere un gate explícito y una revisión conocida. Una recuperación emitida es un hecho persistido y solo se trata mediante el flujo canónico; no se borra directamente.

## Consecuencias

La decisión desbloquea la implementación de una única superficie de recuperación de operador tenant. No cierra Gate F, rehearsal, certificación, tenant real, aceptación operativa ni producción.
