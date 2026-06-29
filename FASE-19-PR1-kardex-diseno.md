# FASE-19 PR1 — Diseño del Kardex de Inventario (capa de lectura)

> Estado: **DISEÑO**. Solo arquitectura y contrato de la capa de lectura.
> No implementa código, componentes, hooks, servicios, UI ni estilos.
> **Fuente de verdad única de este diseño:** `FASE-15-PR1-inventario-ledger-diseno.md` y el código del Ledger en `main` (`lib/inventario-ledger.ts`, escritores conmutados, índices desplegados).
> **Regla rectora del documento:** el Kardex no introduce ninguna capacidad nueva. Todo lo que expone ya está garantizado por el Ledger (FASE-15). Si una capacidad no existe hoy en el Ledger, **no** se diseña aquí.

---

## 0. Principio rector

**El Kardex es una proyección de solo-lectura del Ledger de Inventario.** No almacena nada propio, no duplica datos, no recalcula y no escribe. Cada columna que muestra ya está persistida en `MovimientoInventario` por el escritor que originó el hecho (FASE-15 §6).

El Ledger ya es la única fuente de verdad de las existencias (FASE-15 §0). El Kardex es simplemente **la lectura ordenada de esa verdad para un artículo**. Es lectura, no un subsistema nuevo.

---

## 1. Objetivo de FASE-19

Exponer, como capa de lectura pura, la **historia de movimientos de un artículo** (`producto` o `insumo`) tal y como quedó registrada en el Ledger: en orden determinista, con su saldo corrido congelado, su trazabilidad al documento de origen y su estado de reconciliación.

El objetivo **no** es calcular, valorizar, reparar ni agregar. Es proyectar lo que el Ledger ya contiene, de forma consultable y paginable, con un contrato estable para que una capa de presentación (fuera de este documento) lo consuma.

---

## 2. Alcance y exclusiones

### Dentro de alcance (FASE-19, capa de lectura)

- Proyección de la serie de movimientos de **un** artículo identificado por `(articuloTipo, articuloId)`.
- Lectura del saldo corrido por línea (`saldoCantidadDespues`), sin recálculo.
- Orden canónico y paginación por `secuenciaArticulo`.
- Filtros de presentación aplicados **en memoria** sobre la **página actual** del artículo (tipo, clase, rango de fecha, rango de secuencia); no son filtros globales de la serie completa (ver §9).
- Declaración del **estado de reconciliación** del artículo (`no_migrado | corrupto | divergente_reparable | consistente`), reutilizando las funciones de lectura ya existentes en el Ledger.
- Contrato de datos (DTO) que consume la capa de presentación.

### Fuera de alcance (excluido explícitamente)

- **Valorización y saldo de valor corrido** (`saldoValorDespues`). Reservado hasta elegir modelo de costeo (FASE-15 §7). → **NO se implementa.**
- **Modelos de costeo: FIFO, promedio ponderado, último costo** como cálculo. El Kardex muestra el `costoUnitario`/`costoTotal` *tal cual capturado* por el movimiento; no deriva ningún modelo. → **NO se implementa.**
- **Reportes agregados** (movimientos por periodo/espacio, consumo por tipo, valorización global, históricos a fecha *server-side*). Tienen índices y escala propios. → **Fase posterior.**
- **Producción** (`produccion_salida`/`produccion_entrada`) como flujo. → **FASE-17.** El Kardex ya los proyectaría como líneas normales si existieran, sin cambios.
- **Cualquier escritura**: reparación de cache, emisión de movimientos, backfill, apertura. → **Prohibido** (lo hace la reconciliación/escritores, no el Kardex).
- **UI, componentes React, tablas, estilos, paginación visual.** → Fuera de este documento por definición.
- **Multiempresa funcional.** `empresaId` permanece reservado; las lecturas no filtran por él (ver §9 de FASE-15 y §13 aquí).

---

## 3. Principios arquitectónicos

1. **Proyección, no fuente.** El Kardex deriva todo del Ledger. Si el Ledger no lo persiste, el Kardex no lo muestra.
2. **Cero recálculo.** El saldo corrido se lee de `saldoCantidadDespues` (congelado por I8). El Kardex nunca reagrega cantidades para producir el saldo de presentación.
3. **Cero escritura.** Hereda I1/I2: la lectura jamás modifica movimientos ni cache.
4. **Orden canónico único.** La serie de un artículo se ordena por `secuenciaArticulo` (I12), nunca por `fecha`.
5. **Snapshot manda.** Nombre, unidad y autor se leen del movimiento (snapshots), no del artículo vivo, para que el kardex sea legible aunque el artículo se renombre o desactive (FASE-15 §1).
6. **Reutilización del replay existente.** El estado de reconciliación y la detección de corrupción se obtienen de `diagnosticarArticulo`/`replayLedgerArticulo`, no se reimplementan.
7. **Honestidad sobre el estado.** Una lectura nunca presenta una serie como confiable sin antes declarar el estado de reconciliación del artículo.
8. **Mínima infraestructura nueva.** PR1 reutiliza el índice ya desplegado; no introduce esquema ni índices.

---

## 4. Invariantes específicos del Kardex (K1–K10)

Los invariantes del Kardex son **derivados** de los del Ledger; no los reemplazan.

- **K1 — Solo lectura.** El Kardex nunca escribe en `movimientos_inventario` ni en el cache `stock`/`secuenciaLedger`. (Deriva de I1, I2, I11.)
- **K2 — Saldo no recalculado.** La columna de saldo es exactamente `saldoCantidadDespues` del movimiento. La proyección no suma cantidades para obtenerla. (Deriva de I8.)
- **K3 — Orden por secuencia.** La serie se ordena exclusivamente por `secuenciaArticulo`. `fecha` es informativa y nunca clave de orden. (Deriva de I12.)
- **K4 — Etiquetas desde el snapshot.** `articuloNombre`, `unidad`, `usuarioNombre`, `motivo` provienen del movimiento. (Deriva de I1.)
- **K5 — Estado declarado.** Toda consulta de kardex de un artículo expone su `EstadoReconciliacion` antes de que la serie pueda interpretarse como confiable. (Deriva de I9.)
- **K6 — Tolerancia a saldo negativo.** La proyección nunca recorta ni oculta `saldoCantidadDespues < 0`. (Deriva de I6.)
- **K7 — Sin valor corrido.** `saldoValorDespues` no se proyecta (es `null`). Las únicas columnas de costo son `costoUnitario` y `costoTotal` por movimiento, tal cual capturados. No hay valorización. (Deriva de I7 y FASE-15 §7.)
- **K8 — Identidad por par.** La identidad de un kardex es `(articuloTipo, articuloId)`. Jamás se interleavan dos catálogos (`producto`/`insumo` con ids coincidentes). (Deriva de la clave de orden, FASE-15 §1.)
- **K9 — `empresaId` no filtra.** En mono-empresa la lectura no filtra por `empresaId` (reservado). (Deriva de OBS-4, FASE-15 §12.)
- **K10 — Paginación estable.** El cursor de paginación es `secuenciaArticulo`. Como el ledger es append-only, las páginas ya emitidas son inmutables; los movimientos nuevos solo aparecen como extensión de la serie. (Deriva de I1, I2, I12.)

---

## 5. Modelo de lectura (proyección únicamente)

El Kardex define dos formas de lectura, ambas **derivadas** de `MovimientoInventario`. Son contratos de datos, no entidades persistidas.

### `LineaKardex` — una línea de la serie

Proyección directa de un `MovimientoInventario` (subconjunto de campos ya persistidos). No agrega ningún campo calculado nuevo.

| Campo | Origen en `MovimientoInventario` | Notas |
|---|---|---|
| `id` | `id` | Document id / `claveIdempotencia`. |
| `secuenciaArticulo` | `secuenciaArticulo` | Clave de orden (K3). |
| `fecha` | `fecha` | Timestamp de lectura. Informativa (K3). |
| `tipo` | `tipo` | Enum del catálogo (FASE-15 §3). |
| `clase` | `clase` | `entrada \| salida`. |
| `signo` | `signo` | `+1 \| −1`. |
| `cantidad` | `cantidad` | Con signo, sin recorte (K6). |
| `costoUnitario` | `costoUnitario` | Capturado en origen (I7). No es modelo de costeo (K7). |
| `costoTotal` | `costoTotal` | `\|cantidad\| × costoUnitario`. |
| `saldoCantidadDespues` | `saldoCantidadDespues` | Saldo corrido congelado (K2). |
| `referenciaColeccion` | `referenciaColeccion` | Trazabilidad al documento de origen. |
| `referenciaId` | `referenciaId` | Trazabilidad al documento de origen. |
| `movimientoRelacionadoId` | `movimientoRelacionadoId` | Enlaza contramovimientos / pares. |
| `usuarioNombre` | `usuarioNombre` | Snapshot del autor. |
| `motivo` | `motivo` | Texto libre (ajustes, mermas, `apertura_lazy`). |

Campos **deliberadamente excluidos** de la proyección en PR1: `saldoValorDespues` (siempre `null`, K7), `loteId` y `capasConsumidasDetalle` (reservados FIFO, no se usan), `empresaId` (reservado, K9), `usuarioId` (se proyecta solo el nombre snapshot para presentación).

### `KardexArticulo` — el contenedor de la serie de un artículo

| Campo | Origen | Notas |
|---|---|---|
| `articuloTipo` | parámetro de consulta | Identidad (K8). |
| `articuloId` | parámetro de consulta | Identidad (K8). |
| `articuloNombre` | snapshot del movimiento con `secuenciaArticulo` máxima de la serie | `null` para `no_migrado` (sin movimientos). Independiente de la página y del orden de consulta. Si ese movimiento no pertenece a la página consultada (orden ascendente o cursor activo), se obtiene mediante una consulta dedicada `orderBy("secuenciaArticulo","desc").limit(1)` sobre el índice ya desplegado `(articuloTipo, articuloId, secuenciaArticulo)`; gratis solo cuando la consulta principal es `orden:"desc"` sin cursor (el primer documento de la página ya es el máximo). `diagnosticarArticulo` no expone este campo: su proyección descarta `articuloNombre` y `unidad` (lib/inventario-ledger.ts:704–714). Esa lectura adicional no modifica el Ledger ni requiere índices nuevos. El Principio 5 prohíbe leer el artículo vivo como sustituto. Ver §11. |
| `unidad` | snapshot del movimiento con `secuenciaArticulo` máxima de la serie | `null` para `no_migrado`. Independiente de la página y del orden de consulta. Misma lectura adicional que `articuloNombre`: consulta dedicada `orderBy("secuenciaArticulo","desc").limit(1)` sobre el índice ya desplegado; gratis solo cuando la consulta principal es `orden:"desc"` sin cursor. Ver §11. |
| `estado` | `diagnosticarArticulo(...)` | `EstadoReconciliacion` (K5). |
| `saldoActual` | `DiagnosticoArticulo.stockLedger` | Σ(cantidad) autoritativo del Ledger (I4). Independiente de la página y del orden de consulta. `null` para `no_migrado`. Ver §11/§12. |
| `lineas` | proyección de la página | Array de `LineaKardex`. |

El `KardexArticulo` **no almacena nada**: se construye en cada consulta.

---

## 6. API pública de lectura

Contratos de función (firmas, no implementación). Todas son `async`, de solo lectura, sin transacción (no aplican reads-before-writes porque no escriben).

```
// Opciones de consulta del kardex de un artículo.
interface OpcionesKardex {
  limite?: number;                 // tamaño de página; default y máximo definidos en §8
  cursor?: CursorKardex | null;    // cursor opaco de paginación (§8)
  orden?: "asc" | "desc";          // sobre secuenciaArticulo; default "desc" (§8)
  filtros?: FiltrosKardex;         // filtros en memoria sobre la página (§9); PR2 los implementa
}

// Resultado paginado.
interface PaginaKardex {
  articulo: KardexArticulo;        // incluye estado, saldoActual, lineas y snapshots (§5)
  hayMas: boolean;
  cursorSiguiente: CursorKardex | null;
}

// Consulta principal: una página del kardex de un artículo.
function consultarKardexArticulo(
  articuloTipo: ArticuloTipo,
  articuloId: string,
  opciones?: OpcionesKardex,
): Promise<PaginaKardex>;

// Estado de reconciliación del artículo (reutiliza la función existente del Ledger).
// Reexportado/compuesto, NO reimplementado.
function obtenerEstadoKardex(
  articuloTipo: ArticuloTipo,
  articuloId: string,
): Promise<DiagnosticoArticulo>;   // tipo ya definido en lib/inventario-ledger.ts
```

Notas de contrato:

- `consultarKardexArticulo` realiza entre dos y tres lecturas: (a) la página de movimientos por el índice canónico (§7); (b) el estado vía `diagnosticarArticulo` (K5); (c) opcionalmente, cuando `articuloNombre`/`unidad` no están en la página consultada (orden ascendente o cursor activo), una consulta adicional `orderBy("secuenciaArticulo","desc").limit(1)` sobre el índice ya desplegado para obtener el snapshot del movimiento con `secuenciaArticulo` máxima. La capa de presentación puede pedir solo el estado con `obtenerEstadoKardex`.
- **Coste de `diagnosticarArticulo` en cada llamada:** para artículos migrados, esta función lee **todos** los movimientos del artículo sin `limit` (comportamiento actual en `lib/inventario-ledger.ts`). Cada llamada a `consultarKardexArticulo` incurre en esta lectura completa además de la lectura paginada. No es evitable sin violar K5. Para obtener solo el estado sin la serie, usar `obtenerEstadoKardex`.
- **`filtros` en PR1:** el parámetro `filtros?: FiltrosKardex` forma parte del contrato final de FASE-19 (cubriendo PR1 y PR2). PR1 acepta el parámetro y lo ignora; PR2 lo implementa. La interfaz `OpcionesKardex` no cambia entre PRs.
- **No se expone ninguna función de escritura.** Reparar, abrir o emitir movimientos pertenece al Ledger/reconciliación (FASE-15), no al Kardex.
- `ArticuloTipo`, `DiagnosticoArticulo`, `EstadoReconciliacion` **ya existen** en `lib/inventario-ledger.ts`; el Kardex los reutiliza, no los redefine.

---

## 7. Consultas Firestore e índices requeridos

### Consulta canónica del kardex (una página de un artículo)

```
collection("movimientos_inventario")
  where("articuloTipo", "==", articuloTipo)
  where("articuloId",   "==", articuloId)
  orderBy("secuenciaArticulo", <asc|desc>)
  [startAfter(cursor)]
  limit(limite)
```

### Índice requerido

`(articuloTipo ASC, articuloId ASC, secuenciaArticulo ASC)` — **ya desplegado** en `firestore.indexes.json`.

- Como `articuloTipo` y `articuloId` entran por **igualdad**, el mismo índice sirve `secuenciaArticulo` en orden **ascendente y descendente**. No se requiere un índice DESC adicional.
- **PR1 no introduce ningún índice nuevo ni cambio de esquema.** Es estrictamente aditivo a nivel de lectura.

### Lo que NO se consulta server-side en PR1

- `where("tipo", ...)`, `where("clase", ...)`, rangos de `fecha` combinados con la igualdad de artículo: requerirían índices compuestos nuevos. Se resuelven **en memoria** (§9).
- Consultas por `espacioId`/`fecha`/`tipo` a nivel global (Reportes): índices propios en su fase (§16).

---

## 8. Ordenamiento y paginación

- **Orden canónico:** `secuenciaArticulo` (K3). `fecha` nunca se usa como clave de orden por ser potencialmente no monotónica y empatable (T1 de la revisión).
- **Dirección:** `asc` reconstruye la historia desde la apertura (saldo corrido legible de arriba abajo); `desc` muestra lo más reciente primero. Ambas se sirven con el índice desplegado. **Default sugerido: `desc`** (lo más reciente primero es el caso de consulta más común); la dirección es parámetro, no decisión rígida.
- **Cursor:** opaco, basado en `secuenciaArticulo` del último elemento de la página (traducible a `startAfter`). El cursor **no** se basa en `fecha` ni en offset numérico.
- **Estabilidad (K10):** al ser el ledger append-only e inmutable, una página ya emitida nunca cambia. Movimientos nuevos solo extienden la serie (aparecen al final en `asc`, al inicio en `desc`). No hay "deslizamiento" de páginas.
- **Tamaño de página:** acotado por un límite máximo (p. ej. 50–100) para impedir traer la serie completa de un artículo de alta rotación. El valor exacto se fija en implementación; el contrato exige *que exista* un máximo.

---

## 9. Filtros soportados

Todos los filtros se aplican **en memoria**, sobre la **página** devuelta por la consulta canónica en esa llamada (el conjunto de movimientos acotado por `limite`). No operan sobre la serie completa del artículo. Justificación: la cardinalidad de movimientos **por artículo** está acotada; añadir filtros server-side multiplicaría los índices compuestos sin beneficio de escala en el caso del kardex.

**Consecuencia directa sobre la paginación:** `hayMas` y `cursorSiguiente` reflejan el límite de la *página sin filtrar*, no del subconjunto filtrado. Los filtros son una operación de presentación sobre la página actual; no garantizan que el conjunto filtrado sea completo dentro de la página, ni que no existan coincidencias en páginas posteriores. La UI que necesite filtrar la serie completa debe iterar páginas.

```
interface FiltrosKardex {
  tipos?: TipoMovimientoInventario[];   // p. ej. solo "compra" + "venta"
  clase?: ClaseMovimiento;              // "entrada" | "salida"
  desdeFecha?: Date;                    // corte por fecha, en memoria
  hastaFecha?: Date;
  desdeSecuencia?: number;              // corte por secuencia (corte histórico canónico)
  hastaSecuencia?: number;
}
```

Reglas:

- El **corte histórico** recomendado es por `secuencia` (orden canónico, determinista). El corte por `fecha` se ofrece como conveniencia pero se evalúa en memoria; no es un corte server-side (T1).
- Filtrar **no** altera la columna `saldoCantidadDespues`: el saldo mostrado sigue siendo el saldo real del Ledger tras ese movimiento, **no** un saldo recomputado sobre el subconjunto filtrado (K2). Es decir, filtrar oculta filas, no reescribe saldos.
- Cualquier filtro server-side adicional (por necesidad de escala) es materia de Reportes y exigiría índice propio; queda fuera de PR1.

---

## 10. Contrato de datos que consume la UI

La capa de presentación (fuera de este documento) consume exclusivamente:

- `PaginaKardex` (§6): `articulo` (`KardexArticulo` con `articuloNombre`, `unidad`, `estado`, `saldoActual`, `lineas: LineaKardex[]`), `hayMas`, `cursorSiguiente`.
- `DiagnosticoArticulo` (vía `obtenerEstadoKardex`) cuando solo se necesita el encabezado de estado sin la serie.

Garantías del contrato hacia la UI:

1. Las **columnas** disponibles son exactamente las de `LineaKardex` (§5). No habrá columna de "valor corrido" en PR1 (K7).
2. El **saldo de la serie** (columna `saldoCantidadDespues` por línea y `saldoActual` del encabezado) es confiable si `estado` es `consistente` o `divergente_reparable`: en ambos casos la serie del Ledger es íntegra (sin huecos, sin inválidos I8/I13) y `saldoActual` = Σ(cantidad) es autoritativo por I4. Para `divergente_reparable`, lo que diverge es el *cache* `stock` del artículo, no la serie. Para `corrupto`, los valores persistidos pueden no cuadrar con el acumulado real (§12). Para `no_migrado`, no hay serie. En todos los casos el contrato entrega `estado` para que la presentación lo señale (§11, §12).
3. Los **textos** (nombre, unidad, autor, motivo) son snapshots; la UI no debe re-resolver el nombre contra el catálogo vivo.
4. La UI **no recibe** ninguna primitiva de escritura desde esta capa.

Este documento define el contrato de datos; **no** define cómo se renderiza.

---

## 11. Manejo de artículos no migrados

Un artículo `no_migrado` (`secuenciaLedger === 0`, `diagnosticarArticulo` → `"no_migrado"`) tiene stock cache (heredado del mecanismo legacy) pero **cero movimientos** en el Ledger (FASE-15 §12; la apertura es *lazy* y la emite el primer escritor que toque el artículo).

Contrato del Kardex para este caso:

- `lineas` es **vacío**. El Kardex **no** fabrica una línea `inventario_inicial` ficticia en lectura: la apertura solo existe cuando un escritor la emite atómicamente (K1, FASE-15 §12 Fase 2).
- `estado` = `"no_migrado"`. `saldoActual` es `null` (no hay Σ(cantidad) del Ledger disponible). El cache `stockCache` viaja en el `DiagnosticoArticulo` para que la presentación pueda distinguir "no migrado, cache = N" de "migrado, saldo = 0".
- `articuloNombre` y `unidad` son `null`: no hay ningún movimiento del que tomar el snapshot. El Principio 5 prohíbe leer el artículo vivo como sustituto; la capa de presentación es responsable de resolver el nombre del artículo si lo necesita (tiene el `articuloId` disponible).
- Es un estado **esperado y legítimo** durante la convivencia, no un error. No dispara ninguna acción del Kardex.

---

## 12. Manejo de artículos corruptos detectados por reconciliación

Un artículo `corrupto` (`diagnosticarArticulo` → `"corrupto"`: huecos de secuencia, movimientos inválidos I13/I8, o pérdida de cola) tiene una serie cuya integridad está rota.

Contrato del Kardex para este caso:

- El Kardex **sí** proyecta las líneas existentes (transparencia: la historia se muestra tal como está; nunca se oculta — I1/I2 implican que ni siquiera un movimiento sospechoso se borra).
- `estado` = `"corrupto"` y el `DiagnosticoArticulo` adjunta `huecos`, `movimientosInvalidos` y `motivoCorrupcion`, ya calculados por el Ledger. El Kardex los expone; no los recalcula.
- El `saldoCantidadDespues` mostrado **puede no cuadrar** con el acumulado real: es honesto exponerlo *junto con* la marca de corrupción, no silenciarlo (K2 + K5).
- El Kardex **jamás repara**. La reparación es competencia de la reconciliación (`repararCacheArticulo`), y solo para `divergente_reparable`; la corrupción del ledger requiere investigación manual (FASE-15 reconciliación, Capa 3). El Kardex solo **señala** y **remite**.
- Para `divergente_reparable` (cache ≠ Σ ledger, pero serie íntegra): la serie y su `saldoActual` derivado del Ledger son confiables; lo que diverge es el cache `stock`. El Kardex reporta ambos para que la divergencia sea visible.

---

## 13. Relación con I1–I13 del Ledger

| Invariante del Ledger | Cómo lo respeta / usa el Kardex |
|---|---|
| I1 Inmutabilidad | El Kardex solo lee; nunca edita un movimiento (K1, K4). |
| I2 Permanencia | El Kardex no borra ni oculta movimientos, ni siquiera los marcados corruptos (§12). |
| I3 Reversión por contramovimiento | Los contramovimientos aparecen como líneas propias; `movimientoRelacionadoId` permite cruzarlos en la proyección. |
| I4 Fuente de verdad única | `saldoActual` = `DiagnosticoArticulo.stockLedger` = Σ(cantidad), que es exactamente la definición de I4. La serie se lee del Ledger, nunca de colecciones de dominio. |
| I5 Co-atomicidad | Irrelevante en lectura; el Kardex nunca abre transacción de escritura. |
| I6 Sin recorte | El Kardex muestra cantidades y saldos negativos sin recortar (K6). |
| I7 Costo capturado en origen | Las columnas `costoUnitario`/`costoTotal` se muestran tal cual; no se reconstruyen (K7). |
| I8 Saldo coherente | La columna saldo es `saldoCantidadDespues`, leída no recalculada (K2). |
| I9 Reconstruibilidad | El estado (`consistente`/`divergente`/etc.) se obtiene de `diagnosticarArticulo` (K5, §11, §12). |
| I10 Idempotencia | Transparente: un reintento no creó duplicados, así que la serie no tiene líneas espurias. |
| I11 Un solo mecanismo | El Kardex no es un mecanismo de variación de stock; es lectura (K1). |
| I12 Monotonía por artículo | Es la clave de orden y de paginación del Kardex (K3, K10). |
| I13 Consistencia interna | `signo`/`clase`/`cantidad`/`tipo` se muestran tal cual; las incoherencias las clasifica el diagnóstico, no el Kardex. |

---

## 14. Compatibilidad con futuros modelos de costeo (FIFO / promedio / último)

El Kardex de PR1 es **neutral al modelo de costeo** y queda compatible sin cambios estructurales:

- Hoy muestra `costoUnitario`/`costoTotal` *capturados* (semántica de "último costo snapshot" según lo que emiten los escritores; verificado en `ventas-service`/`mermas-service`). No declara que eso sea un modelo de costeo (K7).
- La **columna de valor corrido** se habilitará cuando `saldoValorDespues` se materialice (al elegir promedio ponderado) o cuando se compute bajo demanda (último/FIFO) — FASE-15 §7. Esa adición es **aditiva** al `LineaKardex` (un campo más), sin tocar el modelo ni los movimientos ya escritos.
- FIFO: cuando se activen `loteId` y `capasConsumidasDetalle` (reservados), el Kardex podrá proyectarlos como detalle adicional de línea. PR1 los ignora (no los proyecta).
- **Limitación heredada (OBS-3, FASE-15 §7):** cualquier columna de valor que cruce la fecha de apertura del ledger mezclará dos eras. El Kardex hereda esta limitación cuando se añada valor; en PR1 no aplica porque no hay columna de valor.

---

## 15. Compatibilidad con Producción (FASE-17)

- Los tipos `produccion_salida` y `produccion_entrada` están reservados en el catálogo (FASE-15 §3, §8). Cuando FASE-17 los emita, **aparecerán en el Kardex como líneas normales** (clase, cantidad, costo, saldo), sin que el Kardex cambie.
- `movimientoRelacionadoId` ya permite cruzar el par salida↔entrada de una producción dentro de la proyección.
- El Kardex no necesita conocer la semántica de producción: solo proyecta movimientos. Compatibilidad **gratuita**.

---

## 16. Compatibilidad con Reportes futuros

- El Kardex es **un caso particular** de las proyecciones del Ledger (FASE-15 §10: "Kardex = replay por artículo"). Los demás reportes (Movimientos por periodo/espacio, Consumo por tipo, Valorización, Históricos a fecha) son **otras proyecciones de la misma colección única**, con sus propios índices.
- Esos reportes **no comparten el índice del kardex**: requieren `(espacioId, fecha)`, `(tipo, fecha)`, etc. (algunos ya existen en `firestore.indexes.json` para colecciones de dominio, no para `movimientos_inventario`). Crearlos es trabajo de su fase.
- Decisión de alcance (T3): **FASE-19 = solo Kardex por artículo.** Reportes agregados y valorización son fases posteriores e independientes. Compartir la colección no obliga a compartir la fase.

---

## 17. Estrategia de implementación dividida en PRs

Orden elegido para **minimizar riesgo y evitar regresiones**: cada PR es aditivo, de solo-lectura, y no toca escritores, esquema ni índices salvo donde se declara.

| PR | Contenido | Riesgo | Por qué este orden |
|---|---|---|---|
| **PR1 — Capa de lectura del kardex** | `consultarKardexArticulo` + proyección `LineaKardex`/`KardexArticulo` + paginación por `secuenciaArticulo` (asc/desc) + integración de `estado` vía `diagnosticarArticulo`. `OpcionesKardex` incluye `filtros` en la firma pero PR1 lo acepta e ignora (implementado en PR2, sin cambio de interfaz). Sin índices nuevos, sin UI. | 🟢 Nulo: reutiliza índice desplegado; lectura pura; imposible regresión sobre escritores. | Establece el contrato mínimo y estable. Es la base de la que dependen los demás. |
| **PR2 — Filtros en memoria** | Implementación de `FiltrosKardex` (tipo/clase/fecha/secuencia) sobre la **página** devuelta por PR1. El parámetro `filtros` ya existe en `OpcionesKardex` desde PR1 (aceptado e ignorado); PR2 activa su lógica sin cambiar la interfaz. | 🟢 Bajo: refinamiento puro de presentación de datos; no cambia consultas ni índices. | Aislado de PR1: si los filtros tuvieran un defecto, no afectan la lectura base. |
| **PR3 — (Presentación)** | UI/visualización del Kardex. **Fuera de este documento.** | — | Depende del contrato de PR1/PR2 ya cerrado. No mezcla diseño de datos con render. |
| **Fases posteriores — Reportes agregados / Valorización** | Proyecciones por periodo/espacio/tipo, consumo, y columna de valor cuando se elija costeo. **Requieren índices nuevos.** | 🟠 Medio: introducen índices y escala. | Se aíslan al final porque son lo único que toca infraestructura; así el riesgo de índices no contamina el kardex. |

Justificación del orden: el riesgo de regresión crece con (a) escritura, (b) cambios de índice/esquema, (c) escala. PR1 y PR2 tienen cero de los tres. Todo lo que introduce índices o escala (Reportes/Valorización) se empuja al final y se mantiene **fuera** de FASE-19. La presentación se separa del contrato de datos para que un cambio visual nunca obligue a tocar la capa de lectura.

---

## 18. Riesgos y decisiones explícitas

### Riesgos

- 🟢 **Crecimiento del ledger por artículo.** Acotado por los movimientos de *ese* artículo y servido por el índice desplegado; mitigado por paginación obligatoria con tope de página (§8). Mismo razonamiento que FASE-15 §Riesgos.
- 🟠 **Saldo congelado engañoso en artículos corruptos.** `saldoCantidadDespues` puede no cuadrar si la serie está corrupta. Mitigado por K5/§12: el estado viaja siempre con los datos; nunca se presenta saldo sin estado.
- 🟢 **Saldo negativo visible.** Intencional (I6/K6); la lectura lo tolera. Es deuda de presentación, no del contrato.
- 🟠 **Tentación de filtrar/cortar server-side por fecha o tipo.** Multiplicaría índices. Mitigado por la decisión de filtros en memoria (§9, T2) y corte histórico por secuencia (§8, T1).
- 🟢 **Confundir "no migrado" con "saldo cero".** Mitigado por §11: el Kardex reporta el estado y el cache por separado; nunca fabrica apertura en lectura.

### Decisiones explícitas

- **D1.** FASE-19 cubre **solo el Kardex por artículo** (lectura). Reportes agregados y valorización quedan fuera (T3).
- **D2.** **Sin índices nuevos** en PR1: se reutiliza `(articuloTipo, articuloId, secuenciaArticulo)` ya desplegado, válido para asc y desc.
- **D3.** Orden y paginación por `secuenciaArticulo`, nunca por `fecha` (T1, K3, K10).
- **D4.** Filtros **en memoria** sobre la página actual; no son filtros globales de la serie completa ni hay filtros server-side en PR1 (T2, §9).
- **D5.** **Sin columna de valor corrido** (`saldoValorDespues` reservado); las columnas de costo se limitan a `costoUnitario`/`costoTotal` por línea (T4, K7).
- **D6.** **Cero escritura** desde el Kardex: reparación/apertura/emisión son del Ledger/reconciliación (K1, §12).
- **D7.** Reutilizar `diagnosticarArticulo`/`replayLedgerArticulo` para el estado; **no** reimplementar el replay (Principio 6).
- **D8.** `empresaId` no participa en los filtros de lectura (reservado, K9).

---

## Veredicto

> FASE-19 **no añade ninguna pieza estructural**. El Ledger de FASE-15 ya persiste todo lo que el Kardex muestra —orden (`secuenciaArticulo`), saldo congelado (`saldoCantidadDespues`), snapshots de nombre/unidad/autor, trazabilidad y estado de reconciliación— y el índice del kardex ya está desplegado. El Kardex es, literalmente, **leer el Ledger en orden para un artículo**.
>
> El diseño es **estrictamente aditivo y de solo-lectura**: no toca escritores, ni esquema, ni índices, ni el cache. Lo que aún no existe en el Ledger (valor corrido, FIFO, producción, reportes agregados) **no se diseña aquí**; se hereda como compatibilidad futura sin migración. El riesgo de regresión de PR1 es nulo por construcción.
