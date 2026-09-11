# ADR-SAAS-037 — Aislamiento de lectura de perfiles globales

## Estado

**Propuesto.** No autoriza cambios de Rules, migraciones, despliegues ni cambios
de runtime hasta su aprobación explícita.

- **Fecha:** 2026-08-23
- **Goal / Milestone / Epic:** `G-SAAS-02 / M2 / E2.1`
- **Hallazgo relacionado:** Codex Security `csf_5ca8a6446e681d29d5c898cd`
- **SHA auditado:** `origin/main @ 1448e03fa5210ad857881b1af94997aff62f1636`

## Contexto y hallazgo

`usuarios/{uid}` fue diseñado como perfil global sin autoridad tenant por
`ADR-SAAS-001`, `ADR-SAAS-002`, `ADR-SAAS-004` y `ADR-SAAS-006`. Sin embargo,
`firestore.rules` permite actualmente `read` a cualquier principal autenticado:

```text
match /usuarios/{uid} {
  allow read: if esAutenticado();
}
```

La prueba `firestore-rules/global-platform.test.ts` reproduce la debilidad:
un cajero de `empresa-a` puede leer un perfil de otro usuario y listar la
colección completa. Los perfiles históricos pueden contener `nombre`,
`username`, `email`, timestamps y `fcmTokens`.

El perfil no contiene la autoridad de rol o permisos —esa autoridad permanece
en `membresias/{empresaId}_{uid}`—, por lo que el hallazgo no demuestra una
escalada de privilegios. Sí demuestra divulgación cross-tenant de identidad y
metadatos, incluyendo posibles tokens de notificación.

## Clasificación y modelo de amenaza

- **Severidad real:** `MEDIUM`.
- **Clasificación:** vulnerabilidad real, no falso positivo.
- **Gate de producto:** `BLOCKER FOR FIRST CLIENT`; la aceptación de G-SAAS-02
  exige aislamiento tenant y no permite certificar el Trial con un directorio
  global legible por cualquier empleado.
- **Momento:** debe resolverse `IMPORTANT BEFORE TRIAL`; no es una mejora
  post-Trial.

| Dimensión | Evaluación |
|---|---|
| Atacante | Usuario autenticado de cualquier tenant; no requiere ser admin. |
| Privilegios | Membresía o sesión autenticada mínima. |
| Superficie | Lectura directa/listado de `usuarios` desde Firestore. |
| Tenant afectado | Todos los perfiles globales, incluidos los de otros tenants. |
| Datos | Nombre, username, email/timestamps y potencialmente `fcmTokens`. |
| Escritura | No demostrada; las mutaciones de autoridad ya están denegadas. |
| Escalada | No directa: roles/permisos se leen de `membresias`, no de `usuarios`. |
| Abuso automatizado | Alto: el listado permite enumeración masiva por cualquier sesión. |
| Impacto financiero/fiscal | No directo. |
| Facilidad | Baja complejidad; una consulta Firestore autenticada reproduce el caso. |
| Blast radius | Global dentro del proyecto, limitado por autenticación. |

## Restricciones arquitectónicas

La solución debe conservar:

1. `usuarios` como identidad/perfil global, sin convertirlo en autoridad tenant.
2. `membresias` como fuente única de rol, permisos efectivos y estado.
3. claims `{empresaId, rol}` emitidos exclusivamente por backend.
4. `Espacio != Sede`; no se crea una dimensión física nueva.
5. ausencia de escrituras productivas y compatibilidad con la incorporación
   `DIRECTA`/`EMAIL` de `ADR-SAAS-006`.

La decisión vigente de `ADR-SAAS-001` de evitar `get()` de documentos dentro de
Rules para aislar colecciones operativas hace que una solución basada solo en
un lookup de membresía dentro de Rules sea una desviación que debe decidirse,
no una corrección silenciosa.

## Opciones consideradas

### Opción A — Lookup de membresía dentro de Rules

Permitir el perfil propio y, para un administrador, permitir el perfil de un
UID solo si existe una membresía activa con el `empresaId` del claim.

- **Ventajas:** cambio pequeño; preserva la UI actual basada en `onSnapshot`;
  no requiere backfill de documentos.
- **Costes/riesgos:** introduce `get()` por lectura de perfil, aumenta coste y
  latencia, complica/listar la colección global y se aparta de la regla de
  aislamiento basada en claims de `ADR-SAAS-001`.
- **Resultado:** no recomendada como solución final; podría ser un mitigador
  transitorio solo con aprobación explícita y límites medidos.

### Opción B — Proyección mínima tenant-aware de perfil

Crear una proyección de lectura escrita por backend, por ejemplo
`usuarios_tenant/{empresaId}_{uid}`, con únicamente los campos necesarios para
la UI (`empresaId`, `uid`, `nombre` y `username` cuando sea imprescindible).
El backend la crea/actualiza junto con la incorporación o la modificación
canónica del perfil. Las Rules permiten leer únicamente el `empresaId` del
claim; `email`, `fcmTokens` y timestamps sensibles no se proyectan por defecto.
El cliente deja de leer `usuarios` ajenos y consume la proyección.

- **Ventajas:** aislamiento expresable con claims, mínimo privilegio, sin
  lecturas `get()` en Rules y sin exponer tokens/PII innecesarios.
- **Costes/riesgos:** nueva proyección, backfill idempotente, sincronización y
  actualización de consumidores; requiere pruebas de consistencia y rollback.
- **Resultado:** recomendada.

### Opción C — Callable de perfiles mínimos sin nueva colección

Denegar lecturas cliente de `usuarios` y devolver desde una callable una
proyección mínima calculada a partir de las membresías del tenant.

- **Ventajas:** evita una migración de datos y centraliza la autorización.
- **Costes/riesgos:** cambia la suscripción reactiva actual por consultas/RPC,
  crea una nueva frontera Function, requiere paginación, rate limiting y
  observabilidad; deja más compleja la consistencia de las pantallas operativas.
- **Resultado:** alternativa válida si se prioriza no crear una proyección,
  pero no es la primera recomendación para el Trial.

## Decisión propuesta

Adoptar la **Opción B**, sujeta a aprobación del propietario de la arquitectura.
La implementación posterior deberá ser un PR independiente y deberá:

1. restringir `usuarios` para que un cliente solo pueda leer su propio perfil
   mínimo; cualquier acceso de perfiles de terceros se hará por la proyección;
2. crear la proyección tenant-aware sin autoridad de rol, permisos, lifecycle o
   facturación;
3. escribirla y reconciliarla únicamente desde Functions/backend canónico;
4. excluir `email`, `fcmTokens`, hashes, credenciales y secretos salvo una
   necesidad aprobada explícitamente;
5. cambiar `suscribirUsuarios`, los candidatos de relevo y consumidores
   equivalentes a la proyección o a un endpoint autorizado;
6. incluir backfill idempotente en Emulator, sin tocar datos productivos;
7. agregar pruebas Rules de lectura propia, lectura cross-tenant denegada,
   listado cross-tenant denegado, permisos inmutables y consistencia de
   membresía/proyección;
8. mantener `P1-09` deshabilitado y fuera del corte.

## Consecuencias

### Positivas

- El aislamiento de identidad queda alineado con la frontera tenant de
  `ADR-SAAS-001`.
- Se elimina la enumeración global de PII desde clientes autenticados.
- La autorización sigue separada de la proyección y continúa en membresías y
  claims.
- Se reduce la exposición accidental de tokens FCM.

### Negativas y riesgos

- Se introduce una proyección que debe mantenerse consistente con el perfil
  global; la consistencia será eventual fuera de la transacción de alta.
- El backfill debe ser idempotente y auditable; no puede inventar perfiles ni
  datos de tenant.
- Algunos consumidores server-side pueden seguir leyendo `usuarios` con Admin
  SDK, pero deben justificar su propósito y no devolver datos globales al
  cliente.

## Criterios de aceptación del ADR implementado

- Un usuario autenticado de tenant A no puede leer ni listar perfiles de tenant B.
- Un administrador de tenant A solo recibe la proyección mínima de miembros de A.
- Un usuario puede leer/actualizar únicamente los campos propios ya permitidos.
- `membresias` continúa siendo la autoridad de rol, permisos y estado.
- Rules, Functions, typecheck, build y pruebas de Emulator pasan.
- Security Scan no reporta una ruta equivalente de lectura global.
- No se realizan escrituras productivas durante la implementación o validación.

## Relaciones

- `ADR-SAAS-001-tenancy.md` — claims, Rules y excepción histórica global.
- `ADR-SAAS-002-identidad.md` — identidad global y membresías multiempresa.
- `ADR-SAAS-004-modelo-empresarial.md` — pertenencia de datos por plano.
- `ADR-SAAS-006-incorporacion-usuarios.md` — incorporación y autoridad de membresía.
- `ADR-SAAS-013-bootstrap-primer-administrador-tenant.md` — creación del perfil inicial.
- `ADR-SAAS-017-recuperacion-segura-credenciales.md` — recuperación sin exponer secretos.
- `docs/security/P1-09-CIERRE-POST-MERGE.md` — hallazgo separado de P1-09.
