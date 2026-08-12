# Políticas de seguridad — MiCafe POS

Estado: documentación alineada con la baseline SaaS de `main`. La certificación de despliegue productivo, recuperación productiva y operación del primer cliente pertenece a G-SAAS-02 y todavía requiere evidencia propia.

## Autoridades

- `empresas/{empresaId}.estado` es la autoridad de lifecycle.
- `membresias/{empresaId}_{uid}` es la autoridad de rol, permisos y estado de membresía.
- Los claims de Firebase son una proyección emitida por Functions.
- `configuraciones/{empresaId}` es la autoridad de configuración tenant-aware.
- Commands server-authoritative son la autoridad para ventas, inventario, compras, finanzas, turnos, cuentas de cobro y provisioning.
- `operaciones_auditoria`, `transacciones_financieras` y `movimientos_inventario` no se escriben desde el cliente.

## Firestore y Storage Rules

- `firestore.rules` usa aislamiento por `empresaId` y fallback deny.
- Las colecciones críticas bloquean escritura directa y delegan en Functions.
- Los egresos son append-only para el cliente; las correcciones requieren una operación backend canónica.
- `storage.rules` restringe rutas tenant-aware, tamaño y tipos MIME según el contrato vigente.
- Las Rules deben validarse con Emulator antes de cada PR que las afecte y deben verificarse en el proyecto productivo antes del Trial.

## Autenticación y soporte

- Firebase Authentication gestiona la identidad.
- El administrador inicial recibe una credencial temporal emitida por Functions.
- La activación, reemisión, desbloqueo y recuperación pasan por comandos server-side auditados.
- El soporte temporal requiere autorización del tenant, alcance explícito y expiración.
- No se usa impersonación silenciosa ni se almacenan PINs o tokens en Git, logs o evidencia.

## Datos y secretos

- Los secretos de Functions se suministran por configuración de entorno/Secret Manager; no se incorporan al repositorio.
- Las variables `NEXT_PUBLIC_FIREBASE_*` son configuración pública del cliente y no sustituyen Rules ni Auth.
- No se inventan ni versionan datos fiscales, credenciales DIAN/Factus, PINs, service accounts o tokens.
- Los logs y artefactos de evidencia deben redactar PII y secretos.

## Operaciones financieras

- Los movimientos financieros son auditables y tenant-aware.
- Las cuentas se resuelven por clave operativa y `empresaId`; no se acepta un document ID físico como autoridad.
- Una corrección no elimina silenciosamente el hecho original ni modifica directamente el saldo.
- P0/P1 financieros se contienen y se corrigen mediante PR, CI, despliegue y verificación.

## Release y recuperación

- Cada Trial debe identificar SHA de aplicación, Functions, Rules y Storage.
- CI verde no demuestra por sí solo que Functions estén desplegadas en producción.
- Antes del Trial se requiere smoke test productivo, punto de recuperación, rollback y responsable operativo.
- La recuperación productiva debe tener evidencia de ensayo o una justificación documentada de no aplicabilidad.

## Reporte de vulnerabilidades

No abras un issue público con información sensible. Registra el hallazgo por el canal privado del equipo responsable del proyecto y adjunta únicamente la evidencia mínima necesaria.

## Documentos relacionados

- [Goal G-SAAS-02](docs/goals/GOAL-MVP-COMERCIAL.md)
- [Runbook de Trial y soporte](docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md)
- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
- `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`
- `ADR-SAAS-028-contrato-comercial-anual-snapshot.md`
