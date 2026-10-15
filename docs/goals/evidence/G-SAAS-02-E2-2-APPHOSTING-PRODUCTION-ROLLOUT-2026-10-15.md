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
