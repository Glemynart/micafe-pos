# MT-U5B — Bloque 1: gate de preparación de autoridad

> **Estado:** ✅ **COMPLETADO**.

El cambio definitivo de autoridad no se ejecuta en este bloque. Antes de iniciar el Bloque 2, la empresa fundacional debe completar, en este orden:

1. Ejecutar el backfill idempotente de `membresias`.
2. Verificar rol, permisos, estado, clave determinística y unicidad de cada membresía.
3. Verificar que todo `usuarios/{uid}` tenga una identidad correspondiente en Firebase Authentication.
4. Ejecutar el cambio único de autoridad en el Bloque 2.

`scripts/migrate-mt-u5b-membresias.ts --verify` es solo lectura y falla ante cualquiera de esas inconsistencias.

> **Actualización de estado:** el Bloque 2 se completó posteriormente. La autoridad runtime de rol, permisos y estado ahora proviene exclusivamente de `membresias`. Este documento conserva el flujo de preparación como evidencia histórica del gate previo al cambio.

## Plantillas globales de transición

- `permisos_roles/supervisor` usa exactamente el contrato de
  `ADR-SAAS-005-rol-supervisor.md`.
- `permisos_roles/marketing` usa `permisos: []`. No existe un permiso modular de
  POS que represente Landing/Marketing, y otorgar uno violaría su límite de no
  adquirir permisos operativos ni administrativos por defecto. Durante la transición,
  la gestión de `eventos`/contenido de Landing se expresa por el rol canónico
  `marketing`, no por un permiso de plantilla; su alcance tenant definitivo permanece
  sujeto a la decisión de producto documentada en
  `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` §16.

## Trabajo diferido

La revocación inmediata de privilegios no forma parte de MT-U5B. Se implementará
en una futura unidad de seguridad dedicada, manteniendo mientras tanto el modelo
estándar de Firebase Authentication: custom claims y revocación de refresh tokens.
