# G-SAAS-02 / M2 / E2.2 — Gate F revalidación de compra Bodega (2026-10-11)

## Resultado

`PURCHASE_BODEGA_CANONICAL_FLOW = PASS` para la revalidación de Gate F solicitada
después de Gate D. Una compra sintética fue registrada en staging y sus efectos
se conciliaron entre compra, recibo operativo, auditoría, ledger e inventario.
Gate F queda revalidado; por secuencia, se repiten Gate G y luego Gate H antes
de avanzar a Gate I.

## Contexto y alcance

Gate D dejó activa la callable aislada `registrarCompraBodegaV1` y habilitó la
pantalla autenticada de Compras. PR #551 preserva el mismo `commandId` al
reintentar el mismo borrador y da una identidad nueva ante otra intención. PR
#551 se integró en `main` mediante `89a2ab71486860d353ebf164cc7129a48747be5e`;
su CI previo al merge, run `38159900463`, terminó `success`.

La validación usó únicamente el proyecto `micafe-pos-staging`, el tenant
`E2_2-BODEGA-STAGING-FIXTURE` y el preview #551:

`https://cafeatrato-git-codex-e2-2-gate-f-pur-259d65-glemynarts-projects.vercel.app/admin/compras`

La CI post-merge de `main`, run
[`38161620488`](https://github.com/Glemynart/micafe-pos/actions/runs/38161620488),
terminó `success` sobre el merge SHA de PR #551.

La sesión correspondía a `Administrador Bodega Demo`. No se usaron cuentas,
usuarios, inventario ni datos del cliente real.

## Compra sintética autorizada

| Campo | Valor observado |
|---|---|
| Proveedor | `Proveedor sintético Gate F` |
| Producto | `E2_2-BODEGA-STAGING-FIXTURE-PRODUCTO` |
| Cantidad / unidad | 1 unidad |
| Costo unitario y total | `$1.000 COP` |
| Fecha de compra | 2026-10-11 |
| Cuenta de pago | Sin descuento en Finanzas |

El historial autenticado mostró exactamente una compra para este proveedor y
el detalle coincidió con el artículo, unidad, cantidad, costo y total. La
interfaz no informó errores y el encabezado, controles y métricas se mantuvieron
operables en el ancho de escritorio.

## Conciliación read-only en Firestore

Una consulta exacta por proveedor confirmó un documento en `compras` con total
`1000`, un item del producto fixture por 1 unidad y una referencia a un único
movimiento de inventario. Las lecturas posteriores filtradas por la referencia
de esa compra confirmaron:

- Un recibo en `operaciones_comandos`, tipo `registrarCompraBodegaV1`, estado
  `CONFIRMADO`, total `1000` y `movimientoFinancieroId: null`.
- Una auditoría en `operaciones_auditoria`, tipo `registrarCompraBodegaV1`,
  resultado `CONFIRMADO`, ligada al mismo comando y compra.
- Un movimiento en `movimientos_inventario`, tipo `compra`, motivo
  `compra_proveedor`, cantidad `1`, signo `+1` y costo total `1000`.
- Cero documentos en `transacciones_financieras` con la referencia de compra;
  no se descontó caja ni cuenta bancaria.
- `/admin/inventario` mostró 3 unidades físicas, 0 reservadas y 3 disponibles.

La compra, su recibo, la auditoría y el movimiento de inventario comparten el
mismo instante de creación (`2026-10-11T17:45:36Z`). No se realizó un ajuste
manual de stock.

## Límites y auditoría de mutaciones

- Se envió una sola compra autorizada; no se reenvió el comando tras una pérdida
  simulada de respuesta. La prueba unitaria del PR #551 sí verifica que el
  mismo borrador conserva su `commandId`; no se atribuye a esta observación un
  replay remoto post-commit.
- La compra quedó persistente en staging y no se eliminó ni revirtió.
- No se registraron ventas, se modificaron turnos ni se cambió agenda,
  membresías, Rules, Functions, IAM, Secrets, otro tenant o producción.
- El costo no se pagó con dinero real; al no seleccionar cuenta, no hay egreso
  financiero asociado.
