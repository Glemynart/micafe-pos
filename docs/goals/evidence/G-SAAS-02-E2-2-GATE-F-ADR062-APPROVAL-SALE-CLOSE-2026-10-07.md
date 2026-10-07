# G-SAAS-02 / M2 / E2.2 — Gate F: solicitud, aprobación, venta y cierre en staging (2026-10-07)

## Alcance

Registra la ejecución observada del nuevo flujo de ADR-SAAS-062 sobre el fixture
sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` en
`micafe-pos-staging`. La persona usuaria ejecutó las acciones en el POS/Backoffice;
Codex verificó los registros persistidos y los logs de Cloud Run mediante
lecturas. No se declara Gate F completo, Gate G/H, aceptación del cliente,
producción ni cierre de E2.2.

## Identidad de la superficie

- Proyecto Firebase: `micafe-pos-staging`.
- Empresa: `E2_2-BODEGA-STAGING-FIXTURE` (`Bodega Atrato Demo`).
- Deployment usado en el navegador: `dpl_8RPtpatX2SgmspCJWb2YcfnBjeNa`, estado
  Vercel `READY`, alias `cafeatrato-kmb4lf4bm-glemynarts-projects.vercel.app`.
- Alias Git de ese Preview: `codex/e2-2-gate-d-deploy`, commit
  `4abd398b043daf4c1449dd37a993a8c3f0cea10d`.
- Comparado con `main @ 7d0abb63db8f13c5b0cb6a11db7176e45e271d25`, los cambios
  posteriores listados por GitHub estaban limitados a Functions, pruebas y
  evidencia documental; no incluían archivos de la interfaz. En particular,
  PR #466 no modificó la UI. La prueba verifica el servicio staging y la UI
  observada; no atribuye el deployment a un SHA de `main` que Vercel no expuso.

## Secuencia verificada

La secuencia de la solicitud más reciente se correlacionó entre Firestore y
Cloud Run:

| Etapa | Evidencia de lectura | Resultado |
| --- | --- | --- |
| Solicitud del vendedor | `crearSolicitudVentaBodegaV1`, revisión `crearsolicitudventabodegav1-00002-laz`, `POST 200` a `2026-10-07T05:55:45.803Z`. | PASS |
| Estado de solicitud | Documento `empresas/E2_2-BODEGA-STAGING-FIXTURE/solicitudes_venta_bodega/r1a-WyJFMl8yLUJPREVHQS1TVEFHSU5HLUZJWFRVUkUiLCJzb2xpY2l0dWQtdmVudGEtYm9kZWdhOmJvZGVnYS1zb2xpY2l0dWQ6OTM0M2VkZjgtMGMxYy00NTdjLTk2NDEtNDlhMWE4ZjBmOGMwIl0`; `EJECUTADA`, revisión `1`, total `5.000 COP`, creada a `05:55:46.856Z`. | PASS |
| Aprobación administrativa | `resolverSolicitudVentaBodegaV1`, revisión `resolversolicitudventabodegav1-00002-fib`, `POST 200` a `2026-10-07T05:56:28.569Z`; la aprobación conservó revisión y total de la solicitud. | PASS |
| Venta canónica | `confirmarVentaBodegaV1`, revisión `confirmarventabodegav1-00005-loz`, `POST 200` a `2026-10-07T06:04:33.259Z`. La ejecución persistida enlaza `ventaId` `r1a-WyJFMl8yLUJPREVHQS1TVEFHSU5HLUZJWFRVUkUiLCJ2ZW50YS1ib2RlZ2E6Ym9kZWdhLXZlbnRhOmVjMDM2YWQwLTVhZmMtNDUyMy1iMzMyLTE2ZDY3YjEyOGVlOCJd` y `commandId` `bodega-venta:ec036ad0-5afc-4523-b332-16d67b128ee8`. | PASS |
| Turno y cierre | Turno `z4g5tL5LGpv9J4B5gxc5`, abierto a `05:57:06.992Z`, quedó `cerrado` a `06:27:54.577Z`, definitivo; esperado/reportado `5.000 COP`, diferencia `0`, depósito neto `5.000 COP`. `cerrarTurnoOperativoV1`, revisión `cerrarturnooperativov1-00001-bef`, respondió `POST 200` a `06:27:53.658Z`. | PASS |
| Efectos operativos y financieros | Lecturas correlacionadas con la venta y el turno: movimiento de inventario de `-2` unidades base; ingreso de venta de `5.000 COP` a `caja-principal`; egreso de cierre de `5.000 COP` de `caja-principal` e ingreso de cierre de `5.000 COP` a `caja-fuerte`; recibos de venta/cierre `CONFIRMADO`. | PASS |

Los tiempos de la tabla son UTC. Las lecturas fueron de Firestore y Cloud Logging;
no se emitió una nueva llamada de mutación desde Codex. La secuencia acredita
que la aprobación precedió a la materialización de la venta para el documento
correlacionado.

También se observó otra solicitud sintética más antigua en el mismo fixture,
creada a `2026-10-07T04:20:59.863Z` y ya `EJECUTADA`. Es un registro separado,
no se alteró ni se cuenta dentro de la secuencia anterior. El fixture conserva
historial previo; no se ejecutó cleanup.

## Estado de Gate F

Esta ejecución supera en staging el flujo posterior a ADR-SAAS-062 de
solicitud → aprobación de admin → venta canónica → cierre conciliado. No
sustituye la matriz funcional completa. Gate F permanece `EN CURSO` hasta
demostrar en el artifact vigente:

- aislamiento A/B para las superficies operativas, más allá de la lectura de
  configuración ya probada;
- revocación/restauración de membresía y comportamiento del actor después de
  restaurar permisos;
- retry autenticado durante una ventana dedicada de pérdida de red para el
  flujo afectado por ADR-SAAS-062, conservando una sola obligación y efectos.

El retry de apertura de turno y el aislamiento limitado a configuración de la
evidencia del 2026-10-05 siguen siendo evidencia histórica útil, pero no cubren
por sí solos los escenarios pendientes de esta revalidación. Después de cerrar
F se repetirá G con aprobación previa y se producirá una matriz H nueva, según
ADR-SAAS-062.

## Mutation audit

- Acciones de staging correlacionadas con la secuencia de esta evidencia,
  ejecutadas por la persona usuaria: `1` solicitud, `1` aprobación, `1` venta
  canónica y `1` cierre de turno.
- Lecturas de Firestore, Cloud Logging, GitHub y Vercel por Codex: solo lectura.
- Escrituras de Firestore/Auth por Codex: `0`; fixture o tenant adicional: `0`.
- Deploy, cambios de tráfico, Rules, IAM, Secrets, Bootstrap, Activation,
  cleanup destructivo y producción: `0`.
- Archivos productivos, commits, push y PR durante la verificación: `0`.
