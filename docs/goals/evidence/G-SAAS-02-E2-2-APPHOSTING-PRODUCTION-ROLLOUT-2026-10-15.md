# G-SAAS-02 / M2 / E2.2 — Primer rollout productivo de App Hosting

Fecha de verificación: 2026-10-15, después de `2026-10-15T17:49:24Z`.
Proyecto: `micafe-pos`; backend `micafe-pos`; región `us-central1`.

## Resultado remoto

- Build `build-2026-10-15-001`: `READY`.
- Rollout `build-2026-10-15-001`: `SUCCEEDED`.
- SHA solicitado, leído en el origen del build y actualmente en `main`:
  `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29`.
- Cloud Build `ef97e19f-5347-4dda-a8e1-51d43b055e46`: `SUCCESS`, iniciado
  `2026-10-15T17:45:01Z`, finalizado `2026-10-15T17:48:41Z`.
- Tráfico remoto: 100% al build `build-2026-10-15-001`.
- Backend: `https://micafe-pos--micafe-pos.us-central1.hosted.app`.
- Configuración remota: runtime `nodejs24`, raíz `/`, app Firebase
  `micafe-pos-web`, rollouts automáticos desactivados.

## Identidad y entorno

- Identidad runtime: `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
- Roles: `roles/firebaseapphosting.computeRunner`, rol personalizado de Firestore
  con acceso a `(default)` limitado por condición, y rol personalizado de FCM con
  `cloudmessaging.messages.create`.
- Los roles `roles/firebase.sdkAdminServiceAgent` y
  `roles/developerconnect.readTokenAccessor` ya no están asignados a la identidad
  runtime. El cambio se aplicó con política IAM v3 y ETag vigente; la relectura
  confirmó los tres roles anteriores.
- Están configuradas seis variables públicas del SDK Firebase para el proyecto
  productivo y `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION=us-central1`. No se guarda
  ningún valor de variable en esta evidencia. No aparece `KEY_EXAMPLE`.

## Comprobaciones

| Comprobación | Estado | Evidencia |
|---|---|---|
| Build de App Hosting | `PASS` | Build `READY`; Cloud Build `SUCCESS`. |
| SHA construido | `PASS` | `source.codebase.commit` coincide con el SHA autorizado. |
| Rollout y tráfico | `PASS` | Rollout `SUCCEEDED`; tráfico 100% al build autorizado. |
| HTTP `/` | `PASS` | `200`, `text/html`. |
| Backoffice `/backoffice/operadores` | `PASS` limitado | `200`, `text/html`; confirma que la ruta responde, no la sesión ni sus datos. |
| API autenticada sin sesión | `PASS` negativo | `GET /api/usuarios/tenant` devuelve `401`. |
| Lectura pública Firestore | `PASS` limitado | Slug sintético inexistente devuelve `404`, respuesta esperada. |
| Errores críticos recientes de Cloud Run | `PASS` limitado | La consulta de logs con severidad `ERROR` desde el inicio del rollout no devolvió entradas. |
| Callable `cambiarFacultadesOperadorSaas` | `PASS` remoto / autenticada `NOT EXECUTED` | Función `ACTIVE`, Node 22, hash `9a0a088d1ee7c3caf1d5d1d087f97328fb646443`; POST sin token devuelve `401`. No se invocó con sesión autorizada ni se cambiaron facultades. |
| Gobernanza autenticada | `NOT EXECUTED` | No había una sesión de operador en el dominio productivo entre los navegadores accesibles; la sesión visible de Backoffice pertenecía a staging. |

## Límites y siguiente paso

El backend productivo sirve el SHA aprobado. Esto no certifica todavía el uso de
la gobernanza desde una sesión autenticada. La siguiente prueba requiere que un
operador autorizado inicie sesión en el Backoffice productivo. La prueba de
`cambiarFacultadesOperadorSaas` debe ser de lectura/validación y no debe enviar
una asignación que modifique facultades.

No se modificaron operadores o facultades, controles de compras, Firestore Rules,
tenant, membresía, catálogo o Trial de Diana.

### Seguimiento autenticado de gobernanza — 2026-10-15 13:08 America/Bogota

- **Sesión productiva:** `PASS`. La URL visible fue el Backoffice del backend
  productivo `micafe-pos` en `us-central1.hosted.app`; no se reutilizó la sesión
  de staging. El encabezado mostró `Contexto validado` y el UID de sesión
  coincidió con el documento del operador presentado por la consulta canónica.
- **Consulta de operadores:** `PASS` de solo lectura, en
  `/backoffice/operadores`, mediante `listarRecursosPlataformaSaas` para el
  recurso `operadores`. El endpoint exige autenticación y valida
  `PLATAFORMA_CONSULTAR` más `OPERADORES_GOBERNAR`; el contrato proyecta `uid`,
  estado, versión de autorización y facultades desde `saas_operadores`.
- **Operador de la sesión:** activo, autorización v3; su UID termina en `RZ2`.
  El documento canónico muestra `OPERADORES_GOBERNAR` y
  `RELEASE_COMPRAS_GOBERNAR`.
- **Segundo operador listado:** activo, autorización v1; su UID termina en
  `dC3`. Tiene `PLATAFORMA_CONSULTAR` y `OPERADORES_GOBERNAR`, pero no
  `RELEASE_COMPRAS_GOBERNAR`.
- **Límite de identidad:** la proyección no expone correo ni rol de negocio
  `principal/secundario`. Por tanto, la facultad está presente en el operador
  autenticado, pero no se afirma que sea el operador principal esperado ni que
  corresponda a un correo específico. No se cambió ninguna facultad.
- **Alcance de pausa:** `BLOCKED`. ADR-SAAS-081 requiere tenants, responsables y
  ventana designados antes del corte. El código expone la transición por
  `empresaId`, pero no se encontró una consulta canónica de solo lectura para
  `controles_release_compras`; el panel no acredita esos tres datos. Los dos
  tenants que aparecen en el resumen del Dashboard no constituyen autorización
  de alcance. No se inicializó ni pausó ningún control.
- **PR #611:** en la última lectura antes de este seguimiento, el HEAD
  `cd2f2870b00516cd273dcff98c5501e1908d09cc` seguía abierto; `Tipos y pruebas`
  estaba `IN_PROGRESS` y Vercel Preview/Preview Comments estaban `SUCCESS`.
  Esta actualización documental genera un HEAD nuevo y requiere validar sus
  propios checks antes de integrar el registro.
