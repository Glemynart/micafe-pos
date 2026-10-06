# G-SAAS-02 / M2 / E2.2 — Gate I preflight bloqueado (2026-10-05)

## Dictamen

`BLOCKED — DATOS DEL CLIENTE PENDIENTES`.

Gate I no puede crear ni configurar el tenant real de Distribuidora Las
Jiménez con datos inventados. La certificación sintética de Gate H habilita
este preflight, pero no sustituye la definición comercial ni la autorización
de tratamiento de los datos reales.

## Evidencia de gates previos

- Gate H fue integrado en `main` mediante PR #452, merge
  `5e6967fe325f756154d3cd67dfa27e9e7e585f52`.
- El CI post-merge `37390634151` terminó `success` el 2026-10-05.
- La matriz vigente de Gate H es
  [`G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-05.md`](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-05.md).
- El único tenant usado para la certificación es el fixture sintético
  `E2_2-BODEGA-STAGING-FIXTURE`; no representa al cliente real.

## Insumos obligatorios ausentes

| Insumo | Contrato que lo exige | Estado |
| --- | --- | --- |
| Entorno autorizado y consentimiento explícito para almacenar los datos reales en ese entorno | Goal E2.2 Gate I; runbook §1 | PENDIENTE |
| `empresaId` comercial estable, compatible con el contrato canónico | Bootstrap `validarEntradaBootstrap` | PENDIENTE |
| Nombre comercial y país fiscal | Bootstrap `validarEntradaBootstrap` | PENDIENTE |
| Vertical confirmada `BODEGA_MVP1` y modo comercial `DEMO` o decisión fiscal separada | Goal E2.2 Gate I; runbook §1 | PENDIENTE |
| Plan publicado, versión, periodicidad, precio y duración de trial aprobados | Bootstrap; runbook §1/§2 | PENDIENTE |
| Administrador inicial autorizado: nombre visible y canal fuera de Git para entregar la credencial temporal, o UID existente verificado | Bootstrap exige exactamente `nombreAdministrador` u `ownerUid`; runbook §2 | PENDIENTE |
| Equipo inicial, roles y permisos por persona | Goal E2.2 Gate I/J; runbook §1 | PENDIENTE |
| Catálogo inicial: categorías, artículos, unidades, presentaciones, precios COP y stock inicial | Goal E2.2 Gate I | PENDIENTE |
| Clientes iniciales, si el cliente requiere cargar alguno antes de la aceptación operativa | Goal E2.2 Gate J | PENDIENTE |
| Ventana operativa, responsable del cliente y referencia de recuperación/rollback antes de escritura | runbook §1 | PENDIENTE |

## Hallazgo

La revisión de la documentación y del repositorio no aporta ninguno de esos
valores para Distribuidora Las Jiménez. Las únicas referencias encontradas
describen que el tenant real no debe crearse sin ellos. No existe un
`empresaId`, identidad administradora, catálogo, plan o inventario del cliente
que se pueda reutilizar de forma autorizada.

## Acción requerida para desbloquear

El responsable comercial debe entregar y aprobar los insumos de la tabla para
el entorno autorizado. Con ellos se hará un preflight read-only que valide el
plan publicado, disponibilidad del `empresaId`, autoridad de la operación y
rollback; solo entonces podrá proponerse una mutación canónica y acotada.

No se acepta como sustituto el fixture `Bodega Atrato Demo`, valores de prueba
ni datos fiscales o credenciales enviados por Git.

## Mutation audit

- Lecturas: documentación, contrato de Bootstrap y estado CI post-merge.
- Código, deploy, Functions, Firebase, tráfico, Firestore/Auth writes, Rules,
  IAM, Secrets, Bootstrap, Activation, fixtures adicionales, tenant real y
  producción: `0`.

## Estado siguiente

E2.2 permanece `EN EJECUCIÓN`; Gate I permanece `BLOCKED` hasta recibir los
datos y la aprobación comercial indicados. Gate J/K/L no se han ejecutado.
