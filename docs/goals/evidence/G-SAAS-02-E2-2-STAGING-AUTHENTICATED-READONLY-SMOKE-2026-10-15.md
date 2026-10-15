# G-SAAS-02 / M2 / E2.2 — Smoke autenticado read-only de App Hosting (2026-10-15)

## Alcance y límite

Comprobación manual de solo lectura sobre el primer rollout documentado en
[`G-SAAS-02-E2-2-APPHOSTING-FIRST-ROLLOUT-2026-10-15.md`](G-SAAS-02-E2-2-APPHOSTING-FIRST-ROLLOUT-2026-10-15.md).
Proyecto Firebase `micafe-pos-staging`, backend `micafe-pos`, URL
`https://micafe-pos--micafe-pos-staging.us-central1.hosted.app` y tenant
sintético retenido `E2_2-BODEGA-STAGING-FIXTURE`. No se consultó producción.

Las observaciones ocurrieron después del merge documental `88d3644` y antes de
`2026-10-15T13:45:48Z`; la interfaz no expuso marcas de tiempo por interacción.
No se registran identificadores de venta, clientes, operador, credenciales ni
tokens.

## Resultados observados

| Control | Estado | Evidencia y límite |
|---|---|---|
| Sesión admin autenticada y tenant resuelto | `PASS` | Edge mostró la superficie administrativa del fixture y `/admin/ventas` renderizó la vista “Consulta operativa”. |
| Persistencia de sesión admin | `PASS` | Tras recargar `/admin/ventas`, la app volvió a resolver el tenant y mostró la vista admin autenticada; no redirigió al login. |
| Lectura seller autenticada | `PASS` | El navegador integrado permaneció en `/pos` y mostró “Mis ventas” del fixture bajo una sesión seller independiente de Edge. |
| Catálogo en formulario de solicitud | `PASS` limitado | “Nueva” abrió la vista de solicitud y mostró la presentación del fixture. No se seleccionó producto; el resumen permaneció en cero líneas y el botón de envío deshabilitado. |
| Aviso de sincronización | `OBSERVED; CLEARED AFTER REFRESH` | La vista indicó sincronización temporalmente desconectada. Se usó “Actualizar”; el aviso desapareció y la vista quedó en “Mis ventas”. No se capturó status HTTP ni se afirma recuperación duradera o latencia. |
| Escrituras de negocio | `NOT EXECUTED` | No se enviaron solicitudes, ventas, pagos, turnos, compras ni cambios de inventario. |
| Negativo cross-tenant A/B en runtime | `BLOCKED` | Ambas sesiones disponibles usan el mismo tenant sintético. No hay una segunda identidad+tenant QA autorizada demostrada. ADR-SAAS-054 excluye crear otro tenant o fixture bajo la autorización vigente. |

## Auditoría de mutaciones

- Firestore/Auth/Functions/Rules/IAM/Secrets/App Hosting: ninguna escritura
  intencional.
- Venta o solicitud: ninguna enviada.
- Tenant, membresía o credencial: no creados ni modificados.
- Producción: sin acceso ni cambios.

La prueba acredita sesión admin, persistencia tras recarga y lecturas UI
autenticadas en el fixture. No acredita aislamiento cross-tenant, cobertura de
todas las operaciones comerciales, comportamiento de FCM ni Gate I. Las suites
de Emulator existentes son evidencia complementaria y no sustituyen el
negativo A/B remoto.

## Estado de CI en el momento de registrar

La CI post-merge `38744738763` para `main @ 88d3644a4763b7ca236c58235450c7a946a13dd4`
seguía `in_progress` a `2026-10-15T13:45:48Z`; no se marca PASS aquí. La CI de
este cambio documental debe comprobarse en su PR.

## Siguiente bloqueo concreto

Para ejecutar el negativo A/B se requiere identificar una segunda empresa de
QA ya existente junto con su identidad/rol autorizados, o aprobar formalmente
una excepción arquitectónica a ADR-SAAS-054 para preparar un fixture separado.
No crear un tenant ni reutilizar una empresa por inferencia. El Trial de Diana
no se inició y Gate I/E2.2 permanecen incompletos.
