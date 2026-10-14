# G-SAAS-02 / M2 / E2.2 — Cierre post-merge de PR #595

**Fecha de registro:** 2026-10-14
**Goal rector:** `G-SAAS-02`
**Milestone:** `M2 — Provisioning y onboarding`
**Epic:** `E2.2 — Configuración inicial`
**Estado de Gate I:** `INCOMPLETE`; este asiento no certifica el release ni autoriza despliegues.

## Resolución de jerarquía

La documentación normativa viva de `origin/main` identifica `G-SAAS-02` como el único Goal activo, con M2 en ejecución y E2.2 en ejecución. El encabezado y cuerpo de PR #595 declaran esos mismos valores. `G-MVP-01` aparece en la sección histórica de `docs/goals/GOAL-MVP-COMERCIAL.md` como completado en `main @ 65a9fb85d9159eb949ffaf18c5a99ed6377b1554`, con reconciliación documental posterior en PR #241; por tanto, no es el Goal rector de este cambio. La baseline histórica `G-SAAS-01` también está documentada separadamente como completada.

No se reclasifica el PR, no se cambia la jerarquía y no se reescribe su descripción histórica. El checkout compartido atrasado no se usó como autoridad.

## Integración y CI

| Dato | Resultado verificado |
|---|---|
| PR | [#595 — fix(gate-i): accept ADR-079 and pause DIAN by tenant](https://github.com/Glemynart/micafe-pos/pull/595) |
| Estado | `MERGED`, 2026-10-14T18:29:06Z |
| SHA de head del PR | `1b57a3bdc89f9edb52f32c755db69cbd9fd4dfc7` |
| Merge SHA completo / `origin/main` | `f08fa1ca6466bfc84c39d771f34e494aaf9b2386` |
| Base del PR | `f604a0af1669cc0903859c7271b1da1e3f29cea9` |
| Checks previos al merge | `Tipos y pruebas` (run `38610876988`), `Vercel` y `Vercel Preview Comments`: `success`; Vercel acredita Preview, no producción. |
| CI post-merge | Run `38615549091`, SHA `f08fa1ca6466bfc84c39d771f34e494aaf9b2386`; su resultado final se añadirá tras concluir. No reportar el estado pendiente como `PASS`. |

## Auditoría integrada

El merge contiene nueve archivos: ADR-SAAS-079, una actualización arquitectónica, guard de interfaz y sus pruebas, matriz Rules y evidencia/estado de Goal. `git diff --check` pasó. El alcance coincide con la decisión aprobada: impedir temporalmente la invocación de Factus desde las cuatro acciones de Historial, solo para `Cafe Atrato` (`1ae0rD9H8t3ZFSBKrrHR`) y `Prueba` (`Prueba`); conservar la implementación Factus; fallar cerrado si no se resuelve el tenant; y dejar explícito que no es autoridad fiscal server-side. No hay cambios en Firestore Rules, Functions, Vercel, datos de producción, IAM ni Secrets.

La auditoría del diff y el mutation audit previos al merge constan como `APROBADO PARA MERGE`. Los mutantes de retirar `Prueba` de la lista y bloquear accidentalmente todos los tenants fueron detectados por sus pruebas. La matriz del guard fue 10/10; las suites adicionales y sus omisiones están detalladas en la descripción de PR #595. No se atribuyen a esta revisión como ejecuciones nuevas.

## Revalidación de Gate I posterior al merge

El collector `scripts/g-saas-02/release-evidence.ts` se ejecutó a las
`2026-10-14T18:36:00.371Z` explícitamente contra el SHA completo integrado.
Resultado: `INCOMPLETE`, `readOnly=true`, `productionWrites=false`,
`collectionErrors=[]`; `ORIGIN_MAIN_MATCH=PASS`, Functions `104/104 ACTIVE`
en Node.js 22 y la CI post-merge seguía `in_progress`. No había estado Vercel
exitoso para el SHA. En esa ejecución el collector no obtuvo el ruleset porque
no tenía un `FIREBASE_ACCESS_TOKEN` en el proceso y por contrato no aceptó una
atestación externa de Rules/Storage/Smoke/Recovery; por eso sus cuatro campos
externos figuran `MISSING`. No se interpreta el `MISSING` del collector como
prueba de que el restore aislado no ocurrió. Las observaciones directas de
Rules y recovery se registran separadamente a continuación.

Lecturas de solo consulta realizadas el 2026-10-14, sin modificar producción:

| Superficie | Observación | Consecuencia |
|---|---|---|
| Empresas en estado `activa`/`trial` | Únicamente `Cafe Atrato` (`1ae0rD9H8t3ZFSBKrrHR`, `activa`) y `Prueba` (`trial`). | Coincide con el allowlist aceptado; es una fotografía y debe repetirse antes del corte de Rules. |
| Firestore Rules | `MISMATCH`, 14 paths; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; fuente de `main` `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`. | No desplegar. El ruleset es global; la matriz identifica dependencias de `/compras` y `/ventas`. El escritor cliente de metadata DIAN y la emisión por Factus necesitan corte seguro antes de cambiar Rules. |
| Compra legacy | `registrarCompraOperativaV1` permanece `ACTIVE`, Gen2/Node 22/us-central1, endpoint `https://us-central1-micafe-pos.cloudfunctions.net/registrarCompraOperativaV1`, hash remoto `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`. La fuente integrada ya rechaza Bodega en operación nueva y replay. | Preparar solo despliegue dirigido con revisión/rollback capturados. No está autorizado desplegar a producción. |
| Vercel | Deployment `READY` más reciente: `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, alias `cafeatrato-git-main-glemynarts-projects.vercel.app`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, 2026-10-06. Los deploys automáticos desde `main` están deshabilitados. | El SHA integrado no está publicado; no se hizo publicación manual. Falta autorización específica, fijar SHA y documentar rollback. |
| Smoke productivo | Sin atestación autenticada para el release objetivo. | Requiere identidad y alcance productivos autorizados; Preview/staging no lo sustituyen. |
| Restore y PITR | Restore aislado `gsaas02-recovery-20261014` en `southamerica-east1`: `VERIFIED`, `RPO=8.307 h`, `RTO=0.220 h`, `sourceUntouched=true`, `applicationCutover=false`. La evidencia indica artefacto JSON local. PITR está deshabilitado según ADR-SAAS-031; hay schedule diario/35 backups. | Restore independiente verificado; el artefacto JSON no está en este worktree. PITR deshabilitado es política aprobada, no bloqueo. No se restauró `(default)` ni se activó PITR. |
| Trial de Diana | El propietario confirmó el `2026-10-15` como fecha prevista de inicio. | La fecha no inicia el Trial ni autoriza provisioning/despliegue; iniciar solo cuando los gates y autorizaciones correspondientes estén satisfechos. |

La auditoría de rutas del checkout encontró cuatro invocaciones `window.api.factus` en `components/pos/historial.tsx` y ninguna llamada server-side a Factus en el código presente. El repositorio no contiene el main/preload/IPC/provider de Electron que implementaría ese límite; debe localizarse el companion source para completar la auditoría del boundary. El guard de PR #595 es de UI y no bloquea invocaciones directas a un backend externo. Antes del corte global de Rules se necesita resolver este gap con una arquitectura aceptada; no se implementó aquí.

## Límites y siguientes bloqueos

- Sin despliegues ni escrituras de producción, cambios IAM/Secrets, Trial o smoke autenticado.
- Bloqueo de Rules: incompatibilidad de 14 paths y necesidad de compatibilidad/server-authority DIAN; requiere preflight fresco, rollback forward-fix y autorización productiva independiente.
- Bloqueo de Functions: hash remoto antiguo de `registrarCompraOperativaV1`; requiere preflight dirigido y autorización productiva independiente.
- Bloqueo de Vercel: producción sigue en un SHA del 6-oct; publicación manual y smoke requieren autorización/identidad independiente.
- Falta completar auditoría del boundary Electron/IPC para DIAN porque su implementación no está en este checkout.
- No se declara Gate I `PASS`.
