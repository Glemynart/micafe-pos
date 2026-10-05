# G-SAAS-02 / M2 / E2.2 — Gate F recovery y cierre de turno en cero (2026-10-04)

## Alcance

Esta evidencia registra la continuación controlada de Gate F sobre el fixture
sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` en `micafe-pos-staging`.
No crea otro tenant ni fixture, no ejecuta Bootstrap, Activation ni cleanup
destructivo, y no declara Gate F, Gate G/H, certificación, producción ni el
Goal como completados.

## Corrección y trazabilidad

- PR #442 integró el allowlist de previews Vercel para la callable de
  recuperación; merge commit: `0491169bfa9d001ecbe8a149ecc9e4e10bb1e2b6`.
- La actualización dirigida de staging dejó
  `restablecercredencialoperativa-00003-xes` activa al 100 % en `us-central1`,
  Node.js 22, con el único Secret autorizado `OPERATIONAL_PIN_PEPPER`.
- El preflight CORS desde el preview actual devolvió HTTP `204` con
  `Access-Control-Allow-Origin` correcto; los logs de la revisión registraron
  preflight `204`, POST `200` y verificación callable exitosa.
- PR #443 integró la corrección de UI para permitir el cierre canónico cuando
  el efectivo esperado es exactamente cero, sin inventar efectivo y exigiendo
  conteo cuando existe saldo esperado. Merge commit:
  `e5562bf904fb9e680d069f9cb7c8706ef6658c23`.
- CI post-merge de `main`: run `37259422639`, `PASS`.

## Validación funcional ejecutada

Con el actor vendedor sintético existente del fixture se realizó, en el
preview staging construido desde la revisión actual:

| Escenario | Resultado |
|---|---|
| Reemisión canónica de credencial existente | PASS; una sola reemisión, sin crear identidad o fixture nuevo |
| Activación con PIN definitivo | PASS; el actor resolvió el tenant del fixture |
| Acceso PWA Bodega | PASS; la sesión mostró `Gate F Retry Seller` y contexto Bodega |
| Cierre canónico de turno con efectivo esperado `$0` | PASS; el botón se habilitó y la UI confirmó `Turno cerrado correctamente` |
| Errores de consola durante el cierre | PASS; no se observaron errores |

La operación utilizó únicamente el flujo de UI y las callables canónicas. No
se escribieron documentos directamente desde herramientas de diagnóstico.

## Estado de Gate F

La submatriz de revocación/restauración y el cierre de turno del actor
sintético quedan `PASS`. Continúan pendientes, sin convertirlos en PASS por
inferencias:

- aislamiento tenant A/B con dos contextos autenticados independientes;
- retry autenticado bajo una ventana de red dedicada.

Los tests locales y la CI cubren contratos relacionados, pero no sustituyen
esos escenarios staging todavía no ejecutados. Por tanto:

`GATE F — BLOCKED / PENDING FUNCTIONAL MATRIX`.

Gate G/H, rehearsal, certificación, cutover y producción permanecen
pendientes.

## Mutation audit

- Código productivo: 0 en staging por esta validación.
- Deploy/topology Firebase adicional durante la validación: 0; la única
  actualización remota de Function es la revisión de recuperación ya
  documentada.
- Firestore/Auth: únicamente el estado esperado de reemisión/activación y del
  cierre del turno sintético existente; no hubo escrituras diagnósticas directas.
- Rules/IAM/Secrets/Storage/Hosting: 0 cambios manuales.
- Fixture adicional: 0.
- Bootstrap adicional: 0.
- Activation adicional de otro actor/fixture: 0; la activación registrada
  corresponde únicamente a la credencial reemitida del actor existente.
- Producción: 0.
