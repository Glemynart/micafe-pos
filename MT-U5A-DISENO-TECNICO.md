# MT-U5A — Diseño técnico verificado

> **Estado:** Propuesto para aprobación documental. No autoriza implementación.
>
> **Fecha / última revisión:** 2026-07-28
>
> **Base de código revisada:** `main` en `68c5415` (PR #131 incluido). La rama de trabajo apunta al mismo commit.

## Objective

Definir el diseño técnico de MT-U5A — autenticación operativa por código + PIN — sin cambiar la arquitectura SaaS aprobada. Este documento contrasta el diseño con el código actual y fija el alcance que debe preservarse si se realiza una corrección o una reimplementación controlada.

Conclusión de la revisión: MT-U5A ya está implementado en `main` desde PR #100 y el estado actual también incluye el cambio de autoridad de MT-U5B, la incorporación `DIRECTA`/`EMAIL`, el bootstrap del primer administrador y la migración de operadores de PR #131. Por tanto, **no existe una implementación pendiente de MT-U5A que deba iniciar este trabajo**. Cualquier trabajo posterior debe ser una unidad nueva, con alcance propio; no debe reabrir MT-U5A ni restaurar a `usuarios` como fuente de autoridad.

## Scope

Incluido:

- La ruta web/PWA de autenticación operativa `código + PIN → Cloud Function → custom token`.
- La relación entre Firebase Auth, `credenciales_operativas`, `incorporaciones`, `membresias`, custom claims y el perfil global `usuarios`.
- La compatibilidad estrictamente necesaria con el alta legacy y la gestión de operadores después de PR #131.
- El inventario de usos de `usuarios` y su clasificación entre autoridad, perfil, migración o diagnóstico.

Excluido:

- Cambio de tenant (MT-U11), convergencia de Electron (MT-U12), recuperación/restablecimiento de PIN, nuevos permisos, cambios de lifecycle, configuración fiscal, onboarding empresarial y rediseño de Rules.
- Retirar o refactorizar código legacy solamente por limpieza.
- Modificar colecciones, Functions, Rules, UI o datos como parte de este diseño.

## Current State

### Documentación revisada

Se revisaron el maestro SaaS, ADR-SAAS-001 a 013 relevantes a identidad, membresías, incorporaciones, lifecycle, operadores y auditoría; MT-U1, U2, U4, U5 Capa 0, U5A changelog y U5B; la investigación de autenticación, R-6 y gestión/migración de operadores; y la auditoría de la migración de operadores.

Las autoridades aprobadas son:

| Concepto | Autoridad canónica actual |
|---|---|
| Identidad técnica | Firebase Auth |
| Perfil global | `usuarios/{uid}` |
| Rol, permisos efectivos y estado de pertenencia | `membresias/{empresaId}_{uid}` |
| Tenant y rol proyectado de la sesión | custom claims `{ empresaId, rol }` emitidos por backend |
| Credencial operativa | `credenciales_operativas` |
| Ciclo de incorporación | `incorporaciones` |
| Estado de acceso del tenant | `empresas/{empresaId}.estado` |

### Código actual verificado

- PR #100 introdujo Functions v2, bcrypt con pepper de Secret Manager, custom token y el cliente de autenticación operativa.
- `functions/src/operational-auth.ts` autentica contra una credencial operativa, verifica empresa y membresía activa, y emite claims desde el rol de la membresía; no consulta `usuarios.rol`, `.permisos` ni `.activo`.
- `lib/auth-service.ts` y `contexts/saas-context.tsx` materializan el perfil desde `usuarios`, pero proyectan `rol`, `permisos` y `activo` exclusivamente desde la membresía activa.
- `firestore.rules` declara expresamente que `usuarios` es un perfil global que no contiene ni decide rol, permisos o estado; las membresías se leen como recurso tenant y solo Functions las escriben.
- La ruta `DIRECTA_TEMP` permite activar una credencial inicial sin emitir todavía claims tenant. Al activar, se crea/valida la membresía y se canjea por una sesión tenant plena.
- PR #131 cambió las pantallas de gestión de usuarios para crear incorporaciones `DIRECTA` con código y PIN temporal generados por servidor. Mantiene el callable legacy `crearUsuarioConMembresia` y `crearUsuario()` como compatibilidad, pero las pantallas activas llaman `crearOperador()`.
- R-6 eliminó la dependencia de `esFundacional` del login: el servidor busca credenciales por código global y desambigua mediante el PIN. El cliente no suministra `empresaId`.

### Desviaciones documentales encontradas

`MT-U5A-CHANGELOG.md` todavía describe a `usuarios` como autoridad temporal y dice que membresías no son autoridad. Esa descripción fue cierta al cierre original de U5A, pero quedó superada por MT-U5B y por el código actual. No puede usarse para guiar cambios futuros. El maestro SaaS, MT-U5B y la implementación actual reflejan correctamente la autoridad en membresías.

## Target State

El estado objetivo de MT-U5A, ya materializado en el código actual, es:

```text
Código + PIN
  → Function privilegiada
  → credencial operativa válida
  → empresa en estado admisible + membresía activa y canónica
  → claims { empresaId, rol }
  → custom token
  → Firebase Auth / ID token
  → contexto SaaS y servicios tenant
```

Invariantes:

1. El cliente nunca aporta ni elige `empresaId`, UID objetivo, rol efectivo, permisos o claims.
2. El PIN no se persiste, registra ni devuelve después del flujo de entrega/activación; solo existe como hash bcrypt más pepper.
3. `usuarios` puede enriquecer una vista con nombre, username, email, último acceso o tokens FCM; no autoriza acceso tenant.
4. Una sesión tenant exige coincidencia entre claim y membresía activa. La Rules añade aislamiento por `empresaId` y el estado canónico de la empresa protege frente a tokens antiguos.
5. Una credencial temporal no concede acceso tenant: solo permite completar la activación `DIRECTA_TEMP`.
6. Los claims de plataforma se preservan al actualizar el bloque tenant; un rol tenant nunca concede facultades SaaS.

## Affected Components

| Componente | Responsabilidad MT-U5A / estado actual |
|---|---|
| `functions/src/operational-auth.ts` | Frontera privilegiada: validación de PIN, bloqueo por fallos, membresía, claims, token, rotación y actualización de membresía. |
| `functions/src/incorporaciones*.ts` | Alta `DIRECTA` y `EMAIL`, activación y transición a membresía activa. PR #131 usa la ruta DIRECTA. |
| `functions/src/contracts.ts`, `pin-security.ts` | Vocabulario de roles, normalización de código, validación PIN e hash con pepper. |
| `lib/operational-auth-service.ts` | Cliente de callables y canje seguro con `signInWithCustomToken`. |
| `lib/auth-service.ts`, `contexts/auth-context.tsx` | Materialización de sesión y manejo de activación obligatoria. |
| `contexts/saas-context.tsx`, `lib/tenant-context.ts` | Resolución exclusiva del tenant desde claim y contraste con membresía. |
| `lib/membresias-service.ts`, `lib/permisos-service.ts` | Autoridad, lectura tenant y administración de operadores basada en membresías. |
| `firestore.rules` | Aislamiento tenant y bloqueo de escrituras según `Empresa.estado`; `usuarios` queda global y no autoritativo. |
| PWA/POS de usuarios | Alta de operadores por incorporación DIRECTA; cambios de rol, permisos y estado vía `actualizarMembresia`. |

## Current Flow

### Login normal

1. La UI entrega código y PIN a `autenticarOperativo`.
2. La Function normaliza el código, verifica formato del PIN, busca candidatas por código y comprueba bcrypt con pepper.
3. Rechaza credenciales bloqueadas, inactivas, ambiguas, empresa ausente o empresa fuera de `trial`/`activa` con un mensaje externo uniforme.
4. Para credenciales no temporales, lee `membresias/{empresaId}_{uid}` y exige `rol` canónico, permisos válidos, `estado: activa` y `activo: true`.
5. Emite `{ empresaId, rol }`, preserva el claim SaaS, crea custom token y el cliente lo canjea con Firebase Auth.
6. El cliente fuerza la lectura fresca del ID token; `SaaSContext` contrasta claim contra membresía y obtiene la empresa.
7. `AuthContext` construye el objeto de UI uniendo perfil global y membresía: los campos de autorización proceden de la segunda.

### Activación de credencial inicial o DIRECTA

1. Si `requiereCambio` es verdadero, la Function valida la incorporación `DIRECTA` temporal y entrega un custom token limitado a `authStage: DIRECTA_TEMP`.
2. El cliente solo muestra el paso de definir PIN; no resuelve tenant ni expone el POS.
3. `activarIncorporacionDirecta` valida el estado, actualiza el hash, crea/activa la membresía y emite una sesión tenant plena.
4. La misma ruta protege el primer admin provisionado por plataforma y operadores creados desde PR #131.

## Proposed Flow

No se propone un flujo nuevo. Para preservar MT-U5A se adopta como flujo normativo el flujo actual anterior.

La única decisión de diseño pendiente de ejecución es documental: cualquier nueva funcionalidad de credenciales debe invocar o extender una Function privilegiada y validar membresía/empresa de la misma manera; no puede recuperar el acceso directo de cliente a `usuarios`, Firebase Email/Password ni la selección de tenant desde UI.

## Data Model

| Recurso | Campos/uso relevante | Autoriza |
|---|---|---|
| `usuarios/{uid}` | `nombre`, `username`, `email`, `ultimoAcceso`, `fcmTokens`, timestamps | No; es perfil global. |
| `membresias/{empresaId}_{uid}` | `empresaId`, `uid`, `rol`, `permisos`, `estado`, `activo` | Sí; autoridad tenant. |
| `credenciales_operativas/{empresaId}_{codigo}` | `empresaId`, `uid`, `codigo`, `pinHash`, `activo`, bloqueo, `requiereCambio`, `incorporacionId` | Solo autentica la posesión de la credencial; no sustituye la membresía. |
| `incorporaciones/{id}` | tenant, mecanismo, estado, UID/código y permisos preparados | Gobierna el ciclo previo a la membresía activa. |
| Firebase Auth | principal, disabled, custom claims | Identidad y proyección de sesión; no almacena permisos completos. |
| `empresas/{empresaId}` | `estado`, datos de tenant | Lifecycle canónico; condiciona acceso/escrituras. |

No se añaden campos a `usuarios`. En especial, no se vuelve a introducir allí `rol`, `permisos`, `activo`, `empresaId`, PIN, hash o claims.

## Authentication Changes

Para una reimplementación desde la línea base MT-U4, el cambio de MT-U5A sería:

1. Añadir Functions v2 y Secret Manager para el pepper.
2. Añadir el contrato de código/PIN y credenciales operativas backend-only.
3. Emitir custom token solo después de comprobar credencial, empresa y membresía.
4. Sustituir la ruta primaria de login por el callable y `signInWithCustomToken`.
5. Quitar el fallback cliente de empresa: un token sin claim tenant, salvo `DIRECTA_TEMP`, no inicia una sesión tenant.

En el estado revisado, estos pasos ya existen. El login username/email interno sigue únicamente como código de compatibilidad de creación legacy; no es la ruta activa de autenticación.

## Authorization Changes

MT-U5A no crea una segunda autoridad. La Function debe:

- derivar el rol del documento de membresía, no de `usuarios` ni de una entrada del cliente;
- actualizar claims solo desde backend y revocar/renovar según corresponda;
- preservar claims de plataforma aislados bajo `saas`;
- comprobar `Empresa.estado` antes de emitir una sesión operativa;
- aplicar bloqueo temporal y respuestas no enumerables para fallos de credencial.

Firestore Rules conserva la separación: las colecciones operativas se protegen por claim y tenant; el estado de la empresa se evalúa canónicamente; la escritura de membresías, credenciales e incorporaciones no se concede a clientes.

## Inventory: remaining `usuarios` dependencies

### Dependencias que sí usan `usuarios` como autoridad histórica

No hay una dependencia **runtime** actual de rol, permisos o estado en `usuarios`. Las dos siguientes son migraciones históricas que leen los campos legacy únicamente para poblar/verificar la autoridad ya trasladada:

| Ubicación | Responsabilidad actual | Por qué lee `usuarios` | Decisión |
|---|---|---|---|
| `scripts/migrate-mt-u1-fundacional.ts` | Elegir el owner fundacional y crear la arista inicial de membresía. | La fuente disponible antes de MT-U5B contenía `rol`/`activo`. | No ejecutar de nuevo en producción. Conservar como evidencia/rollback hasta certificar archivo de migraciones; no pertenece a MT-U5A. |
| `scripts/migrate-mt-u5b-membresias.ts` y `lib/membresias-preparacion.ts` | Backfill y gate de preparación de MT-U5B. | Copia/valida rol, permisos y activo legacy para la primera membresía canónica. | Solo migración histórica. No es llamada por runtime. Retirable en una futura limpieza de migraciones tras conservar evidencia y verificar que no hay reejecución requerida. |

### Dependencias runtime de perfil, no de autoridad

| Ubicación | Responsabilidad | ¿Por qué depende de `usuarios`? | Decisión |
|---|---|---|---|
| `lib/auth-service.ts` | Nombre, username, email, último acceso y FCM de la sesión. | Une perfil global con membresía; rol/permisos/activo vienen de membresía. | Debe permanecer como perfil; el requisito implícito de que exista perfil merece validación de datos, no una migración de autoridad. |
| `lib/permisos-service.ts` | Lista de personas de un tenant. | Cruza membresías tenant con perfiles para mostrar identidad. | Debe permanecer; no usa perfil para visibilidad, rol o permisos. |
| `lib/reportes-service.ts` | Nombre de vendedores en reportes. | Resuelve etiqueta humana por UID; el rol se toma de membresía. | Debe permanecer. |
| `lib/turnos-service.ts` | Nombre del relevo. | Requiere perfil para el nombre; valida elegibilidad/rol con membresía. | Debe permanecer. |
| `app/api/turnos/candidatos-relevo/route.ts` | Lista candidatos al relevo. | Tras filtrar membresías activas, lee nombres de perfiles. | Debe permanecer. |
| `lib/notificaciones-push.ts` | Tokens FCM de administradores. | Selecciona admins por membresía y lee/purga tokens del perfil. | Debe permanecer. |
| `components/fcm-manager.tsx` y logout | Registrar/retirar FCM del propio usuario. | `fcmTokens` pertenece al perfil técnico global. | Debe permanecer. |
| `functions/src/incorporaciones-service.ts` | Crear perfil para DIRECTA/EMAIL y compensar un Auth huérfano. | Garantiza el perfil global 1:1; membresía se crea/activa por separado. | Debe permanecer. |
| `functions/src/operational-auth.ts:crearUsuarioConMembresia` | Compatibilidad de alta legacy. | Crea perfil junto con membresía; autoridad queda en membresía. | Mantener temporalmente; retirar solo en una unidad posterior tras inventario y plan de sustitución. |
| `functions/src/platform/emitir-credencial-inicial.ts` | Crear el perfil del owner si no existe. | Garantiza identidad visible global, no autoridad. | Debe permanecer. |
| `firestore.rules` | Política de perfil. | Permite lectura de perfil y actualización propia de acceso/FCM. | No es autoridad; una revisión de minimización de lectura es seguridad futura, fuera de MT-U5A. |
| `app/api/debug-tokens/route.ts` | Diagnóstico no productivo. | Devuelve perfiles para depuración. | No es autoridad; debe permanecer deshabilitado en producción y revisarse en una iniciativa de hardening. |
| `check-usuarios.ts` | Diagnóstico manual de Firestore. | Imprime campos legacy, incluido rol, para inspección. | No es runtime ni debe usarse para validar autorización; retirar o actualizar en limpieza de herramientas. |
| `scratch_update_admin.js` | Script manual histórico. | Modifica `usuarios.permisos` directamente. | No ejecutar: ya no cambia permisos efectivos. Retirarlo en una unidad de limpieza de scripts, no en MT-U5A. |

### Recursos homónimos que no son la colección Firestore global

`src/database.js`, `main.js` y `get_users.js` usan una tabla SQLite local llamada `usuarios` para el cliente Electron. Esa tabla sí contiene roles locales, pero pertenece al boundary aislado de Electron y no es `usuarios/{uid}` de Firestore. Conforme a MT-U5 Capa 0, no debe mapearse ni migrarse dentro de MT-U5A; su convergencia corresponde a MT-U12.

Los comentarios antiguos que describen a `usuarios` con rol/PIN (por ejemplo el encabezado de `lib/auth-service.ts`) son deuda documental/cosmética, no evidencia de autoridad runtime.

## Migration Strategy

No hay migración nueva de MT-U5A autorizada ni necesaria en el estado actual.

Para una instalación que partiera realmente de MT-U4, la secuencia aprobada sería:

1. Inventariar perfiles, identidades Auth, membresías y plantillas de permisos sin cambiar datos.
2. Ejecutar el backfill idempotente de MT-U5B y su `--verify`; no activar lectores hasta que cada membresía sea completa y única.
3. Cambiar lectores/escritores de autorización a membresías en un corte único.
4. Emitir/reemitir claims desde membresías y verificar sesiones nuevas y existentes.
5. Aprovisionar credenciales operativas sin copiar contraseñas Firebase ni escribir PIN en Firestore.
6. Validar login, activación, cambio de rol, desactivación y aislamiento tenant antes de retirar compatibilidad.

El código actual ya está después de los pasos 1 a 5. Reejecutar los scripts sin una razón de recuperación aprobada puede sobrescribir el contexto histórico y está fuera de este diseño.

## Risks

| Área | Riesgo | Control vigente / condición de aceptación |
|---|---|---|
| Autenticación | Fuerza bruta, enumeración o fuga de PIN. | Formato estricto, bcrypt+pepper, bloqueo tras cinco fallos, mensaje uniforme y ausencia de secretos en logs. |
| Autorización | Rol del token obsoleto o manipulado. | Backend contrasta claim con membresía; Rules usan claim y estado canónico de empresa. |
| Claims | Un cambio de rol/estado no se refleje inmediatamente. | Actualización/revocación de tokens; la sesión se vuelve a validar contra membresía en Functions y contra lifecycle en Rules. |
| Membresías | Perfil y membresía creados a medias. | Transacciones de incorporación y estados `TEMP_CREDENTIAL`/`ACTIVE`; compensación de principal email. |
| Aislamiento tenant | Cliente elija tenant o una credencial se resuelva equivocadamente. | El cliente no envía `empresaId`; resolución por credencial + PIN; claim y Rules fijan tenant. |
| Firestore | Lectura global de perfiles revele más datos de los necesarios. | Es un riesgo de privacidad/escala existente; no convertirlo en cambio de MT-U5A. Evaluar por separado con requisitos de perfil mínimo. |
| Cloud Functions | Fallo entre Firestore y Firebase Auth. | Incorporaciones y bootstrap son reintentables; los claims se emiten como paso recuperable. |
| UI | El PIN temporal se pierda o se permita usar POS antes de activarlo. | Entrega única, `requiereCambio`, sesión `DIRECTA_TEMP` sin tenant y guard de activación. |
| Datos | Reejecutar backfills históricos o dejar perfiles faltantes. | Scripts con verify/dry-run; auditoría previa de perfiles sin migrar autoridad de vuelta. |
| Migración | Usuarios creados por la vía legacy sigan sin credencial utilizable. | La alta nueva usa PR #131; el tratamiento de legados exige una unidad futura de recuperación/provisionamiento. |

## Edge Cases

- Código coincidente en más de un tenant: el backend verifica PIN contra candidatas y exige una única coincidencia.
- Código/PIN erróneos, credencial inactiva, empresa suspendida o membresía inválida: misma respuesta externa; no enumerar cuentas.
- Credencial temporal vencida, cancelada o ya sustituida: no emite sesión tenant.
- `DIRECTA_TEMP` restaurada tras recarga: no se resuelve tenant antes de la activación.
- Membre­sía desactivada mientras el token aún existe: las operaciones privilegiadas revalidan membresía; Rules bloquean lifecycle incompatible.
- Claim tenant distinto al rol actual de membresía: el contexto SaaS se deniega y la Function rechaza la operación.
- Perfil global ausente con membresía existente: la autorización no debe caer a `usuarios`, pero la UI actual no puede materializar identidad completa; tratar como inconsistencia de datos y reparar perfil, no como permiso denegado por rol.
- Incorporación o bootstrap reintentados: deben reutilizar el registro durable o devolver la emisión existente, sin reexponer PIN.
- Usuario con varias membresías: la estructura lo soporta, pero la selección/reemisión explícita de tenant pertenece exclusivamente a MT-U11.

## Backward Compatibility

Compatibilidad que puede permanecer:

- Perfil global `usuarios` para identidad visible, FCM, historial y etiquetas humanas.
- Callable y función `crearUsuarioConMembresia` marcados como deprecated, mientras se inventarían y sustituyen los flujos que aún los consuman.
- Credenciales Firebase internas existentes solo como legado de identidad; no como ruta primaria de login ni fuente de autorización.
- Scripts de migración conservados como evidencia y mecanismo de recuperación controlada, no como parte del runtime.

Compatibilidad que no puede reintroducirse:

- Fallback de rol, permisos, `activo` o `empresaId` desde `usuarios`.
- Login operativo directo por email/password como camino que eluda credencial, membresía o claims.
- Escritura cliente de membresías, credenciales, incorporaciones o claims.

Condiciones para retirar compatibilidad legacy en una fase futura:

1. Inventario firmado de usuarios legacy, principals Auth y credenciales operativas.
2. Todas las rutas activas de alta usan incorporación o el mecanismo sucesor aprobado.
3. Cada usuario que deba operar posee una credencial válida y membresía activa; los no migrables tienen decisión explícita.
4. Suite de regresión cubre login, alta, activación, rotación/recuperación aprobada, desactivación y multi-tenant cuando MT-U11 exista.
5. Se aprueba una unidad separada para remover el callable deprecated, helpers email internos y scripts de migración; no se elimina en MT-U5A.

## Step-by-Step Implementation Plan

No ejecutar pasos de código sin aprobación posterior. Si este diseño se aprueba como base para una corrección estrictamente MT-U5A, el plan es:

1. Confirmar que el objetivo es una corrección concreta y no una reimplementación de capacidades ya presentes.
2. Congelar este mapa de autoridades y añadir pruebas negativas para cualquier regresión que lea `usuarios.rol`, `.permisos` o `.activo` en runtime.
3. Limitar la corrección a la Function, cliente o guard afectado; mantener la secuencia de login y los contratos de datos.
4. Probar con emulador: credencial correcta, PIN erróneo, bloqueo, membresía inactiva, claim desfasado, tenant suspendido y `DIRECTA_TEMP`.
5. Ejecutar pruebas de Functions, TypeScript, Rules y regresión manual de PWA/POS sin modificar Electron.
6. Revisar los diffs para asegurar que no aparecen nuevos campos autoritativos en `usuarios`, ni acceso cliente a recursos backend-only.

## Acceptance Criteria

- La aprobación reconoce que `main@68c5415` ya satisface el diseño de MT-U5A y que no se iniciará una implementación duplicada.
- Toda decisión de rol, permisos y estado tenant en runtime procede de una membresía canónica, con evidencia en backend, cliente y Rules.
- Un código/PIN válido no crea una sesión tenant sin empresa admisible y membresía activa.
- Los claims contienen solo el contexto necesario y se emiten exclusivamente desde backend privilegiado, preservando claims SaaS.
- `usuarios` no recibe nuevos campos de autorización; sus usos quedan clasificados como perfil, FCM, migración histórica o diagnóstico.
- PR #131 permanece como la ruta activa de alta de operadores: incorporación DIRECTA, credencial temporal, activación y membresía activa.
- Electron permanece sin cambios y fuera del boundary hasta MT-U12.
- No se ejecuta migración, se escribe código ni se cambia infraestructura antes de una aprobación explícita de este diseño y de un alcance de implementación concreto.

## Out of Scope

- Restablecimiento o recuperación de código/PIN.
- Conversión de usuarios legacy existentes a credenciales operativas.
- Retiro de Email/Password interno, `crearUsuarioConMembresia` o scripts históricos.
- Selector de tenant, sesiones concurrentes multiempresa o cambio de empresa activa.
- Restricción adicional de lecturas de perfiles globales, salvo que una iniciativa de seguridad la especifique.
- Electron, configuración, facturación, numeración, lifecycle, planes, soporte y auditoría fuera de los contratos ya consumidos por autenticación.
