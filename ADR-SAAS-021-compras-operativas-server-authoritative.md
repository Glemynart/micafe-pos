# ADR-SAAS-021 — Compras operativas server-authoritative

## Estado

**Propuesto**

**Fecha:** 2026-08-04  
**Decision makers:** Lead Engineer; propietario del Goal  
**Aprobación requerida antes de implementar:** sí

Este ADR no autoriza todavía código, cambios de Firestore Rules, migraciones,
despliegues ni escrituras en producción. La implementación debe comenzar solo
después de que la decisión sea aceptada y la planificación del Goal se
reconcilie con el trabajo aprobado.

## Goal, Milestone y Epic

- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial reusable.
- **Ubicación propuesta:** `M2 — Núcleo transaccional íntegro`.
- **Epic propuesto:** `E2.3 — Compras e inventario operativos`.
- **Backlog actual relacionado:** `P1-03`.
- **Corte propuesto:** nuevo `P0-12`, sujeto a aprobación de la replanificación.
- **Estado documental actual:** el Goal todavía señala `M3/E3.1` como siguiente PR; este ADR no modifica esa sección.

## 1. Contexto y problema

La pantalla de Compras ya permite registrar una compra con inventario y, de
forma opcional, descontar una cuenta bancaria. Sin embargo, `registrarCompra`
ejecuta desde el SDK cliente una única transacción que combina:

- creación del documento `compras`;
- movimientos del ledger de inventario;
- actualización de stock y secuencia;
- actualización del costo cacheado del artículo;
- descuento de `cuentas_bancarias`;
- escritura de `transacciones_financieras`.

La escritura de `transacciones_financieras` está prohibida para el cliente por
Rules. Por ello, la ruta con cuenta puede fallar completa o quedar dependiente
de una autoridad que el cliente no puede ejercer. La ruta de eliminación
repite el problema: borra la compra y escribe una reversión financiera desde
el cliente.

La arquitectura R1 ya define `registrarCompraOperativaV1` como comando
server-authoritative, pero R1 continúa siendo un diseño propuesto y no existe
esa callable en `functions/src`. `registrarEgresoOperativoV1` solo registra un
egreso operativo; no puede coordinar atómicamente la compra, el ledger de
inventario, el costo y el efecto financiero.

El problema, por tanto, no se resuelve llamando al egreso después de crear la
compra. Se necesita una única autoridad que confirme todos los efectos de una
compra en la misma transacción.

## 2. Drivers de la decisión

1. Las compras con efecto en inventario o finanzas forman parte del núcleo
   operativo del MVP comercial.
2. El tenant y el actor deben derivarse de la sesión autenticada.
3. El servidor debe calcular y validar los efectos derivados; el cliente solo
   expresa la intención de compra.
4. Un cambio de saldo financiero debe tener su movimiento financiero
   co-atómico.
5. Un movimiento de inventario debe actualizar stock y secuencia en la misma
   transacción.
6. Los reintentos deben devolver el mismo resultado sin duplicar compra,
   stock, costo, saldo, movimiento, recibo ni auditoría.
7. La resolución financiera debe usar `empresaId` y `claveOperativa`, conforme
   a ADR-SAAS-019; nunca un ID físico enviado por el cliente.
8. No deben introducirse datos fiscales, numeración, facturación electrónica ni
   dependencias de Café Atrato.
9. El cambio debe poder validarse en Emulator y localmente, sin producción.

## 3. Alternativas consideradas

### A. Mantener la transacción del cliente y llamar al backend para el egreso

**Rechazada.** Una transacción Firestore del cliente y una callable posterior no
forman un commit atómico. Puede existir compra e inventario sin efecto
financiero, o un efecto financiero sin una compra confirmada. También conserva
al cliente como autoridad de hechos críticos.

### B. Crear la compra y reutilizar `registrarEgresoOperativoV1`

**Rechazada.** Esa callable representa un egreso de caja, exige turno y no
conoce el documento de compra, sus líneas ni sus efectos de inventario. Su uso
como segundo paso produciría una operación partida y una semántica incorrecta
de auditoría.

### C. Crear una callable única de compra con ejecutor interno de ledger

**Recomendada.** La callable resuelve tenant, actor, membresía, capacidad,
artículos, espacio y cuenta; calcula los efectos y confirma compra, inventario,
costo, finanzas, recibo e auditoría dentro de una transacción Admin SDK.

El ejecutor de inventario debe vivir en una primitiva backend-compatible. No se
debe importar el servicio cliente actual como autoridad ni mantener dos
implementaciones divergentes del mismo ledger. La extracción o adaptación de
la primitiva debe preservar sus claves idempotentes, secuencia y semántica de
movimientos.

### D. Crear un servicio externo separado para compras

**Rechazada.** Introduce infraestructura, latencia y un nuevo límite de
consistencia sin ser necesario para el MVP ni para el modelo Firebase actual.

## 4. Decisión propuesta

Se adopta una autoridad única `registrarCompraOperativaV1`, expuesta como
callable en `us-central1` y ejecutada mediante Admin SDK.

### 4.1 Envelope

La entrada usa el envelope R1:

```ts
{
  commandId,
  idempotencyKey,
  correlationId,
  causationId,
  motivo,
  payload: {
    proveedor,
    espacioId,
    fechaCompra,
    cuentaClaveOperativa,
    items: [{ articuloId, tipo, cantidad, costoUnitario }]
  }
}
```

`empresaId`, actor, rol, membresía, lifecycle, capacidad y datos derivados no
son autoridad del payload.

### 4.2 Reglas de autoridad

- `empresaId` procede de la sesión y se revalida dentro de la transacción.
- La callable exige Empresa operativa (`trial` o `activa`), membresía vigente y
  la capacidad `purchases`.
- Cada artículo existe, pertenece al tenant y coincide con el tipo solicitado.
- Cantidades y costos unitarios son positivos, seguros y válidos para el
  contrato existente.
- El nombre y la unidad persistidos se toman de la fuente canónica del artículo;
  el cliente no puede alterar esos snapshots.
- El total se calcula en servidor a partir de las líneas. Un total enviado por
  el cliente nunca es autoridad.
- `espacioId` se valida contra el tenant y el espacio operativo permitido.
- Si existe pago desde una cuenta, la entrada recibe únicamente
  `cuentaClaveOperativa`; el servidor resuelve la cuenta según ADR-SAAS-019.
- Si no se indica cuenta, la compra puede registrar inventario sin efecto de
  saldo, conservando la semántica opcional existente.

### 4.3 Transacción única

La transacción debe leer primero todas las fuentes necesarias y escribir de
forma co-atómica:

1. recibo de comando e índice de idempotencia;
2. artículos, cuentas, empresa, membresía y espacio;
3. documento `compras` con snapshots comerciales;
4. movimientos de inventario append-only;
5. stock y `secuenciaLedger`;
6. costo derivado del artículo, cuando corresponda;
7. saldo de la cuenta y movimiento financiero, si hay cuenta;
8. auditoría y referencias del resultado.

Una transacción fallida no deja ningún efecto parcial. Un replay válido devuelve
el resultado original.

### 4.4 Eliminación y reversión

La creación server-side no autoriza conservar la eliminación física actual
como mecanismo comercial. Una compra confirmada no debe borrarse para revertir
inventario o saldo.

La anulación compensatoria de compras queda identificada como un segundo corte
del mismo Epic y deberá:

- conservar la compra original;
- crear movimientos opuestos referenciados;
- impedir una segunda reversión;
- mantener auditoría e idempotencia;
- no editar movimientos históricos.

Si para materializar esa reversión se introduce un nuevo estado o colección,
deberá quedar incluido en un ADR de implementación derivado antes de codificarlo.
Este ADR no autoriza todavía la eliminación ni define una migración de compras
históricas.

## 5. Invariantes

- Ninguna compra con efecto operativo crítico será confirmada por una escritura
  directa del cliente.
- Un reintento con el mismo `commandId` e `idempotencyKey` no duplica ningún
  efecto.
- Un mismo identificador con otra huella produce conflicto determinista.
- Un saldo financiero solo cambia junto con su movimiento financiero.
- Stock y secuencia cambian junto con su movimiento de inventario.
- Una compra confirmada conserva su documento y sus snapshots históricos.
- Una reversión posterior es compensatoria y auditable; nunca edita ni borra el
  hecho original.
- La resolución de cuentas nunca depende del nombre visible ni de un ID físico.
- No se aceptan `cuentaId`, `empresaId`, actor, stock, saldo, total derivado ni
  nombres de artículos como autoridad del cliente.
- No hay dual-write cliente/servidor para una misma compra.
- No se generan documentos fiscales ni se consume numeración.

## 6. Alcance del PR de creación derivado

### Incluido

- contrato y callable `registrarCompraOperativaV1`;
- primitiva backend-compatible para el ledger de inventario;
- adaptación del servicio cliente para enviar el envelope;
- compra con y sin cuenta financiera;
- resolución tenant-aware de la cuenta;
- idempotencia, auditoría y transacción;
- pruebas unitarias y Emulator para dos tenants;
- replay, conflictos, fondos insuficientes y fallos sin commit parcial;
- validación de la capacidad `purchases`.

### Fuera de alcance

- eliminación o anulación de compras, salvo retirar la llamada directa del flujo
  que se encuentre dentro del PR aprobado;
- proveedores como nuevo agregado de dominio;
- financiación, crédito o cuentas por cobrar;
- cambios en fiscalidad, numeración o DIAN;
- cambios en Bootstrap, planes o suscripciones;
- cambios de Firestore Rules en este ADR;
- migraciones o escrituras en producción;
- reservas, Electron, impresión y notificaciones.

## 7. Compatibilidad, Rules y rollback

La migración debe realizarse en este orden:

1. publicar la callable y sus pruebas;
2. cambiar el cliente soportado para usar exclusivamente la callable;
3. verificar que no queda ningún consumidor activo del contrato directo;
4. ejecutar el corte de Rules en un PR posterior o en el mismo PR solo si la
   evidencia de compatibilidad y el alcance aprobado lo permiten;
5. retirar la ruta cliente directa sin dual-write.

Mientras las Rules antiguas permanezcan abiertas para `compras`, el sistema
debe documentar que la autoridad server-side está aplicada al cliente soportado,
pero que el cierre defensivo de escrituras directas todavía es un criterio de
release pendiente. No se acepta reabrir una escritura crítica como rollback
después del corte definitivo.

El rollback previo al corte de Rules consiste en volver al consumidor cliente
compatible con la callable, no en restaurar una segunda autoridad de negocio.
Una operación ya confirmada solo se corrige mediante comando compensatorio.

## 8. Validación requerida

- `npx tsc --noEmit`;
- `npm run build`;
- `npm run build:functions`;
- `npm run test:auth-foundation`;
- pruebas backend de envelope, autoridad, idempotencia y atomicidad;
- Emulator con al menos dos tenants y cuentas físicas diferentes;
- compra sin cuenta: inventario y costo correctos, sin movimiento financiero;
- compra con cuenta: compra, inventario, saldo y movimiento financiero
  co-atómicos;
- cuenta ausente, cuenta duplicada, ID físico y tenant ajeno rechazados;
- replay estable y conflicto de huella;
- fallo en cualquier lectura o validación sin escrituras parciales;
- evidencia de que el cliente no escribe directamente las colecciones críticas.

La certificación física, los datos fiscales de Café Atrato y la producción no
forman parte de la validación.

## 9. Consecuencias

### Positivas

- La compra usa la misma frontera server-authoritative que ventas, turnos y
  finanzas.
- Inventario y tesorería dejan de depender de una transacción cliente imposible
  de completar contra las Rules actuales.
- El contrato es reutilizable para cualquier tenant del plan `mvp_comercial`.
- Los reintentos y fallos tienen un resultado auditable y recuperable.

### Negativas

- Debe extraerse o adaptar la primitiva de ledger para Admin SDK.
- El cliente y Functions deben coordinarse en un corte compatible.
- La anulación de compras requiere un corte posterior y no puede seguir siendo
  un borrado directo.
- La CI deberá incorporar la nueva suite antes de declarar el PR listo para
  merge.

## 10. Decisión solicitada

Se solicita aceptar o rechazar:

1. la callable única `registrarCompraOperativaV1`;
2. la autoridad server-side co-atómica sobre compra, inventario y finanzas;
3. la resolución financiera por `empresaId + claveOperativa`;
4. la separación de la reversión de compras como corte compensatorio;
5. la admisión del trabajo como `P0-12 / M2-E2.3`, mediante una actualización
   aprobada del Goal y del backlog.

