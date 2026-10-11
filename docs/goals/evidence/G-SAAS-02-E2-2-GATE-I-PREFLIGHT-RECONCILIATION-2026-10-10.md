# G-SAAS-02 / M2 / E2.2 — Gate I preflight reconciliado (2026-10-10)

## Dictamen

`BLOCKED — PRECONDICIONES COMERCIALES, OPERATIVAS Y DE ARQUITECTURA PENDIENTES`.

Este preflight reemplaza para el estado actual la lectura de “ningún insumo
disponible” del documento de 2026-10-05. Registra lo que el responsable ya
confirmó después de esa fecha y separa esos datos de lo que todavía no está
autorizado o no fue entregado. No crea oferta, tenant, membresía, catálogo,
cliente ni inventario; tampoco inicia producción.

## Base y límites

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Gate H:** certificado en PR #528, integrado en `main` por el commit
  `4ac00d7c012fe6a8d5ba439b993dc9e02ae1247d`; CI post-merge run
  [38060265375](https://github.com/Glemynart/micafe-pos/actions/runs/38060265375)
  terminó `success` sobre ese SHA.
- **Entorno usado para la certificación anterior:** fixture sintético en
  `micafe-pos-staging`; no representa al cliente.
- **Entorno autorizado para datos reales:** aún no consta consentimiento
  explícito para almacenar datos reales en staging o producción.
- **Producción:** no consultada ni modificada en este preflight.

## Insumos reconciliados

| Dato | Estado | Alcance/observación |
|---|---|---|
| Nombre comercial | `Distribuidora Las Jiménez` — CONFIRMADO por el responsable | La razón social y datos legales no están documentados aquí. |
| `empresaId` | `distribuidora-las-jimenez` — PROPUESTO Y ACEPTADO por el responsable | Sigue sujeto a la validación canónica de disponibilidad e invariantes de Bootstrap. |
| Vertical | `BODEGA_MVP1` — CONFIRMADA | Corresponde a operación distribuidora. |
| Plan | `mvp_comercial`, versión 2; operación con plan completo — CONFIRMADO | El precio publicado permanece en `1.800.000 COP`; no modificar el catálogo público. |
| Oferta del tenant | `1.600.000 COP` por un año — APROBACIÓN INTERNA DOCUMENTADA | Aprobación específica de términos en [evidencia de oferta](G-SAAS-02-E2-2-GATE-I-COMMERCIAL-OFFER-APPROVAL-2026-10-06.md). No prueba que la cliente haya aceptado ni que la oferta esté persistida. |
| Administradora inicial | `Diana Jimenez` — CONFIRMADA como administradora inicial y autorizadora del alta | Nombre de cuenta/identidad verificable y cualquier identificador de Auth se validan fuera de este documento. |
| Canal para credencial temporal | WhatsApp — CONFIRMADO | Falta número/canal destino verificado si Diana desea recibir por WhatsApp la credencial temporal inicial. No existe envío automatizado de WhatsApp en la app; la entrega es externa y no se guardarán credenciales ni PIN en Git. |
| Operación inicial | La administradora también venderá; no usará facturación electrónica al inicio — CONFIRMADO como intención operativa | No equivale a validar obligaciones legales/fiscales. País fiscal y configuración tributaria siguen pendientes de confirmación. |
| Catálogo de referencia | 110 productos entregados por el responsable mediante listas impresas — RECIBIDO | Los valores impresos son precio de venta al cliente. `x N unidades` indica empaque de N unidades; las bebidas fuertes sin múltiplo expreso se venden por unidad. El detalle debe transcribirse y validarse antes de importarse. |
| Precio de productos para Las Jiménez | ADR-SAAS-070 Opción 1 — ACEPTADA por el responsable | Se conserva un precio único por presentación para compradores del tenant. El valor `1.600.000 COP` corresponde exclusivamente a la oferta anual del software bajo ADR-SAAS-061; no es una tarifa de producto. Los 110 valores impresos siguen pendientes de validación antes de importarse. |
| Stock inicial real | NO ENTREGADO | El stock de pruebas fue autorizado solo para escenarios de staging; Diana debe hacer/validar el inventario físico inicial antes de cargar existencias reales. |

## Pendientes que impiden la mutación canónica

| Pendiente | Por qué es necesario | Gate/acción |
|---|---|---|
| Entorno explícito para almacenar datos reales y autorización de alta | La autorización general de pruebas no identifica por sí sola el proyecto/entorno autorizado para datos reales. | Gate I — confirmar con el responsable antes de Bootstrap/Activation. |
| Aceptación de la oferta por Diana/cliente, vigencia, fecha de inicio y tratamiento de Trial | La aprobación interna de precio no acredita aceptación contractual ni define vigencia canónica. | Gate I — validar y persistir únicamente mediante ADR-SAAS-061 tras aceptación. |
| ADR-SAAS-068 — venta en efectivo sin turno | Opción 2 fue señalada como preferida; falta confirmar el límite de control de caja: venta sin turno no entra al arqueo/cierre de turno y se revisa por venta/fecha. | Gate de arquitectura — aceptación final pendiente; no cambiar el flujo actual antes de registrarla. |
| ADR-SAAS-069 — actualización sin refresco manual | Opción 3 aceptada e implementada en PR #537, integrado en `main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4`; la CI post-merge sigue pendiente al corte de esta actualización. | Después de CI post-merge `SUCCESS`, ejecutar Gate C read-only y Gate D dirigido solo a `micafe-pos-staging`; observar convergencia y revalidar los casos afectados de F/G/H. La revalidación server-authoritative permanece obligatoria. |
| Usuarios operativos reales | El responsable confirma que Diana creará las cuentas reales y asignará los roles; no se requiere recibir ahora una lista de vendedores. | Gate I — Diana administrará usuarios/roles después del alta; no reutilizar vendedores sintéticos. |
| Catálogo digital aprobado | Hay 110 referencias en imágenes; los precios impresos son precios de venta. El responsable pide importar esos precios con una tarifa única por presentación y dejar el stock inicial en cero. La transcripción aún requiere revisión de nombres y factores de empaque; no hay matriz de precios por comprador. | Gate I — segunda revisión y aprobación de Diana antes de cargar. La carga real permanece bloqueada hasta autorizar el entorno y completar preflight. |
| Costos de compra | Se ingresarán después desde la operación de Bodega, mediante compras con costos reales por unidad; no inventar costos durante importación. | Antes de habilitar venta/stock: registrar compras reales para establecer existencias y costo. Stock cero impide confirmar ventas sin existencia. |
| Conteos físicos y ubicaciones de inventario | El responsable confirma que el catálogo se cargará con stock cero; el inventario físico se hará posteriormente por Diana. | Gate I — no cargar cantidades físicas hasta inventario aprobado por Diana. |
| Datos fiscales/legales mínimos y recuperación/rollback | COP y “sin facturación electrónica al inicio” no sustituyen país fiscal, identidad legal, contactos responsables ni ventana/plan de recuperación. | Gate I — confirmar según el runbook y validar preflight read-only antes de cualquier escritura. |

## Siguiente paso permitido

La implementación de ADR-SAAS-069 ya está integrada por PR #537 en
`main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4`; no se ha desplegado a
staging. Tras la CI post-merge, el siguiente paso es un Gate C read-only contra
el SHA vivo, seguido —solo si `PREFLIGHT = PASS`— de Gate D dirigido a
`micafe-pos-staging`. La sincronización debe medirse allí y los escenarios
afectados de F/G/H deben volver a certificarse. La venta sin turno no se cambia
hasta aceptar expresamente el límite de conciliación de ADR-SAAS-068.

Gate I permanece `BLOCKED` para cualquier Bootstrap, Activation, persistencia
de oferta, alta de usuarios reales, carga de catálogo/stock real, tráfico o
producción hasta resolver los pendientes. No se requiere que el responsable
abra una sesión POS/Backoffice para este preflight documental.

## Mutation audit

- Archivos de aplicación y pruebas funcionales: `0`.
- Firestore/Auth, solicitudes/ventas, agenda/reservas, inventario/ledger,
  catálogo/usuarios reales, Functions, Rules, IAM, Secrets, despliegue o
  tráfico: cambios `0`.
- Tenant real y producción: cambios `0`.
- Alcance: evidencia documental de preflight; no representa aceptación del
  cliente, dictamen de Gate I completo ni autorización de escritura.

## Aclaración del responsable (2026-10-10)

- Diana creará los usuarios reales y asignará sus roles; no se solicita lista de usuarios para preparar el tenant.
- El catálogo debe usar los 110 precios impresos como precios de venta y comenzar sin existencias. El costo de compra se registrará posteriormente con compras reales de Bodega.
- WhatsApp es solo el canal externo propuesto para entregar a Diana la credencial temporal inicial. No es un canal de notificaciones de venta/pedidos implementado por la app. Si se elige WhatsApp para esa entrega, hace falta confirmar el número destino; si se entrega la credencial por otro canal fuera de banda, el número no es requisito técnico.
- Estas decisiones no autorizan por sí solas escritura de datos reales ni habilitan Bootstrap/Activation.

## Actualización de estado — 2026-10-10 (Bogotá)

- PR #537 quedó integrado en `main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4` a las `2026-10-10 23:04:50` Bogotá; sus checks previos al merge pasaron. La CI post-merge es el run [38110437457](https://github.com/Glemynart/micafe-pos/actions/runs/38110437457) y estaba `in_progress` a las `23:08` Bogotá.
- No se desplegó el cambio a `micafe-pos-staging` ni se hicieron escrituras de tenant, Auth, Firestore, inventario o producción. Gate C/D y la revalidación F/G/H siguen pendientes.
- La creación de usuarios operativos y asignación de roles queda a cargo de Diana; no hace falta recibir ahora una lista de vendedores.
- La carga de catálogo con 110 precios de venta y stock cero permanece pendiente de aprobación de Diana y del preflight/autorización de Gate I. El costo se ingresará luego con compras reales; con stock cero no se podrán confirmar ventas.
- El número de WhatsApp solo es necesario si se usa ese canal externo para entregar la credencial temporal inicial. WhatsApp no es una integración de notificaciones operativas de la aplicación.
