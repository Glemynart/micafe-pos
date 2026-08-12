# G-SAAS-02 — Evidencia read-only de producción — 2026-08-12

## Alcance

Lectura estrictamente read-only del proyecto Firebase `micafe-pos` y del tenant aprobado de referencia `1ae0rD9H8t3ZFSBKrrHR`. La consulta se ejecutó con Firebase Admin SDK usando Application Default Credentials. No se invocaron callables comerciales, no se ejecutó Bootstrap y no se realizaron escrituras.

## Estado observado

| Área | Resultado observado |
|---|---|
| Empresa | Existe, nombre `Cafe Atrato`, `estado = activa`, país fiscal `CO`. |
| Administrador | La proyección Auth está habilitada; claims y membresía corresponden al tenant, con rol `admin` y estado activo. No se conserva el UID en esta evidencia. |
| Suscripción | Existe en `trialing`, `mvp_comercial` versión 1, del `2026-08-03` al `2026-09-02`, revisión 1. No tiene `snapshotContrato`. |
| Plan publicado | Solo se observó `mvp_comercial` versión 1, periodicidad `MENSUAL`, con capacidades `sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas` y `waste`. |
| Plan anual aprobado | No se observó una versión publicada `ANUAL` con precio `1.800.000 COP` en producción. |
| Configuración | `schemaVersion = 1`, revisión 3; materializa las mismas siete capacidades de la versión mensual. |
| Espacios | Se observaron seis Espacios activos: `Alquiler`, `Artesanías`, `Cafetería`, `Consignación`, `Fotocopias` y `Librería`; se observaron 22 categorías tenant-aware. |
| Functions | El inventario read-only de Firebase devuelve 55 Functions activas; las superficies de autenticación, configuración, comandos comerciales, Bootstrap y soporte están desplegadas en `us-central1` con Node.js 22. |

## Veredicto de esta evidencia

`NO CERTIFICA G-SAAS-02`.

La lectura confirma que `Café Atrato` es un tenant real y operable, pero el estado observado no satisface todavía el contrato de G-SAAS-02: el Trial vigente referencia la oferta mensual histórica, el plan anual aprobado aún no está publicado en producción, faltan `shifts` y `cuentas_cobro` de la configuración efectiva y el tenant conserva múltiples Espacios activos.

No se debe reiniciar artificialmente el Trial, cambiar su plan durante el periodo vigente, ejecutar Bootstrap sobre la Empresa existente ni editar directamente la Suscripción. La ruta siguiente debe ser aprobada operativamente antes de cualquier mutación: mantener este Trial histórico fuera del alcance de G-SAAS-02, o definir una transición contractual posterior mediante los comandos comerciales canónicos. Un cliente nuevo requeriría datos aprobados y un `empresaId` distinto.

## Evidencia relacionada

- `docs/goals/P0-01-CERTIFICACION-DATOS-INICIALES.md` — certificación histórica read-only de P0-01.
- `ADR-SAAS-014-trial-tenant-existente.md` — restricciones para una Empresa existente.
- `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md` — gates de entrada, operación y cierre.
- `main` verificado en `5ed5d1f870240c807263f0cb5d65fec363fa50ef`.
