# G-SAAS-01 — Resolución de decisión de producto

**Estado:** APROBADO POR PRODUCT OWNER
**Fecha de registro:** 2026-08-12
**Milestone:** `MT-U9 — Contrato y operación comercial inicial`

**Oferta aprobada:** `1.800.000 COP / año`, periodicidad `ANUAL`.

## Decisiones aprobadas

1. Durante MT-U9 el cobro será anual y manual. Solo un operador SaaS autorizado
   podrá confirmar el pago; no se integra un proveedor automático de billing.
2. Cada nueva Suscripción conservará un snapshot contractual inmutable con
   `planId`, `planVersion`, código del Plan, periodicidad, precio, moneda,
   capacidades, límites, una Sede conceptual, fiscalidad opcional y fechas
   contractuales. La evidencia histórica no se muta retroactivamente. Se
   autoriza un ADR técnico antes de implementar esta parte.
3. Mientras exista únicamente el Plan inclusivo, no habrá cambios de Plan
   durante el Trial.
4. El Trial será de 30 días. Si al finalizar el día 30 no hay confirmación de
   pago, la Suscripción y la Empresa pasarán inmediatamente a suspendido. No
   habrá periodo de gracia en MT-U9.
5. Reactivar requiere confirmación manual de pago anual; el nuevo periodo se
   calcula y establece server-side.
6. Cancelar durante un periodo pagado se programa para el final del periodo;
   el cliente conserva acceso hasta la fecha contractual de finalización.
7. MT-U9 no archiva ni elimina automáticamente tenants o datos. Exportación y
   eliminación serán operaciones posteriores, separadas, explícitas y
   auditables, sujetas a política y revisión legal.
8. `mvp_comercial` tendrá una nueva versión `ANUAL`; la versión mensual
   histórica permanece intacta y no se migran automáticamente sus Suscripciones.
9. El catálogo canónico del Plan inclusivo contiene exactamente:
   `sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`,
   `waste`, `shifts`, `cuentas_cobro`.

10. La versión anual se publica con precio `1800000` y moneda `COP`. El importe
    se guarda como entero en la unidad monetaria de COP; no se aceptan valores
    de precio o moneda desde una confirmación de pago.

## Límites de la autorización

No se autoriza billing automático, Wompi como billing SaaS, Sede técnica,
múltiples Sedes, MT-U10, MT-U11, límites cuantitativos, overages, paquetes de
facturación electrónica, referidos, offline, notificaciones ni eliminación
automática de datos.

La autorización permite auditar, diseñar, crear ADRs técnicos, implementar
MT-U9, probar, revisar Rules/tenant isolation, crear PRs y reconciliar la
documentación. No permite inventar decisiones de producto ni ampliar el Goal.
