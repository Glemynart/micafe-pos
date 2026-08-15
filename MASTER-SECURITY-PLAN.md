# Master Security Plan — MiCafe POS SaaS

Estado: `VIGENTE` para `origin/main @ 3a02dbbd4cafcc9dfd716859c29ba18d1839c3d7` al 2026-08-13.

Este documento registra controles y riesgos relevantes para G-SAAS-02. No declara desplegado en producción ningún recurso que no tenga evidencia de despliegue. Los riesgos fuera del Trial permanecen en backlog y no se convierten en alcance automáticamente.

## Modelo de autoridad

- `empresas/{empresaId}.estado`: lifecycle del tenant.
- `membresias/{empresaId}_{uid}`: membresía, rol, permisos y estado.
- Claims Auth: proyección emitida por Functions.
- `configuraciones/{empresaId}`: configuración tenant-aware.
- Functions/Admin SDK: autoridad de provisioning, lifecycle, operaciones críticas y auditoría.
- Firestore/Storage Rules: frontera de acceso del cliente y aislamiento por `empresaId`.

No se usa Espacio como frontera de seguridad ni se introduce una Sede técnica para G-SAAS-02.

## Controles implementados en `main`

- Firestore Rules con fallback deny, aislamiento tenant-aware y colecciones críticas backend-only.
- Storage Rules tenant-aware, límites de tamaño y tipos MIME.
- Auth con membresía canónica, claims proyectados y credenciales operativas temporales.
- Commands server-authoritative con envelope, idempotencia, auditoría y efectos transaccionales para operaciones críticas.
- Ledger financiero e inventario append-oriented; los egresos son backend-only
  y no se crean, modifican ni borran desde el cliente. Las mutaciones de stock
  de catálogo y mermas quedan bajo el cutover aceptado de `ADR-SAAS-030`; la
  implementación y el despliegue del deny de Rules deben verificarse antes de
  declarar el control operativo integrado.
- Las reservas internas y su agenda quedan bajo el cutover aceptado de
  `ADR-SAAS-033`; cancelación y completado usan Functions idempotentes y el
  cliente no puede escribir esas colecciones.
- Backoffice para consulta, lifecycle, soporte consentido, recuperación de credenciales y auditoría.
- CI con typecheck, builds, Rules, Storage Rules, Functions, Emulator y E2E según superficie.

## Controles obligatorios antes del Trial

- SHA de aplicación y Functions identificado.
- CI verde para ese SHA.
- Rules y Storage desplegados y verificados en el proyecto correcto.
- Smoke test productivo sin datos inventados.
- Secretos fuera de Git y evidencia redactada.
- Punto de recuperación, rollback y responsable operativo.
- Runbook de provisioning, soporte, incidentes y recuperación validado.

## Riesgos pendientes del Goal

| Riesgo | Estado | Tratamiento |
|---|---|---|
| Functions productivas no demostradas contra el SHA actual | Pendiente | Gate M4: despliegue identificable y smoke test |
| Recuperación productiva no ensayada | Pendiente | Gate M4: backup/restore o justificación documentada |
| Mutaciones directas históricas de stock, mermas y reservas internas | P1 / remediación en curso | `ADR-SAAS-030` y `ADR-SAAS-033` aceptados; inventario integrado en PR #322; reservas pendientes de CI, deploy y verificación post-merge |
| Fiscalidad externa | Condicional | Solo si el cliente selecciona FISCAL y aporta datos aprobados |
| Hardware de impresión | Condicional | Validar modelo/driver 58/80 mm si el cliente lo requiere |
| MT-U10 límites/consumo | Fuera de G-SAAS-02 | No implementar sin necesidad y decisión de producto |
| MT-U11 multiempresa por identidad | Fuera de G-SAAS-02 | Un usuario → un tenant es suficiente |
| Wompi SaaS, reservas públicas, offline y notificaciones | Fuera de G-SAAS-02 | Las reservas internas del POS se cubren únicamente por `ADR-SAAS-033` |

## Respuesta a incidentes

P0/P1 exige contener, reproducir, corregir mediante PR, probar, fusionar, desplegar, verificar y registrar. No se ocultan incidentes ni se reinicia artificialmente el Trial.

Una corrección financiera no elimina silenciosamente el hecho original ni modifica directamente cuentas o ledger. Debe utilizar un command backend canónico o permanecer escalada como dependencia.

## Evidencia y privacidad

No se versionan PINs, tokens, service accounts, credenciales fiscales ni documentos completos con PII. La evidencia conserva estados, identificadores mínimos, fechas, SHA, resultados y referencias de auditoría.
