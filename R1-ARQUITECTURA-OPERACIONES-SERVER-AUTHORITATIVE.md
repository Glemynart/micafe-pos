# R1 — Arquitectura de Operaciones Críticas Server-Authoritative

> **Estado:** DISEÑO PROPUESTO — solo arquitectura. No implementa ni autoriza código, Rules, migraciones ejecutables ni PR.
>
> **Alcance:** autoridad de escritura para turnos, caja, cuentas, ledger financiero, ledger de inventario, efectos de ventas, anulaciones, compras, ajustes, **traslados financieros entre cuentas**, producción y devoluciones. El traslado de inventario entre ubicaciones no forma parte de R1.
>
> **Precondición:** arquitectura SaaS vigente; B1 de configuración empresarial canónica; B2 Fiscal Core y `snapshotFiscal`; y el cutover operativo B7 con su backfill de `estadoOperativo`, ya certificados conforme a sus autoridades. Estos nombres no se refieren al documento conceptual `MT-U10-B6-B7-cierre-arquitectonico.md`.

---

## 1. Autoridad y propósito

Este documento define la arquitectura de ejecución de R1 para que las operaciones críticas del negocio sean **server-authoritative**. Su propósito es eliminar la posibilidad de que un cliente autenticado cree o modifique directamente hechos de caja, inventario, turnos o efectos de venta fuera de las invariantes del dominio.

La jerarquía aplicable es:

1. ADR SaaS aceptados, en especial `ADR-SAAS-001` a `ADR-SAAS-010`.
2. `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`.
3. Arquitectura MT-U3, MT-U9 y MT-U10-B0 a B7.
4. `MASTER-SECURITY-PLAN.md`.
5. Este diseño R1.

Ante contradicción, R1 no altera la autoridad superior. En particular, B7 no diseña APIs, Rules ni mecanismos operativos; R1 los define sin reinterpretar límites comerciales, lifecycle, fiscalidad, snapshots ni ledger histórico.

### 1.1 Relación y supersesión acotada de ADR-SAAS-010

Al aprobarse R1, este documento supersede **únicamente** dos mecanismos de `ADR-SAAS-010-integracion-fiscal-inventario.md`:

1. el ejecutor de las transiciones operativas de Fase 2, incluidas las dos rutas de anulación: la intención ya no la ejecuta el Cliente POS ni un worker con ruta propia; la ejecuta la Callable R1 o un proceso servidor que invoca el mismo ejecutor interno;
2. el contrato de escrituras cliente de la sección 6 de ADR-SAAS-010, reemplazado por la matriz exhaustiva de Rules de la sección 7 de R1.

No supersede estados, OPE-01 a OPE-09, Fase 1/B2, `snapshotFiscal`, transiciones, semántica de compensaciones, consultas de cutover B7 ni el aislamiento tenant. El cliente conserva la facultad de solicitar una intención, nunca de ejecutar la transición crítica.

### 1.2 Terminología de compatibilidad

- **B1**: configuración empresarial SaaS canónica; no es una autoridad de saldo, stock o hechos operativos.
- **B2**: Fiscal Core, numeración, consecutivo, emisión y `snapshotFiscal`, conforme a los ADR fiscales aplicables.
- **B7**: cutover operativo y certificación de `estadoOperativo` del programa SaaS. `MT-U10-B6-B7-cierre-arquitectonico.md` solo documenta límites conceptuales y no otorga autoridad runtime.

## 2. Decisión

La autoridad de negocio de toda operación crítica reside en **Cloud Functions Callable** y sus transacciones Admin SDK. El cliente conserva su UX actual y solo solicita comandos; no escribe directamente los documentos críticos.

```text
POS / Backoffice existente
        |
        v
Servicio cliente con misma intención de UX
        |
        v
Callable R1 autenticada
        |
        +--> resuelve actor, tenant, membresía y lifecycle
        +--> valida el comando y lee fuentes de verdad
        +--> ejecuta una transacción Admin SDK
        +--> escribe hechos, proyecciones y auditoría
        +--> persiste recibo idempotente
```

### 2.1 Alternativas evaluadas

| Alternativa | Decisión | Motivo |
|---|---|---|
| Reglas de campo + transacciones cliente | Rechazada | Las Rules no pueden comprobar de forma completa la relación entre turno, saldo, movimiento, stock, secuencia y venta. |
| Callables + transacciones Admin SDK por comando | **Seleccionada** | Conserva Firebase, el modelo actual y la UX; permite validar y confirmar todos los efectos de forma atómica. |
| Microservicio nuevo, cola externa o event sourcing completo | Rechazada | Aumenta operación, latencia y riesgo sin ser necesario para el piloto ni para los invariantes aprobados. |

### 2.2 No objetivos

R1 no:

- rediseña entidades, roles, membresías, claims, lifecycle, planes ni suscripciones;
- modifica la configuración B1, numeración B2 ni el `snapshotFiscal`;
- reemplaza los ledgers existentes por un modelo contable nuevo;
- introduce una UX, panel o flujo comercial nuevo;
- cambia el significado de compras, mermas, producción, traslados o devoluciones.

## 3. Invariantes de compatibilidad

| Identificador | Invariante |
|---|---|
| R1-I01 | La Empresa sigue siendo la frontera de aislamiento. El tenant y el actor se derivan de la sesión autenticada, nunca del payload. |
| R1-I02 | `Empresa.estado` sigue siendo la autoridad de escritura: solo `trial` y `activa` admiten operaciones. |
| R1-I03 | `snapshotFiscal`, consecutivo, numeración y la creación de una venta fiscal siguen siendo autoridad de B2/`confirmarVentaFiscalCallable`. |
| R1-I04 | Las transiciones y estados de ADR-SAAS-010 se conservan sin cambios: `PENDIENTE_EFECTOS`, `COMPLETO`, `ANULADA_SIN_EFECTOS` y `ANULADA_CON_EFECTOS`. |
| R1-I05 | La Fase 2 de venta conserva OPE-02, OPE-04, OPE-06 y OPE-08: efectos únicos, co-atómicos, desde el estado correcto y terminales. |
| R1-I06 | Todo movimiento de inventario es append-only, tiene clave idempotente y actualiza stock/secuencia en la misma transacción. |
| R1-I07 | Todo cambio de saldo financiero tiene uno o más movimientos financieros asociados en la misma transacción. |
| R1-I08 | Un turno cerrado no se reabre ni se modifica. Los ajustes posteriores son compensatorios y auditables. |
| R1-I09 | Una corrección nunca edita o borra un hecho financiero, un movimiento de inventario, un snapshot fiscal o una venta histórica. |
| R1-I10 | Un reintento con la misma clave devuelve el mismo resultado y no duplica efectos. |
| R1-I11 | La migración de inventario respeta la secuencia y gates de `FASE-15-PR1-inventario-ledger-diseno.md` §12; el ledger no se vuelve fuente autoritativa por R1 antes de cumplirlos. |

## 4. Frontera técnica de operaciones

### 4.1 Envelope común

Toda Callable R1 recibe:

| Campo | Regla |
|---|---|
| `commandId` | Identificador único de intención; no puede reutilizarse con otro payload. |
| `idempotencyKey` | Clave estable durante reintentos de la misma intención. |
| `correlationId` | Identifica la cadena de operación para soporte y auditoría. |
| `causationId` | Opcional; identifica el hecho que originó el comando. |
| `motivo` | Obligatorio cuando el tipo de operación pueda alterar caja o inventario por ajuste/corrección. |
| `payload` | Solo datos de intención necesarios para el caso de uso. Nunca contiene autoridad. |

El servidor obtiene `empresaId`, `actorUid`, rol efectivo, membresía, estado de empresa, cuenta, turno, venta, artículo, receta, documento origen y cálculos derivados desde fuentes canónicas.

### 4.2 Recibo de comando e identidad doble

Se reserva un recibo canónico backend-only y un índice interno backend-only:

```text
operaciones_comandos/{empresaId}_{commandId}
operaciones_command_idempotency/{empresaId}_{idempotencyKey} -> recibo canónico
```

Su único propósito es identidad e idempotencia durable. Ambos documentos contienen `empresaId`, `commandId`, `idempotencyKey`, huella semántica del envelope, comando, actor, resultado, referencias afectadas y fecha; el índice solo apunta al recibo canónico. `empresaId` es inmutable y coincide con el tenant resuelto por servidor. No reemplazan `fiscal_comandos` ni `configuracion_command_ids`, que permanecen para B1/B2.

La transacción lee y escribe recibo e índice junto con efectos y auditoría. La misma dupla y huella devuelve el resultado original. La existencia de uno de los dos identificadores con otra dupla o huella produce `COMMAND_ID_CONFLICT` o `IDEMPOTENCY_CONFLICT`, nunca una segunda operación.

### 4.3 Transacción servidor

Cada comando sigue esta secuencia:

1. Autenticar la llamada y resolver contexto tenant.
2. Validar permisos y lifecycle antes y dentro de la transacción.
3. Leer recibo idempotente y todas las fuentes de verdad antes de escribir.
4. Comprobar estado previo, referencias, montos, cantidades, secuencias y límites propios del comando.
5. Escribir hechos inmutables, proyecciones derivadas, recibo y auditoría en un único commit.
6. Devolver resultado estable y referencias creadas.

Antes de abrir el commit, el servidor calcula el plan de lecturas y escrituras del comando y verifica el máximo aprobado para ese tipo, siempre por debajo de los límites de tamaño y operaciones de Firestore. Si no cabe, falla sin efectos con `OPERATION_TOO_LARGE`; no fragmenta una operación que deba ser atómica. Los máximos por tipo son un gate de implementación y deben quedar fijados antes de implementar cada Callable.

La contención de documentos calientes (cuenta, artículo, insumo o turno) se resuelve por transacción y reintento interno acotado ante `ABORTED`; agotado ese mecanismo se devuelve error de concurrencia. El cliente solo reintenta fallos temporales con backoff y exactamente el mismo envelope. R1 no particiona saldos ni stock.

## 5. Catálogo de comandos

| Operación | Callable | Iniciador y validación servidor | Recursos de la transacción | Idempotencia, auditoría y compensación |
|---|---|---|---|---|
| Apertura de turno | `abrirTurnoOperativoV1` | Cajero o autoridad vigente; deriva cajero del actor salvo delegación administrativa existente. Verifica membresía activa, empresa escribible y ausencia de candado. | `turnos`, `turnos_activos`, recibo, auditoría. | Reintento devuelve el mismo turno. `TurnoAbierto`. No se elimina el turno. |
| Cierre de turno | `cerrarTurnoOperativoV1` | Valida turno abierto, actor permitido, conteo y relevo. Recalcula ventas `COMPLETO` y egresos desde servidor; verifica fondos. | Turno, candados, cuentas, transacciones financieras, recibo, auditoría. | Ya cerrado por misma intención devuelve resultado. `TurnoCerrado`. Diferencias posteriores se corrigen con ajuste, no edición. |
| Relevo | Parte de `cerrarTurnoOperativoV1` | Valida receptor activo, rol permitido y ausencia de turno/candado activo. | Cierre origen, nuevo turno, ambos candados y efectos de caja. | Misma clave que el cierre. `TurnoRelevado`. No duplica al receptor. |
| Egreso | `registrarEgresoOperativoV1` | Valida turno aplicable, monto positivo, motivo, cuenta y fondos. | `egresos`, cuenta, transacción financiera, recibo, auditoría. | ID determinista por comando. Reversión por `revertirEgresoOperativoV1`, que crea hechos compensatorios. |
| Movimiento financiero manual | `registrarMovimientoFinancieroV1` | Valida categoría, monto, cuenta, motivo y fondos para egreso. | Cuenta, transacción financiera, recibo, auditoría. | Movimiento inmutable. Corrección mediante movimiento opuesto referenciado. |
| Traslado financiero | `trasladarEntreCuentasV1` | Valida cuentas distintas, existencia, monto y fondos de origen. | Dos cuentas, dos movimientos financieros, recibo, auditoría. | Dos líneas deterministas. Reversión por traslado inverso, no edición. |
| Configuración de cuenta | `configurarCuentaFinancieraV1` | Solo administración vigente. No acepta ni cambia saldo operacional. Protege cuentas con historial. | Metadatos de `cuentas_bancarias`, recibo, auditoría. | Alta/cambio administrativo auditable. Saldo solo cambia mediante comando financiero. |
| Compra | `registrarCompraOperativaV1` | Valida actor, proveedor, ítems, cantidades, costos, artículos y semántica de pago existente. | `compras`, ledger inventario, stock/secuencia, efecto financiero si corresponde, recibo, auditoría. | Reintento no duplica compra ni movimientos. Anulación mediante comando compensatorio. |
| Ajuste / merma | `registrarAjusteInventarioV1` | Valida tipo, artículo, cantidad no cero, signo coherente y motivo. | Movimiento de inventario, artículo/insumo, recibo, auditoría. | Clave por comando/línea. Corrección solo con ajuste opuesto referenciado. |
| Producción | `registrarProduccionOperativaV1` | Valida receta, insumos, producto resultante y política vigente de stock. | Salidas de insumos, entrada de producto, stocks/secuencias, recibo, auditoría. | Efectos inseparables. Reversión por producción compensatoria. |
| Devolución | `registrarDevolucionOperativaV1` | Lee compra o venta origen; valida tenant, estado y cantidad no devuelta previamente. | Movimientos de inventario, efecto financiero cuando aplique, recibo, auditoría. | Clave origen/línea. Nunca edita el documento ni movimiento original. |
| Fase 2 de venta | `aplicarEfectosVentaOperativaV1` | Lee venta. Exige exactamente `PENDIENTE_EFECTOS`; deriva ítems, pago y cuentas desde la venta fiscal, no desde payload. | Ledger inventario, stock/secuencia, cuentas, transacciones, venta `COMPLETO`, recibo, auditoría. | Preserva OPE-02/OPE-04/OPE-06. Reintento devuelve la venta completa sin duplicar efectos. |
| Anulación de venta | `anularVentaOperativaV1` | Pre-efectos: exige `PENDIENTE_EFECTOS`. Post-efectos: exige `COMPLETO` y rol actual autorizado. No acepta efectos calculados por cliente. | Venta, reversos de ledger/caja cuando corresponda, recibo, auditoría. | Preserva snapshot y estados terminales. La anulación post-efectos siempre es compensatoria. |

## 6. Validaciones obligatorias por dominio

### 6.1 Turnos y caja

- El servidor deriva la identidad del cajero y valida relación con el turno.
- La apertura solo puede producir un candado por cajero y tenant.
- El cierre lee cifras fuente y no confía en totales enviados por el cliente.
- `baseApertura`, estado, fechas, conteo y diferencia quedan congelados al cierre.
- Los movimientos de caja incluyen cuenta, tipo, monto, referencia, actor y comando.
- Un saldo nunca puede mutarse sin su movimiento financiero co-atómico.

### 6.2 Inventario

- Cada artículo existe y pertenece al tenant antes de emitir movimiento.
- Tipo, clase y signo son compatibles; cantidad nunca es cero.
- Clave idempotente, secuencia y saldo posterior se calculan en servidor.
- `stock` y `secuenciaLedger` se actualizan junto al movimiento.
- Compra, merma, ajuste, producción y devolución preservan referencias de origen y relaciones compensatorias. El traslado de inventario queda reservado para una fase posterior de FASE-15 y no se declara cubierto por R1.
- Durante las fases 0 a 3 de FASE-15 §12, I9 permanece suspendido y la reconciliación es solo de lectura. Al migrar el primer escritor R1 de un artículo, su `inventario_inicial` y el primer movimiento se emiten co-atómicamente. La ruta legacy se cierra antes de activar la denegación de Rules de inventario; la reconciliación autoritativa y caché desde ledger solo se habilitan en Fase 4. R1 no exige backfill histórico ni altera stock o snapshots legados.

### 6.3 Ventas y anulaciones

- La creación fiscal y `snapshotFiscal` siguen siendo exclusivamente B2.
- La Fase 2 no admite ítems, montos, cuentas ni saldos como autoridad cliente.
- Una venta pendiente no se anula automáticamente por retraso o reconexión.
- Una venta completa se anula creando reversos; no se modifica el snapshot ni se borra evidencia.
- Los estados `ANULADA_*` son terminales.

### 6.4 Reconciliación durable de Fase 2

Un proceso servidor programado o de recuperación procesa ventas `PENDIENTE_EFECTOS` invocando el mismo ejecutor interno de `aplicarEfectosVentaOperativaV1`; no existe una ruta cliente alternativa. Usa la clave de efecto determinista de la venta, conserva el actor y la causación originales en auditoría y registra al proceso como ejecutor técnico.

Ante fallo temporal, la venta permanece pendiente y se reintenta. No se anula por tiempo. Se conserva la alerta configurable de 15 minutos de ADR-SAAS-010 y se permiten stock negativo e incidencia operativa para que una venta fiscal cobrada pueda alcanzar `COMPLETO`; la anulación sigue siendo exclusivamente explícita y autorizada.

## 7. Rules objetivo

Tras el cutover R1, el cliente no escribe colecciones críticas:

| Colección | Política cliente objetivo |
|---|---|
| `turnos`, `turnos_activos` | Lectura autorizada; create/update/delete denegados. |
| `ventas` | Lectura autorizada; create/update/delete denegados. B2 y R1 usan Admin SDK. |
| `cuentas_bancarias` | Lectura autorizada; create/update/delete cliente denegados. La configuración pasa por Callable. |
| `transacciones_financieras` | Lectura autorizada; create/update/delete cliente denegados. |
| `movimientos_inventario` | Lectura autorizada; create/update/delete cliente denegados. |
| `compras`, `egresos`, `mermas`, producción y devoluciones | Lectura autorizada; create/update/delete cliente denegados. |
| `productos`, `insumos` | Solo una allowlist cerrada de metadatos no críticos según rol. `stock`, `secuenciaLedger`, costos derivados y todo campo de ledger son create/update/delete cliente denegados. Si un documento mezcla metadatos y un hecho crítico, no se admite excepción de actualización cliente hasta separarlo o usar Callable. |
| `operaciones_comandos`, `operaciones_command_idempotency` y auditoría crítica | Backend-only: create/update/delete cliente denegados. |

Las Rules conservan la defensa de tenant, rol, lifecycle y fallback-deny. No se pretende que reemplacen la validación de negocio de las Callables.

## 8. Errores, auditoría y recuperación

| Clase | Códigos de dominio | Comportamiento cliente |
|---|---|---|
| Autorización | `AUTH_REQUIRED`, `TENANT_ACCESS_DENIED`, `ROLE_FORBIDDEN`, `EMPRESA_NO_OPERATIVA` | No reintentar hasta corregir acceso o lifecycle. |
| Validación | `MONTO_INVALIDO`, `ARTICULO_INVALIDO`, `CUENTA_INVALIDA`, `MOTIVO_REQUERIDO` | Corregir entrada; no reintentar igual. |
| Precondición | `TURNO_CERRADO`, `FONDOS_INSUFICIENTES`, `VENTA_NO_PENDIENTE`, `DEVOLUCION_EXCEDE_ORIGEN` | Recargar estado y solicitar nueva acción. |
| Concurrencia | `LOCK_CONFLICT`, `REVISION_CONFLICT`, `ABORTED` | Reintentar con la misma clave si la intención sigue siendo válida. |
| Idempotencia | `COMMAND_ID_CONFLICT`, `IDEMPOTENCY_CONFLICT` | No reintentar con payload diferente. |
| Temporal | `UNAVAILABLE`, timeout | Reintentar exactamente el mismo envelope. |

La auditoría servidor registra tenant, actor, rol efectivo, tipo de comando, huella, correlación, motivo, referencias y resultado. No se registran secretos, PIN, tokens ni datos de pago sensibles.

El rollback de una transacción fallida es automático: no hay commit parcial. Después de un commit, la única reversión aceptable es un comando compensatorio auditado.

## 9. Compatibilidad y migración sin downtime material

1. Verificar los gates de migración de inventario de FASE-15 §12 aplicables a cada escritor antes de cerrar su ruta legacy.
2. Desplegar Callables y contrato compatible; las Rules siguen temporalmente como están.
3. Adaptar y publicar clientes Callable-capable con la misma intención y respuestas de UX actuales, incluido Electron si aplica.
4. Observar que las operaciones críticas se ejecutan por Callables; bloquear clientes legacy mediante compatibilidad o versión mínima antes de cerrar Rules.
5. Desplegar Rules server-authoritative que niegan escrituras directas críticas y retirar la ruta legacy.
6. Mantener consumidores de lectura y documentos históricos sin reescritura.
7. Tras el paso 5, el rollback solo puede dirigirse a cliente o Callable que conserve el contrato R1. Está prohibido volver a un escritor Firestore directo. Las versiones Callable necesarias se conservan hasta retirar los clientes previos; reabrir Rules requiere únicamente un break-glass extraordinario, aprobado y auditado.

No hay dual-write. Los mismos documentos, IDs, referencias, snapshots, `estadoOperativo` y consultas B7 se conservan. El backfill B7 no se repite ni se altera.

## 10. Criterios de aceptación arquitectónica

R1 estará listo para implementación únicamente cuando el diseño se mantenga conforme a estos criterios:

1. Ninguna Callable toma `empresaId`, actor, saldo, stock, consecutivo o efecto derivado como autoridad del cliente.
2. Cada comando crítico tiene envelope, idempotencia durable, auditoría y errores de dominio definidos.
3. Toda mutación de saldo tiene movimiento financiero co-atómico.
4. Todo movimiento de inventario actualiza stock y secuencia co-atómicamente.
5. Todo cierre de turno es terminal; toda corrección posterior es compensatoria.
6. Fase 1 fiscal permanece en B2 y Fase 2 conserva íntegramente ADR-SAAS-010.
7. Las Rules finales niegan escrituras cliente en colecciones críticas.
8. La compatibilidad con tenant, lifecycle, B1, B2, B7, snapshots y datos históricos está probada antes de activar Rules restrictivas.
9. Recibo e índice idempotente verifican la dupla tenant-scoped, `empresaId` inmutable y los conflictos de cada identificador.
10. La transición de Fase 2 tiene reconciliador servidor durable y no autoanula ventas pendientes.
11. Los gates de FASE-15 §12 y la compatibilidad de cliente se cumplen antes de negar la escritura directa correspondiente.

## 11. Condiciones de rechazo

Debe rechazarse cualquier implementación que:

- acepte `empresaId`, rol, actor, saldo, stock, secuencia, ítems o efectos como fuente de verdad cliente;
- use dual-write cliente/servidor para un mismo hecho;
- permita editar o borrar ledger, transacciones financieras, snapshot fiscal o venta histórica;
- fragmente una operación que requiere atomicidad sin un contrato compensatorio explícito;
- use el resultado de límites comerciales de MT-U10 como permiso, bloqueo o sustituto de lifecycle;
- active Rules restrictivas mientras exista un cliente operativo que dependa de escritura directa;
- habilite reconciliación autoritativa de inventario antes de cumplir los gates de FASE-15 §12;
- cambie la semántica de B1, B2, B7 o ADR-SAAS-010.

## 12. Cierre

R1 establece una frontera técnica adicional, no una nueva autoridad de dominio: el servidor ejecuta los comandos críticos usando las autoridades ya aprobadas. La arquitectura resultante conserva la UX y el modelo operativo actual, pero elimina la confianza en escrituras directas del cliente para la integridad de caja, turnos, inventario y ventas.

## Referencias

- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
- `MT-U10-B6-B7-cierre-arquitectonico.md`
- `ADR-SAAS-009-enforcement-ciclo-vida.md`
- `ADR-SAAS-010-integracion-fiscal-inventario.md`
- `FASE-15-PR1-inventario-ledger-diseno.md`
- `MASTER-SECURITY-PLAN.md`
- Validación R1 — Integridad de Operaciones Críticas
- Release Readiness Assessment — MiCafe POS
