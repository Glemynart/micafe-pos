# Rollout manual de borradores legales v0.8 en staging — 2026-11-28

**Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`  
**PR:** [#706](https://github.com/Glemynart/micafe-pos/pull/706)  
**Entorno:** Firebase App Hosting `micafe-pos-staging`, `us-central1`  
**Resultado:** validación técnica de staging; no constituye aprobación legal,
publicación contractual ni autorización para producción.

## Candidato y despliegue

- HEAD exacto: `3de251d6b3c704033b4de97d435ce4e33a4c1272`.
- CI [run 46133603091](https://github.com/Glemynart/micafe-pos/actions/runs/46133603091):
  `success`, 129/129 pasos exitosos, cero fallidos, omitidos o pendientes.
- Se solicitó un rollout manual de App Hosting con `--git-commit` apuntando a
  ese SHA y proyecto `micafe-pos-staging`. No se desplegaron Functions, Rules
  ni IAM.
- Rollout `build-2026-11-28-003`: `SUCCEEDED`.
- Build `build-2026-11-28-003`: `READY`; su recurso registra el commit exacto
  `3de251d6b3c704033b4de97d435ce4e33a4c1272`.
- Cloud Run `micafe-pos-build-2026-11-28-003`: `READY`, con 100 % del tráfico de
  staging. La revisión previa `build-2026-11-28-002` dejó de recibir tráfico.

## Verificación HTTP posterior

Las páginas públicas devolvieron HTTP 200. Todas muestran Dusema POS y estado
`BORRADOR`; no muestran Café Atrato:

- `/terminos`
- `/privacidad`
- `/aviso-autorizacion`
- `/anexo-tratamiento`

Los cuatro assets v0.8 también devolvieron HTTP 200. El rótulo interno coincide
con `0.8`, no con `0.7`, y el SHA-256 UTF-8/LF remoto coincide con el archivo
local y con el catálogo:

| Asset | SHA-256 UTF-8/LF |
| --- | --- |
| `terminos-servicio.md` | `922c841d7f62fbdc225e01b3d4735751aa761fccc945bd5a98996b52973dd17d` |
| `politica-tratamiento.md` | `278f03ccfb1b7a12a3954a8cb5caabceb24e1dfd49b67b764845fac2ac44faf2` |
| `aviso-autorizacion.md` | `2a5da1937dead674b459d2b8c85d9940c7e48a5233b863a63f06041c119d4491` |
| `anexo-tratamiento.md` | `fd9d857f510b0fe5feda31f980b87a2f101dd4028f464e289ae6d36bf35c40d7` |

## Smoke autenticado

`npm run e2e:privacy:staging` pasó **2/2** en 32.8 segundos contra staging,
después del rollout. Las pruebas usaron operadores, tenants y expedientes
sintéticos; completaron el trámite del reclamo con aislamiento entre tenants y
confirmaron denegación para el operador sin facultad. No se usó la cuenta de
Diana ni se escribieron datos de producción.

## Límites

- Este rollout mantiene el bundle `PREPARACION` y los cuatro documentos en
  `BORRADOR`; no habilita la aceptación contractual ni publica textos vigentes.
- Producción no cambió. Las rutas productivas y los gates de aprobación
  factual/jurídica, exportación/supresión real, contacto/proveedor y seguridad
  descritos en el PR continúan pendientes.
