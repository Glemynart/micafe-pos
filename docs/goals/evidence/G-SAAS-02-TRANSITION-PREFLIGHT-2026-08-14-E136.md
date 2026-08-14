# G-SAAS-02 — Preflight read-only vigente de cierre anticipado — 2026-08-14

- **Observación:** `2026-08-14T22:46:47Z`
- **Proyecto:** `micafe-pos`
- **Tenant:** Café Atrato — `1ae0rD9H8t3ZFSBKrrHR`
- **SHA observado:** `origin/main @ e136ea899a4e9269e14ad51bb4fc8e1f6092fc97`
- **Decisión:** `G-SAAS-02-PO-DECISION-CIERRE-ANTICIPADO-2026-08-14`
- **ADR:** `ADR-SAAS-032-cierre-anticipado-trial-historico.md`

## Resultado

El preflight se ejecutó en modo estrictamente read-only:

```text
readOnly=true
productionWrites=false
commandExecutionAllowed=false
status=BLOQUEADO
readyForCanonicalCommands=false
```

La identidad del operador quedó verificada contra la callable productiva
read-only `consultarContextoPlataforma`:

| Control | Resultado |
|---|---|
| UID autenticado | `lNTK76Nf2TO5PSAOFPeHJx6PLRZ2` |
| Estado | `ACTIVO` |
| Versión de autorización | `1` |
| Facultades requeridas | `COMERCIAL_GOBERNAR`, `LIFECYCLE_GOBERNAR` |
| Respuesta callable | HTTP `200` |

La sesión fue efímera, se entregó fuera del repositorio y no se guardó en la
evidencia. No se modificaron contraseña, claims persistentes, membresías ni
datos del tenant.

## Estado productivo confirmado

- Empresa: `activa`, revisión `2`.
- Suscripción raíz: `trialing`, `mvp_comercial` v1, revisión `1`.
- Fechas históricas: `2026-08-03` a `2026-09-02`.
- Snapshot contractual raíz: ausente.
- Configuración histórica: siete capacidades.
- Plan anual v2: publicado, `ANUAL`, `1.800.000 COP`, nueve capacidades.
- Relación contractual anual: inexistente.

## Bloqueo restante

`RECOVERY_EVIDENCE_MISSING` continúa siendo el único bloqueo del preflight:

- existe el schedule diario de 35 días
  `fa16b7c4-ecb8-418f-bf3a-815da592fabc`, creado en
  `2026-08-14T13:34:14.218278Z`;
- el listado REST y `firebase firestore:backups:list` siguen mostrando cero
  backups observables;
- por ello no existe todavía atestación independiente, restore aislado ni
  medición RPO/RTO.

El smoke productivo independiente de la aplicación continúa siendo un gate
separado del preflight y no se declara cumplido por esta observación.

## Escrituras

Ninguna. No se canceló la suscripción histórica, no se creó relación anual, no
se modificó la Empresa y no se cambió la configuración.

## Siguiente acción

Cuando el primer backup sea observable, ejecutar el guard de restore hacia una
base nueva con prefijo `gsaas02-recovery-`, verificar integridad y aislamiento,
medir RPO/RTO y publicar la atestación independiente. Después repetir el
preflight y, solo si todos los gates permanecen en PASS, ejecutar la secuencia
canónica de cierre anticipado y materialización del Trial anual.
