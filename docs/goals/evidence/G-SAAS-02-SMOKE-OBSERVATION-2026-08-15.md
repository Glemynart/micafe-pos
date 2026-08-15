# G-SAAS-02 — Observación del smoke productivo — 2026-08-15

## Resultado

`PUBLIC_ANONYMOUS_CHECK = OBSERVED`

`AUTHENTICATED_TENANT_SMOKE = MISSING`

La comprobación fue no destructiva y no autenticada. No se crearon usuarios,
no se usaron credenciales inventadas, no se escribieron datos y no se alteró
el Trial de Café Atrato.

## Observación

- SHA de `origin/main` observado en esa comprobación: `c2ff8855d2564972886d0f4f9bb296f5f3035d0e`.
- Deployment observado: `cafeatrato-1y24o8ofp-glemynarts-projects.vercel.app`.
- Hora: `2026-08-15T06:52:05Z`.
- Respuesta anónima: `HTTP 302 Found`.
- Destino: Vercel SSO (`vercel.com/sso-api`).
- `cafeatrato.com`: no resuelve DNS.
- `www.cafeatrato.com`: no resuelve DNS.

La aplicación no puede certificarse mediante una lectura HTTP anónima porque
el deployment está protegido por Vercel SSO. El smoke requerido necesita una
sesión autenticada en el mismo deployment, con un canal seguro y una cuenta
autorizada para Café Atrato. La ventana debe permitir navegación y lecturas
tenant-scoped mínimas; cualquier operación de negocio debe ser reversible,
DEMO y previamente registrada, sin contaminar el historial comercial.

## Seguimiento read-only — 2026-08-15T09:26:38Z

- `origin/main` vigente: `7d0b2309d2b61b02451f6916f1269b5646c03fbe`.
- El deployment público continúa respondiendo `HTTP 302 Found` hacia Vercel SSO.
- `cafeatrato.com` y `www.cafeatrato.com` continúan sin resolución DNS observable.
- No se obtuvo una sesión autenticada, no se crearon usuarios y no se escribieron
  datos productivos.

El seguimiento confirma que la causa observable del bloqueo es el acceso/canal
autorizado; no permite certificar una divergencia del release porque la sesión
autenticada sigue ausente. La evidencia autenticada continúa pendiente y no se
autoriza la transición del tenant.

## Gate pendiente

Para cerrar `SMOKE` falta exactamente:

1. cuenta autenticada autorizada para acceder al deployment protegido;
2. ventana operativa segura del tenant;
3. ejecución auditada del smoke mínimo tenant-safe;
4. evidencia sin credenciales, tokens ni datos completos del cliente.

Mientras esos elementos no existan, el smoke productivo es `MISSING` y no se
autoriza la transición de Café Atrato al Trial anual.
