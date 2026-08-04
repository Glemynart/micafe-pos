# ADR-SAAS-020 — Cuentas por cobrar operativas server-authoritative

## Estado

**Aceptado**

La aceptación de este ADR autoriza la implementación del PR derivado, sin
autorizar escrituras en producción.

## Fecha

2026-08-03

## Goal, Milestone y Epic

- **Goal:** `G-MVP-01` — MVP comercial de Café Atrato
- **Milestone:** `M2` — Núcleo transaccional íntegro
- **Epic:** `E2.3` — Cobro y anulación
- **PR derivado:** `P0-04` — Certificar cobro de mostrador y anulación
- **Alcance:** mecanismo operativo reusable para cualquier tenant del plan
  `mvp_comercial`

## Decisión aceptada

Se incorpora `cuentas_cobro` al plan SaaS genérico `mvp_comercial` como
capacidad operativa de ventas pendientes y liquidación posterior. No se crea
una capacidad adicional de cartera, crédito empresarial o financiación.

La decisión aceptada adapta el flujo existente a la frontera
server-authoritative de `ADR-SAAS-015` y a la resolución de cuentas de
`ADR-SAAS-019`, conservando la venta original separada de su liquidación.

## 1. Contexto y problema

El POS ya permite crear una venta con `metodoPago = "cuenta_cobro"` y
`estado = "pendiente"`. La Fase 2 puede completar los efectos operativos de
la venta —por ejemplo, inventario— sin acreditar una cuenta financiera mientras
el cliente no haya pagado.

La liquidación posterior todavía se ejecuta en
`lib/cuentas-cobro-service.ts` mediante una transacción Firestore del cliente.
Esa ruta:

- cambia la venta a pagada desde el cliente;
- selecciona cuentas físicas históricas como `caja-principal` y `bancolombia`;
- actualiza saldos y crea transacciones financieras sin la autoridad de
  Functions;
- no usa el recibo de comando, el índice de idempotencia ni la auditoría
  server-side de las operaciones financieras vigentes.

Esta divergencia impide incluir `cuentas_cobro` en el MVP sin relajar Rules ni
duplicar la autoridad financiera. También hace ambiguo el significado de una
venta pendiente: debe representar una obligación operativa de pago, no una
nueva factura, una cuenta empresarial con financiación ni un documento DIAN
posterior.

## 2. Límites de negocio aprobados

`cuentas_cobro` tendrá únicamente estas capacidades:

1. registrar una venta cuyo pago queda pendiente;
2. mostrar las ventas pendientes del tenant;
3. liquidar posteriormente el importe total mediante efectivo o transferencia;
4. reflejar el ingreso en la cuenta financiera tenant-aware y en la venta.

No forma parte del modelo:

- financiación;
- cuotas o abonos parciales;
- intereses, mora, recargos o fechas de vencimiento financieras;
- límites o scoring de crédito;
- gestión de cobranza;
- estados de cuenta empresariales;
- cuentas maestras de clientes o saldos agregados por cliente.

## 3. Drivers de la decisión

- La autoridad de la liquidación, el importe, el tenant, el turno, la cuenta y
  el saldo debe residir en Functions/Admin SDK.
- La venta original y la liquidación posterior deben ser hechos relacionados,
  pero no el mismo hecho fiscal ni una nueva emisión.
- Un reintento después de perder la respuesta no puede duplicar el ingreso ni
  cambiar dos veces el estado de la venta.
- La solución debe reutilizar `executeConContexto`, el resolvedor de
  `ADR-SAAS-019`, el ledger financiero y las estructuras de auditoría vigentes.
- El mismo contrato debe funcionar para la Empresa fundacional y para tenants
  no fundacionales.
- La capacidad debe ser reusable y genérica; no puede contener reglas para
  Café Atrato.
- El Trial DEMO debe poder usar el mecanismo sin crear snapshot fiscal,
  consecutivo, CUFE ni efecto tributario.

## 4. Alternativas consideradas

### Alternativa A — Mantener la liquidación en el cliente y ampliar Rules

**Rechazada.** Mantendría al cliente como autoridad de venta, saldo y cuenta
financiera, abriría una segunda frontera de seguridad y contradiría
`ADR-SAAS-015` y `ADR-SAAS-019`.

### Alternativa B — Tratar la liquidación como una nueva venta o documento DIAN

**Rechazada.** Duplicaría el hecho comercial, podría consumir numeración o
crear CUFE, y rompería la separación entre la venta original y el cobro
posterior. El pago no constituye una nueva venta ni una nueva emisión fiscal.

### Alternativa C — Crear un agregado completo de crédito o cartera

**Rechazada para el MVP.** Introduciría cuotas, saldos agregados, vencimientos,
conciliación y estados de cobranza que el negocio no ha aprobado y que no son
necesarios para operar el POS.

### Alternativa D — Comando server-side de liquidación sobre la venta existente

**Seleccionada.** La venta permanece como el hecho original. Un comando
`liquidarCuentaCobroV1` materializa una liquidación única por el total de esa
venta, crea el movimiento financiero correspondiente y actualiza únicamente la
proyección operativa de pago. Todo se confirma en una única transacción con
idempotencia y auditoría existentes.

## 5. Decisión aceptada

### 5.1 Modelo de la venta original

- La venta se crea por el flujo vigente de venta DEMO o FISCAL.
- `metodoPago = "cuenta_cobro"` identifica el método original y no se
  sobrescribe con `efectivo` o `transferencia`.
- La venta comienza con `estado = "pendiente"`.
- La Fase 2 server-side puede llevarla a `estadoOperativo = "COMPLETO"` y
  aplicar inventario, pero no crea movimiento financiero de cobro mientras
  siga pendiente.
- `items`, `totales`, cliente, espacio, turno de origen, `modoOperacion`,
  `snapshotFiscal`, consecutivo y cualquier evidencia fiscal original son
  datos del hecho de venta y no se reescriben durante la liquidación.
- La vista de cuentas pendientes continúa siendo una proyección tenant-aware
  de las ventas que cumplan las condiciones de pendiente; no se crea un
  agregado paralelo de cartera.

La transición a `estado = "pagada"`, `metodoPagoFinal`, `fechaPago` y el
identificador de liquidación son una proyección operativa de que el pago fue
registrado. No convierten la venta en otra venta ni modifican su identidad
fiscal.

### 5.2 Comando de liquidación

La interfaz cliente solo expresa la intención mínima:

```ts
{
  commandId,
  idempotencyKey,
  correlationId,
  causationId,
  motivo,
  payload: {
    ventaId,
    metodoPagoFinal: "efectivo" | "transferencia"
  }
}
```

El cliente no puede enviar como autoridad:

- `empresaId`;
- importe o saldo;
- `cuentaId`, nombre de cuenta o documento físico;
- `turnoId` elegido por el cliente;
- saldo resultante;
- snapshot fiscal, consecutivo o datos DIAN.

La callable `liquidarCuentaCobroV1` derivará esos datos del tenant autenticado,
de la venta y de la cuenta lógica correspondiente.

### 5.3 Autoridad y transacción

La callable reutilizará `executeConContexto` y exigirá la capacidad canónica
`sell`, porque la liquidación es una operación de caja que también debe estar
disponible para el operador autorizado del POS. La membresía, el rol, la
Empresa y el estado operativo se revalidarán dentro de la misma transacción.

Dentro de una única transacción Admin SDK se deberá:

1. comprobar el recibo y el índice de idempotencia y devolver el resultado
   anterior en un replay válido;
2. leer la venta y validar que pertenece al tenant, que tiene
   `metodoPago = "cuenta_cobro"`, que está en `estado = "pendiente"` y que sus
   efectos operativos ya están en `COMPLETO`;
3. derivar el importe total desde `ventas.totales.total`;
4. resolver la cuenta por `(empresaId, claveOperativa)` mediante el resolvedor
   de `ADR-SAAS-019`;
5. exigir un turno abierto derivado server-side cuando el método final sea
   `efectivo`; un `turnoId` enviado por cliente nunca sustituye esa validación;
6. crear un único movimiento de ingreso con categoría `cuentas_cobro`,
   enlazado a `ventaId` y a la identidad lógica/física resuelta;
7. actualizar el saldo de la cuenta resuelta y la proyección operativa de pago
   de la venta;
8. escribir recibo de comando, índice de idempotencia y auditoría;
9. devolver un resultado que incluya la identidad de la liquidación, la venta,
   el movimiento y la cuenta resuelta.

Para `efectivo` se usará la clave lógica reservada `caja-principal`. Para
`transferencia` se usará la clave lógica de transferencia configurada por el
contrato vigente (actualmente `bancolombia`); en ningún caso se aceptará el ID
físico como sustituto de la clave.

### 5.4 Identidad y separación de la liquidación

Cada venta puede tener como máximo una liquidación completa. La identidad
determinista de la liquidación se derivará de `(empresaId, ventaId)` y se
conservará en el resultado, el movimiento financiero, el recibo y la
auditoría. No se crea una segunda venta ni una colección de cartera.

Un segundo comando con la misma intención devuelve el resultado confirmado.
Un comando distinto que intente liquidar una venta ya pagada, anulada o sin
condiciones de cobro pendientes se rechaza sin mutación.

La separación queda garantizada por dos hechos relacionados:

- la venta original conserva sus datos comerciales y fiscales;
- la liquidación tiene su propio comando, identidad idempotente, movimiento
  financiero y evidencia de auditoría.

### 5.5 Separación fiscal y DEMO

- Liquidar una venta DEMO no la convierte en FISCAL.
- Una venta DEMO liquidada no obtiene consecutivo, `snapshotFiscal`, CUFE,
  factura POS ni llamada a DIAN.
- La liquidación DEMO es un efecto operativo y financiero interno; queda fuera
  de proyecciones y reportes fiscales, aunque puede aparecer en reportes
  operativos.
- En una venta FISCAL, el `snapshotFiscal`, consecutivo y demás hechos de la
  venta original permanecen intactos. La liquidación no inicia una nueva
  emisión hacia la DIAN.
- `fechaLimiteDIAN` no será una autoridad, condición de cobro ni temporizador
  de este contrato. Las referencias históricas se conservarán solo como datos
  legacy de lectura; las nuevas operaciones no crearán ni calcularán plazos
  DIAN para una cuenta pendiente.

## 6. Invariantes

1. Una venta `cuenta_cobro` conserva su identidad original y no se convierte
   en otra venta por ser liquidada.
2. Una liquidación siempre corresponde a exactamente una venta del mismo
   tenant.
3. La liquidación es por el total server-side de la venta; no hay abonos ni
   liquidaciones parciales en el MVP.
4. Una venta puede tener como máximo una liquidación confirmada.
5. Un replay válido no duplica movimiento, incremento de saldo, transición de
   venta, recibo ni auditoría.
6. Una cuenta inexistente, duplicada, ajena o resuelta mediante un ID físico
   aborta la transacción sin escrituras parciales.
7. La resolución de cuenta no depende del nombre visible y respeta las claves
   reservadas de `ADR-SAAS-019`.
8. El importe, tenant, actor, turno y cuenta son autoridad del servidor.
9. La liquidación no crea ni modifica snapshot fiscal, consecutivo, CUFE,
   factura, numeración ni estado tributario.
10. Una venta DEMO sigue siendo DEMO después de la liquidación y permanece
    excluida de reportes fiscales.
11. No se crean cuentas financieras, clientes ni agregados de cartera desde el
    cliente o desde este PR.
12. La liquidación nunca modifica el contenido comercial de la venta original:
    productos, cantidades, impuestos, descuentos, totales, cliente, vendedor,
    espacio ni turno de origen.
13. Una venta con una liquidación confirmada no puede anularse directamente.
    Toda reversión debe utilizar el comando de anulación correspondiente,
    preservando la auditoría y la consistencia financiera.
14. No se modifica Firestore Rules, Bootstrap, la autoridad de ventas ni el
    contrato de cuentas financieras aceptado.

## 7. Compatibilidad y transición

- `marcarComoPagada` dejará de ejecutar escrituras Firestore del cliente y se
  convertirá, si se conserva como nombre de servicio, en un adaptador del
  comando callable.
- El cliente no escribirá directamente `ventas`, `cuentas_bancarias` ni
  `transacciones_financieras` para liquidar.
- No habrá migración, backfill, dual-write ni reescritura de cuentas o ventas
  históricas.
- Las ventas históricas ya pagadas se conservan como evidencia. El nuevo
  comando no inferirá una liquidación histórica inexistente ni creará una
  segunda transacción financiera.
- Una venta pendiente legacy que no cumpla las precondiciones canónicas será
  rechazada de forma determinista y sin mutación; su reparación, si alguna vez
  fuese necesaria, requerirá un alcance separado.
- La implementación deberá sincronizar el blueprint y el validador del plan
  `mvp_comercial` para incluir `cuentas_cobro`, sin añadir una capacidad de
  cartera o una lógica específica de Café Atrato.

## 8. Fuera de alcance

- financiación, cuotas, intereses, mora, recargos o cobranza;
- pagos parciales, abonos o liquidación mixta de una misma cuenta;
- estados de cuenta, saldos agregados por cliente, límites o scoring;
- creación o migración de cuentas financieras en producción;
- emisión, reemisión o integración DIAN derivada del pago;
- diseño general de anulaciones, devoluciones o notas de ajuste; una venta
  anulada nunca podrá liquidarse y cualquier caso de anulación de una cuenta
  pendiente deberá respetar el comando de anulación vigente o abrir una
  decisión específica antes de implementarse;
- eventos o notificaciones FCM de cuentas por cobrar, que permanecen fuera del
  catálogo inicial de `ADR-SAAS-018`;
- cambios en Firestore Rules, Bootstrap, suscripciones o datos productivos de
  Café Atrato.

## 9. Validación requerida después de la aceptación

El PR de implementación deberá demostrar en Emulator, sin datos productivos:

- una venta DEMO pendiente que se liquida sin campos fiscales ni efectos
  tributarios;
- una venta FISCAL de prueba cuya liquidación no cambia su snapshot ni
  consecutivo;
- liquidación por efectivo con turno derivado server-side;
- liquidación por transferencia con cuenta lógica tenant-aware;
- saldo, movimiento, venta y auditoría consistentes en un solo commit;
- replay del mismo comando sin duplicados;
- conflicto de una segunda liquidación con otra intención;
- rechazo de tenant ajeno, membresía revocada, permiso ausente, venta anulada,
  venta no pendiente, estado operativo incompleto, cuenta ausente, cuenta
  duplicada e ID físico;
- ausencia de creación de cuentas, consecutivos, CUFE, snapshots o documentos
  DIAN durante la liquidación;
- aislamiento entre dos tenants que usan las mismas claves lógicas;
- pruebas de que el cliente solo invoca la callable y no ejecuta escrituras
  financieras directas;
- ausencia de cambios en Rules y de escrituras en producción.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El cliente repite el pago tras perder la respuesta | Envelope determinista, recibo, índice y movimiento idempotentes dentro de la transacción. |
| Se acredita una cuenta de otro tenant | Tenant derivado del contexto autenticado y resolución por `empresaId + claveOperativa`. |
| La venta pendiente no tiene efectos de inventario completos | Precondición `estadoOperativo = COMPLETO`; la Fase 2 se procesa por su callable vigente. |
| Se interpreta el pago como hecho fiscal nuevo | Invariantes explícitas; no se llama a numeración, CUFE ni DIAN. |
| Datos legacy contienen semántica de plazo DIAN | No se usan para autoridad; los registros históricos quedan de solo lectura. |
| Se amplía accidentalmente a cartera empresarial | No hay pagos parciales, cuotas, intereses, agregados ni estados adicionales. |

## 11. Rollback

El rollback del PR de implementación será revertir el adaptador cliente y la
callable nueva sin migrar ni borrar datos. Los movimientos de liquidaciones ya
confirmadas no se eliminarán ni se revertirán destructivamente; cualquier
compensación futura deberá usar un comando financiero explícito y auditable.
Los datos de las pruebas permanecerán únicamente en Emulator.

## 12. Relación con decisiones existentes

- Complementa `ADR-SAAS-015`: la venta pendiente y su liquidación permanecen
  bajo autoridad de Functions, sin transacciones críticas del cliente.
- Implementa para este flujo las claves lógicas y restricciones de
  `ADR-SAAS-019`.
- Respeta `ADR-SAAS-016`: DEMO no se convierte en FISCAL y queda fuera de
  proyecciones fiscales.
- No amplía el catálogo de eventos de `ADR-SAAS-018`.
- Conserva las obligaciones de auditoría de `ADR-SAAS-012`.

## 13. Consecuencias

### Positivas

- `cuentas_cobro` queda disponible para el MVP comercial sin abrir un sistema
  de cartera empresarial.
- La venta pendiente puede operar durante Trial DEMO sin datos fiscales
  ficticios.
- El cobro posterior actualiza caja y ledger de forma tenant-aware, atómica,
  idempotente y auditable.
- La misma callable y las mismas invariantes se reutilizan para cualquier
  tenant.

### Negativas

- Se debe coordinar el contrato de Functions y el cliente en un despliegue
  compatible.
- El flujo no soportará abonos ni liquidaciones parciales hasta una decisión
  futura.
- Los registros legacy con semántica de plazo DIAN requieren tratamiento de
  compatibilidad en la UI, sin convertirlos en autoridad de dominio.

## 14. Aceptación registrada

La aceptación explícita confirma:

1. la inclusión de `cuentas_cobro` en `mvp_comercial` con el alcance operativo
   limitado descrito aquí;
2. la callable server-side `liquidarCuentaCobroV1` como autoridad de la
   liquidación;
3. la liquidación completa única por venta, únicamente por efectivo o
   transferencia;
4. la ausencia de nuevas emisiones fiscales, cartera avanzada, migraciones,
   cambios de Rules y escrituras productivas en el PR derivado.

El ADR queda en estado **Aceptado** y habilita el PR de implementación dentro
del alcance aprobado.
