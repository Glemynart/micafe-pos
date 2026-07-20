# MT-U4 — Excepción transitoria de `usuarios`

> **Estado:** COMPLETADO.
> **Alcance:** Firestore Rules de MT-U4; no modifica el modelo de identidad ni los flujos de usuarios.
> **Siguiente iniciativa:** MT-U5.

## Excepción transitoria

La colección `usuarios` permanece como colección global legacy hasta MT-U5b. Durante esta fase no es posible aplicar aislamiento tenant-aware únicamente mediante Firestore Rules sin modificar el modelo de identidad o utilizar consultas prohibidas (`get()`, `exists()`, `getAfter()`).

`usuarios` no contiene `empresaId`; la pertenencia a una empresa se modela mediante `membresias`. Como MT-U4 exige autorización basada exclusivamente en Firebase Auth y Custom Claims, las Rules pueden identificar el tenant del solicitante, pero no demostrar que un usuario objetivo pertenece al mismo tenant.

Durante MT-U4 solo existe un tenant operativo (Café Atrato). Por ello, `usuarios` y `permisos_roles` conservan temporalmente el comportamiento legacy para preservar la compatibilidad funcional. Esta excepción no representa el modelo objetivo multiempresa y será eliminada en MT-U5b con la migración de la autoridad de identidad a `membresias`.

Por tanto, la política definitiva de `usuarios` se implementará en MT-U5b junto con la migración de la autoridad de rol y permisos hacia `membresias`.

## Límites de la excepción

- No convierte `usuarios` en una colección empresa-scoped ni añade `empresaId` a sus documentos.
- No autoriza lecturas de `membresias` desde Firestore Rules.
- No adelanta la migración de identidad, roles o permisos prevista para MT-U5b.
- No altera la política tenant-aware de las 25 colecciones operativas cubiertas por MT-U3 y MT-U4.

## Referencias arquitectónicas

- `MT-U1-empresas-membresias-diseno.md`, D-U1-2: `usuarios.rol` y `usuarios.permisos` son la fuente de verdad hasta MT-U5b.
- `MT-U2-runtime-saas-diseno.md`, D-U2-2: los claims de rol son espejo no autoritativo hasta MT-U5b.
- `MT-U3-helper-tenant-diseno.md`, §7.2: `usuarios` es global y no gana `empresaId`.
- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, §§4.2, 5 y 13: identidad global, pertenencia mediante membresías y migración de autoridad en MT-U5b.
