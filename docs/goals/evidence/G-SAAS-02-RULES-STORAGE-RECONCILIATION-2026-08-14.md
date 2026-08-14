# G-SAAS-02 — Reconciliación independiente de Rules y Storage — 2026-08-14

## Resultado

PASS para la reconciliación del release actual. Esta evidencia no ejecuta un
deploy nuevo: reutiliza la verificación independiente de la API GET de
Firebase registrada en G-SAAS-02-RELEASE-EVIDENCE-2026-08-14-POSTDEPLOY.md y
demuestra que las fuentes versionadas no cambiaron desde ese deploy.

- SHA actual de origin/main: 25fd0be99accb04ab2564db7e66d9389635e97f7
- SHA del deploy verificado por API: a644d1d002d733b9ef2ea637894ff362c01ee59d
- Verificación API original: 2026-08-14T01:10:36.466Z
- Proyecto: micafe-pos
- Escrituras productivas en esta reconciliación: false

## Verificación reproducible

La comparación:

    git diff --quiet a644d1d002d733b9ef2ea637894ff362c01ee59d -- firestore.rules storage.rules

terminó sin diferencias. Los hashes SHA-256 normalizados (LF, UTF-8 sin BOM)
del contenido actual coinciden con los hashes que la API independiente observó
como desplegados:

| Servicio | Hash actual normalizado | Hash desplegado observado | Resultado |
| --- | --- | --- | --- |
| Firestore Rules | 35bd16fb6e9180a655ab1c137ac32104b24d34b23434d777a10cbf51c58840ee | 35bd16fb6e9180a655ab1c137ac32104b24d34b23434d777a10cbf51c58840ee | PASS |
| Storage Rules | fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b | fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b | PASS |

La conclusión es válida mientras no cambien firestore.rules o storage.rules;
un cambio posterior requiere repetir el deploy controlado y la verificación
independiente de la API.

## Gates que permanecen abiertos

- Smoke productivo independiente de Café Atrato: MISSING.
- Recovery independiente: MISSING; el schedule existe, pero el proveedor aún
  no expone un backup observable y no se ha medido restore/RPO/RTO.
- Trial anual: no iniciado; no se escribieron datos del tenant.
