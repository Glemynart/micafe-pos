# G-SAAS-02 / M2 / E2.2 — Gate I preflight reconciliado (2026-10-10)

## Dictamen

`BLOCKED — PRECONDICIONES COMERCIALES, OPERATIVAS Y DE ENTORNO PENDIENTES`.

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
- **Entorno autorizado para datos reales:** el responsable confirma el
  2026-10-11 que los datos reales se almacenarán en producción. Esto identifica
  el entorno; no autoriza por sí solo Bootstrap, Activation ni escrituras antes
  de completar y aprobar el preflight de Gate I.
- **Producción:** no consultada ni modificada en este preflight.

## Insumos reconciliados

| Dato | Estado | Alcance/observación |
|---|---|---|
| Nombre comercial | `Distribuidora Las Jiménez` — CONFIRMADO por el responsable | La razón social y datos legales no están documentados aquí. |
| `empresaId` | `distribuidora-las-jimenez` — PROPUESTO Y ACEPTADO por el responsable | Sigue sujeto a la validación canónica de disponibilidad e invariantes de Bootstrap. |
| Vertical | `BODEGA_MVP1` — CONFIRMADA | Corresponde a operación distribuidora. |
| Plan | `mvp_comercial`, versión 2; operación con plan completo — CONFIRMADO | El precio publicado permanece en `1.800.000 COP`; no modificar el catálogo público. |
| Oferta del tenant | Diana acepta `1.600.000 COP` por un año, pago manual y Trial de 30 días — CONFIRMADO por el responsable el 2026-10-11 | Aceptación reportada; la oferta y el Trial aún no están persistidos. Fecha prevista de inicio: martes 2026-10-13; la fecha efectiva debe coincidir con la activación canónica y no se debe iniciar anticipadamente. |
| Administradora inicial | `Diana Jimenez` — CONFIRMADA como administradora inicial y autorizadora del alta | El responsable pide solicitarle los datos legales/comerciales faltantes al primer inicio de sesión; hay que verificar que el onboarding los solicite sin bloquear la operación inicial DEMO/no fiscal. No se guardan valores ficticios. |
| Canal para credenciales temporales | WhatsApp — canal preferido para entregar a cada vendedor su usuario y clave temporal | La entrega automatizada no existe en la app. Para el primer tenant se puede entregar fuera de banda; Diana creará usuarios y roles. Teléfonos/nombres de vendedores se obtendrán cuando Diana los cree. No guardar credenciales ni PIN en Git ni en el sistema de soporte. |
| Operación inicial | Diana también venderá y no usará facturación electrónica al inicio — CONFIRMADO como intención operativa | País/datos fiscales no se inventan. La información legal/comercial se solicitará a Diana en el primer inicio, sujeto a verificar o implementar ese paso de onboarding antes de depender de él. |
| Catálogo de referencia | Diana aprueba la transcripción de los 110 productos, empaques y precios — CONFIRMADO el 2026-10-11 | Los valores impresos son precio de venta al cliente. `x N unidades` indica empaque de N unidades; las bebidas fuertes sin múltiplo expreso se venden por unidad. Cargar una tarifa única por presentación y stock inicial cero; no inventar costos de compra. |
| Precio de productos para Las Jiménez | ADR-SAAS-070 Opción 1 — ACEPTADA por el responsable; Diana aprueba los 110 precios impresos como precio de venta | Se conserva un precio único por presentación para compradores del tenant. El valor `1.600.000 COP` corresponde exclusivamente a la oferta anual del software bajo ADR-SAAS-061; no es una tarifa de producto. |
| Stock inicial real | NO ENTREGADO | El stock de pruebas fue autorizado solo para escenarios de staging; Diana debe hacer/validar el inventario físico inicial antes de cargar existencias reales. |

## Pendientes que impiden la mutación canónica

| Pendiente | Por qué es necesario | Gate/acción |
|---|---|---|
| Entorno explícito para almacenar datos reales y autorización de alta | La autorización general de pruebas no identifica por sí sola el proyecto/entorno autorizado para datos reales. | Gate I — confirmar con el responsable antes de Bootstrap/Activation. |
| Aceptación de la oferta por Diana/cliente, vigencia, fecha de inicio y tratamiento de Trial | La aprobación interna de precio no acredita aceptación contractual ni define vigencia canónica. | Gate I — validar y persistir únicamente mediante ADR-SAAS-061 tras aceptación. |
| ADR-SAAS-068 — venta en efectivo sin turno | Opción 2 y su límite fueron aprobados explícitamente el 2026-10-10: efectivo sin turno no entra al arqueo/cierre de turno y se revisa por venta/fecha. | Decisión de arquitectura resuelta. Implementar y certificar el contrato en una PR de E2.2 antes de Gate I; el flujo actual no cambia hasta integrar y pasar sus gates. |
| ADR-SAAS-069 — actualización sin refresco manual | Opción 3 aceptada e implementada en PR #537, integrado en `main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4`; la CI post-merge run `38110437457` terminó `success` sobre ese SHA. | Ejecutar Gate C read-only y, solo si pasa, Gate D dirigido a `micafe-pos-staging`; observar convergencia y revalidar los casos afectados de F/G/H. La revalidación server-authoritative permanece obligatoria. |
| Usuarios operativos reales | El responsable confirma que Diana creará las cuentas reales y asignará los roles; no se requiere recibir ahora una lista de vendedores. | Gate I — Diana administrará usuarios/roles después del alta; no reutilizar vendedores sintéticos. |
| Catálogo digital aprobado | Diana ya aprobó la transcripción de 110 productos, empaques y precios, con stock cero. | La decisión de contenido está resuelta. Sigue pendiente verificar/importar el artefacto aprobado solo después del preflight de producción; no cargar cantidades ni costos ficticios. |
| Costos de compra | Se ingresarán después desde la operación de Bodega, mediante compras con costos reales por unidad; no inventar costos durante importación. | Antes de habilitar venta/stock: registrar compras reales para establecer existencias y costo. Stock cero impide confirmar ventas sin existencia. |
| Conteos físicos y ubicaciones de inventario | El responsable confirma que el catálogo se cargará con stock cero; el inventario físico se hará posteriormente por Diana. | Gate I — no cargar cantidades físicas hasta inventario aprobado por Diana. |
| Solicitud de datos legales al primer inicio | El responsable pide que Diana complete los datos legales/comerciales al iniciar sesión por primera vez; no habrá facturación electrónica inicialmente. | Antes de depender de ese flujo, verificar en producto dónde se solicitan esos datos, qué campos son obligatorios y que el acceso DEMO no fiscal no se bloquee. No inventar razón social/NIT ni datos fiscales. |
| ADR-SAAS-071 — frontera de compras Bodega | Propuesta Opción 1 pendiente de aprobación explícita. | Aprobar o rechazar la opción en ADR-SAAS-071 antes de implementar la callable de compras Bodega y repetir Gate C. |
| Preflight de producción y recuperación | Entorno de datos reales confirmado como producción; no se ha ejecutado el preflight productivo ni existe evidencia de rollback para el alta nueva. | Completar la secuencia de gates con lectura previa, runbook, revisión de rollback y autorización operativa específica antes de cualquier escritura. |

## Siguiente paso permitido

La implementación de ADR-SAAS-069 ya está integrada por PR #537 en
`main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4`; no se ha desplegado a
staging. La CI post-merge terminó `success`; el siguiente paso es un Gate C read-only contra
el SHA vivo, seguido —solo si `PREFLIGHT = PASS`— de Gate D dirigido a
`micafe-pos-staging`. La sincronización debe medirse allí y los escenarios
afectados de F/G/H deben volver a certificarse. La venta sin turno no se cambia
hasta implementar el contrato aceptado de ADR-SAAS-068 Opción 2 en una PR
separada y superar sus validaciones; esa implementación y certificación son
requisito antes de Gate I.

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

- PR #537 quedó integrado en `main @ 7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4` a las `2026-10-10 23:04:50` Bogotá; sus checks previos al merge pasaron. La CI post-merge, run [38110437457](https://github.com/Glemynart/micafe-pos/actions/runs/38110437457), terminó `success` sobre ese SHA a las `2026-10-11T04:28:44Z`.
- No se desplegó el cambio a `micafe-pos-staging` ni se hicieron escrituras de tenant, Auth, Firestore, inventario o producción. Gate C/D y la revalidación F/G/H siguen pendientes.
- La creación de usuarios operativos y asignación de roles queda a cargo de Diana; no hace falta recibir ahora una lista de vendedores.
- Diana aprobó la transcripción de los 110 precios de venta y empaques, con stock cero. La importación real sigue sujeta al preflight y ejecución autorizada de Gate I. El costo se ingresará luego con compras reales; con stock cero no se podrán confirmar ventas.
- La preferencia actual es que Diana entregue por WhatsApp las credenciales temporales a los vendedores que cree. No se requiere hoy una lista de vendedores; los teléfonos se obtendrán al crearlos. WhatsApp no es una integración de notificaciones operativas ni de envío automático de credenciales de la aplicación.
- El responsable aprobó la Opción 2 de ADR-SAAS-068 y aceptó que efectivo sin turno no se concilia en el cierre de turno, sino por venta y fecha. La aprobación no cambia código ni autoriza deploy o escrituras remotas.

## Confirmaciones de Gate I — 2026-10-11

- El responsable confirma producción como entorno para guardar los datos reales.
- Informa que Diana acepta la oferta anual de `1.600.000 COP`, con pago manual y
  Trial de 30 días. La fecha prevista de inicio es martes 2026-10-13. No se ha
  creado la oferta ni el Trial; la fecha efectiva deberá resultar del flujo
  canónico al activar el tenant.
- Diana aprueba la transcripción de 110 productos, empaques y precios impresos
  como precios de venta, con inventario inicial cero.
- No habrá facturación electrónica al inicio. El responsable solicita que los
  datos legales/comerciales se pidan a Diana durante su primer inicio de
  sesión; este flujo aún debe verificarse en el producto. No se deben inventar
  razón social, NIT ni datos fiscales.
- WhatsApp es el canal preferido para entregar credenciales temporales a los
  vendedores. Diana creará usuarios y roles; el envío automatizado de WhatsApp
  no existe en la aplicación y los datos de vendedores se obtendrán al crearlos.
  La entrega inicial puede hacerse manualmente fuera de banda sin registrar
  contraseñas en Git.
- Estas confirmaciones resuelven insumos comerciales y de catálogo, pero no
  autorizan adelantar escrituras productivas fuera del orden de gates ni
  sustituyen la aceptación pendiente de ADR-SAAS-071.

## Actualización de Gate C — 2026-10-11

El preflight read-only del commit `main @
7a44a0be618edf4ac7bfc702e171be1e2e6ab0b4` quedó
`BLOCKED` porque el cambio de señal posterior a compras vive en `saas-auth`,
fuera del boundary que ADR-SAAS-049/054 permite desplegar. No se ejecutó Gate D
ni hubo mutaciones staging/producción. Los hashes, reglas, revisiones de
rollback y causa exacta están en
[`G-SAAS-02-E2-2-GATE-C-ADR069-PREFLIGHT-2026-10-11.md`](G-SAAS-02-E2-2-GATE-C-ADR069-PREFLIGHT-2026-10-11.md).

La propuesta para resolverlo es ADR-SAAS-071. No se modificará el flujo de
compras ni se desplegará `saas-auth`; antes se requiere aprobar una frontera
Bodega compatible, implementarla y repetir Gate C.
