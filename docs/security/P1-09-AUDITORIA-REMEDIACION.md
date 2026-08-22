# P1-09 — Auditoría de remediación de reservas públicas y Wompi

## Identificación del corte

- Goal: MVP comercial de Café Atrato.
- Milestone/Epic excepcional autorizado: `M3 / E3.2`.
- Iniciativa: `P1-09 — Remediación de seguridad`, sin activación funcional.
- Rama: `codex/p1-09-security-remediation`.
- Base documentada: `origin/main @ 9cdb25f0ad52eb1e3b4a44c6f6e924403a43f3b9`.
- Worktree aislado: `PROYECTO CAFE-security-p1-09`.
- ADR rector: `ADR-SAAS-036`, aceptado por aprobación explícita.

El checkout histórico con cambios locales no fue usado ni modificado. Este corte no incluye B3, identidad, `/api/debug-tokens`, credenciales locales, FCM ni rediseños internos de reservas.

## Resultado técnico

La remediación está implementada y auditada localmente. El cliente dejó de ser autoridad del precio: el servidor resuelve tenant, tarifa, moneda COP, referencia e intención inmutable antes de exponer el checkout. El webhook público de Next falla cerrado y la Function HTTPS verifica firma, ambiente, monto, moneda y referencia contra la intención persistida antes de reclamarla. Los efectos fiscales, de inventario y tesorería usan la autoridad canónica y una cuenta tenant-aware.

La capacidad permanece deshabilitada por defecto. No se ejecutó activación, despliegue ni configuración productiva.

## Hallazgos de los scans diferenciales

| Finding | Severidad | Validación | Remediación | Estado |
| --- | --- | --- | --- | --- |
| `csf_7ab91cd3abe6de8ce18f8c61` — efectos antes de validar un hold vencido o sin propiedad de agenda | MEDIUM | La transacción de claim no leía empresa, configuración, mesa, agenda ni expiración antes de permitir efectos fiscales/financieros. | El claim inicial revalida empresa activa, configuración estricta habilitada, tenant de mesa/agenda, propiedad de bloques y hold vigente antes de `PAGO_RECLAMADO`. La recuperación de una saga ya reclamada sigue permitida. | Corregido |
| `csf_64868b9cc6a4e88e4985138c` — ambiente Wompi no requerido en la firma | LOW | `environment` era comprobado, pero podía quedar fuera de `signature.properties`. | `data.transaction.environment` es propiedad firmada obligatoria; existen pruebas de ausencia y manipulación. | Corregido |
| `csf_31ef7ce82fa78d2f41e05e3a` — carrera entre cancelación y pago reclamado | LOW | La cancelación pública o autenticada podía retirar agenda después de `PAGO_RECLAMADO` y antes de los efectos. | Ambas cancelaciones leen la intención enlazada en la misma transacción y solo aceptan `CREADA`; las reservas legacy sin intención conservan su comportamiento. Las lecturas compartidas fuerzan reintento ante escrituras concurrentes. | Corregido |

El trigger original ya no reproduce: no es posible alcanzar efectos con un hold vencido/no propietario, aceptar un evento cuyo ambiente no esté firmado ni cancelar una reserva cuya intención ya salió de `CREADA`. Los controles de regresión demuestran que un hold válido, la recuperación idempotente y la cancelación ordinaria/legacy continúan funcionando.

## Auditoría explícita de aislamiento multiempresa

| Superficie | Invocante/autenticación | Origen del tenant | Autorización y revalidación | Sustitución cross-tenant |
| --- | --- | --- | --- | --- |
| Hold público | Anónimo | La mesa resuelta por slug; nunca un `tenantId` cliente | Empresa activa, configuración estricta, mesa, producto/tarifa y agenda deben pertenecer al mismo tenant | Rechazada antes de crear reserva o intención |
| Webhook Wompi | Proveedor con checksum válido | Intención inmutable localizada por referencia | Firma y ambiente; monto/moneda/referencia exactos; reserva, mesa, agenda, empresa y cuenta financiera se revalidan contra la intención | Rechazada antes del claim o de cualquier efecto |
| Cancelación pública | Poseedor del identificador/capacidad de reserva | Reserva y su intención enlazada | Coincidencia tenant/reserva/intención y estado `CREADA`; serialización transaccional | No puede cancelar una intención ajena o reclamada |
| Cancelación interna | Usuario Firebase con membresía/capacidad | Contexto empresarial autenticado | Membresía, empresa, reserva, intención y estado se validan dentro de la transacción | Rechazada por contexto o inconsistencia de tenant |
| Efectos fiscales/tesorería | Solo saga interna `SYSTEM_WOMPI` | Intención y comprobante fiscal | Empresa activa, venta canónica y clave de cuenta financiera tenant-aware; idempotencia por intención | No existe fallback a cuenta bancaria global |
| Firestore | Clientes Firebase | Claims/membresía y rutas tenant-aware | Rules deniegan acceso cliente a intenciones de pago; Functions revalidan los invariantes | Las Rules no se usan como sustituto de autorización server-side |

## Evidencia de validación

- Tests focalizados de cancelación pública: `10/10` PASS.
- Tests focalizados de reservas y Wompi en Functions: `9/9` PASS.
- `npm run test:auth-foundation`: `306` tests, `303` PASS, `3` skips de emulador, `0` fallos.
- `npm --prefix functions test`: `306` tests, `303` PASS, `3` skips de emulador, `0` fallos.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- `npm run build:functions`: PASS.
- `npm run lint`: PASS.
- `npm run test:rules`: PASS.
- `npm run e2e:p0-01`: PASS (`1/1`) después de separar las primitivas `node:crypto` del contrato compartido con el navegador.
- `git diff --check`: PASS; solo advertencias de normalización LF/CRLF.

## Codex Security

Scan final: `c2d7dc87-5460-40b8-b5e4-3c1562beebb8`.

- Cobertura: `25/25` archivos fuente/test cambiados.
- Findings reportables: `0`.
- Snapshot: `codex-security-snapshot/v1:sha256:614ce00fd5a6e96e963605c1cf2cdc4ebcee7ab1a22885d29f05d5e387ce9e07`.
- Artefactos: `report.md`, `findings.json` y `exports/results.sarif` en el directorio del scan.
- Limitación: la consulta TAC no estuvo disponible porque el conector no estaba conectado; no afecta la cobertura local declarada, pero limita contraste externo de advisories.

Scan de seguimiento posterior al gate E2E: `16184c9e-492c-4c3f-a297-35794813b36a`.

- Cobertura: `4/4` archivos del ajuste server-only.
- Findings reportables: `0`.
- Snapshot: `codex-security-snapshot/v1:sha256:bd5836e927701271da3721c8f9cbfce74dbcac70a0df439e82c338be698843e9`.
- Evidencia dinámica: build cliente y smoke P0-01 confirman que `node:crypto` no entra al bundle; las pruebas Wompi confirman que SHA-256 y `timingSafeEqual` conservan el comportamiento previo.

## Riesgos residuales y gates de activación

1. WAF/rate limiting externo: falta aplicar y observar en Preview el límite aprobado de `5` holds por IP cada `10` minutos.
2. Integración real: faltan secretos en Secret Manager, configuración tenant Wompi, endpoint real, prueba firmada del proveedor y smoke controlado.
3. Operación financiera: reembolsos y chargebacks automatizados no forman parte de P1-09; un pago aprobado que no pueda recuperarse requiere runbook/manual review.
4. Dependencias preexistentes: `npm audit` reporta `10` vulnerabilidades en raíz (`9` moderate, `1` high) y `8` en Functions (`7` moderate, `1` high). Son deuda transversal de dependencias, no introducida ni corregible de forma segura dentro de este corte sin upgrades mayores y validación separada.
5. Producción: la feature flag permanece apagada y el webhook legado falla cerrado. Activar requiere completar todos los gates del runbook `P1-09-ACTIVACION-RESERVAS-WOMPI.md` y autorización separada.

## Estado

- IMPLEMENTADO: **sí**.
- AUDITADO: **sí**.
- LISTO PARA ACTIVACIÓN: **no**.
- ACTIVADO EN PRODUCCIÓN: **no**.

`NO APROBADO PARA MERGE`

Único gate pendiente para cambiar el veredicto: abrir el PR de esta iniciativa y comprobar todos sus checks de CI en verde, sin pendientes. El merge y la activación productiva no están autorizados por este documento.
