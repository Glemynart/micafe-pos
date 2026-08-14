# G-SAAS-02 — Reconciliación post-merge de Functions — 2026-08-14

## Resultado

La evidencia read-only se recolectó contra `origin/main @
0a62301e2e62919c0b8fbfe585be1ce506b33b51` después del merge de PR #280 y de
la CI post-merge `31763686625`.

```text
observedAt: 2026-08-14T02:46:36.541Z
readOnly: true
productionWrites: false
releaseEvidence: INCOMPLETE
```

## Inventario reconciliado

Firebase reportó 74 Functions, todas `ACTIVE` y en `nodejs22`. El hash fue
observado individualmente para cada Function; los tres grupos efectivos son:

| Hash desplegado | Functions | Estado |
|---|---:|---|
| `6a9909b64f5810bf107f75d2e81517683d8ae08e` | 3 | `PASS` |
| `bf165660e5619bbdcd621089f58cc305bcc88e8c` | 12 | `PASS` |
| `ce73f42fa704c461257e87a809f45a264a7cbfc3` | 59 | `PASS` |

El mapa completo `Function → hash` quedó emitido por el colector en la
observación automática. Por tanto, los hashes múltiples ya no son un gate
pendiente: están reconciliados por Function sin redeployar Functions.

## Resultado del release

También permanecen en `PASS`:

- SHA de `origin/main` y CI post-merge;
- Vercel;
- Firestore Rules y Storage, con source coincidente;
- Functions activas en Node.js 22.

El release global continúa `INCOMPLETE` únicamente por:

- ausencia de PITR, schedules o backups observables en
  `southamerica-east1`;
- falta de smoke productivo independiente del tenant Café Atrato.

No se inició ni reinició ningún Trial y no se escribieron datos productivos.
