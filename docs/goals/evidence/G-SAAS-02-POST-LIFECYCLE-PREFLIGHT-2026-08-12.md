# G-SAAS-02 — Preflight read-only posterior al lifecycle — 2026-08-12

## Alcance

Lectura estrictamente read-only del proyecto Firebase `micafe-pos` y del tenant
de referencia `1ae0rD9H8t3ZFSBKrrHR` después de integrar y desplegar el lifecycle
de la relación anual. La lectura se realizó el `2026-08-13T04:08:31Z` mediante
GET de la API REST de Firestore usando la sesión autenticada local de Firebase
CLI; el inventario de Functions se consultó con `firebase functions:list`.
No se invocaron callables comerciales, no se ejecutó Bootstrap y no se
realizaron escrituras productivas.

## Release observado

| Elemento | Evidencia |
|---|---|
| `main` | `4cfad20` — merge del PR #261 |
| CI post-merge | Run `31664603935`, `main`, completa y en verde |
| Functions relevantes | `ejecutarComandoComercialSaas`, `consultarContextoPlataforma` y `reconciliarVencimientosComercialesSaas` en `us-central1`, Node.js 22, estado `ACTIVE` |
| Hash de Functions | `ce73f42fa704c461257e87a809f45a264a7cbfc3` |

## Preflight del tenant

| Recurso | Estado observado |
|---|---|
| Empresa | `Cafe Atrato`, `estado=activa`, `revision=2` |
| Suscripción raíz | `trialing`, `mvp_comercial` v1, `revision=1`, `trialInicio=2026-08-03`, `trialFin=2026-09-02`, sin `snapshotContrato` |
| Plan v1 | `PUBLICADA`, `MENSUAL`, siete capacidades históricas |
| Plan v2 | `PUBLICADA`, `ANUAL`, `1.800.000 COP`, nueve capacidades |
| Configuración | `revision=3`, siete módulos históricos; todavía no incluye `shifts` ni `cuentas_cobro` |
| Relaciones contractuales | La colección `suscripciones/{empresaId}/relaciones` está vacía; no existe relación anual materializada |
| Espacios | Se conservan seis espacios históricos |
| Operador | UID de referencia `lNTK76Nf2TO5PSAOFPeHJx6PLRZ2`, `ACTIVO`, autorización v1 con `COMERCIAL_GOBERNAR` |

## Veredicto

`PREPARADO PARA TRANSICIÓN POSTERIOR AL 2026-09-02`.

El tenant y el release están disponibles para ejecutar la transición, pero el
Trial anual todavía no ha comenzado y G-SAAS-02 no está certificado. El Trial
mensual histórico sigue intacto y no se debe reiniciar, cambiar de plan ni
editar directamente.

## Secuencia pendiente autorizada por el runbook

Después de que el Trial mensual cierre canónicamente:

1. verificar de nuevo Empresa, suscripción raíz, plan v2, configuración,
   relación vigente, operador, Rules y recovery;
2. confirmar que la raíz quedó `suspended` sin cambiar sus fechas, plan ni
   capacidades históricas;
3. ejecutar `CrearRelacionContractualTrial` mediante
   `ejecutarComandoComercialSaas`, con `planId=mvp_comercial`,
   `planVersion=2`, la revisión raíz observada y
   `relacionAnteriorId=legacy_mensual_v1`;
4. verificar snapshot anual, nueve capacidades y Trial de exactamente 30 días,
   con la raíz mensual intacta;
5. ejecutar `TransicionarEmpresa` a `activa` con la revisión observada;
6. actualizar los módulos mediante `actualizarConfiguracionEmpresa` usando la
   lista derivada del snapshot vigente;
7. registrar comandos, revisiones, SHA, smoke, soporte y recovery sin secretos.

Si una precondición falla, se conserva el estado actual. No se deben usar
escrituras REST, Bootstrap sobre la Empresa existente ni comandos de la
suscripción raíz para operar el contrato anual.

## Certificación

Esta evidencia no certifica el Goal. El Goal permanece `ACTIVO` hasta completar
el Trial anual real de 30 días, documentar soporte y recuperación, y ejecutar la
conversión o suspensión contractual con evidencia final.
