# G-SAAS-02 / M2 / E2.2 — Gate D: conciliación read-only de perfil, compra y ledger

- **Verificación:** 2026-10-13, de `09:10:17.6848846Z` a `09:10:28.0045174Z`.
- **Proyecto:** `micafe-pos-staging` (Firestore `(default)`).
- **Tenant sintético:** `E2_2-BODEGA-STAGING-FIXTURE`.
- **Producto sintético:** se resolvió desde la línea de compra; no se imprimió su ID.
- **Código integrado al inicio:** `main @ ccd2e39b18d2317a804120d08d4b145fe433ff52` (PR #584).
- **Método:** token de nube local, lecturas Firestore REST `GET` de rutas fijas del fixture y `documents:runQuery` con filtro exacto de `empresaId`; proyección local limitada a presencia, conteos, estados y cantidades. No se imprimieron NIT, DV, correo, teléfono, dirección, nombres de personas ni credenciales.

## Resultado

| Superficie | Lectura observada | Resultado |
|---|---|---|
| Perfil | `configuraciones/{tenant}` y `empresas/{tenant}` existen; vertical `BODEGA_MVP1`; revisiones 2 y 2; 11/11 campos comerciales requeridos presentes; 1 evento `PERFIL_COMERCIAL_PRIMER_ACCESO_BODEGA` en `auditoria_logs`. | PASS |
| Compra sintética | Una compra coincidente: `$1.000 COP`, 1 unidad del producto fixture y un ID de movimiento de inventario. | PASS |
| Recibo e idempotencia | 1 recibo `registrarCompraBodegaV1`, estado `CONFIRMADO`; 1 registro de idempotencia y 1 evento en `operaciones_auditoria`, enlazados a esa compra. | PASS |
| Efecto financiero | La compra no contiene `movimientoFinancieroId` y no existe `transacciones_financieras` asociada a ella, coherente con no seleccionar cuenta de pago. | PASS |
| Inventario | Un movimiento de compra de `+1`, costo `$1.000`, saldo posterior `3`, secuencia `26`. Saldo físico actual `1`, reservado `0`, disponible `1`; los 31 movimientos del artículo suman `1`, igual al stock actual. | PASS |

## Alcance y límites

Esta conciliación cierra la incertidumbre de persistencia que dejó el primer
smoke: el perfil sí quedó guardado y la compra existente produjo exactamente
un recibo, un movimiento de inventario, un registro de idempotencia y una
auditoría; no se repitió el comando. La diferencia entre el saldo posterior a
la compra (`3`) y el saldo actual (`1`) queda explicada por el ledger completo,
cuyo saldo final coincide con el documento del producto; esta lectura no
atribuye movimientos posteriores a un actor ni afirma que se haya repetido una
venta.

Todas las operaciones de esta verificación fueron lecturas. No se usó la
callable de compra/perfil, no se alteraron Rules, Functions, IAM, índices ni
datos, y no se consultó producción (`micafe-pos`). El responsable había
aportado previamente una captura del historial de Compras y reportó estar en
el preview vigente; la captura no incluía hostname/SHA. Vercel había marcado
como exitosa la preview del HEAD `cb2946f` del PR #584. La consulta de Firestore
certifica persistencia del proyecto de staging, no la identidad visual de la
pestaña del navegador.

Esta evidencia acredita el tramo de Gate D cubierto por perfil comercial,
compra, recibo, idempotencia, auditoría e inventario. No sustituye la
revalidación remota de Gate F/G/H en el namespace ADR-SAAS-076, no certifica
producción y no autoriza crear el tenant real ni iniciar el Trial de Diana.
