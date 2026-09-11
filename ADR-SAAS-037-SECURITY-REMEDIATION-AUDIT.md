# ADR-SAAS-037 — Security Remediation Audit

## Estado inicial

- Base: `origin/main @ 8e155d1bccfc7d8914b83aa0c7fe57042bc6da0c`.
- Finding: `broken-access-control.global-user-profile-read`.
- La Rule anterior permitía `read` global de `usuarios` a cualquier sesión
  autenticada; la suite de Rules certificaba ese comportamiento inseguro.
- `app/api/debug-tokens` no existe en esta base; no fue parte del diff.

## Consumidores y arquitectura corregida

| Consumidor | Clasificación | Tratamiento |
|---|---|---|
| Autenticación y actualización FCM propia | legítimo propio | `get`/update únicamente del UID autenticado. |
| Directorio administrativo | legítimo tenant-aware | Route backend con claim admin y membresía canónica activa; salida mínima. |
| Candidatos de relevo | legítimo tenant-aware backend | Conserva su resolución backend por membresías. |
| Notificaciones | legítimo backend | Lee tokens sólo después de resolver admins del tenant. |
| Lectura/listado directo global | inseguro | Denegado por Rules. |

No se requiere migración ni backfill: se conservan `usuarios` y
`membresias` como fuentes existentes y no se añade persistencia.

## `fcmTokens`

Permanece en `usuarios` para registro y limpieza del propio titular y para el
servicio backend de notificaciones. No forma parte de ninguna respuesta de
directorio y no puede ser leído por perfiles ajenos desde cliente.

## Matriz cross-tenant

| Actor | Recurso | Operación | Tenant propio | Otro tenant | Resultado |
|---|---|---|---|---|---|
| Usuario | Perfil | get | permitido sólo propio | denegado | PASS |
| Usuario | `usuarios` | list | denegado | denegado | PASS |
| Admin tenant | Perfil de tercero | get directo | denegado | denegado | PASS |
| Admin tenant | Directorio backend | list | permitido, mínimo | denegado por filtro de membresía | PASS |
| Backend de notificaciones | Tokens | read | sólo admins del tenant resuelto | no expuesto al cliente | PASS |

## Evidencia de validación

- `node --import tsx firestore-rules/run-tests.ts`: PASS, 33 pruebas.
- `node --import tsx --test app/api/usuarios/tenant/service.test.ts`: PASS,
  autorización y proyección mínima sin `email` ni `fcmTokens`.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

`npm run test:rules` no pudo iniciar otra instancia porque el puerto local 8085
ya estaba ocupado por un Firestore Emulator. No se terminó ese proceso ajeno.
La ejecución equivalente `npm run test:rules:raw` contra el emulador ya activo
pasó las 33 pruebas, incluidas las negativas de este ADR.

## Security scan

`npm audit --omit=dev --json` sobre la base identifica 1 crítico (`next`), 2
altos y 7 moderados preexistentes. Ninguno fue introducido por este diff. El
crítico de Next.js requiere un PR de dependencias separado; no se considera
evidencia de cierre para ADR-SAAS-037 ni se oculta.

## Diff y riesgos residuales

El diff se limita a Rules, su certificación negativa, el directorio backend
tenant-aware, el consumidor administrativo y la documentación del ADR. No
incluye Functions, migraciones, datos reales, secretos, Recovery, B3 ni otros
módulos.

Pendiente de esta auditoría: CI del PR y revisión/merge. No se realizaron
despliegues ni escrituras productivas.

NOT APPROVED
