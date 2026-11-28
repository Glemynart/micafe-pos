# Revisión documental v0.8 — 2026-11-28

**Goal:** `G-SAAS-02 → M2 → E2.2`

**Bundle:** `dusema-pos-2026-11-v0.8` — `PREPARACION`
**Estado de documentos:** cuatro documentos `BORRADOR`; no vigentes ni exigibles.

## Motivo del cambio

ADR-SAAS-110 fue aprobado por el responsable el 2026-11-28, alternativa A.
Para reclamos nuevos, el cómputo de quince días hábiles se inicia desde el día
siguiente a la recepción verificable del reclamo completo. El requerimiento de
subsanación conserva los cinco días desde la recepción inicial. Los expedientes
históricos sin `plazoRespuestaVersion` mantienen la regla anterior y sus
vencimientos persistidos. Cuando existe subsanación, el servidor exige que la
fecha efectiva de completitud coincida con la recepción documentada de la
información faltante.

La lectura parte del artículo 15 de la Ley 1581 de 2012. Requiere validación
jurídica colombiana antes de publicar una política vigente o activar el flujo
con casos reales; este cambio técnico no es concepto jurídico.

## Versionado y hashes

Se creó v0.8 porque v0.7 ya había sido desplegada en staging. Los cuatro assets
v0.7 se preservan sin cambios; v0.8 contiene copias exactas de las fuentes
`docs/legal` y se mantiene en `BORRADOR`.

| Documento | SHA-256 UTF-8/LF |
| --- | --- |
| Términos | `922c841d7f62fbdc225e01b3d4735751aa761fccc945bd5a98996b52973dd17d` |
| Política de tratamiento | `278f03ccfb1b7a12a3954a8cb5caabceb24e1dfd49b67b764845fac2ac44faf2` |
| Aviso de autorización | `2a5da1937dead674b459d2b8c85d9940c7e48a5233b863a63f06041c119d4491` |
| Anexo por tenant | `fd9d857f510b0fe5feda31f980b87a2f101dd4028f464e289ae6d36bf35c40d7` |

## Validación local

- `npm --prefix functions-legal run build`: aprobado.
- `npm --prefix functions-legal test`: 35 aprobadas, 5 omitidas por requerir Emulator; 0 fallidas.
- `npm --prefix functions-legal run test:emulator`: 6/6 aprobadas, incluyendo reclamo incompleto que se completa 30 días después y preservación de compatibilidad histórica.
- `npm run test:legal-bundle`: 2/2 aprobadas; verifica hashes y conserva v0.7.
- `npm run build:functions`, `npx tsc --noEmit` y `npm run build`: aprobados.
- CI del nuevo HEAD debe confirmarse por separado después del push.

## Alineación de rótulos v0.8 — 2026-11-28 10:05 UTC

- Al cotejar el bundle con los cuatro assets v0.8, sus metadatos internos aún
  mostraban `BORRADOR 0.7`, aunque el catálogo los identifica como v0.8. Se
  alinearon los rótulos en las fuentes y los assets públicos v0.8. Los textos
  sustantivos no cambiaron y los assets históricos v0.7 permanecen intactos.
- Los cuatro hashes canónicos de la tabla anterior fueron recalculados; las
  fuentes y assets v0.8 vuelven a coincidir byte a byte tras normalizar CRLF a
  LF. La prueba de bundle terminó 2/2 PASS y `git diff --check` pasó.
- Staging todavía sirve el build `2026-11-28-002` desde `485970a`, que conserva
  los rótulos anteriores. El nuevo candidato no se ha desplegado; CI de su SHA
  debe terminar antes del rollout controlado. No se desplegó a producción ni se
  habilitó aceptación.

## Límites operativos

- Después de esta revisión local, v0.8 se desplegó únicamente a staging con
  `build-2026-11-28-002`, desde el commit `485970a`; el build quedó `READY` y
  recibió el 100 % del tráfico de staging.
- El smoke autenticado sintético de privacidad pasó 2/2. Las cuatro rutas y
  assets versionados respondieron 200; sus hashes coincidieron con el bundle.
- No se desplegó a producción ni se habilitó aceptación.
- Producción no cambió: `/terminos` sigue con contenido heredado de Café Atrato; las otras tres rutas legales continúan en 404.
- No se generó ni entregó una exportación real, no se suprimieron datos y no se cambió IAM productivo.
- Continúan pendientes la aprobación factual/jurídica, la verificación de canales y proveedores, la autorización verificable de exportación, la certificación de supresión/conservación y la auditoría final del PR #706.

## Rollout exacto posterior a CI — 2026-11-28 10:41 UTC

- Después de quedar verde la CI del HEAD `3de251d6b3c704033b4de97d435ce4e33a4c1272`,
  se desplegó manualmente ese commit a App Hosting de staging.
- `build-2026-11-28-003` quedó `SUCCEEDED` y `READY`; la revisión Cloud Run
  `micafe-pos-build-2026-11-28-003` tiene 100 % del tráfico. El build registra
  el SHA solicitado.
- Las cuatro páginas devuelven 200, Dusema y `BORRADOR`. Los cuatro assets v0.8
  devuelven 200, muestran el rótulo 0.8 y sus hashes remotos coinciden con los
  locales. `npm run e2e:privacy:staging` pasó 2/2 tras el rollout con datos
  sintéticos.
- Evidencia completa: [rollout y smoke de staging](evidence/ROLLOUT-STAGING-LEGAL-PR706-3DE251D-2026-11-28.md).
- Producción permanece sin cambios; los documentos siguen como
  `PREPARACION/BORRADOR`. No se ejecutó exportación/supresión real ni se
  desplegaron Functions, Rules o IAM en este corte.
