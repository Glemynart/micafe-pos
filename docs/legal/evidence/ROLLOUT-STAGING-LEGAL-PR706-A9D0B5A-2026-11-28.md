# Verificación de borradores legales v0.9 en staging — 2026-11-28

**Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`  
**PR:** [#706](https://github.com/Glemynart/micafe-pos/pull/706)  
**Entorno:** Firebase App Hosting `micafe-pos-staging`, `us-central1`  
**Resultado:** verificación técnica; los documentos siguen en borrador y no se publicaron ni habilitaron para aceptación en producción.

## CI, build y tráfico

- CI del SHA `a9d0b5a826421b2d61f029276ce35bda39eeb9a6`: run [46148192083](https://github.com/Glemynart/micafe-pos/actions/runs/46148192083), `SUCCESS`; el check `Tipos y pruebas` completó sin fallos.
- Rollout manual al backend de staging, creado con `firebase --project micafe-pos-staging apphosting:rollouts:create micafe-pos --git-commit a9d0b5a826421b2d61f029276ce35bda39eeb9a6 --force`.
- Build `build-2026-11-28-005`: `READY`; rollout: `SUCCEEDED`; Cloud Run marca esa revisión lista y con 100 % del tráfico del backend de staging.
- El recurso Build de App Hosting confirma como fuente el commit exacto `a9d0b5a826421b2d61f029276ce35bda39eeb9a6`.
- No se cambió la configuración de rollouts automáticos. En este despliegue se seleccionó explícitamente el proyecto `micafe-pos-staging`.

## Páginas públicas y archivos

- `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento`: HTTP 200; cada página muestra `BORRADOR`.
- Los cuatro assets bajo `/legal/v0.9/` responden HTTP 200. SHA-256 UTF-8/LF local y remoto coinciden:

| Asset | SHA-256 |
|---|---|
| `terminos-servicio.md` | `7af90c5fc6c1bf2c4e06a5cedd1fe427bf698995bfa1b5a31bfcd1a9c25a2b7a` |
| `politica-tratamiento.md` | `440fdaa02e6b3c687e7f8cc35862269ebe7e8af45ed263121e7edf2daae8e554` |
| `aviso-autorizacion.md` | `eb3fa4a8dddecc1fea7ee6817e96093828f31bd04bd920389336009982fe32a3` |
| `anexo-tratamiento.md` | `aaeff070aa6b11a714281d9fc94b5e64af34ea2403efae42bae0cb2dbb76bcbc` |

## Smoke autenticado de privacidad

- Comando: `npm run e2e:privacy:staging`.
- Resultado: **2/2 PASS**, 34.4 s, proyecto `micafe-pos-staging`.
- El primer recorrido cerró un reclamo sintético y verificó aislamiento entre tenants. El segundo confirmó que un operador sin facultad no accede al trámite ni invoca la callable.
- Solo se usaron operadores y expedientes sintéticos. Esto no certifica exportación o supresión con datos reales.

## Límites

- No se ejecutaron escrituras, despliegues ni cambios de Rules, Functions o IAM en producción durante esta validación.
- La v0.9 incorpora datos de contacto del prestador al anexo y conserva los cuatro documentos en `BORRADOR`; staging no equivale a vigencia, aprobación jurídica ni autorización para aceptación real.
- La interpretación de ADR-SAAS-110 y los textos siguen pendientes de revisión jurídica colombiana. Exportación/supresión reales, proveedores y demás gates de producción permanecen sujetos a la matriz vigente.
