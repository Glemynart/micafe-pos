# ADR-SAAS-037 — Aislamiento de lectura de perfiles globales

## Estado

**Aceptado.** Aprobado por Product Owner el 2026-09-11 para `G-MVP-01`, con
implementación separada de B3, Recovery y certificaciones funcionales.

## Contexto

`usuarios/{uid}` es el perfil global de una identidad. La autoridad de tenant
permanece exclusivamente en `membresias/{empresaId}_{uid}` y los claims que
emite el backend. El contrato anterior permitía a cualquier sesión autenticada
leer o listar todos los perfiles, exponiendo PII y potenciales `fcmTokens`.

`empresaId` continúa siendo la frontera de seguridad. `espacioId` no es una
frontera de seguridad ni una sede.

## Decisión

1. Las Rules permiten únicamente `get` del perfil propio y prohíben todo
   `list` y toda lectura de perfil ajeno desde cliente.
2. El directorio administrativo se resuelve en backend: valida token con
   `empresaId`, claim `admin` y membresía propia canónica activa; luego consulta
   exclusivamente las membresías del tenant y obtiene sus perfiles con Admin
   SDK.
3. La respuesta se limita a `uid`, `nombre` y `username`. No incluye `email`,
   timestamps, roles, permisos ni `fcmTokens`.
4. `fcmTokens` permanece en el perfil global: el titular puede actualizarlo y
   los servicios backend de notificación lo leen sólo tras resolver miembros
   administradores del tenant. No se crea una proyección, migración ni backfill.

## Consecuencias

- Se elimina la enumeración y lectura cross-tenant de `usuarios` por cliente.
- La UI administrativa conserva un directorio tenant-aware sin que Firestore
  Rules haga `get()` de membresías ni se introduzca persistencia adicional.
- Las rutas backend que necesitan nombres (relevo y notificaciones) mantienen
  el mismo patrón: determinar primero la membresía tenant y proyectar sólo lo
  requerido.

## Verificación requerida

- perfil propio permitido;
- perfil ajeno y listado global denegados;
- directorio backend limitado al tenant y a admin activo;
- ausencia de `email` y `fcmTokens` en la respuesta;
- typecheck, build, Rules Emulator y pruebas relevantes en verde.
