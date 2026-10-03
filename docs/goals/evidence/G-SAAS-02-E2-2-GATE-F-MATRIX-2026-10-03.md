# G-SAAS-02 / M2 / E2.2 — matriz de Gate F en staging (2026-10-03)

## Alcance

Esta evidencia registra una comprobación adicional, principalmente read-only,
del fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` en
`micafe-pos-staging`. No declara Gate F, Gate G/H, producción ni aceptación
operativa como completados. No se creó otro fixture y no se ejecutó Bootstrap,
Activation ni cleanup destructivo.

## Superficie y fixture

- Proyecto: `micafe-pos-staging`.
- Región de las Functions observadas: `us-central1`.
- Runtime observado: Node.js 22.
- Fixture: `E2_2-BODEGA-STAGING-FIXTURE` (`Bodega Atrato Demo`).
- Estado leído: Empresa `trial`, suscripción `mvp_comercial` v2,
  membresías y configuración presentes.
- La sesión administrativa del POS y el detalle del Backoffice resolvieron el
  fixture correcto; las páginas de catálogo, clientes, inventario y ventas se
  observaron sin acciones mutantes.

## Evidencia remota observable

Los logs de Cloud Run del 2026-10-03 muestran solicitudes atendidas por la
superficie Bodega, sin registrar PINs, tokens ni secretos en esta evidencia:

| Superficie | Resultado observado |
| --- | --- |
| `consultarCatalogoPresentacionesVendedorV1` | HTTP 200 en varias lecturas autenticadas |
| `consultarClientesVendedorV1` | HTTP 200 en varias lecturas autenticadas |
| `consultarMisVentasVendedorV1` | HTTP 200 en lecturas autenticadas |
| `abrirTurnoOperativoV1` | HTTP 200 en aperturas observadas |
| `cerrarTurnoOperativoV1` | HTTP 200 en cierres observados |
| `crearClienteVendedorV1` | HTTP 200 en una creación observada |
| `confirmarVentaBodegaV1` | HTTP 200 en confirmaciones observadas |
| `confirmarVentaBodegaV1` — stock insuficiente | HTTP 500 con `STOCK_INSUFICIENTE`; no se aceptó el efecto de la venta |
| `confirmarVentaBodegaV1` — payload incompleto | HTTP 400; el runtime rechazó la solicitud |
| `crearCategoriaBodegaV1` / `crearArticuloInventarioV1` / `crearPresentacionComercialV1` | HTTP 200 en las invocaciones ya reconciliadas |

Una llamada HTTP sin Firebase Auth a cada una de las doce superficies Bodega
desplegadas (`consultar*`, turnos, cliente, presentación, inventario,
categoría y venta) fue rechazada con HTTP `401`. Esto demuestra el cierre de
la frontera sin autenticación, pero no sustituye una prueba autenticada de
aislamiento A/B.

El panel Historial del Backoffice resolvió `consultarAuditoriaPlataformaSaas`
con HTTP `200` después del índice de ADR-SAAS-057 y mostró cuatro hechos
existentes, todos `CONFIRMADO`. La misma consulta sin Auth fue rechazada con
`401`.

## Estado persistido leído

Las lecturas read-only del fixture confirman la existencia de catálogo,
presentación, clientes, turnos, ventas, movimientos de inventario,
transacciones financieras, comandos de idempotencia y auditoría. El POS
administrativo mostró un producto activo, dos clientes activos y tres ventas
pagadas; no se ejecutó ninguna acción desde esas páginas durante esta
comprobación.

## Cobertura local complementaria

- Tests `functions/src/bodega-vendedor/*.test.ts` y `functions/src/bodega/*.test.ts`:
  `35 PASS`, `2 SKIP` esperados, `0 FAIL`.
- `npm run test:bodega-ui`: `4 PASS`, `0 FAIL`.
- La suite local cubre autoridad server-side, payload manipulado, tenant
  ajeno, stock insuficiente, idempotencia, concurrencia y auditoría. Esta
  cobertura complementa, pero no convierte, un escenario staging no
  ejecutado en `PASS`.

## Limitación que mantiene Gate F abierto

No existe en la sesión actual una credencial de vendedor sintético utilizable
para completar una sesión PWA autenticada del actor vendedor. No se adivinó
un PIN, no se escribió una credencial directamente y no se reemitió ni creó
otra identidad. Por ello permanecen sin evidencia staging suficiente:

- recorrido autenticado de vendedor completo desde PWA;
- payload manipulado contra un contexto autenticado;
- aislamiento tenant A/B con dos contextos autenticados;
- replay/concurrencia/retry autenticados y permisos revocados.

Los estados HTTP negativos observados en logs no se asignan a un caso
específico cuando no existe contexto autenticado correlacionable; no se
presentan como evidencia más fuerte de la que permiten.

## Estado del gate

`GATE F — BLOCKED / PENDING FUNCTIONAL MATRIX`.

El bloqueo es de evidencia de actor/escenario, no una autorización para
modificar código, Rules, IAM, Secrets, Firebase topology, producción o el
fixture. Gate G/H y el cierre de E2.2 permanecen pendientes.

## Mutation audit de esta comprobación

- Archivos modificados: 0 en el entorno remoto; esta evidencia se registra
  únicamente en la rama documental.
- Firestore/Auth: 0 escrituras intencionales.
- Functions/Rules/IAM/Secrets/Storage/Hosting: 0.
- Fixture adicional: 0.
- Bootstrap: 0.
- Activation: 0.
- Cleanup destructivo: 0.
- Tráfico: 0.
- Producción: 0.
