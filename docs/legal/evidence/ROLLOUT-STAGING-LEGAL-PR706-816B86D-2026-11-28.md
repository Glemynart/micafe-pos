# Verificación de borradores legales v0.8 en staging — 2026-11-28

**Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`\
**PR:** [#706](https://github.com/Glemynart/micafe-pos/pull/706)\
**Entorno:** Firebase App Hosting `micafe-pos-staging`, `us-central1`\
**Resultado:** verificación técnica solamente; no constituye aprobación jurídica, publicación contractual ni autorización de aceptación en producción.

## Build y tráfico

- CI del código desplegado: run [46144338844](https://github.com/Glemynart/micafe-pos/actions/runs/46144338844), `SUCCESS`, para el SHA `816b86d8946156ecb24b4faab9fad0de6ccb4f1b`.
- Rollout manual creado con `firebase --project micafe-pos-staging apphosting:rollouts:create micafe-pos --git-commit 816b86d8946156ecb24b4faab9fad0de6ccb4f1b --force`.
- Build `build-2026-11-28-004`: `READY`; rollout: `SUCCEEDED`; tráfico del backend staging: 100 % a ese build. El recurso Build confirma el SHA exacto.
- El tráfico automático de staging sigue desactivado (`rolloutPolicy.disabled=true`); no hubo cambios de configuración.

## Páginas públicas y assets

- `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`: HTTP 200; títulos de Dusema POS; se observó la marca `BORRADOR` y no la marca Café Atrato.
- Los cuatro assets servidos bajo `/legal/v0.8/` respondieron HTTP 200. SHA-256 UTF-8/LF remoto y local coincidieron:

| Asset | SHA-256 |
|---|---|
| `terminos-servicio.md` | `922c841d7f62fbdc225e01b3d4735751aa761fccc945bd5a98996b52973dd17d` |
| `politica-tratamiento.md` | `405c40f992b6c73bac87c8e03131bb244bfdb64f704094423cc2833ff96090f4` |
| `aviso-autorizacion.md` | `2a5da1937dead674b459d2b8c85d9940c7e48a5233b863a63f06041c119d4491` |
| `anexo-tratamiento.md` | `fd9d857f510b0fe5feda31f980b87a2f101dd4028f464e289ae6d36bf35c40d7` |

## Smoke autenticado de privacidad

- Comando: `npm run e2e:privacy:staging`.
- Resultado: **2/2 PASS**, 31.8 s, proyecto `micafe-pos-staging`.
- El primer recorrido tramitó y cerró un reclamo sintético y comprobó aislamiento entre tenants; el segundo verificó que un operador sin facultad no ve ni ejecuta el trámite.
- Solo se usaron identidades y expedientes sintéticos. El test no certifica el proceso de exportación/supresión con datos reales.

## Producción

- No se ejecutaron escrituras, despliegues, cambios de Functions, Rules o IAM en producción.
- La lectura actual de App Hosting muestra el build `build-2026-11-24-002` con 100 % del tráfico. El host productivo aún sirve el contenido legado de Café Atrato en `/terminos`; `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` responden 404.
- Los documentos v0.8 permanecen borradores. La verificación de staging no habilita su aceptación ni su publicación como documentos vigentes.
