# Auditoría P0-07 — transporte reutilizable de impresión

## Resultado

**APROBADO PARA MERGE**

El PR implementa el corte técnico de P0-07/E3.1 sin introducir una nueva
autoridad, persistencia ni dependencia de producción. La certificación física
final permanece abierta hasta probar una impresora térmica representativa y
definir el formato operativo de 58/80 mm.

## Clasificación vigente de producto — 2026-08-12

La decisión de producto posterior establece que P0-07/E3.1 queda **COMPLETADO
técnicamente y NO BLOQUEANTE** para el MVP Web/PWA. El servicio selecciona los
layouts `MM_58` y `MM_80`, genera el ticket en HTML y abre el diálogo estándar del
navegador. El PC/tenant debe aportar el driver correspondiente. La prueba física
con un modelo concreto de impresora queda como validación operativa posterior;
su ausencia no bloquea el desarrollo ni la disponibilidad del POS.

## Trazabilidad

- **Goal:** `G-MVP-01` — MVP comercial de Café Atrato.
- **Milestone:** `M3` — Canal productivo y recuperación.
- **Epic:** `E3.1` — Impresión física.
- **PR:** `P0-07` — transporte de impresión reutilizable para venta y reimpresión.
- **Rama:** `codex/e3-1-p0-07-print-transport`.
- **ADR aplicables:** ninguno nuevo; se reutilizan el renderer de tickets, el
  puente IPC existente y la configuración canónica de impresión.

## Alcance auditado

- La venta activa y la reimpresión usan un servicio común de transporte.
- Electron conserva el canal existente de impresora y, como fallback, el canal
  existente de ticket/PDF.
- La PWA deja de ignorar silenciosamente la impresión: abre un documento
  aislado y solicita el diálogo estándar del navegador; un popup bloqueado se
  devuelve como error visible.
- `MM_58` y `MM_80` resuelven los layouts canónicos existentes. `CARTA` conserva
  el layout histórico de 80 mm hasta que exista un renderer de carta aprobado.
- Las ventas DEMO pueden reimprimirse desde sus datos operativos y la
  configuración canónica vigente, sin snapshot fiscal, numeración, CUFE ni
  datos DIAN inventados. Las ventas FISCAL siguen exigiendo su snapshot
  inmutable.
- El renderer escapa los datos de negocio antes de entregarlos a HTML, sin
  cambiar el contrato comercial ni la autoridad de venta.

## Fuera de alcance y dependencias

- No se certificó hardware físico: el entorno de desarrollo no tiene una
  impresora térmica instalada.
- No se empaqueta ni distribuye Electron; eso pertenece a P0-08/E3.2.
- No se modifican Firestore Rules, Bootstrap, Functions, planes, dominio,
  persistencia, migraciones ni datos productivos.
- No se ejecutaron escrituras ni despliegues en producción.

## Seguridad, compatibilidad y rollback

- El servicio solo transporta HTML ya generado; no crea comandos, efectos de
  venta, autoridad server-side ni escrituras.
- El escape HTML cubre identidad, productos, modificadores, cliente, pago,
  totales, datos fiscales y QR antes de cruzar la frontera de la ventana de
  impresión.
- El cambio se limita a los consumidores activos `SellModule` e `Historial`;
  no reactiva ni altera el consumidor legacy fuera de la ruta vigente.
- El rollback consiste en revertir el servicio y sus consumidores. No requiere
  migración ni reparación de datos.

## Evidencia ejecutada

- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm run build:functions` — PASS.
- `npm run test:tickets` — PASS: 59 tests, 58 aprobados y 1 skip existente.
- `npm run test:reimpresion` — PASS: 19/19.
- `npm run test:configuracion` — PASS: 44/44.
- `npm run test:tenant` — PASS: 8 aprobados y 1 skip existente.
- `npm run test:auth-foundation` — PASS: 247 aprobados, 1 skip existente, 0
  fallos.
- `npm run test:rules:raw` — PASS: 26/26; la primera ejecución aislada tuvo
  un fallo transitorio del emulador y la repetición pasó completa.
- `npm run e2e:p0-06` — PASS: 1/1.
- `npm run e2e:p0-10` — PASS: exportación, apagado, importación y verificación.
- `git diff --check` — PASS.
- `npm run lint` no está disponible en este checkout porque no existe el
  ejecutable `eslint`; no es un check de `.github/workflows/ci.yml` y no se
  añadió una dependencia fuera del alcance de P0-07.

## Cierre

`APROBADO PARA MERGE`. El merge queda condicionado a que GitHub Actions
confirme todos los checks en verde y sin pendientes. Tras la decisión de producto
del 2026-08-12, E3.1 se considera cerrado para la capacidad técnica Web/PWA; la
certificación con hardware real permanece como validación operativa no bloqueante.
> **Decisión de canal (2026-08-10):** la superficie soportada es Web/PWA y usa el diálogo de impresión del navegador. Electron no se distribuye ni se certifica; las menciones históricas del transporte se conservan como evidencia.
