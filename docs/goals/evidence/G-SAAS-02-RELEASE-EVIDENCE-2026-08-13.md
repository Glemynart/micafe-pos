# G-SAAS-02 — Evidencia automática de release — 2026-08-13

## Resultado

El colector read-only se ejecutó el `2026-08-13T21:52:54Z` contra el proyecto
Firebase `micafe-pos`, el repositorio `Glemynart/micafe-pos` y
`origin/main @ a33bd2b6d866adec00aec8f8c5ff47c4f4877741`.

```text
status: INCOMPLETE
readOnly: true
productionWrites: false
collectionErrors: []
```

## Evidencia automática positiva

- CI del SHA objetivo: run `31745492006`, `completed`, `success`.
- Vercel para el SHA objetivo: `success`.
- Functions observadas: `74` activas de `74` y todas en `nodejs22`.
- Distribución de hashes de Functions observada:
  - `ce73f42fa704c461257e87a809f45a264a7cbfc3`: 59;
  - `bf165660e5619bbdcd621089f58cc305bcc88e8c`: 12;
  - `6a9909b64f5810bf107f75d2e81517683d8ae08e`: 3.

La distribución múltiple queda registrada para reconciliar el release por
Function; no se interpreta como una autorización de deploy ni como una prueba
de que todas las Functions correspondan al mismo release funcional.

## Gates faltantes

No se aportó evidencia independiente de:

- Rules desplegadas en el proyecto correcto;
- Storage Rules desplegadas en el proyecto correcto;
- smoke productivo del tenant;
- recovery productivo verificable.

Por ello el resultado no certifica el release ni autoriza iniciar el Trial
anual. No se ejecutaron callables, deploys, comandos comerciales ni escrituras
productivas.

## Reproducción

```text
npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos
```

El runner consulta GitHub y Firebase en modo lectura y no acepta referencias
externas como evidencia independiente sin una verificación adicional.
