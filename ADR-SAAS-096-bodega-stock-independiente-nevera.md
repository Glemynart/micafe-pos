# ADR-SAAS-096 — Bodega MVP-1: carga independiente de inventario Nevera

## Estado

**ACEPTADO — 2026-10-27.** La persona responsable corrigió expresamente la decisión anterior: Nevera no recibe existencias mediante transferencia desde el catálogo Bodega y autorizó implementar la gestión directa de su inventario con «ok hazlo».

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Relacionado:** ADR-SAAS-091, ADR-SAAS-093 y ADR-SAAS-094.
- **Supersede parcialmente:** ADR-SAAS-091 en el origen del stock Nevera y ADR-SAAS-094 en los requisitos de correspondencia, factor y transferencia Bodega→Nevera. La separación de catálogos y los costos capturados por operación permanecen vigentes.
- **Límite operativo:** permite implementar y probar el flujo en código y Emulator. No autoriza cargar stock, importar productos, cambiar Rules, desplegar ni escribir datos remotos.

## Contexto

El catálogo Nevera es independiente del catálogo Bodega. La pantalla de Inventario solo suscribe productos Bodega y el backend rechaza ajustes de stock/costo sobre productos Nevera con `NEVERA_REQUIERE_TRANSFERENCIA`; esa conducta impide que Diana registre su inventario físico en el catálogo correcto y contradice la aclaración del responsable.

## Decisión

1. Bodega y Nevera conservan IDs propios para productos, presentaciones y categorías. Un producto Nevera no requiere ni obtiene una correspondencia con Bodega.
2. El administrador registra las existencias directamente sobre el producto del catálogo Nevera. La operación solo modifica ese artículo Nevera y nunca descuenta, reserva ni cambia el producto homónimo de Bodega.
3. Los cambios se envían por el comando server-authoritative de inventario existente. La transacción valida tenant, membresía/capacidad `inventory`, artículo, catálogo, espacio, stock reservado y costo; persiste el saldo y el movimiento append-only con actor, motivo, costo y clave idempotente. No se admiten escrituras directas desde el cliente.
4. El alta/importación del producto sigue creando stock cero. La carga física ocurre como una operación posterior de inventario.
5. Para stock Nevera mayor que cero se exige un costo de adquisición positivo en COP por unidad base. El movimiento conserva el costo vigente en su snapshot. No se deduce costo ni factor desde Bodega, el nombre, el precio retail o el Excel de precios consumidor final.
6. Esta operación de inventario no registra compra a proveedor, egreso de caja, venta retail ni abono. El subledger de control Nevera y el consumo de capas de costo por ventas siguen sujetos a sus propios criterios de aceptación; la pantalla de stock no se presenta como contabilidad completa.
7. Ajustar el inventario no habilita por sí mismo ventas retail. Estas requieren catálogo de vendedor, costo consumido verificable, cargo/abono de control, aislamiento, autorización y pruebas aprobadas conforme a ADR-SAAS-091/093.

## Alternativas

### A. Transferir desde Bodega con asociación y factor — descartada para este flujo

Descuenta un producto Bodega relacionado y acredita Nevera. No representa el inventario separado que Diana registra ni debe ser un requisito para dar de alta el conteo de Nevera.

### B. Carga directa sobre Nevera — aceptada

Registra saldo y costo en el artículo Nevera identificado, con ledger de inventario e idempotencia. Mantiene intacto el catálogo Bodega.

## Criterios de aceptación

1. Admin puede elegir Bodega o Nevera en la pantalla de inventario; el listado contiene únicamente el catálogo elegido.
2. Una carga Nevera registra cantidad y costo positivo por unidad base y persiste un movimiento identificable e idempotente.
3. La operación no cambia ningún producto, saldo, precio, presentación, categoría o movimiento de Bodega, aunque haya nombres iguales.
4. Reintentar el mismo comando no duplica el movimiento ni el stock; un comando distinto registra un nuevo ajuste conforme a la cantidad objetivo.
5. Payload cross-tenant, producto inactivo/inexistente, catálogo alterado, costo faltante o no positivo con stock, cambio de costo sin entrada, saldo inválido y reducción bajo reservas fallan sin escrituras parciales.
6. El cliente vendedor no recibe el costo ni adquiere capacidad para ajustar inventario.
7. La importación conserva stock cero. No se infieren asociación, factor, costo o existencia a partir de nombres o tarifas.
8. Las pruebas Functions cubren transacción, idempotencia, costo, tenant y aislamiento entre catálogos; las pruebas UI cubren selección del catálogo y envío de cantidad/costo.
9. Cambiar el costo almacenado de Nevera requiere registrar una entrada positiva en el mismo comando; un cambio de costo sin movimiento de entrada se rechaza para preservar la trazabilidad del costo por movimiento.

## Consecuencias y límites

- Ya no se necesita correspondencia Bodega↔Nevera para registrar el inventario Nevera.
- Un ajuste de existencias no prueba una compra ni realiza un movimiento financiero. Si se requiere registrar compras/egresos o la cuenta operativa de Nevera, debe usarse o implementarse su flujo específico.
- Un costo por unidad base describe la carga registrada; el costeo FIFO de lotes y los abonos del subledger durante venta requieren implementación y validación antes de autorizar ventas retail.
- El catálogo Nevera importado con saldo cero no cambia por aceptar este ADR. No se cargan datos remotos.

## Registro de aceptación

El responsable estableció que los catálogos son independientes, aclaró que la carga de Nevera no transfiere inventario desde Bodega y autorizó implementar esa corrección. Esta aceptación supersede solo el origen por transferencia; conserva la separación, el aislamiento tenant-aware y la captura del costo real. No autoriza despliegues ni escrituras de stock.
