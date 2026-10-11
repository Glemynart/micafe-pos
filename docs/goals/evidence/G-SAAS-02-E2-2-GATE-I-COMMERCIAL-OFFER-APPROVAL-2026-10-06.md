# G-SAAS-02 / M2 / E2.2 — Aprobación comercial de oferta tenant-specific

- **Fecha de aprobación:** 2026-10-06
- **Última actualización:** 2026-10-11
- **Estado:** términos aprobados internamente y aceptación de Diana reportada el 2026-10-11; registro canónico de oferta y Trial en producción pendiente de Gate I
- **Referencia de aprobación:** `G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06`
- **ADR aplicable:** `ADR-SAAS-061-oferta-comercial-tenant-especifica.md`
- **Tenant objetivo:** Distribuidora Las Jiménez (`distribuidora-las-jimenez`)

## Aprobación comercial

El Product Owner aprobó una oferta anual tenant-specific de **1.600.000 COP**
para `mvp_comercial` versión 2, destinada exclusivamente a Distribuidora Las
Jiménez. La vertical de operación acordada es `BODEGA_MVP1`. El precio público
del Plan permanece en **1.800.000 COP**; esta aprobación no crea ni publica una
nueva versión del catálogo.

El responsable confirma que Diana acepta la oferta por un año, con pago manual
y Trial de 30 días. La fecha prevista de inicio es el martes **2026-10-13**.
La oferta/relación contractual no está creada ni persistida; la fecha efectiva
de inicio debe establecerse por el flujo canónico de activación, no por una
escritura manual anticipada.

La oferta deberá usar el comando canónico de ADR-SAAS-061 y la referencia
anterior. El precio, el Plan y la Empresa objetivo no se pueden sustituir desde
el cliente. La vigencia debe definirse explícitamente al registrar el borrador
canónico.

## Límites y estado

Esta evidencia registra la aprobación interna y la aceptación de Diana tal
como fue reportada por el responsable; no sustituye un comprobante externo de
aceptación ni afirma que exista una oferta/Trial persistido. ADR-SAAS-061 aporta
la arquitectura y autoridad técnica, pero esta referencia es la aprobación
comercial específica del monto.

El destino de los datos reales se confirmó como producción. Esta evidencia no
declara realizados ni autoriza adelantar el registro de oferta, Bootstrap,
creación/configuración del tenant, emisión de credenciales, Activation, carga
de catálogo o inventario, tráfico ni deploy antes de completar los gates y el
preflight productivo correspondientes.

E2.2 permanece `EN EJECUCIÓN`; Gate I no se considera completo por estas
aceptaciones. La persistencia canónica de oferta/Trial, el Bootstrap,
Activation, importación del catálogo y demás operaciones quedan condicionados
a los gates y preflight productivo vigentes. Diana creará los usuarios y
asignará roles; sus datos se solicitarán cuando corresponda.

## Mutation audit de este registro

- Registro original: 1 archivo de evidencia; actualización documental del 2026-10-11.
- Oferta/Trial creados en Firebase: 0.
- Bootstrap / Activation / deploy / tráfico: 0.
- Cambios de producción: 0.
