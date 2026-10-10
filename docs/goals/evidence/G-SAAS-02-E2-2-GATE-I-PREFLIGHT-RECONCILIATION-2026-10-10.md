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
| Canal para credencial temporal | WhatsApp — CONFIRMADO | Falta número/canal destino verificado. No guardar credenciales ni PIN en Git. |
| Operación inicial | La administradora también venderá; no usará facturación electrónica al inicio — CONFIRMADO como intención operativa | No equivale a validar obligaciones legales/fiscales. País fiscal y configuración tributaria siguen pendientes de confirmación. |
| Catálogo de referencia | 110 productos entregados por el responsable mediante listas impresas — RECIBIDO | Los valores impresos son precio de venta al cliente. `x N unidades` indica empaque de N unidades; las bebidas fuertes sin múltiplo expreso se venden por unidad. El detalle debe transcribirse y validarse antes de importarse. |
| Precio distribuidor para Las Jiménez | Solicitud y aprobación de manejar precio especial — CONFIRMADAS | No se recibieron importes/regla aprobada por producto. Los precios especiales no se pueden inferir a partir de los precios impresos. |
| Stock inicial real | NO ENTREGADO | El stock de pruebas fue autorizado solo para escenarios de staging; Diana debe hacer/validar el inventario físico inicial antes de cargar existencias reales. |

## Pendientes que impiden la mutación canónica

| Pendiente | Por qué es necesario | Gate/acción |
|---|---|---|
| Entorno explícito para almacenar datos reales y autorización de alta | La autorización general de pruebas no identifica por sí sola el proyecto/entorno autorizado para datos reales. | Gate I — confirmar con el responsable antes de Bootstrap/Activation. |
| Aceptación de la oferta por Diana/cliente, vigencia, fecha de inicio y tratamiento de Trial | La aprobación interna de precio no acredita aceptación contractual ni define vigencia canónica. | Gate I — validar y persistir únicamente mediante ADR-SAAS-061 tras aceptación. |
| ADR propuesto para ventas en efectivo sin turno | El flujo actual de ADR-SAAS-062 exige revalidar un turno al confirmar. Retirar esa precondición afecta autoridad de cobro, efectivo recibido/cambio, caja, ledger, conciliación e idempotencia. | Gate de arquitectura — redactar ADR `Propuesto`; no implementar hasta aprobación explícita. |
| Contrato de actualización sin refresco manual | La lista del vendedor y la bandeja administrativa usan lecturas/polling; el responsable pidió ver stock y solicitudes sin depender de “Actualizar”. Hace falta determinar el alcance, la fuente de lectura, aislamiento, frescura y comportamiento de reconexión. | Pre-I — inspección/decisión técnica; no venderlo como tiempo real hasta probarlo. Si altera autoridad, persistencia o contrato de datos, aplicar Gate de arquitectura. |
| Usuarios operativos reales | La lista de vendedoras/roles por persona quedó pendiente de confirmar con la cliente. | Gate I — recibir usuarios y roles autorizados; no reutilizar vendedores sintéticos. |
| Catálogo digital aprobado | Hay 110 referencias en imágenes, pero la transcripción, revisión de nombres/unidades/factores y la tabla de precios especiales aún no están validadas como importación. | Gate I — convertir fuente, hacer revisión de segunda pasada y aprobar catálogo antes de cargarlo. |
| Conteos físicos y ubicaciones de inventario | No se proporcionaron existencias reales ni su fecha/conteo responsable. | Gate I — cargar cantidades únicamente después de inventario aprobado por Diana. |
| Datos fiscales/legales mínimos y recuperación/rollback | COP y “sin facturación electrónica al inicio” no sustituyen país fiscal, identidad legal, contactos responsables ni ventana/plan de recuperación. | Gate I — confirmar según el runbook y validar preflight read-only antes de cualquier escritura. |

## Siguiente paso permitido

El trabajo de producto que no cambia reglas de negocio puede prepararse en
`main` después de Gate H. Para el efectivo sin turno, el siguiente paso es una
propuesta ADR que exponga alternativas, autoridad de pago/efectivo, efectos de
caja y rollback. Debe permanecer `Propuesto` hasta aprobación explícita; no se
despliega ni modifica el flujo actual antes de esa aprobación.

La sincronización visual puede analizarse contra las suscripciones Firestore y
callables existentes. Antes de elegir una implementación deben precisarse la
frecuencia/garantía que necesita la bodega y verificarse Rules, costo, permisos,
reconexión y reconciliación con la autoridad server-side. No se agrega una
segunda autoridad de inventario ni se permite que una lectura en vivo reemplace
la revalidación transaccional al confirmar la venta.

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
