# G-SAAS-02 / M2 / E2.2 — Aprobación comercial de oferta tenant-specific

- **Fecha de aprobación:** 2026-10-06
- **Estado:** términos aprobados por Product Owner; registro canónico en staging pendiente
- **Referencia de aprobación:** `G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06`
- **ADR aplicable:** `ADR-SAAS-061-oferta-comercial-tenant-especifica.md`
- **Tenant objetivo:** Distribuidora Las Jiménez (`distribuidora-las-jimenez`)

## Aprobación comercial

El Product Owner aprobó una oferta anual tenant-specific de **1.600.000 COP**
para `mvp_comercial` versión 2, destinada exclusivamente a Distribuidora Las
Jiménez. La vertical de operación acordada es `BODEGA_MVP1`. El precio público
del Plan permanece en **1.800.000 COP**; esta aprobación no crea ni publica una
nueva versión del catálogo.

La oferta deberá usar el comando canónico de ADR-SAAS-061 y la referencia
anterior. El precio, el Plan y la Empresa objetivo no se pueden sustituir desde
el cliente. La vigencia debe definirse explícitamente al registrar el borrador
canónico.

## Límites y estado

Esta aprobación registra la autorización interna de los términos comerciales;
no afirma que el cliente haya aceptado la oferta ni que exista una oferta
persistida. ADR-SAAS-061 aporta la arquitectura y autoridad técnica, pero esta
referencia es la aprobación comercial específica del monto.

Por sí sola no autoriza ni declara realizados el registro de la oferta en
staging, Bootstrap, creación/configuración del tenant, emisión de credenciales,
Activation, carga de catálogo o inventario, tráfico, deploy ni producción.
Cada operación posterior conserva sus gates y preflight correspondientes.

E2.2 permanece `EN EJECUCIÓN`; Gate I no se considera completo por esta
aprobación. Los datos de usuarios iniciales, vigencia de la oferta y demás
precondiciones operativas pendientes se verifican antes de su operación
canónica.

## Mutation audit de este registro

- Cambios de documentación: 1 archivo nuevo.
- Oferta creada en Firebase: 0.
- Bootstrap / Activation / deploy / tráfico: 0.
- Cambios de producción: 0.
