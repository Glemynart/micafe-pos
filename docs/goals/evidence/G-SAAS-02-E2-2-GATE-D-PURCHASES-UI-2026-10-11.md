# G-SAAS-02 / M2 / E2.2 — Gate D revalidación autenticada de Compras (2026-10-11)

## Resultado

`PURCHASES_UI_AFTER_INDEX_DEPLOY = PASS` para la pantalla administrativa de
Compras Bodega en staging, tras el deploy de los cuatro índices del Gate D.

## Observación autenticada

- Proyecto de datos: `micafe-pos-staging`.
- Superficie: preview #548, ruta `/admin/compras`.
- Identidad visible: `Administrador Bodega Demo` (sesión sintética de staging).
- La ruta mostró `Compras de Productos`, gasto del periodo `$0`, `0` compras y
  el estado vacío `No hay compras registradas`.
- No permaneció en el indicador de carga, no volvió al login y no se observó el
  `failed-precondition` de índices que motivó el corte.
- El árbol de accesibilidad de Edge confirmó el encabezado, los totales, la
  tabla y su fila de estado vacío.
- No se abrió ni envió el formulario de compra. No se crearon ni modificaron
  documentos.

La verificación ocurrió en la sesión Edge con la ruta exacta:

`https://cafeatrato-git-codex-e2-2-gate-d-pur-475814-glemynarts-projects.vercel.app/admin/compras`

La captura aportada para esta revisión muestra un problema de disposición en
escritorio: el título se envuelve, los controles rebasan el ancho de la tarjeta
y las etiquetas de métricas quedan estrechas. La función y el estado vacío son
visibles; esta observación queda para la validación de usabilidad de Gate F y no
se presenta como una compra autenticada ni como certificación del flujo de
escritura.

## Alcance del PASS

Este resultado demuestra solo que la ruta autenticada y su consulta de historial
cargan después de que los cuatro índices quedaron `READY`. En conjunto con los
checkpoints de Functions, Rules e índices, completa el resultado operativo de
Gate D. No demuestra la autorización ni el efecto transaccional de una compra;
esos escenarios quedan en Gate F.

## Mutación y rollback

- No se ejecutó ninguna compra ni se escribieron datos.
- No se modificaron Rules, Functions, IAM, Secrets, Auth, fixture, tenant real o
  producción durante la verificación.
- No requiere rollback.
