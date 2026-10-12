# G-SAAS-02 / M2 / E2.2 — Aceptación de ADR-SAAS-076

**Fecha:** 2026-10-12
**Decisión:** ampliar a once IDs la migración de namespace Bodega inicialmente aprobada en ADR-SAAS-074.
**Alcance:** preparar PR de implementación de código/cliente; sin deploy, Rules, IAM, Secrets, Functions remotas, escrituras de datos, tenant real ni producción.

## Evidencia

La aprobación inicial de ADR-SAAS-074 cubría cuatro IDs observados activos en la lectura read-only de producción. La prueba de discovery conjunta falló y detectó once IDs repetidos entre los manifiestos fuente de `saas-auth`, `saas-bodega` y `saas-bodega-operations`. Cuatro coinciden con la evidencia remota; los otros siete son colisiones de manifiesto y no se declaran activos en producción sin evidencia.

En respuesta a la pregunta sobre los siete IDs adicionales, el responsable respondió: “Ampliar ADR-074 a los 11 IDs (Recomendado)”. Esta aprobación se registra en ADR-SAAS-076, sucesor que amplía el inventario y el alcance de ADR-SAAS-074 sin modificar el comportamiento de `saas-auth`.

## Límite operativo

La aprobación autoriza preparar e implementar el cambio en una PR. No cambia Functions remotas ni permite deploy. Gate C y la autorización de despliegue específica siguen siendo obligatorios; cualquier delta fuera del namespace aprobado detiene el preflight.
