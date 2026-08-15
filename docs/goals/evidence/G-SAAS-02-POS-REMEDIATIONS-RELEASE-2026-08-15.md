# G-SAAS-02 — Reauditoría POS y release posterior a remediaciones

## Resultado

La reauditoría read-only contra `origin/main @ 7d9078f7fce7f206a6696ff21be4a05893e59fcf` confirma que las dos fronteras críticas identificadas en la auditoría global quedaron integradas en código:

- inventario, ajustes y mermas mediante `ADR-SAAS-030` y PR #322;
- reservas internas y agenda mediante `ADR-SAAS-033` y PR #323.

El release aún queda **INCOMPLETE** para iniciar o modificar el Trial de Café Atrato: smoke productivo y recovery independiente siguen pendientes. No se escribieron documentos del tenant ni se inició/reinició ningún Trial.

## Evidencia observada

- SHA objetivo y `origin/main`: `7d9078f7fce7f206a6696ff21be4a05893e59fcf`.
- CI post-merge: run `31863473905`, `success`.
- Vercel: `success`, deployment observado contra el SHA objetivo.
- Functions: 79 activas, todas Node.js 22; mapa de hashes reconciliado por Function. Las nuevas `crearArticuloInventarioV1`, `actualizarArticuloInventarioV1`, `registrarMermaOperativaV1`, `cancelarReservaOperativaV1` y `completarReservaOperativaV1` aparecen activas.
- Firestore Rules: desplegadas desde `origin/main` el `2026-08-15T04:20:46Z`; hash de fuente local y hash desplegado coinciden.
- Storage Rules: hash local y hash desplegado coinciden.
- Recovery: un schedule diario observable, ubicación `southamerica-east1`, cero backups observables.
- Smoke productivo independiente: falta evidencia.

## Auditoría funcional

| Superficie | Estado actual | Evidencia / límite |
|---|---|---|
| Ventas DEMO/FISCAL | Integrada | Callables server-authoritative; fiscalidad sigue tenant-specific. |
| Inventario, catálogo y merma | Remediado y desplegado | PR #322 integrado; Functions y Rules observadas activas/reconciliadas en el release. |
| Compras, proveedores, finanzas, caja y turnos | Integrados | Callables, ledger e idempotencia cubiertos por CI. |
| Clientes, crédito e historial | Funcional | CRUD tenant-aware; liquidación de cuentas de cobro server-side. No se abre una migración arquitectónica sin un hallazgo P1 nuevo. |
| Salón, mesas, comandas y cocina | Funcional | Operaciones críticas server-authoritative; configuración de mesas/espacios permanece administrativa y tenant-aware. |
| Reservas internas | Remediado y desplegado | PR #323 integrado; Functions activas, Rules read-only, saga DEMO determinista y replay. |
| Reservas públicas/Wompi SaaS | Fuera de alcance | Rutas backend existentes; no se amplía el producto. |
| Impresión, reportes, backoffice, usuarios y operadores | Integrados técnicamente | Validación física o evidencia productiva específica permanecen gates cuando apliquen. |

## Gated next step

No se ejecuta ninguna transición comercial sobre Café Atrato mientras no exista:

1. backup nativo observable;
2. restore a `gsaas02-recovery-20260814` verificado y aislado;
3. RPO/RTO y atestación independiente;
4. smoke productivo seguro y sin datos inventados;
5. preflight actualizado con recovery PASS y sin drift.

La observación confirma que el bloqueo restante es operativo/deploy —no una deuda local equivalente a inventario o reservas— y que el Trial histórico permanece intacto.
