# FASE-19 PR3 — Documento de alcance (capa de presentación del Kardex)

> Estado: **ALCANCE** (scope), no diseño de implementación ni código.
> Fuentes de verdad de este documento:
> - `FASE-19-PR1-kardex-diseno.md` (contrato de la capa de lectura; §17 define la estrategia de PRs).
> - `FASE-15-PR1-inventario-ledger-diseno.md` (Ledger: fuente de verdad e invariantes I1–I13).
> - Código ya mergeado en `main`: `lib/inventario-kardex.ts` (PR1 + PR2), `lib/inventario-ledger.ts`.
> **Regla rectora:** PR3 no introduce ninguna capacidad de datos nueva. Renderiza el contrato ya cerrado por PR1/PR2. Lo que el contrato no expone, la UI no muestra.

---

## 0. Hallazgo central de la auditoría documental

El documento de diseño de FASE-19 **sí nombra PR3, pero deliberadamente no lo especifica**. En §17 (tabla de estrategia de PRs):

| PR | Contenido (según el diseño) | Estado |
|---|---|---|
| **PR1** | `consultarKardexArticulo` + proyección `LineaKardex`/`KardexArticulo` + paginación por `secuenciaArticulo` + `estado` vía `diagnosticarArticulo`. `filtros` en la firma pero ignorado. | ✅ **Implementado y mergeado** |
| **PR2** | Implementación de `FiltrosKardex` (tipo/clase/fecha/secuencia) en memoria sobre la página. | ✅ **Implementado y mergeado** |
| **PR3** | **"(Presentación) — UI/visualización del Kardex. Fuera de este documento."** | ⬜ **Pendiente (esta rama)** |
| Fases posteriores | Reportes agregados / Valorización. Requieren índices nuevos. | ⬜ Fuera de FASE-19 |

**Consecuencia:** PR3 es, sin ambigüedad, **la capa de presentación (UI) del Kardex**. Pero el diseño de FASE-19 **no contiene** el diseño de esa UI (componentes, pantallas, interacciones, estilos): lo declaró explícitamente fuera de su alcance ("Fuera de este documento por definición", §2 y §17).

Por tanto este documento puede fijar **con total precisión** el *qué consume*, *qué debe respetar* y *qué queda fuera* de PR3 (todo derivable de los docs). Lo único que los documentos **no** predeterminan es el detalle visual/interacción concreto — eso es la única decisión abierta (§16).

---

## 1. Qué quedó implementado en PR1 (verificado en código)

En `lib/inventario-kardex.ts` (commit `88e660c`):

- `consultarKardexArticulo(articuloTipo, articuloId, opciones)` → `PaginaKardex`.
  - Lectura (a): página por índice canónico `(articuloTipo, articuloId, secuenciaArticulo)` con `orderBy` asc/desc, `startAfter(cursor)` y `limit(limite+1)` (detección de `hayMas` sin lectura extra).
  - Lectura (b): `estado` vía `diagnosticarArticulo` (K5).
  - Lectura (c): `articuloNombre`/`unidad` desde el snapshot de `secuenciaArticulo` máxima (gratis en `desc` sin cursor; consulta dedicada `desc limit 1` en otro caso).
  - Proyección `LineaKardex` (15 campos) sin recálculo ni escritura.
  - Construcción de `KardexArticulo` con `estado`, `saldoActual` (`diagnostico.stockLedger ?? null`), `lineas`.
  - Paginación: `cursorSiguiente` = `secuenciaArticulo` del último doc de la página **sin filtrar**; tope `LIMITE_MAXIMO = 100`, default `50`.
- `obtenerEstadoKardex(...)` → `DiagnosticoArticulo` (reexporta `diagnosticarArticulo`, no reimplementa replay; D7).
- Tipos/interfaces públicas: `CursorKardex`, `FiltrosKardex`, `OpcionesKardex`, `LineaKardex`, `KardexArticulo`, `PaginaKardex`.

## 2. Qué quedó implementado en PR2 (verificado en código)

En el mismo archivo (commit `72b2135`):

- `aplicarFiltros(lineas, filtros)` + helper `fechaAMillis(...)`.
- Filtra **en memoria** sobre la página ya obtenida: `tipos` (pertenencia), `clase`, rango `desde/hastaSecuencia` (inclusivo), rango `desde/hastaFecha` (inclusivo, en millis).
- No añade `where(...)`, no reconsulta Firestore, no reordena, no toca `saldoCantidadDespues` (K2), y `hayMas`/`cursorSiguiente` se calculan sobre la página **sin filtrar** (§9).
- La interfaz `OpcionesKardex` no cambió entre PR1 y PR2 (estabilidad de contrato confirmada).

**Conclusión PR1+PR2:** la **capa de lectura completa del Kardex está terminada y es estable**. No hay ningún `TODO` de datos pendiente en `inventario-kardex.ts`.

## 3. Qué apartados del documento aún no tienen implementación

- **§10 (Contrato de datos que consume la UI):** definido como contrato; **ningún consumidor existe todavía**. No hay ningún archivo que importe `consultarKardexArticulo`/`obtenerEstadoKardex` salvo el propio módulo (verificado: 0 referencias en `app/` y `components/`).
- **§17 fila PR3 (Presentación):** sin implementar — es exactamente esta rama.
- Apartados de **compatibilidad futura** (§14 valorización, §15 producción FASE-17, §16 reportes agregados): intencionalmente **fuera de FASE-19**; no son trabajo de PR3.

## 4. Qué corresponde exactamente a PR3 (sin inventar funcionalidades)

PR3 = **construir la capa de presentación de solo-lectura que consume el contrato ya cerrado** (`PaginaKardex` + `DiagnosticoArticulo`), y nada más. Estrictamente:

1. **Una vista de Kardex por artículo** que invoque `consultarKardexArticulo(articuloTipo, articuloId, opciones)` y renderice:
   - **Encabezado del artículo:** `articuloNombre`, `unidad`, `estado` (badge de `EstadoReconciliacion`), `saldoActual`.
   - **Tabla de líneas** con exactamente las columnas de `LineaKardex` (§5/§10): fecha, tipo, clase, signo, cantidad, costo unitario, costo total, `saldoCantidadDespues`, referencia (colección+id), `movimientoRelacionadoId`, autor (`usuarioNombre`), motivo.
2. **Controles de paginación** que usen `hayMas` + `cursorSiguiente` (cursor opaco) y permitan elegir `orden` asc/desc. PR3 no inventa otra paginación: usa la del contrato (§8, K10).
3. **Controles de filtro** que construyan `FiltrosKardex` y lo pasen en `opciones.filtros` (tipo, clase, rango fecha, rango secuencia). PR3 no implementa el filtrado (ya lo hizo PR2): solo arma el objeto y muestra el resultado, **señalando que el filtro opera sobre la página actual, no la serie completa** (§9).
4. **Señalización de estado (obligatoria, K5/§10/§11/§12):** la UI nunca presenta la serie como confiable sin mostrar `estado`. Casos a representar visualmente:
   - `no_migrado`: serie vacía legítima; mostrar `stockCache` del `DiagnosticoArticulo` distinguiéndolo de "saldo 0"; resolver el nombre del artículo desde el catálogo vivo (la capa de lectura entrega `null`, §11).
   - `consistente` / `divergente_reparable`: serie confiable; en `divergente_reparable` señalar que lo que diverge es el *cache*, no la serie.
   - `corrupto`: mostrar las líneas igualmente (transparencia) + marca de corrupción usando `huecos`, `movimientosInvalidos`, `motivoCorrupcion` del diagnóstico; advertir que `saldoCantidadDespues` puede no cuadrar.
5. **Punto de entrada en la app:** un acceso a "ver movimientos / kardex" por artículo desde el módulo de inventario existente (`components/pos/inventory-module.tsx` y/o `components/pos/inventario.tsx`), respetando el patrón de módulos dinámicos del POS (`app/pos/page.tsx`).

Eso es todo. Cualquier cosa más es invención.

## 5. Qué queda explícitamente FUERA de PR3

- **Valorización / columna de valor corrido** (`saldoValorDespues`): el contrato no la expone (K7, D5). La UI **no** tiene columna de valor.
- **Modelos de costeo** (FIFO / promedio / último) como cálculo: prohibido (K7). Solo se muestran `costoUnitario`/`costoTotal` tal cual.
- **Reportes agregados** (movimientos por periodo/espacio, consumo por tipo, valorización global, históricos a fecha server-side): fase posterior, requieren índices propios (§16, D1).
- **Cualquier escritura desde la UI**: reparar cache, emitir/abrir movimientos, backfill, recalcular. Prohibido (K1, D6). Ni un botón de "reparar" — eso pertenece a reconciliación del Ledger.
- **Filtrado / corte server-side** (por fecha, tipo, etc.): no se añaden `where(...)` nuevos (§7, §9, D4). La UI usa solo los filtros en memoria de PR2.
- **Filtrar la serie completa** automáticamente: el contrato filtra solo la página. Si la UI necesitara filtrar toda la serie debería iterar páginas — eso es una decisión de producto, no parte mínima de PR3.
- **Re-resolver nombre/unidad/autor contra el catálogo vivo** para artículos migrados: son snapshots; la UI los muestra tal cual (§10.3, Principio 5). Única excepción permitida: `no_migrado`, donde el contrato entrega `null` y la presentación resuelve el nombre por su cuenta (§11).
- **Producción** (`produccion_*`): FASE-17. Si existieran líneas, se renderizan como cualquier otra; no hay tratamiento especial en PR3.
- **Lotes / `loteId` / `capasConsumidasDetalle`:** el contrato no los proyecta; la UI no los muestra.

## 6. Dependencias técnicas con fases posteriores

- **Ninguna dependencia bloqueante.** PR3 consume un contrato cerrado y autosuficiente.
- **Compatibilidad hacia adelante (no es dependencia):** cuando FASE-17 (producción) emita movimientos, aparecerán como líneas normales sin tocar PR3 (§15). Cuando se añada valorización (§14), será un campo aditivo a `LineaKardex` y, en su momento, una columna nueva — pero **fuera** de PR3.
- PR3 **no** habilita ni adelanta ninguna fase posterior; solo no la estorba.

## 7. ¿PR3 cambia el Ledger o solo consume su API?

**Solo consume.** PR3 no toca `lib/inventario-ledger.ts`. Consume indirectamente vía `obtenerEstadoKardex`/`consultarKardexArticulo`, que ya envuelven `diagnosticarArticulo`. Cero cambios al Ledger.

## 8. ¿Requiere nuevos índices Firestore?

**No.** PR3 no emite consultas Firestore propias: delega en `consultarKardexArticulo`, que usa el índice `(articuloTipo, articuloId, secuenciaArticulo)` **ya desplegado** (§7, D2). Cero índices nuevos.

## 9. ¿Requiere cambios en `MovimientoInventario`?

**No.** Es presentación de campos ya persistidos. Cero cambios de esquema.

## 10. ¿Requiere cambios en los escritores?

**No.** PR3 es solo-lectura (K1). Los escritores (ventas, compras, mermas, ajustes) no se tocan. Imposible regresión sobre escritura por construcción.

## 11. ¿Requiere cambios en reconciliación?

**No.** PR3 *consume* el resultado de la reconciliación de lectura (`DiagnosticoArticulo`: `estado`, `huecos`, `movimientosInvalidos`, `motivoCorrupcion`, `stockCache`, `stockLedger`). No la modifica ni dispara reparación (K1, §12, D6).

## 12. ¿Requiere cambios en la API pública creada en PR1?

**Objetivo: no.** El contrato (`OpcionesKardex`, `PaginaKardex`, `KardexArticulo`, `LineaKardex`, `FiltrosKardex`, `obtenerEstadoKardex`) está diseñado para ser consumido sin cambios. PR3 debería poder construirse encima sin tocar `lib/inventario-kardex.ts`.

> ⚠️ **Riesgo a vigilar (no cambio planificado):** dos campos podrían tentar a un cambio de API:
> - `LineaKardex.fecha` es `unknown` (Timestamp de Firestore). La UI debe formatearlo; si se prefiere normalizar a `Date`/millis, **esa decisión debe tomarse en la capa de presentación**, no mutando el contrato, salvo decisión explícita.
> - `no_migrado` entrega `articuloNombre`/`unidad` = `null`. La UI necesita el nombre real → debe resolverlo desde el catálogo (productos/insumos), **sin** alterar el contrato de lectura. Esto implica que PR3 leerá el catálogo de artículos para el encabezado (lectura adicional, no del Ledger).
>
> Si durante implementación apareciera una necesidad real de tocar la API, **se detiene y se revisa el alcance**; no se cambia el contrato de forma silenciosa.

## 13. ¿Requiere cambios en la paginación o filtros de PR2?

**No.** PR3 *usa* la paginación (`hayMas`/`cursorSiguiente`/`orden`) y los filtros (`FiltrosKardex`) tal como están. No reimplementa ni extiende su lógica. La UI solo construye los parámetros de entrada y consume la salida.

## 14. Archivos que se tocarían en PR3 (estimación de superficie)

**Nuevos (presentación):**
- Componente(s) de UI del Kardex (p. ej. `components/pos/kardex-*.tsx`): vista/tabla, encabezado de estado, controles de filtro y paginación. Cantidad y división exactas dependen de la decisión de §16.

**Modificados (mínimos, punto de entrada):**
- `components/pos/inventory-module.tsx` (y/o `components/pos/inventario.tsx`): añadir acción "ver kardex/movimientos" por artículo que abra la vista. Lectura del catálogo vivo solo para el caso `no_migrado` (nombre/unidad).
- Posiblemente `app/pos/page.tsx` si el Kardex se expone como módulo/ruta propia en lugar de vista embebida (decisión de §16).

**NO se tocan:** `lib/inventario-kardex.ts`, `lib/inventario-ledger.ts`, escritores, `firestore.indexes.json`, esquema.

## 15. Riesgos

- 🟢 **Regresión sobre datos/escritura:** nula por construcción (solo-lectura, sin tocar Ledger/escritores/índices).
- 🟠 **Presentar saldo sin estado:** violaría K5. Mitigación: el encabezado de estado es obligatorio en el alcance (§4.4); ninguna pantalla muestra serie sin `estado`.
- 🟠 **Confundir `no_migrado` con saldo 0, o `corrupto` con confiable:** mitigado por representación explícita de los cuatro estados (§4.4) y uso de `stockCache` vs `saldoActual`.
- 🟠 **Tentación de "arreglar" desde la UI** (botón reparar/recalcular): prohibido (K1, §5). Riesgo de producto, no técnico; se excluye explícitamente.
- 🟠 **Filtros malinterpretados como globales:** el filtro opera sobre la página (§9). La UI debe comunicar esto; si no, el usuario creerá que ve la serie completa filtrada. Riesgo de UX.
- 🟠 **Coste de lectura por consulta:** cada `consultarKardexArticulo` ejecuta `diagnosticarArticulo`, que **lee todos los movimientos del artículo sin `limit`** (§6 nota de coste). La UI no debe reconsultar en exceso (p. ej. en cada tecleo de filtro, ya que filtrar es en memoria sobre la página ya traída). Riesgo de rendimiento/lecturas Firestore.
- 🟢 **Snapshot vs catálogo vivo:** mostrar snapshots es intencional; el único caso de lectura del catálogo vivo es `no_migrado` (nombre).
- 🟡 **`fecha` como `unknown`:** la UI debe formatear el Timestamp con cuidado (SSR off: el módulo POS ya usa `ssr:false`).

---

## 16. Decisiones de presentación (CERRADAS)

El diseño de FASE-19 cerró el **contrato de datos** pero dejó la **superficie de UI sin especificar** ("Fuera de este documento"). Decisiones fijadas con el dueño del producto (no agregan funcionalidad de datos):

- **D-UI-1 — Punto de entrada:** **vista embebida** desde inventario. Un acceso "ver movimientos / kardex" por artículo dentro de `components/pos/inventory-module.tsx` que abre la vista (drawer/modal/panel). **No** se crea módulo/ruta propia ni entrada de sidebar; **no** se modifica `app/pos/page.tsx`.
- **D-UI-2 — Filtros en UI:** **los cuatro filtros de PR2** desde el inicio (`tipos`, `clase`, rango `desde/hastaFecha`, rango `desde/hastaSecuencia`). Cobertura completa del contrato de PR2. La UI debe comunicar que el filtro opera sobre la **página actual**, no la serie completa (§9, riesgo de UX en §15).
- **D-UI-3 — Señalización de estado:** **completa, los cuatro estados** (`no_migrado`, `consistente`, `divergente_reparable`, `corrupto`), con desglose de `huecos`, `movimientosInvalidos` y `motivoCorrupcion` en el caso `corrupto`, y distinción `stockCache` vs `saldoActual`. Cumplimiento máximo de K5/§11/§12.

Con estas tres decisiones, **el alcance de PR3 queda completamente definido**. Listo para pasar a diseño de implementación.

---

## Veredicto

> PR3 es **exclusivamente la capa de presentación de solo-lectura** del Kardex sobre el contrato ya cerrado por PR1+PR2. **No toca** Ledger, `MovimientoInventario`, escritores, reconciliación, índices Firestore, ni la API/paginación/filtros existentes — solo los **consume**. Su riesgo de regresión es nulo por construcción. Las decisiones de forma de UI (§16) están **cerradas**: vista embebida desde inventario, los cuatro filtros de PR2, y señalización completa de los cuatro estados de reconciliación. El alcance de PR3 queda **completamente definido**; ninguna decisión añade funcionalidad de datos nueva.
