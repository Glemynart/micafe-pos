# MT-U5A — Changelog de implementación

> **Estado final:** ✅ **COMPLETADO**.

## Objetivo cumplido

Se incorporó la infraestructura de autenticación operativa SaaS para la empresa fundacional, sin trasladar
la autoridad de roles o permisos a `membresias`.

## Implementación

- Proyecto Firebase Functions v2 modular con Firebase Admin SDK.
- Credencial operativa independiente de Firebase Email/Password: código normalizado y PIN de seis dígitos.
- PIN almacenado solo como hash bcrypt con pepper de Secret Manager; no se registra ni reutiliza la
  contraseña Firebase.
- Function privilegiada para validar credenciales, emitir Custom Claims y crear Custom Tokens.
- Inicio de sesión cliente mediante `signInWithCustomToken`, refresh forzado de claims e integración con
  `AuthContext` y `SaaSContext`.
- La ruta código + PIN es la vía operativa principal; username + contraseña Firebase continúa como
  contingencia legacy.
- Normalización de los roles tenant: `admin`, `supervisor`, `cajero`, `cocinero` y `marketing`.
- El resolvedor de tenant ya exige claims válidos y no usa fallback de empresa fundacional.

## Alcance preservado

No se modificaron Firestore Rules, la autoridad temporal de `usuarios`, el modelo de `membresias`,
Electron, onboarding, invitaciones ni funcionalidades de MT-U5B.

## Correcciones finales de cierre

- Functions dejó de depender de `file:..`, por lo que su paquete es desplegable desde `functions/`.
- El emisor legacy de claims reconoce `supervisor`, manteniendo la compatibilidad de ese rol durante la
  transición.

## Validaciones de cierre

- `npm run build:functions` — correcto.
- `npx tsc --noEmit` — correcto.
- `npm run test:auth-foundation` — 4 pruebas correctas.
- `npm run test:tenant` — 6 pruebas correctas; 1 omitida existente.
- `git diff --check` — correcto.
- Lint no ejecutable: el repositorio no dispone de un ejecutable `eslint` configurado.
