# G-SAAS-02 / M2 / E2.2 — validación del índice y lectura de auditoría en staging

## Alcance

Esta evidencia cierra el bloqueo técnico de la consulta de auditoría del
fixture retenido. Registra únicamente la creación dirigida del índice
compuesto y las comprobaciones read-only posteriores. No declara Gate F
completo, rehearsal, certificación, producción ni aceptación operativa.

## Índice creado

- Proyecto: `micafe-pos-staging`.
- Base: `(default)`.
- Colección: `saas_auditoria`.
- Índice: `CICAgJiUpoMK`.
- Campos: `agregado.id ASC`, `agregado.tipo ASC`, `registradoEn DESC`;
  `__name__ DESC` es el orden implícito de Firestore.
- Operación: `projects/micafe-pos-staging/databases/(default)/operations/S01vcFVpSmdBQ0lDDCoDIDYwZDc1NjRiMTY4NC1kMjI4LTdhYzQtNTEzNi1iMzIxNTYwZiQac2VuaWxlcGlwCQpBEg`.
- Inicio: `2026-10-03T18:02:02.689358Z`.
- Estado final observado: `READY`.

La mutación remota fue exactamente una creación de índice. No hubo deletes,
replacements, cambios de Functions, Auth, Rules, IAM, Secrets, Storage,
Hosting, tráfico ni producción.

## Callable y Backoffice

`consultarAuditoriaPlataformaSaas` permanece `ACTIVE` en
`saas-platform-resources`, `us-central1`, Node.js 22, con cero Secrets. Su
build es `96337981-b8a3-493e-8520-982a7a36fc3d` y su hash de Functions es
`953d4b4cb1b42ee276d59b3ad3e38add87bfd20b`.

Con la sesión de plataforma autorizada, el detalle de
`E2_2-BODEGA-STAGING-FIXTURE` cargó el panel Historial después de `Reintentar`
y mostró cuatro eventos existentes, todos `CONFIRMADO`. Los logs remotos
registran una respuesta HTTP `200` para la callable a las
`2026-10-03T18:08:57.929785Z` y no registran otro `FAILED_PRECONDITION`
posterior a la creación del índice.

Una llamada sin Auth devolvió `401`, confirmando que el endpoint no es una
lectura anónima. La verificación fue read-only y no envió PINs, tokens ni
secretos a la evidencia.

## Estado observable del fixture

Las lecturas de staging confirman, sin escritura adicional durante esta
validación:

- Empresa `E2_2-BODEGA-STAGING-FIXTURE` en `trial`, revisión `1`.
- Suscripción `mvp_comercial` v2 en `trialing`.
- Membresías administrativas y de vendedor activas.
- Cuenta lógica `bancolombia` activa con saldo observado de `5000` COP.
- Catálogo con producto/presentación activos, clientes, turnos, ventas,
  movimientos de inventario, transacciones financieras y comandos/auditoría
  existentes.

## Mutation audit

- Firestore: 1 índice compuesto creado; 0 documentos modificados por la
  validación.
- Functions: 0.
- Auth: 0.
- Rules: 0.
- IAM manual: 0.
- Secrets: 0.
- Storage/Hosting: 0.
- Fixture adicional/Bootstrap/Activation: 0.
- Producción: 0.

## Siguiente estado

El subgate de auditoría de Gate F queda `PASS` y el bloqueo del índice queda
resuelto. La matriz completa de Gate F (incluidos negativos, aislamiento,
replay/retry y validación vendedor/PWA) aún debe cerrarse antes de Gate G,
rehearsal y certificación E2.2.
