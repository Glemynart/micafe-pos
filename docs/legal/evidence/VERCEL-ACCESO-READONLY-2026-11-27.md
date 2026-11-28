# Revisión de previews y producción Vercel — 2026-11-27

Consulta de solo lectura el 2026-11-27 a las 18:34 UTC en el scope
`glemynarts-projects`, proyecto `cafeatrato`. No se borraron deployments, no se
cambió protección, dominio ni plan.

## Estado observado

- `vercel ls cafeatrato --environment preview --limit 100 --json` devuelve
  `pagination.count = 0`; no hay previews activos listados.
- La captura del 2026-11-25 contenía 106 metadatos de previews. Tres URLs
  históricas distribuidas entre septiembre y noviembre respondieron HTTP 404.
- El inventario actual muestra cuatro deployments `Production`, todos `READY`.
  Los cuatro URLs de deployment y dos aliases (`cafeatrato` y `cafeatrato-git-main`)
  respondieron con la pantalla `Login – Vercel`; el HTML entregado no mostró la
  aplicación a una solicitud anónima.
- `vercel domains inspect pos.dusema.com` encuentra `dusema.com` en la cuenta,
  pero lo marca mal configurado para Vercel: los nameservers observados son
  `eric.ns.cloudflare.com` y `sasha.ns.cloudflare.com`. El dominio no sirve el
  POS desde Vercel; la verificación HTTP de `pos.dusema.com` se hizo por separado.

## Conclusión

No hay preview histórico activo que restringir ni remover en el listado actual;
las muestras antiguas devuelven 404. Los deployments Production permanecen, pero
la protección de Vercel bloquea el acceso anónimo comprobado. No se borraron por
ser deployments `Production`, y no se modificaron DNS ni el plan Hobby. El riesgo
de publicación anónima del proyecto `cafeatrato` por Vercel queda **cerrado para
el estado observado**; esto no certifica su plan, facturación ni expiración
interna de artefactos.

## Evidencia y límites

- Lista actual de Vercel: cuatro `Production/READY`, cero `Preview`.
- Muestra de tres URLs históricas: HTTP 404.
- Muestra de seis URLs Production/aliases: HTTP 200 con título `Login – Vercel`.
- Dominio: Vercel indica nameservers de Cloudflare y configuración incompleta.
- No se accedió con cuenta Vercel autenticada ni se leyeron variables de entorno,
  secretos, código fuente de deployments o datos de clientes.

## Revalidación del PR #706 — 2026-11-28 03:38 UTC

Consulta de solo lectura en `glemynarts-projects/cafeatrato`:

- `vercel ls cafeatrato --environment preview --limit 100 --json` devuelve
  `deployments: []` y `pagination.count = 0`.
- `vercel ls cafeatrato --limit 30` enumera los mismos cuatro deployments
  `Production/Ready`, de 53 días. No crea ni activa previews.
- HEAD anónimo a los cuatro URLs de esos deployments devuelve HTTP 302 hacia
  `vercel.com/sso-api`, consistente con protección SSO.
- El URL Preview del comentario de Vercel en PR #706
  (`cafeatrato-git-codex-e2-2-legal-acceptance-...vercel.app`) devuelve HTTP
  404. Es una notificación histórica, no un Preview activo.
- `gh pr checks 706` solo reporta el check CI del repositorio; no aparece un
  check nuevo de Vercel para este corte.

No se cambió la configuración de Vercel, DNS, plan, aliases ni deployments. La
evidencia cierra el riesgo de un Preview accesible para este PR y confirma que
los deployments `Production` muestreados exigen SSO; no acredita aptitud
comercial del plan Hobby, política de retención interna ni ausencia de otros
proyectos/deployments fuera de `cafeatrato`.
