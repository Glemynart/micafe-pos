# G-SAAS-02 — Evaluación de Next.js 16.4.1 para App Hosting

Fecha: 2026-10-15

Goal / Milestone / Epic: `G-SAAS-02 / M2 / E2.2`

Base: `origin/main @ cd9d625d079aa0f0c99688e91f353dc8f3218b1f`

Estado: **IMPLEMENTADO Y VALIDADO EN RAMA AISLADA; NO INTEGRADO NI DESPLEGADO**

## Decisión técnica

Se recomienda `next@16.4.1` para el primer rollout **de staging únicamente**. La base ya usa Next.js 16.4.0; el candidato es un parche directo de esa versión y no cambia código de aplicación. Next.js 16.4.1 corrige dos avisos críticos y uno alto publicados el 2026-10-14. El análisis local no encontró directivas `"use cache"`, `"use server"` ni imports de `next/image`; esto reduce la superficie observada, pero no sustituye la actualización del framework.

Firebase App Hosting declara `15.2.x` como la versión activa de Next.js y considera Preview las versiones fuera del rango designado hasta que las marque activas. Por lo tanto, `16.4.1` **no tiene soporte activo de App Hosting**. La alternativa `15.5.28` también queda fuera del rango activo publicado y requeriría una migración hacia atrás desde el runtime 16.4.0 que hoy declara `main`; no hay en esta evidencia una validación funcional de esa migración. El parche 15.2.9 probado en una evaluación previa tampoco es una alternativa aceptable frente a los avisos actuales. La opción elegida minimiza el cambio y mantiene el parche de seguridad más reciente que ya pasó las pruebas del proyecto, aceptando explícitamente el riesgo de canal Preview para staging.

La recomendación no autoriza producción, no cambia el backend, no cambia variables y no constituye aceptación del riesgo para un release productivo. El backend `micafe-pos` aún no tiene un primer rollout; no existe versión previa de App Hosting a la cual volver. Si el adaptador Preview falla, el criterio de recuperación es detener el rollout y corregir el candidato; no volver a publicar Next.js 16.4.0 vulnerable.

## Cambio aislado

- `package.json`: `next` de `16.4.0` a `16.4.1`.
- `package-lock.json`: resolución correspondiente de Next.js y sus paquetes SWC.
- No hay cambios de código de aplicación ni configuración de navegador.
- Rama de trabajo: `codex/e2-2-apphosting-next-16-4-1`.
- La rama parte del SHA de `main` indicado arriba y fue publicada como PR #606, HEAD `757610d50719885e96f03291eead9a4a7fa4f1cd`. Este SHA sigue sin integrar ni desplegar; los checks de ese HEAD pasaron antes de esta actualización documental.

## Validación disponible

La evaluación aislada ejecutó `npm ci` y `npm run build:vercel` con configuración pública exclusiva de `micafe-pos-staging`, sin copiar `.env.local` ni credenciales productivas. Resultado: build PASS, 49 páginas generadas y 11 rutas API dinámicas. También pasaron `npx tsc --noEmit`, `npm run lint` y seis archivos de pruebas de rutas (24 pruebas PASS). La ejecución de build y pruebas se realizó con Node `v24.19.0`.

Como revalidación posterior, `npm audit --omit=dev --audit-level=high` terminó con exit 0 y cero vulnerabilidades en la base actual de npm; `npm ls next --depth=0` confirma `next@16.4.1`; `git diff --check` pasa. En esa revalidación la CLI usó Node `v22.23.2`; no fue una nueva ejecución del build.

### Comparación de la línea activa y la línea Preview

La matriz oficial consultada el 2026-10-15 mantiene `15.2.x` como la única línea Next.js con estado `active`; las versiones fuera de los rangos publicados se consideran Preview. `npm view` confirma que el último parche publicado de esa línea es `15.2.9`, mientras que el último parche de `16.4.x` es `16.4.1`.

La alternativa activa no satisface el requisito de seguridad de esta entrega: los avisos oficiales GHSA-2464-fhr4-w9xw y GHSA-p3m5-59mp-jv5r marcan como afectado Next.js desde 10.0.0/13.0.0 hasta `15.5.27` y fijan `15.5.28` como parche; por tanto, `15.2.9` queda dentro de ambos rangos vulnerables. `15.5.28` no figura como línea activa en la matriz y también sería Preview. El tercer aviso, GHSA-673q-mjm6-r5xr, afecta solo a la línea 16, y queda corregido en `16.4.1`.

Decisión para staging: conservar el cambio mínimo `16.4.0 → 16.4.1`. No se recomienda bajar a `15.2.9`, porque conserva dos avisos críticos/altos, ni migrar ahora a `15.5.28`, porque también sería Preview y exige un downgrade mayor sin una validación funcional aprobada. Esto acepta explícitamente el riesgo Preview **solo para staging**; no constituye aprobación de producción. Si App Hosting Preview falla, detener el rollout y corregir la integración; no volver a `16.4.0` ni usar `15.2.9` como salida.

La inspección de la rama experimental local de Next `15.2.9` encontró cambios adicionales de configuración/TypeScript junto con el downgrade de paquetes, pero no hay evidencia de un build validado para ese candidato. Esa rama no se modificó como parte de este cambio.

### Avisos de seguridad y audit

Los avisos oficiales publicados el 2026-10-14 son:

- [RCE en funciones `use cache` con ciertos typed arrays — GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), crítico; corregido en 16.4.1.
- [RCE en el API de optimización de imágenes con SVG — GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), crítico; corregido en 16.4.1 y 15.5.28.
- [DoS del App Router con Server Actions — GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), alto; corregido en 16.4.1 y 15.5.28.

La ejecución previa de `npm audit --omit=dev --audit-level=high` devolvió cero avisos en el registro consultado, pero no detectó estos GHSAs: la fuente oficial del proveedor declara a `16.4.0`, `15.2.9` y sus rangos afectados como vulnerables según corresponda. Por eso el resultado de `npm audit` no se interpreta como prueba de ausencia de vulnerabilidades; la decisión se basa en los rangos y parches publicados por Next.js además del audit.

## Gate que permanece abierto

`IMPLEMENTADO`: bump de dependencia en rama aislada.

`PROBADO`: build, tipos, lint, pruebas de rutas y audit local según los resultados arriba.

`INTEGRADO`: no.
`DESPLEGADO`: no; no se inició rollout.

### Revalidación IAM de staging (2026-10-15)

- Firestore: una identidad canary temporal, limitada por condición IAM a la base `(default)`, permitió lectura de documento inexistente, consulta, y transacciones reales de lectura/creación y lectura/actualización; también completó un batch con dos escrituras. Las operaciones de commit y lectura respondieron HTTP 200. La eliminación directa fue denegada. Se limpiaron con el principal de mantenimiento los tres documentos sintéticos y se verificó la colección vacía. No se usó el tenant de Diana. Esto valida las operaciones ejercitadas, no todas las rutas de la aplicación.
- FCM: `fcm.googleapis.com` está habilitada en `micafe-pos-staging`. Un rol temporal con solo `cloudmessaging.messages.create`, enlazado al canary, obtuvo token después de esperar la propagación IAM. Una petición `validate_only=true` con token sintético inválido llegó a FCM y respondió `400 INVALID_ARGUMENT` por el token. Esto demuestra autorización IAM para la validación, no entrega de notificación ni validación de un token QA válido.
- Limpieza: se retiraron los bindings de proyecto y de impersonación; la cuenta canary fue eliminada y el rol quedó soft-deleted. No hay binding canary activo. La identidad de ejecución de App Hosting no se modificó y conserva `roles/firebaseapphosting.computeRunner`, `roles/firebase.sdkAdminServiceAgent` y `roles/developerconnect.readTokenAccessor`.
- Resultado: la prueba acotada demuestra permisos canary para las operaciones Firestore ejercitadas, incluidas transacciones y batch, y autorización para invocar la validación FCM sin entrega. No demuestra todavía que el conjunto sustituya por completo los permisos de la aplicación: falta ejecutar las rutas de la app en App Hosting con el rol mínimo y, para FCM, validar un token QA autorizado en modo `dryRun`. El rol amplio actual sigue asignado a la identidad de ejecución. No se inició rollout.

## Fuentes oficiales consultadas

- [Compatibilidad de frameworks y soporte de Firebase App Hosting](https://firebase.google.com/docs/app-hosting/frameworks-tooling).
- [Guía oficial de actualización a Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16).
- [Release de Next.js 16.4.1](https://github.com/vercel/next.js/releases/tag/v16.4.1).
