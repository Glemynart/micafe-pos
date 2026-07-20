# MT-U3 — Changelog de implementación

> **Estado final:** ✅ **Aprobado y listo para activación mediante el runbook**.
> La activación no se ha ejecutado aún: requiere desplegar índices, esperar su estado `Enabled`, ejecutar el
> backfill y desplegar el runtime según `MT-U3-CAPA5-runbook-activacion.md`.

## Objetivo

Incorporar el aislamiento de tenant en la capa de aplicación sin modificar el comportamiento observable del
POS mono-tenant: toda colección operativa obtiene `empresaId`, las escrituras lo estampan y las lecturas lo
filtran. MT-U3 deja el sistema preparado para que MT-U4 active Firestore Rules tenant-aware sin adaptar los
consumidores.

## Arquitectura implementada

- Estrategia de colecciones planas con `empresaId` como discriminador de tenant.
- Contexto de tenant ambiental basado en el claim autenticado, con fallback transitorio a la empresa
  fundacional.
- Helper único `lib/tenant.ts` para resolver, estampar y filtrar `empresaId`.
- Backfill operativo idempotente para anclar datos históricos a la empresa fundacional.
- Aislamiento en aplicación para las 25 colecciones operativas oficiales.
- Preparación de índices compuestos tenant-aware antes de activar filtros en runtime.

## Componentes modificados

- `lib/tenant-context.ts` y `lib/tenant.ts`: resolvedor canónico y helper de tenant.
- `contexts/saas-context.tsx`: reutilización del resolvedor compartido, sin cambio de API pública.
- Servicios operativos: lecturas filtradas, escrituras estampadas y transacciones con tenant resuelto una
  sola vez por operación.
- Ledger e inventario: eliminación de `empresaId: "default"` en escrituras nuevas y soporte de remapeo
  durante el backfill.
- Webhook Wompi y rutas de reservas públicas: resolución explícita del tenant en contextos sin sesión.
- `app/admin/(authenticated)/utilidades/page.tsx`: la reparación de turnos duplicados crea candados con
  `empresaId` y consulta `turnos`/`ventas` filtrando por el tenant activo.

## Scripts agregados

- `scripts/mt-u3-colecciones-oficiales.ts`: fuente única de las 25 colecciones operativas.
- `scripts/migrate-mt-u3-operativo.ts`: backfill operativo, idempotente y con dry-run por defecto.
- `scripts/rollback-mt-u3-operativo.ts`: reversión del backfill operativo.
- `scripts/verificar-activacion-mt-u3.ts`: verificaciones pre y post activación.

## Índices

`firestore.indexes.json` incorpora los índices tenant-aware necesarios para las consultas operativas. Incluye
la incorporación de `empresaId` a índices existentes de `movimientos_inventario`, `ventas`, `compras`,
`mermas`, `espacios` y `reservas`, además de índices nuevos para consultas de auditoría, categorías,
cuentas bancarias, transacciones financieras y turnos.

Los índices deben desplegarse y quedar `Enabled` antes de ejecutar el backfill o activar los filtros de
runtime.

## Decisiones arquitectónicas relevantes

- El cliente nunca decide el tenant: `empresaId` procede del claim autenticado.
- Las escrituras de creación estampan `empresaId`; las actualizaciones no lo reestampan porque el campo es
  inmutable.
- El tenant se resuelve una vez al inicio de cada operación lógica y se reutiliza dentro de bucles y
  transacciones.
- Los contextos Admin SDK resuelven el tenant de forma explícita y autoritativa; no usan la sesión cliente.
- `configuracion/general` permanece global hasta MT-U6; MT-U3 no modifica Firestore Rules, roles ni
  numeraciones fiscales.

## Riesgos conocidos y controles

- **Orden de activación obligatorio:** índices `Enabled` → backfill → despliegue de filtros/estampado.
- **Datos históricos:** el backfill y su verificación deben completar con cero documentos operativos sin
  `empresaId` antes de activar el runtime.
- **Rules:** el aislamiento actual es de aplicación; la defensa de Rules queda para MT-U4.
- **Reservas públicas:** el mecanismo actual de empresa fundacional es válido en modo mono-tenant. MT-U11
  deberá derivar el tenant desde la mesa o espacio antes de habilitar una segunda empresa.
- **Deudas fuera de MT-U3:** consecutivo global y cuentas hardcodeadas del webhook se difieren a MT-U6;
  el rol `supervisor` pendiente se mantiene registrado fuera de alcance.

## Resultado de auditorías

- Se verificó que las 25 colecciones operativas oficiales reciben `empresaId` en sus rutas de escritura y
  lectura aplicables.
- Se corrigió la utilidad administrativa de turnos: `turnos_activos` se crea mediante `withEmpresaId()`.
- Se corrigieron sus consultas operativas de `turnos` y `ventas` para reutilizar el `empresaId` resuelto
  con `getEmpresaId()`.
- `tsc --noEmit` finalizó correctamente.

## Estado y siguiente paso

La implementación de MT-U3 está aprobada y lista para activación mediante
`MT-U3-CAPA5-runbook-activacion.md`. La activación operativa sigue el orden documentado y debe incluir la
verificación post-activación y la regresión manual del POS.
