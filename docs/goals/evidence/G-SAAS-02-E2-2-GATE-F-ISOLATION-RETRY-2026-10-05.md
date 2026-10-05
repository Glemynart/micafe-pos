# G-SAAS-02 / M2 / E2.2 — aislamiento A/B y retry autenticado en staging (2026-10-05)

## Alcance

Esta evidencia cierra dos subescenarios pendientes de la matriz de Gate F sobre
el fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` en
`micafe-pos-staging`. No declara Gate F completo: la comprobación autenticada
del Backoffice Bodega en el preview vigente sigue sin ejecutarse. No declara
Gate G/H, certificación, tenant real, aceptación operativa ni producción.

## Aislamiento tenant A/B

Se utilizaron dos contextos Auth sintéticos independientes: el administrador
del fixture E2.2 y un administrador de otro tenant sintético preexistente. Las
solicitudes llegaron a `obtenerConfiguracionEmpresa` en la revisión
`obtenerconfiguracionempresa-00002-pib`; los logs de solicitudes muestran
`POST 200` para ambos contextos entre `2026-10-05T05:16:38Z` y
`2026-10-05T05:16:43Z`.

Cada respuesta correspondió únicamente al tenant derivado de sus claims
server-side. Se enviaron `empresaId` del otro tenant y campos falsificados de
actor/rol/permisos; esos campos no alteraron la autoridad ni cambiaron la
configuración devuelta. No se crearon tenants, membresías, usuarios ni
configuraciones y no hubo escrituras directas de Firestore.

Resultado: `PASS` para el escenario de lectura de configuración A/B y
manipulación de autoridad. Este resultado no afirma cobertura de toda
colección operativa con esos dos contextos.

## Retry autenticado de apertura de turno

Sobre el actor sintético existente se ejecutó `abrirTurnoOperativoV1` mediante
un proxy local de prueba que descartó la respuesta del primer intento después
de que el servidor lo aceptó. El cliente reintentó el mismo comando
idempotente. Los logs de Cloud Run registran ambos `POST 200` en
`abrirturnooperativov1-00001-noy` a las `2026-10-05T05:26:03Z` y
`2026-10-05T05:26:06Z`; ambas respuestas devolvieron el mismo `turnoId` y las
lecturas posteriores encontraron un solo recibo de apertura.

- `commandId`: `E22-gatef-retry-20261005-f807047a4afd`.
- `turnoId`: `Ai2jhLnnQg67AOSLoasC`.

Después se ejecutó el cierre canónico del turno con efectivo esperado cero;
Cloud Run registró `POST 200` en `cerrarturnooperativov1-00001-bef` a las
`2026-10-05T05:26:07Z`. La lectura posterior confirmó el turno cerrado, el
lock del actor liberado, el conteo de turnos activos vuelto a su línea base y
un solo recibo de apertura y uno de cierre. No se creó una venta, movimiento
de inventario ni variación de saldos financieros.

Resultado: `PASS` para retry autenticado/idempotente y cierre del turno
sintético de prueba.

## Backoffice en preview vigente

El deployment Preview
`https://cafeatrato-9gjl166wq-glemynarts-projects.vercel.app` está `Ready`.
Vercel lo identifica como `dpl_3m4FhydqHZDSYmRBVooB2UtALgq5`; el alias Git
corresponde a `codex/e2-2-gate-f-zero-close-docs` en `7e20bd2`. Ese commit
contiene únicamente documentación y su árbol coincide con `origin/main` en
`d0ffde0d52a4c792a8f78d53cec5e7e880c20c01`. En la inspección de Edge, la ruta
del Backoffice presentó el formulario de acceso de operadores y no había una
sesión autenticada disponible en ese origen. Por tanto la comprobación visual
autenticada de catálogo, configuración operativa y membresías del Backoffice
queda
`NOT EXECUTED — sesión no autenticada`. El preview histórico `bg6o3l7mf` no se
usa como evidencia de la versión actual.

Las pruebas locales de política UI de Bodega pasaron (`npm run test:bodega-ui`:
7/7). Son evidencia complementaria y no sustituyen la comprobación en vivo del
Backoffice.

## Mutation audit

- Deploy, tráfico manual, topology Firebase, Rules, IAM, Secrets y producción:
  0.
- Firestore: no se modificaron tenant, membresías, configuración, ventas,
  inventario ni saldos. La validación de retry produjo únicamente el turno
  sintético temporal, sus recibos idempotentes/auditoría y transiciones
  canónicas del lock; el turno se cerró por su callable canónica.
- Auth: no se crearon usuarios ni credenciales; la autenticación canónica pudo
  refrescar claims/contadores de los contextos sintéticos existentes como parte
  del flujo normal.
- Fixtures, Bootstrap, Activation y cleanup destructivo: 0.
- Archivos productivos modificados durante las validaciones: 0.

## Estado de Gate F

Los subescenarios A/B y retry autenticado pasan con la evidencia anterior.
Gate F permanece abierto hasta comprobar el Backoffice Bodega, con sesión
autorizada, sobre el preview vigente. Después se reevaluará la matriz completa
antes de empezar Gate G.
