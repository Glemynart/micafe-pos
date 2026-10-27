# ADR-SAAS-094 — Bodega MVP-1: catálogos separados de Bodega y Nevera

## Estado

**ACEPTADO — 2026-10-27; parcialmente supersedido por ADR-SAAS-096.** La persona responsable aprobó dos catálogos independientes, correspondencias manuales con factor explícito para transferencias y ofertas aisladas por catálogo. ADR-SAAS-096 reemplaza el requisito de transferencia para cargar existencias Nevera: su inventario se registra directamente y no descuenta Bodega. Los requisitos previos de transferencias quedan históricos y no habilitan ese flujo. Esta aceptación autoriza implementación versionada y pruebas; no autoriza importación/backfill remoto, carga/transferencia de existencias ni despliegues.

- **Goal:** G-SAAS-02 → M2 → E2.2; la certificación operativa continúa en M3 / E3.1 y M4 / E4.1.
- **Relacionado:** ADR-SAAS-091, ADR-SAAS-092 y ADR-SAAS-093.
- **Supersede parcialmente:** ADR-SAAS-092 en el uso de dos precios sobre una misma presentación. Los precios de PRECIOS CONS FINAL pertenecen al catálogo Nevera; no son una segunda tarifa del producto Bodega. Las reglas de ofertas por presentación, snapshots y vigencia siguen vigentes, aplicadas al catálogo correspondiente.
- **Límite operativo:** la implementación debe pasar por PR, CI, auditoría y preflight. La aceptación no autoriza importación/backfill remoto, escritura de datos, transferencia de existencias, activación de Nevera, despliegue, publicación de Rules ni operación productiva.

## Contexto

El archivo vigente DISTRIBUIDORA LAS JIMENEZ (2).xlsx tiene dos hojas con propósitos distintos. La hoja PRECIOS A TIENDA contiene 107 filas para el catálogo mayorista de Bodega. La hoja PRECIOS CONS FINAL contiene 55 filas para el catálogo retail de Nevera. La responsable confirmó que los productos de Nevera se venden al consumidor individualmente y son un surtido separado.

Bodega ya tiene productos, presentaciones y categorías cargados con stock cero. El registro previo de precios de consumidor final en cuatro presentaciones Bodega provino de una interpretación anterior del Excel; esos campos no demuestran que exista identidad compartida ni stock en Nevera y requieren reconciliación auditable antes de cualquier activación.

ADR-SAAS-091 acepta ubicaciones Bodega/Nevera dentro del espacio operativo, transferencias internas y una cuenta de control de Nevera valorizada al costo, sin simular un cliente externo ni duplicar ingresos. ADR-SAAS-093 exige conservar costos exactos por presentación en COP. Ninguno define cómo mapear identidades entre dos catálogos ni cómo convertir un empaque mayorista en unidades retail.

## Problema

El modelo de ADR-SAAS-092 representa precios por canal dentro de la misma presentación. Eso no representa el inventario real descrito por la responsable: Bodega puede tener una caja, mientras Nevera vende unidades individuales; algunos productos existen solo en uno de los surtidos. La coincidencia de texto entre hojas no es evidencia suficiente para compartir producto, costo, presentación ni existencia.

Sin una regla explícita, el POS podría mostrar al vendedor productos retail sin stock, transferir mercancía al producto equivocado o contabilizar dos veces el costo/ingreso de Nevera.

## Decisión

Mantener **dos catálogos lógicos, independientes y tenant-aware**: Bodega y Nevera. Cada catálogo tendrá identidades propias de producto, presentación y categoría, incluso cuando los nombres coincidan. La implementación podrá reutilizar las colecciones existentes solo si todo lector/escritor exige un discriminador de catálogo y sus pruebas demuestran el aislamiento; no se aceptará inferir el catálogo desde el precio, nombre, rol o ruta del navegador.

1. Las 107 filas de PRECIOS A TIENDA corresponden a Bodega y las 55 filas de PRECIOS CONS FINAL a Nevera. El importador mantiene inventario inicial en cero. No crea asociación entre hojas por nombre idéntico o parecido.
2. Categorías y presentaciones se consultan dentro del catálogo activo. La administración puede buscar y filtrar por categoría; Bodega y Nevera no comparten categorías implícitamente.
3. El precio de venta de una presentación Bodega es el precio de la presentación/empaque completo aprobado para tienda. El precio de una presentación Nevera es el precio retail de esa presentación. No se guarda precioConsumidorFinalCOP como segundo precio operativo en Bodega.
4. Un producto Nevera puede compartir mercancía de origen con Bodega solo mediante una correspondencia explícita y aprobada por administración entre presentación de origen y producto/presentación de destino. La correspondencia declara el factor de conversión de unidades base. Sin ella, no se puede transferir stock entre catálogos.
5. La transferencia Bodega→Nevera descuenta el número verificado de unidades base de Bodega, agrega las unidades convertidas a Nevera en una operación atómica y conserva el stock total del tenant. No es venta a un tercero ni ingreso.
6. La transferencia crea el cargo del subledger Nevera usando el costo COP snapshot de la capa/paquete de origen, según ADR-SAAS-091/093. La venta retail consume exclusivamente stock Nevera, usa el precio del catálogo Nevera y registra el ingreso una sola vez; el abono del subledger se calcula al costo de lo vendido, no con el efectivo recibido.
7. Si un artículo retail no tiene correspondencia aprobada o costo de origen, se puede conservar como producto Nevera con stock cero; no se permite venderlo hasta tener precio válido y existencia registrada por un flujo autorizado.
8. Las ofertas se definen por catálogo y presentación. El catálogo determina la ubicación y el ámbito de precio; inicio, vencimiento y cierre manual conservan las reglas aprobadas de ADR-SAAS-092. Una oferta de Nevera no cambia el precio de Bodega ni viceversa.
9. Las cuatro tarifas de consumidor existentes en presentaciones Bodega se mantienen sin modificación mientras se ejecuta una reconciliación de solo lectura. La migración decide explícitamente si cada dato se preserva como evidencia histórica o se carga a una presentación Nevera; nunca crea productos/stock por coincidencia ni modifica snapshots históricos.

### Conversión y costo retail aceptados

Para convertir una presentación mayorista de Q unidades base con costo exacto C COP a unidades retail, la transferencia crea una capa de costo vinculada al comando y a la correspondencia aprobada. El costo acumulado asignado a n unidades será floor(C × n / Q); el costo de cada unidad será la diferencia entre acumulados consecutivos. Así, el costo total de la capa permanece exactamente C COP aunque no sea divisible por Q.

Se consumen primero las capas más antiguas (FIFO), de forma transaccional e idempotente. Una misma transferencia no puede duplicar stock ni cargo. Reversar una transferencia requiere un movimiento compensatorio auditable; no se edita el ledger.

## Alternativas

### A. Un catálogo maestro con varios surtidos/canales

Una identidad de producto se comparte entre Bodega y Nevera; cada presentación declara surtidos y canales.

- **Ventaja:** comparte identidad donde el artículo es realmente el mismo.
- **Riesgo:** contradice la separación funcional confirmada y hace demasiado fácil interpretar coincidencias de nombre/empaque como identidad o disponibilidad común. No se recomienda.

### B. Dos catálogos independientes con correspondencia explícita para traslados — recomendada

Cada catálogo tiene sus productos y presentaciones; solo una correspondencia revisada permite convertir mercancía entre ellos.

- **Ventaja:** coincide con las dos hojas y separa precio, disponibilidad, categoría e identidad; conserva transferencias trazables cuando se confirma el artículo.
- **Costo:** requiere administrar asociaciones, factores, capas de costo y saldo separado; los artículos no vinculados permanecen sin transferencia.

### C. Dos catálogos sin posibilidad de transferencia

Bodega y Nevera operan como inventarios totalmente aislados.

- **Ventaja:** aislamiento simple.
- **Riesgo:** no puede representar el movimiento de mercancía de Bodega a la nevera física ni el saldo al costo pedido para Nevera. No satisface ADR-SAAS-091.

## Secuencia de migración y activación

1. Ejecutar un preflight de solo lectura de Bodega: productos, presentaciones, categorías, stock, reservas, ledger, costo, ventas activas y campos de consumidor ya persistidos. Confirmar conteos y sumas por tenant.
2. Definir e implementar el discriminador/alcance de catálogo con consultas tenant-aware. Un backfill idempotente asigna los 107 productos existentes a Bodega y preserva IDs, snapshots, costos y ledger; no crea productos Nevera ni cambia precios.
3. Preparar un plan offline independiente de las 55 filas Nevera: categoría, nombre, presentación, precio consumidor, asociación Bodega revisada (si aplica), factor, fuente de costo y conteo físico. El plan no escribe datos.
4. Validar las cuatro tarifas de consumidor preexistentes y documentar su destino sin borrar evidencia. No convertirlas automáticamente en precios de Nevera.
5. Separar por PR la administración/importación Nevera, correspondencias, transferencia/subledger y ventas retail. Todo PR conserva compatibilidad con registros Bodega existentes y snapshots v1/v2.
6. Antes de activar Nevera: dry-run sin errores, aprobación de asociaciones, costos y conteos, pruebas Emulator/Rules/E2E, aislamiento entre tenants y backfill repetible no-op. La activación/despliegue requiere corte y autorización específicos.

## Seguridad, compatibilidad y recuperación

- Toda query y mutación deriva el tenant de Auth/membresía y verifica permiso, catálogo, presentación, ubicación, factor, precio, costo y saldo en servidor.
- No se confía en empresaId, catálogo, ubicación, costo, precio ni factor enviado por el cliente. Payload alterado, catálogo cruzado y acceso cross-tenant se rechazan.
- Firestore Rules mantienen la escritura directa de ledger, capas, correspondencias y saldos en deny-by-default; solo las callables canónicas pueden mutar.
- Ventas, traslados y ofertas congelan catálogo, producto, presentación, factor, precio, costo, ubicación y versión de contrato en snapshots append-only.
- El backfill es idempotente y no reasigna stock a Nevera. La recuperación de código no revierte movimientos: se detiene la operación y se preservan ledgers, capas y snapshots; cualquier corrección usa movimientos compensatorios.

## Criterios de aceptación arquitectónica

1. Una consulta Bodega no devuelve registros Nevera y viceversa; categorías, productos y presentaciones están scoped a empresa y catálogo.
2. Importar el plan crea exactamente los registros aprobados en el catálogo objetivo, con stock inicial cero; repetirlo produce no-op y no cruza listas.
3. Los 107 registros actuales conservan identidad y datos Bodega. Las 55 filas de consumidor no comparten IDs ni reciben asociaciones automáticas.
4. Precio/categoría/presentación inexistente o de catálogo equivocado bloquea venta sin mutación.
5. Una transferencia exige correspondencia vigente, factor y costo; en transacción consume stock de origen, agrega la cantidad destino y registra un cargo único al costo exacto. Stock consolidado se conserva.
6. Costo por capas conserva COP exactos tras salidas parciales y concurrentes; reintentos idempotentes no duplican stock, cargo, venta o abono.
7. Venta Nevera usa precio retail server-side y descuenta solo Nevera; el ingreso se reconoce una vez y el subledger se abona al costo snapshot.
8. Las ofertas se aíslan por catálogo y no reescriben el precio base ni afectan el otro catálogo.
9. Fixtures y pruebas prueban permisos permitidos/denegados de admin y vendedor, aislamiento cross-tenant/cross-catálogo, manipulación de payload, compatibilidad de snapshots y fallos/reintentos.
10. Backfill dry-run conserva stock/reservas/ledger, y repetir backfill es no-op. No hay activación antes de aprobación y reconciliación de precios, costos y conteos.

## Riesgos y límites

- La hoja Nevera no demuestra por sí sola costo ni existencia física; sin una fuente de costo y conteo, sus productos permanecen en cero/no vendibles.
- Una correspondencia errónea o factor invertido puede mover cantidades/costos al artículo incorrecto; se requiere vista previa, confirmación admin y recibo legible.
- precioConsumidorFinalCOP existente en Bodega puede tener historia, pero no prueba una venta/stock Nevera. Su tratamiento requiere reconciliación; no borrar ni reinterpretar silenciosamente.
- El margen de venta requiere costo de adquisición exacto por presentación/lote. No se obtiene de la diferencia de precios ni de un porcentaje supuesto.
- Los invariantes técnicos anteriores quedaron aceptados el 2026-10-27. Su implementación sigue sujeta a PR, pruebas y auditoría; la aceptación no autoriza operaciones remotas.

## Aprobación registrada

El responsable aprobó expresamente el 2026-10-27 todos los puntos técnicos de la propuesta:

1. Catálogos lógicos separados con IDs independientes y categorías/presentaciones scoping por catálogo.
2. Correspondencia manual aprobada entre una presentación origen de Bodega y un producto/presentación destino Nevera, con factor explícito; sin correspondencia no hay transferencia.
3. Transferencias internas atómicas/idempotentes con stock separado y cargo al subledger Nevera al costo exacto de origen.
4. Capas de costo FIFO y asignación entera determinista por diferencia de acumulados para conservar el total COP del empaque.
5. Ofertas asociadas a catálogo + presentación, sin efectos cruzados.

La confirmación del Excel y la aprobación de estos invariantes habilitan a continuar con la implementación. No autorizan importar filas, crear asociaciones reales, migrar existencias, activar ventas retail ni desplegar. Esas acciones requieren su preflight y corte operativo específico.
