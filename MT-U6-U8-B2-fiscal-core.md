# MT-U6→U8 — B2: Fiscal Core

## Estado y frontera

Implementación de la autoridad fiscal nueva definida por ADR-SAAS-008 y B0. Este bloque crea el núcleo, pero **no lo activa**: POS, reservas, Wompi, Electron, el singleton `configuracion/general` y sus escritores siguen bajo la autoridad legacy hasta el cutover certificado B7. No hay dual-read, dual-write, fallback ni backfill en B2.

## Agregados y autoridad

- `numeraciones/{empresaId}_{numeracionId}` conserva exclusivamente resolución, prefijo, rango, vigencia, scope, tipo, contador, estado y revisión.
- `asignaciones_numeracion/{empresaId}_{scopeCanonico}_{tipoDocumento}` conserva exclusivamente la selección vigente.
- `ventas/{ventaId}.snapshotFiscal` es la evidencia inmutable de una emisión nueva.
- `fiscal_comandos/{reciboId}` es el recibo canónico e inmutable de cada comando fiscal. Para `ConfirmarVentaFiscal`, además de la identidad idempotente del comando, conserva el vínculo único con `ventaId` y el contexto histórico resuelto por servidor: `empresaId`, `actorOriginal.uid`, `actorOriginal.rolEfectivo`, `commandId`, `idempotencyKey`, `correlationId` y `causationId`.

Los scopes canónicos son `EMPRESA` y `ESPACIO:<espacioId>`. La selección se hace solo en backend: espacio/tipo, empresa/tipo, o rechazo explícito.

## Comandos B2

`CrearNumeracion`, las transiciones habilitar/pausar/reanudar/revocar, `EstablecerAsignacionNumeracion` y `ConfirmarVentaFiscal` se ejecutan desde Functions privilegiadas. Todo comando transporta commandId, idempotencyKey, correlationId, causationId y expectedRevision; reintentos equivalentes recuperan el resultado durable y una clave reutilizada con otra carga se rechaza. La unicidad global de `commandId` reutiliza el índice canónico introducido por B1.

`ConfirmarVentaFiscal` no acepta numeración ni número del cliente. En una transacción valida Empresa, readiness fiscal mediante el validador B1, líneas/impuestos, asignación, tipo, scope, estado, país, vigencia y rango; incrementa un único contador, crea la venta y congela `snapshotFiscal`, auditoría, evento y recibo fiscal canónico. No existe comando independiente de incremento o snapshot. Los estados terminales detectados se confirman y auditan antes de devolver el rechazo de emisión.

El recibo de una confirmación se crea en ese mismo commit con el `empresaId`, actor y rol efectivo que la Function ya resolvió desde la sesión y membresía vigentes; nunca los toma de `entrada.venta`. `ventaId` es único dentro de `fiscal_comandos` para una confirmación fiscal y permite localizar el recibo mediante consulta por ese campo. La dupla de identidad y la huella ya definidas para el comando permanecen sin cambios; un reintento devuelve ese mismo recibo y no crea otra relación ni otro contexto.

R1-B.2 localiza el recibo por `ventaId` antes de aplicar los efectos de una venta `PENDIENTE_EFECTOS`. Ese recibo es la única fuente canónica para reconstruir `empresaId`, `actorOriginal.uid` y `actorOriginal.rolEfectivo` históricos; `ventas/{ventaId}` se usa exclusivamente como hecho fiscal y fuente de los efectos, nunca como autoridad de tenant, actor o rol. El reconciliador registra su identidad separada como ejecutor técnico, sin reemplazar al actor original.

El cambio es aditivo sobre el recibo B2 existente: no agrega contexto a la venta, no modifica `snapshotFiscal` ni crea una segunda fuente de verdad. Los recibos y ventas ya confirmados conservan su forma histórica; una venta pendiente sin recibo con este vínculo no es elegible para el reconciliador R1-B.2 hasta que una iniciativa de compatibilidad explícita defina su tratamiento, sin inferir identidad desde la venta.

## Snapshot y reimpresión

El snapshot contiene revisión de configuración, identidad fiscal, país, moneda, impuestos de líneas y la serie completa usada (tipo, scope, número, prefijo, resolución, rango, vigencia y fecha). La reimpresión de una venta B2 lo consume sin leer configuración ni numeraciones vigentes. Ventas históricas sin snapshot permanecen en el adaptador legacy aislado hasta B7.

## Exclusiones

No implementa lifecycle/enforcement (B3/B4), bootstrap (B5), onboarding (B6), migración/cutover/backfill (B7), Firestore Rules ni Electron (MT-U12).

## Trazabilidad

Materializa FIS-01 a FIS-10, CON-01 a CON-05 y ADR-SAAS-008. La ausencia de este documento y de `PROJECT_STATE.md` fue detectada durante la auditoría inicial; no modifica la jerarquía normativa.
