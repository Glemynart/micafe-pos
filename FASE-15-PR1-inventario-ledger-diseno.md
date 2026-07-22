# FASE-15 PR1 — Diseño del Ledger de Inventario

> Estado: **DISEÑO CERRADO**. Solo arquitectura. No implementa código, componentes, hooks ni servicios.
> Decisiones de negocio fijadas: **multiempresa = solo preparado** (campo reservado, sin multi-tenant funcional);
> **alcance PR1 = solo diseño + plan de migración**.
> Base: auditoría de Inventario y Recetas (stock escalar mutable con 5 escritores, ajustes sin rastro,
> clamp a cero que destruye el consumo real; precedente correcto ya existente = el ledger de tesorería).

---

## 0. Principio rector

**El Ledger de Inventario es la única fuente de verdad de las existencias.** Toda variación de stock —pasada, presente o futura— es un *movimiento* registrado en el ledger. El número de existencias que hoy vive en cada artículo deja de ser autoridad y se convierte en un **acumulado cacheado**, derivable en cualquier momento del ledger.

El proyecto ya practica este patrón con el dinero (saldo de cuenta = acumulado; el ledger de tesorería = verdad). Inventario lo replica para unidades. Es **evolución**, no paradigma nuevo.

---

## 1. Modelo del Ledger

### Entidad: `MovimientoInventario`

Un movimiento es un hecho **inmutable** y **atómico**: describe una variación de existencias de **un** artículo en **un** instante, con su costo y su trazabilidad. Es un registro de solo-anexado (append-only).

#### Campos

**Identidad y aislamiento**
- `id` — identificador opaco del movimiento.
- `empresaId` — **reservado**. Valor `default` en mono-empresa. Presente desde el primer movimiento para no migrar nunca (ver §11, §12).
- `espacioId` — venue/área operativa. Aislamiento actual del sistema.

**Artículo afectado**
- `articuloTipo` — `producto | insumo`. Reservados para el futuro: `semielaborado | terminado` (no fusiona catálogos hoy; ver §8).
- `articuloId` — referencia lógica al artículo.
- `articuloNombre` — *snapshot* del nombre al momento del hecho (el kardex debe leerse aunque el artículo se renombre o se desactive).
- `unidad` — *snapshot* de la unidad del artículo (catálogo canónico reservado: `und | g | kg | ml | l`).

**Naturaleza del movimiento**
- `tipo` — enum del catálogo de §3.
- `clase` — `entrada | salida`. Derivada del tipo; persistida para agregaciones rápidas y validación.
- `signo` — `+1 | −1`. Redundante con el signo de `cantidad`; persistido para validación de integridad.

**Cantidad y costo**
- `cantidad` — variación **con signo**, **sin recorte a cero**. Negativa = salida.
- `costoUnitario` — costo por unidad de **este** movimiento. En entradas: costo de compra/producción real. En salidas: costo al que salió la unidad (snapshot). Es la pieza que habilita cualquier modelo de costeo posterior (§7).
- `costoTotal` — `|cantidad| × costoUnitario`. Para valorización directa sin recomputar.

**Saldo (soporte de Kardex)**
- `saldoCantidadDespues` — *snapshot* del acumulado de existencias del artículo **después** de aplicar este movimiento. Es la columna "Saldo" del kardex línea-a-línea, sin recálculo.
- `saldoValorDespues` — **reservado** hasta elegir modelo de costeo (§7). No se calcula en PR1.

**Trazabilidad**
- `referenciaColeccion` / `referenciaId` — documento de dominio que originó el movimiento (venta, compra, merma, producción, ajuste). Permite recorrer de un hecho de negocio a sus movimientos y viceversa.
- `movimientoRelacionadoId` — enlaza pares y reversiones: contramovimiento ↔ original, salida ↔ entrada de un traslado, consumo ↔ producción.
- `loteId` — **reservado** para costeo FIFO. En movimientos de *entrada*, identifica la capa de costo que constituye esa entrada. No se usa en PR1.
- `capasConsumidasDetalle` — **reservado** para costeo FIFO. En movimientos de *salida*, registra el desglose de capas consumidas: lista de `{ loteId, cantidad, costoUnitario }`. Es necesario porque una salida FIFO puede consumir porciones de múltiples capas a distintos costos; el campo escalar `costoUnitario` no puede representar ese desglose. Sin este campo, activar FIFO en el futuro requeriría un cambio estructural del movimiento de salida. No se usa en PR1.

**Auditoría y orden**
- `usuarioId` / `usuarioNombre` — autor del hecho (snapshot del nombre).
- `fecha` — instante de ocurrencia.
- `secuenciaArticulo` — ordinal **monotónico por artículo**. Garantiza orden determinista del kardex aun con `fecha` empatada, y permite **detección de huecos** (un salto en la secuencia delata un movimiento perdido). El contador vive en el documento del artículo y se incrementa **dentro de la misma operación atómica** que verifica idempotencia, escribe el movimiento y actualiza el cache; esto garantiza monotonía sin huecos bajo concurrencia (I12).
- `claveIdempotencia` — huella compuesta del movimiento específico (ver §1 Claves para la composición). La verificación de unicidad ocurre **dentro de la misma operación atómica** que escribiría el movimiento; una verificación previa fuera de ella no protege bajo concurrencia. Un reintento bloqueado por esta verificación no consume número de secuencia (I10).
- `motivo` — texto libre opcional (ajustes, mermas).

#### Claves

- **Primaria:** `id`.
- **Clave de orden (kardex):** `(articuloTipo, articuloId, secuenciaArticulo)` — orden total y determinista por artículo. El prefijo `articuloTipo` es necesario porque `producto` e `insumo` son catálogos con espacios de ids independientes; sin él, una coincidencia de id entre tipos interleave dos kardex distintos.
- **Clave de idempotencia:** `claveIdempotencia` — única por movimiento específico. Su composición mínima es `tipo + documentoOrigenId + articuloId + lineaOrdinal`. El campo `tipo` es necesario porque un mismo documento puede originar movimientos de tipos distintos sobre el mismo artículo (p. ej. una anulación que emite `devolucion_venta` referenciando la misma venta original). El `lineaOrdinal` discrimina múltiples líneas del mismo artículo dentro del mismo documento (p. ej. una compra con dos líneas del mismo insumo).
- **Clave de trazabilidad:** `(referenciaColeccion, referenciaId)` — agrupa todos los movimientos de un mismo documento de negocio.

#### Índices (lógicos, por caso de uso)

| Caso de uso | Índice lógico |
|---|---|
| Kardex de un artículo | `(articuloTipo, articuloId)` + orden `secuenciaArticulo` |
| Movimientos por periodo y espacio | `espacioId` + `fecha` |
| Reporte por tipo (compras, mermas, consumo) | `tipo` + `fecha` |
| Trazar un documento → sus movimientos | `referenciaColeccion` + `referenciaId` |
| Multiempresa (futuro) | `empresaId` + cualquiera de los anteriores (reservado) |

#### Relaciones

- **Movimiento → Artículo** (`producto`/`insumo`): por referencia lógica, no relación dura. No fusiona catálogos.
- **Movimiento → Documento de origen**: por `referencia*`. Un documento (p. ej. una compra de 3 líneas) genera N movimientos.
- **Movimiento ↔ Movimiento**: por `movimientoRelacionadoId` (reversiones, pares de traslado, pares de producción).
- **Artículo → Stock cache**: 1:1 derivada (§5).

---

## 2. Invariantes del sistema

- **I1 — Inmutabilidad.** Un movimiento, una vez escrito, **nunca se edita**.
- **I2 — Permanencia.** Un movimiento **nunca se elimina**.
- **I3 — Reversión por contramovimiento.** Toda corrección, anulación o devolución se expresa como un **nuevo** movimiento que compensa al original, enlazado por `movimientoRelacionadoId`. Jamás se altera el original.
- **I4 — Fuente de verdad única.** El stock **nunca** se calcula desde ventas, compras ni mermas por separado. Solo desde el ledger.
- **I5 — Co-atomicidad.** Anexar el movimiento y actualizar el stock cache ocurren en **una sola operación atómica** o no ocurren. Nunca uno sin el otro.
- **I6 — Sin recorte.** La `cantidad` registra el delta **real**, aun si el stock resultante queda negativo. Está prohibido aplastar a cero (la sobreventa debe ser visible y auditable, no borrada).
- **I7 — Costo capturado en origen.** Toda **entrada** registra su `costoUnitario` real en el momento del hecho. El costo nunca se reconstruye a posteriori.
- **I8 — Saldo coherente.** `saldoCantidadDespues` se calcula **dentro** de la operación atómica que lee el saldo previo; nunca se precalcula fuera de ella.
- **I9 — Reconstruibilidad.** Para todo artículo, una vez completada la migración (§12 Fase 4 activada): `stock cache == Σ(cantidad de sus movimientos)`. Si la igualdad se rompe, el cache es lo incorrecto y se regenera desde el ledger. **Durante la migración (Fases 0–3) este invariante está explícitamente suspendido**: los escritores no conmutados aún actualizan el cache sin emitir movimiento, por lo que la divergencia es esperada y no es señal de error. La reconciliación es de solo-lectura (reporte) hasta que I9 se reactive en Fase 4.
- **I10 — Idempotencia de origen.** Un mismo hecho de negocio, reintentado, no produce movimientos duplicados. La garantía es arquitectónica: la verificación de `claveIdempotencia` ocurre **dentro de la misma operación atómica** que escribiría el movimiento y que incrementaría la secuencia. Si ya existe un movimiento con esa clave, la operación retorna el movimiento existente sin escribir y sin consumir número de secuencia.
- **I11 — Un solo mecanismo.** Existe exactamente **un** camino para variar existencias: emitir un movimiento. Cualquier mutación directa de stock por fuera del ledger está prohibida (incluido el camino de escritorio legacy).
- **I12 — Monotonía por artículo.** `secuenciaArticulo` es estrictamente creciente y sin huecos por artículo. La garantía es arquitectónica: el contador reside en el documento del artículo y se asigna en la misma operación atómica que I10, el movimiento y el cache. Un reintento bloqueado por I10 no obtiene número de secuencia; un hueco en la secuencia sí es señal de pérdida y dispara reconciliación.
- **I13 — Consistencia interna del movimiento.** Para todo movimiento: `sign(cantidad) == signo`, `clase == 'entrada'` si y solo si `signo == +1`, y `clase == 'salida'` si y solo si `signo == −1`. Los tres valores son derivables del `tipo` según el catálogo de §3. Ningún escritor puede publicar un movimiento con estos cuatro campos incoherentes entre sí.

---

## 3. Catálogo de tipos de movimiento

Cada tipo declara su `clase` y si forma **par** con otro. Justificación incluida.

### Implementados conceptualmente en el alcance de FASE-15

| Tipo | Clase | Par | Justificación |
|---|---|---|---|
| `inventario_inicial` | entrada | — | Punto de partida del ledger por artículo. Sin él no hay saldo base ni reconstrucción posible (§12). |
| `compra` | entrada | — | Ingreso por adquisición a proveedor. Lleva el costo real → alimenta el costeo. |
| `venta` | salida | — | Egreso por venta de un artículo simple (sin receta). |
| `consumo_receta` | salida | — | Egreso de insumos al venderse un producto con receta. Separado de `venta` porque afecta a otro artículo (insumo) y debe distinguirse en reportes de consumo. |
| `ajuste_positivo` | entrada | — | Corrección al alza por conteo físico/ingreso manual. Hoy ocurre **sin rastro**; el ledger lo formaliza. |
| `ajuste_negativo` | salida | — | Corrección a la baja por conteo físico. |
| `merma` | salida | — | Pérdida (caducidad, daño). Debe ser polimórfica: insumo **o** producto (hoy solo cubre insumos). |
| `devolucion_compra` | salida | — | El negocio devuelve mercancía a un proveedor. Es un hecho real distinto de anular un registro. |
| `devolucion_venta` | entrada | — | El cliente devuelve un artículo vendido y reingresa al stock. |

### Reservados (en el catálogo, fuera del alcance de FASE-15)

| Tipo | Clase | Par | Fase |
|---|---|---|---|
| `produccion_salida` | salida | ↔ `produccion_entrada` | FASE-17 — consume insumos/semielaborados |
| `produccion_entrada` | entrada | ↔ `produccion_salida` | FASE-17 — genera el terminado |
| `traslado_salida` | salida | ↔ `traslado_entrada` | Futuro — mueve existencias entre espacios/bodegas |
| `traslado_entrada` | entrada | ↔ `traslado_salida` | Futuro |

### Nota arquitectónica sobre "anulación"

**La anulación NO es un tipo de movimiento.** Es una *operación* que emite los contramovimientos correspondientes a los movimientos del hecho anulado (una venta anulada genera `devolucion_venta` equivalentes a sus `venta`/`consumo_receta`). Modelarla como tipo propio rompería el invariante I3 y duplicaría semántica. Lo mismo aplica a "eliminar una compra": emite `devolucion_compra`. Esta distinción mantiene el catálogo mínimo y auditable.

---

## 4. Flujo de escritura

### Quién escribe

El **dueño del hecho de negocio** escribe el movimiento: la operación de venta, de compra, de merma, de producción o de ajuste. No existe un "servicio de stock" que mute existencias por su cuenta; el stock solo cambia como **consecuencia** de un hecho registrado.

### Orden dentro de la operación atómica

1. **Leer** el artículo: saldo cache actual y contador de secuencia.
2. **Verificar idempotencia** (I10): buscar si ya existe un movimiento con la misma `claveIdempotencia`. Si existe, retornar ese movimiento y **detener aquí** — sin escribir nada, sin consumir secuencia.
3. **Calcular** el delta, el nuevo saldo y el siguiente número de secuencia.
4. **Anexar** el movimiento (con `saldoCantidadDespues`, `costoUnitario`, `secuenciaArticulo`, `claveIdempotencia`, `signo`, `clase` coherentes con `tipo` — I13).
5. **Actualizar** el artículo: nuevo saldo cache y nuevo contador de secuencia.

Los pasos 4 y 5 son **co-atómicos** (I5): ambos se confirman juntos o ninguno. El paso 2 **debe ocurrir dentro de la misma operación atómica** que los pasos 4 y 5; verificar idempotencia fuera de ella no protege ante concurrencia.

### Qué nunca debe ocurrir

- Actualizar el stock cache **sin** anexar movimiento.
- Anexar movimiento **sin** actualizar el cache.
- Recortar la cantidad a cero (I6).
- Variar existencias desde la interfaz o desde un mecanismo paralelo (I11).
- Precalcular `saldoCantidadDespues` fuera de la operación atómica (I8).
- Verificar `claveIdempotencia` fuera de la operación atómica (permite duplicados bajo carrera).
- Consumir número de secuencia en un reintento bloqueado por idempotencia (I12).
- Publicar un movimiento con `tipo`, `clase`, `signo` y `sign(cantidad)` incoherentes entre sí (I13).

---

## 5. Stock: definición formal

- **Fuente de verdad:** el ledger. El saldo de un artículo **es**, por definición, la suma de las cantidades de sus movimientos desde `inventario_inicial`.
- **Cache:** el número de existencias almacenado en el artículo. Su única razón de existir es la lectura barata y en tiempo real (listados del POS, alertas de stock bajo). No tiene autoridad.
- **Sincronización:** el cache se actualiza **en la misma operación atómica** que anexa el movimiento (I5). Nunca por un proceso aparte ni diferido.
- **Reconstrucción:** ante cualquier sospecha de divergencia, el cache se **regenera** sumando los movimientos del artículo (I9). Un proceso de **reconciliación** periódico compara cache contra suma del ledger y reporta discrepancias; el ledger siempre gana. **Esta afirmación aplica únicamente una vez completada la migración (Fase 4); durante las Fases 0–3 I9 está suspendido y la reconciliación es de solo-lectura — ver I9 y §12.**

---

## 6. Kardex

El Kardex es una **proyección de solo-lectura** del ledger. **No almacena nada propio**; no duplica datos.

- Se obtiene filtrando el ledger por `(articuloTipo, articuloId)` y ordenando por `secuenciaArticulo`.
- Columnas, todas ya presentes en cada movimiento: fecha, tipo, entrada/salida (`clase`), cantidad, costo unitario, costo total, **saldo de cantidad** (`saldoCantidadDespues`), referencia al documento de origen, autor.
- El saldo corrido **no se recalcula al consultar**: ya quedó congelado por movimiento (I8). Esto hace el kardex consultable a cualquier fecha sin reprocesar la historia.
- La columna de **valor** del kardex queda disponible cuando se elija modelo de costeo (`saldoValorDespues`, reservado).

---

## 7. Costos: substrato preparado, modelo no elegido

El ledger captura el costo **por movimiento** (I7). Esa es la materia prima común de los tres modelos; ninguno queda excluido y ninguno exige migración cuando se decida:

- **Último costo:** es el `costoUnitario` de la `compra`/entrada más reciente del artículo. Lectura directa del ledger.
- **Costo promedio ponderado:** se deriva del valor y la cantidad acumulados; puede materializarse en `saldoValorDespues` (reservado) recalculándolo en cada entrada, o computarse bajo demanda desde el ledger.
- **FIFO:** cada entrada registra su `loteId` (reservado), constituyendo una capa de costo. Sin embargo, una salida FIFO puede consumir porciones de múltiples capas a distintos costos; el campo escalar `costoUnitario` no puede representar ese desglose. Por ello se reserva `capasConsumidasDetalle` en las salidas (§1). Con `loteId` en entradas y `capasConsumidasDetalle` en salidas presentes desde el primer movimiento, activar FIFO **no altera los movimientos ya escritos**. Sin `capasConsumidasDetalle`, la activación de FIFO habría requerido un cambio estructural de las salidas.

**Decisión de PR1:** no se elige modelo. Los tres son adoptables hacia adelante sin migración. **Ningún modelo es retroactivo**: los movimientos anteriores a la adopción del modelo conservan el costo escalar con que fueron escritos; los cálculos se aplican desde la fecha de activación en adelante. Esto incluye los movimientos emitidos durante la migración del ledger.

**Limitación aceptada (OBS-3):** los reportes de costeo/valorización que crucen la fecha de apertura del ledger mezclan dos eras: antes de la apertura, el costo se obtiene del costo escalar del artículo (sin historial de compras por movimiento); después, del ledger. Esta discontinuidad es inevitable dado que no se hace backfill histórico (§12). Se documenta como limitación conocida y no como defecto.

---

## 8. Producción (convivencia futura, FASE-17)

Materia prima → producción → producto terminado se modela como **un par de movimientos co-atómicos** bajo un mismo hecho de producción:

- `produccion_salida` — descuenta los insumos/semielaborados consumidos (según la receta), a su costo.
- `produccion_entrada` — incrementa el stock del **artículo terminado**, con `costoUnitario = Σ(costo consumido) ÷ rendimiento`.

Ambos enlazados por `movimientoRelacionadoId` y por la `referencia` al documento de producción.

Consecuencias arquitectónicas:
- El terminado pasa a tener **existencias propias**, producidas por anticipado, y se vende después como artículo simple (`venta`), **sin tocar el motor de ventas**.
- Resuelve la ambigüedad actual (un producto con receta agota insumos al vender y nunca acumula stock propio): producción y venta quedan separadas en el tiempo.
- Requiere la extensión aditiva de receta (rendimiento; ingrediente que pueda ser producto), prevista para FASE-16/17. El ledger ya la soporta sin cambios.

---

## 9. Compras (convivencia futura)

- Una compra emite un movimiento `compra` (entrada) **por línea**, cada uno con su `costoUnitario` real → es la vía por la que el costeo se alimenta de la realidad (§7).
- Una compra puede afectar insumos y/o productos; el ledger es polimórfico por `articuloTipo`.
- Revertir una compra (eliminar el registro) emite `devolucion_compra` (contramovimientos), nunca borra los `compra` originales (I2, I3).

---

## 10. Reportes

Todos son **proyecciones sobre el único ledger**, sin duplicar datos:

| Reporte | Cómo se obtiene del ledger |
|---|---|
| **Movimientos** | Filtro por espacio/fecha/tipo. |
| **Kardex** | Replay por artículo (§6). |
| **Valorización** | Σ de existencias × costo (o `saldoValorDespues` cuando se elija costeo). |
| **Históricos** | Cualquier corte de fecha: el saldo a una fecha es el `saldoCantidadDespues` del último movimiento ≤ esa fecha. |
| **Consumo** | Σ de salidas (`venta`, `consumo_receta`, `merma`, `produccion_salida`) por periodo/tipo. |

El histórico previo a la apertura del ledger sigue consultable en sus colecciones de dominio originales; el ledger es la verdad **hacia adelante**.

---

## 11. Compatibilidad (no se rehace nada)

| Subsistema | Impacto | Por qué no se rehace |
|---|---|---|
| **Inventario** | El campo de existencias deja de ser autoridad y pasa a ser cache. El catálogo de artículos no cambia. | Cambio semántico, no estructural: el dato sigue donde está. |
| **Recetas** | El consumo de insumos se expresa como `consumo_receta`. La estructura de receta no cambia en PR1. | Las extensiones (rendimiento, ingrediente=producto) son aditivas y posteriores. |
| **Ventas** | La operación de venta añade la emisión de movimientos y elimina el recorte a cero. El documento de venta no cambia. | El snapshot de costo por ítem ya existente se conserva. |
| **POS** | Sin cambios: sigue leyendo el stock cache como hoy. | El cache mantiene su contrato de lectura. |
| **Cocina** | Sin cambios: está desacoplada del inventario. | Nunca tocó existencias. |

**Conclusión:** el diseño es **aditivo**. Ningún subsistema requiere reescritura; los escritores existentes ganan una responsabilidad (emitir el movimiento) sin perder las que ya tienen.

---

## 12. Plan de migración (sin detener el sistema, sin perder datos)

**Estrategia: apertura lazy garantizada por el escritor + conmutación de escritores uno a uno + reconciliación diferida hasta completar. Fase 1 (pre-apertura) es una optimización operacional sujeta a restricción de ventana temporal (ver más adelante).**

### Problema central y cómo se resuelve

Un snapshot global de stock (apertura) seguido de conmutación posterior de escritores crea una **ventana de divergencia permanente**: cualquier movimiento ocurrido entre el snapshot y la conmutación actualiza el cache sin emitir movimiento, y cuando I9 se activa, la reconciliación que "el ledger gana" fijaría el cache en el valor de apertura —borrando esos movimientos. La solución es que el `inventario_inicial` de cada artículo sea emitido **de forma co-atómica con la primera escritura real de ese artículo por su escritor conmutado**. No puede existir ventana entre apertura y primer movimiento real porque ambos son el mismo momento.

### Suspensión de I9 durante la migración

I9 (`cache == Σ movimientos`) está **explícitamente suspendido desde Fase 0 hasta el final de Fase 3**. Durante este período, la divergencia entre cache y Σ(ledger) es esperada: escritores no conmutados siguen actualizando el cache sin emitir movimiento. La reconciliación en este período es de **solo-lectura** (detecta y reporta; nunca sobrescribe el cache ni inserta movimientos correctivos). I9 se reactiva al inicio de Fase 4, una vez que todos los escritores están conmutados y el mecanismo paralelo está cerrado.

### Fases

**Fase 0 — Modelo presente, inerte.** Se introduce la estructura del ledger y el catálogo de tipos. Ningún escritor lo usa aún. El sistema opera idéntico. Riesgo nulo. La reconciliación, si existe, opera en modo solo-lectura.

**Fase 1 — Pre-apertura (optimización operacional con restricción de ventana).** Un proceso idempotente emite `inventario_inicial` para todos los artículos activos, capturando el stock y costo del momento. Reduce el trabajo del mecanismo lazy de Fase 2, pero introduce un riesgo si existe un intervalo significativo antes de que los escritores se conmuten: los movimientos ocurridos entre Fase 1 y la conmutación de cada escritor actualizan el cache sin emitir movimiento; cuando Fase 4 activa la reconciliación autoritativa, la divergencia residual haría que "el ledger gana" produjera valores de cache incorrectos.

**Restricción operacional obligatoria:** Fase 1 solo puede ejecutarse en el mismo ciclo de despliegue que la conmutación de **todos** los escritores de Fase 2 — con un intervalo máximo de minutos entre ambas acciones (mismo deployment, misma ventana operacional). Si existe cualquier ventana significativa entre Fase 1 y Fase 2 (horas, días), **Fase 1 debe omitirse completamente** y el sistema confiar únicamente en la apertura lazy de Fase 2, que es la garantía arquitectónica real. La garantía "sin ventana de divergencia permanente" solo aplica bajo esta restricción o cuando Fase 1 se omite.

**Fase 2 — Conmutación de escritores, uno a uno.** Cada escritor (ventas, compras, mermas, ajustes) se actualiza de forma independiente. **Regla crítica de cada escritor conmutado:** como primer paso dentro de su operación atómica, antes de emitir el movimiento real, verifica si existe `inventario_inicial` para el artículo afectado; si no existe, lo emite en ese mismo momento atómico con el stock cache leído en ese instante. De esta forma, el `inventario_inicial` de cada artículo se crea **en la misma operación atómica** que su primer movimiento real: no puede haber ventana entre ambos. Una vez conmutado un escritor, los artículos que toca quedan bajo I9 de forma continua desde ese primer movimiento.

**Fase 3 — Cierre del mecanismo paralelo.** Se retira el camino legacy (escritorio Electron) que mutaba existencias por fuera del ledger. A partir de aquí, I11 aplica sin excepción. Todos los escritores están conmutados.

**Fase 4 — Activación de reconciliación.** Con todos los escritores conmutados y el mecanismo paralelo cerrado, I9 se reactiva. La reconciliación pasa de solo-lectura a **autoritativa**: cualquier divergencia detectada a partir de este punto es un defecto en un escritor conmutado, no un artefacto de migración, y el cache se regenera desde el ledger. El historial pre-ledger (colecciones `ventas`, `compras`, `mermas` anteriores a la apertura) permanece intacto en sus colecciones de dominio; el ledger es la verdad desde la apertura en adelante.

### Propiedades garantizadas

- **Sin pérdida de stock durante la migración:** el cache es siempre la fuente de lectura del POS; los escritores siguen actualizándolo como antes. El ledger crece en paralelo sin afectar la operación.
- **Sin ventana de divergencia permanente:** el `inventario_inicial` de cada artículo se emite co-atómicamente con su primer movimiento real por el escritor conmutado (apertura lazy de Fase 2). Esta garantía se mantiene siempre, independientemente de si Fase 1 se ejecutó o no. Si Fase 1 se ejecuta, aplica únicamente bajo la restricción operacional declarada en esa fase; fuera de esa restricción, Fase 1 debe omitirse.
- **La reconciliación nunca destruye movimientos reales:** es de solo-lectura hasta Fase 4. Después de Fase 4, si detecta divergencia, regenera el cache (no el ledger), y el ledger es inmutable (I1/I2).
- **Sin downtime:** todas las fases son aditivas o conmutaciones locales independientes entre sí.
- **Sin pérdida del historial:** nada se borra; la historia previa sobrevive en sus colecciones de dominio.
- **Reversible por escritor:** revertir la conmutación de un escritor individual no corrompe el stock (el cache sigue siendo correcto; los movimientos ya emitidos son inmutables y correctos).
- **Sin migración futura por multiempresa:** `empresaId = "default"` se puebla desde la apertura de cada artículo; activar multi-tenant no toca el ledger.

### Alcance del campo `empresaId` en el ledger (OBS-4)

La preparación de `empresaId` es **scoped exclusivamente al ledger**. Los catálogos de artículos (`productos`, `insumos`), las cuentas bancarias con ids fijos (`caja-principal`, `bancolombia`), el consecutivo de ventas y el documento `configuracion/general` son colecciones mono-empresa que **no forman parte del ledger** y quedan fuera del alcance de este PR. Su aislamiento por empresa, cuando sea necesario, es una tarea independiente que no requiere migrar el ledger.

---

## Riesgos

- 🔴 **Reintentos duplicando movimientos.** Mitigado por `claveIdempotencia` (I10). Es el riesgo más serio: sin idempotencia, un reintento de venta duplicaría el descuento.
- 🟠 **Concurrencia sobre un artículo "caliente".** La co-atomicidad serializa las escrituras (correcto), pero puede generar contención. Aceptable en PR1; optimización (p. ej. partición de saldo) queda fuera de alcance.
- 🟠 **Stock negativo ahora visible.** Es intencional (I6), pero la lectura debe tolerarlo sin romperse. Es deuda de presentación, no de modelo.
- 🟢 **`saldoCantidadDespues` bajo concurrencia.** Resuelto por I8 (se calcula dentro de la operación atómica).
- 🟢 **Crecimiento del ledger.** Append-only crece sin techo; con índices por artículo/fecha el costo de consulta se mantiene acotado. Archivado/compactación es problema de años, no de PR1.
- 🟢 **Campos reservados sin uso.** Coste despreciable; evitan migraciones de esquema futuras.

---

## Compatibilidad con fases futuras (síntesis)

| Fase | Habilitada por |
|---|---|
| FASE-16 Recetas | `consumo_receta` ya modelado; extensión de receta aditiva |
| FASE-17 Producción | par `produccion_salida`/`produccion_entrada` reservado |
| FASE-18 Compras-costeo | `compra` con `costoUnitario`; `loteId` reservado para FIFO |
| FASE-19 Reportes/Kardex | proyecciones sobre el ledger único |
| Multiempresa | `empresaId` poblado desde la apertura |

---

## Veredicto

> El diseño introduce **una sola pieza estructural nueva** —el Ledger de Inventario como fuente de verdad— y degrada el stock a cache derivado, replicando el patrón ya probado del ledger de tesorería. Con ello quedan habilitados, **sin migraciones posteriores**, Kardex, Costeo (en cualquiera de sus tres modelos), Producción, Compras valorizadas y Reportes históricos.
>
> El diseño es **estrictamente aditivo**: Inventario, Recetas, Ventas, POS y Cocina **no se rehacen**; los escritores existentes solo ganan la responsabilidad de emitir el movimiento y dejar de recortar a cero.
>
> Los invariantes I1–I13 constituyen el contrato de integridad: inmutabilidad, reversión por contramovimiento, fuente de verdad única, co-atomicidad, no-recorte, idempotencia garantizada por mecanismo (no solo por campo), monotonía de secuencia garantizada por mecanismo, y consistencia interna del movimiento.
>
> El plan de migración garantiza que no existe ventana de divergencia permanente: el `inventario_inicial` de cada artículo se emite co-atómicamente con su primer movimiento real, eliminando la posibilidad de que la reconciliación destruya movimientos ocurridos durante la transición. I9 está explícitamente suspendido durante la migración y la reconciliación es solo-lectura hasta que todos los escritores estén conmutados.
>
> **Listo para pasar a diseño de implementación por PRs** (pre-apertura → conmutación de escritores con apertura garantizada por escritor → cierre del mecanismo paralelo → activación de reconciliación autoritativa).
