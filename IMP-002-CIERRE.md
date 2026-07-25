# IMP-002 — Backoffice SaaS: cierre de implementación

> **Estado:** iniciativa completada y cerrada oficialmente.
> Este documento es el informe de cierre de la implementación de MT-U9, cuya
> arquitectura quedó certificada en `MT-U9-B6-certificacion-arquitectonica.md`.
> **Git:** trabajo consolidado y mergeado mediante el PR #116
> (`87038b6` implementación + `ba8bef9` remediación de auditoría, merge `d288634`).
> **Fecha de cierre:** 2026-07-25.

---

## 1. Qué es este cierre y qué no es

IMP-002 es la **primera implementación** del plano de plataforma cuya arquitectura
cerró MT-U9. B6 certificó la coherencia arquitectónica de los bloques B0–B5; este
documento certifica que existe una implementación conforme a esa certificación y que
los hallazgos de auditoría sobre ella quedaron resueltos.

**No** certifica activación en producción: el Backoffice no se ha desplegado ni se ha
creado ningún operador de plataforma en un entorno real. El procedimiento de puesta en
marcha se describe en §6 y permanece pendiente de ejecución.

**No** amplía el alcance hacia MT-U10, MT-U11 ni MT-U12, que siguen sin implementar.

---

## 2. Alcance implementado

| Bloque MT-U9 | Implementación | Estado |
|---|---|---|
| B0 — Contratos e invariantes | `functions/src/platform/contracts.ts`: seis facultades canónicas, `OperadorSaas`, tipos de auditoría | ✅ |
| B1 — Operadores y autorización | `platform/authorization.ts` (predicado canónico ADR-SAAS-011 §5.1), `platform/operators.ts`, `platform/initial-bootstrap.ts` | ✅ |
| B2 — Comandos administrativos | `platform/operations.ts`, `platform/command-catalog.ts`, `platform/callables.ts` | ✅ |
| B3 — Auditoría | `platform/audit.ts`: `saas_auditoria` append-only + obligaciones durables recuperables (ADR-SAAS-012) | ✅ |
| B4 — Soporte e impersonación | `platform/support.ts`: autorización temporal, mínima y atribuible, con expiración programada | ✅ |
| B5 — Panel SaaS | `app/backoffice/**`, `components/backoffice/**`, `contexts/platform-context.tsx`, `lib/platform/client.ts` | ✅ |
| B6 — Certificación | Documentos de arquitectura movidos a estado "aprobado" | ✅ |

Superficie de datos de plataforma cerrada al cliente en `firestore.rules`
(`saas_operadores`, `saas_auditoria`, `saas_auditoria_obligaciones`,
`saas_soporte_autorizaciones`, `saas_comandos`, `provisionamientos_empresariales`
con `allow read, write: if false`). El Panel opera exclusivamente vía callables, sin
autoridad de dominio propia, conforme a B5.

---

## 3. Remediación de auditoría

La implementación se sometió a dos auditorías técnicas independientes y a una auditoría
de aceptación final. Los hallazgos resultantes se corrigieron en `ba8bef9` sin ampliar
el alcance ni alterar contratos.

### 3.1 Hallazgos altos

| ID | Corrección | Contrato |
|----|-----------|----------|
| H1 | Preserva `causationId` en el bootstrap solicitado desde Backoffice (coalesce a `commandId`), sin ruta alterna al servicio canónico | ADR-SAAS-007 |
| H2 | Persiste `obligacionId` en los resultados durables comercial y de bootstrap, de modo que el reintento idempotente recupere la evidencia | ADR-SAAS-012 |
| H3 | Pagina por cursor el reconciliador de obligaciones de auditoría | ADR-SAAS-012 §7 |
| H4 | Separa `CONSERVACION_GOBERNAR` de `LIFECYCLE_GOBERNAR` en archivar, restaurar y eliminar | ADR-SAAS-011 §5 |
| H5 | Emite el hecho `BOOTSTRAP_EMPRESARIAL_COMPLETADO` | ADR-SAAS-012 |
| H6 | Exige ventana temporal en las consultas de auditoría sensibles | ADR-SAAS-012 §7 |
| H7 | Revalida las autoridades de soporte dentro de la transacción, cerrando la ventana TOCTOU | ADR-SAAS-011 §9 |
| H8 | Aplica el límite máximo de 20 a la consulta por comando | ADR-SAAS-012 §7 |
| H9 | Omite reproyección de claims y revocación de tokens en reintentos idempotentes de comandos de operador | ADR-SAAS-011 §4.2 |

### 3.2 Hallazgos medios

- **M-1** — La obligación `COMPLETADO` solo se emite cuando el hecho durable registró
  efectivamente un `obligacionCompletadoId`, evitando un `AUDIT_OBLIGATION_NOT_FOUND`
  sobre un hecho ya confirmado.
- **M-2** — La transacción de finalización del bootstrap lee el provisionamiento
  **antes** de cualquier escritura y reutiliza el `obligacionCompletadoId` ya
  persistido, de modo que un reintento concurrente de Firestore no genere un segundo
  `CONFIRMADO` del mismo hecho (ADR-SAAS-012 §2.1).

---

## 4. Verificación

- **94/94 pruebas de Functions en verde**; build (`tsc -p tsconfig.json`) sin errores.
- CI del PR #116 en verde: "Tipos y pruebas", Vercel y Vercel Preview Comments.
- Cada corrección se validó por **reversión quirúrgica aislada**: se comprobó que su
  prueba falla al revertir únicamente ese fix y pasa al restaurarlo. El método detectó y
  descartó dos pruebas que pasaban por construcción antes de darlas por buenas.
- La remediación quedó confinada a `functions/**` y `lib/bootstrap/contrato.ts`, sin
  cambios en Firestore Rules, índices ni UI respecto del commit de implementación.

---

## 5. Invariantes preservadas

Las invariantes obligatorias de MT-U9 §B6.4 se mantienen. En particular:

- **Plataforma ↔ tenant:** el operador no es un rol tenant; el claim `saas` se proyecta
  preservando `empresaId`/`rol` existentes, sin reescribir identidad ni membresías.
- **Autoridad servidor:** el predicado canónico exige simultáneamente documento
  `saas_operadores` ACTIVO **y** claim `saas.operador`, con corte por
  `versionAutorizacion` (`PLATFORM_CONTEXT_STALE`). El Panel nunca decide autorización.
- **Separación comercial/lifecycle:** las transiciones pasan por el servicio canónico de
  ADR-SAAS-009; una Suscripción no altera acceso por sí sola.
- **Bootstrap empresarial intacto:** ADR-SAAS-007 no se modificó; el operador solo puede
  *solicitar* el bootstrap y nunca crea Empresa, Membresía, claims ni documentos tenant.
- **Auditoría no autorizante:** la evidencia es posterior, append-only y falla cerrada —
  la autorización se deniega aunque el escritor de evidencia esté degradado.
- **Separación de funciones:** ningún operador puede modificar su propia autoridad
  (`AUTOESCALAMIENTO_DENEGADO`), y `REVOCADO` es terminal.

---

## 6. Puesta en marcha pendiente

El Backoffice no está activado. El procedimiento de arranque, conforme a
ADR-SAAS-011 §6.1, es:

1. Crear la cuenta en Firebase Authentication (consola). El bootstrap **no** crea
   credenciales.
2. Exportar `GOOGLE_APPLICATION_CREDENTIALS` apuntando al service account.
3. Ejecutar desde `functions/`:
   `SAAS_BOOTSTRAP_UID=<uid> npm run bootstrap:operator-saas`
   (opcionalmente `SAAS_BOOTSTRAP_FACULTADES` para acotar; por defecto concede las seis).
4. Desplegar las Cloud Functions.
5. Ingresar en `/backoffice/login`.

El bootstrap es **irrepetible**: una vez creado el primer operador,
`PLATFORM_INITIAL_BOOTSTRAP_CLOSED` cierra la puerta definitivamente y no reabre ni
aunque ese operador quede `REVOCADO`. Es el comportamiento prescrito por el ADR
("nunca se borra el documento ni se crea otro primer operador"), no un defecto, pero
implica una precaución operativa: **incorporar un segundo operador con
`OPERADORES_GOBERNAR` antes de arriesgar el acceso al primero**.

Si la proyección de claims fallara tras el commit, la recuperación prevista es la
función programada `reconciliarClaimsOperadores` (ADR-SAAS-011 §6.1.5), que reproyecta
lo divergente sin borrar ni duplicar el documento.

---

## 7. Fuera de alcance

No implementados por IMP-002 y sin cambios en esta unidad: consumo y límites (MT-U10),
multiempresa de usuario y tenant activo (MT-U11), convergencia de sesión Electron
(MT-U12), numeraciones y autoridad fiscal (ADR-SAAS-008), integración fiscal-inventario
(ADR-SAAS-010), ledger y tesorería.

**Cierre formal de IMP-002:** la implementación del plano de plataforma queda cerrada y
conforme a la certificación MT-U9-B6. Cualquier cambio posterior que contradiga las
invariantes de §5 requiere revisión arquitectónica antes de continuar.
