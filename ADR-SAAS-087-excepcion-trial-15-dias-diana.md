# ADR-SAAS-087 — Excepción de Trial anual de 15 días para Diana

## Estado

**ACEPTADO — 2026-10-23.**

La aprobación expresa del responsable autoriza una sola excepción de Trial de 15 días para Distribuidora Las Jiménez. El responsable confirma que Diana aceptó expresamente el mismo plazo. La aprobación habilita preparar e implementar el contrato versionado definido aquí; no registra la oferta, crea el tenant, ejecuta Bootstrap o Trial, escribe datos ni autoriza despliegues.

- **Fecha de aceptación:** 2026-10-23.
- **Fuente:** aprobación expresa del responsable y confirmación de aceptación de Diana en esta ejecución; identificador de aceptación que usará la oferta: `G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23`.
- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial` (Epic activo en el Goal vivo).
- **Caso autorizado:** `distribuidora-las-jimenez`, Bodega MVP-1, oferta anual de `1.600.000 COP`, pago manual.
- **ADRs relacionados:** [ADR-SAAS-028](ADR-SAAS-028-contrato-comercial-anual-snapshot.md), [ADR-SAAS-061](ADR-SAAS-061-oferta-comercial-tenant-especifica.md) y [ADR-SAAS-073](ADR-SAAS-073-perfil-comercial-primer-acceso-bodega.md).

El identificador es opaco y no contiene datos personales ni transcripción. El precio anual público y la política de Trial para todos los demás casos no cambian.

## Política vigente y evidencia revisada

1. `G-SAAS-02` define como resultado un Trial anual server-side de 30 días.
2. `ADR-SAAS-028` establece 30 días exactos, calculados por el servidor, sin gracia, con intervalo semiabierto `[inicio, fin)`. En la fecha `fin` ya no hay acceso de Trial. El Bootstrap anual no admite otro valor.
3. `ADR-SAAS-061` permite que una oferta por tenant varíe el precio acordado; los demás términos derivan del Plan y del contrato. No añade la duración del Trial al contrato de oferta.
4. En `functions/src/bootstrap/service.ts`, Bootstrap usa 30 como valor por defecto y rechaza una duración anual distinta de 30. Deriva `trialInicio` desde el reloj del servidor y `trialFin` sumando días de 24 horas antes de formatear ambas fechas como fecha UTC `YYYY-MM-DD`.
5. En `functions/src/suscripciones/service.ts`, el creador transaccional de Trial anual también rechaza intervalos cuya diferencia no sea 30 días. Guarda `trialInicio` y `trialFin` en `suscripciones/{empresaId}`, crea `snapshotContrato.vigencia.inicio/fin` con las mismas fechas y registra `TrialIniciado` en la auditoría.
6. La oferta vive bajo `ofertas_comerciales_tenant/{empresaId}/ofertas/{ofertaId}`. Su contrato actual contiene el precio, Plan/version, destinatario, estado, revisión, `referenciaAprobacion` y la ventana de elegibilidad `iniciaEn`/`expiraEn`. No contiene `trialDias`. Esas fechas determinan cuándo se puede consumir la oferta; no son las fechas de inicio y vencimiento del Trial.

Por tanto, el comportamiento vigente no permite iniciar 15 días de forma conforme. Pasar `trialDias: 15` al payload o cambiar a mano las fechas después del Bootstrap no ofrece evidencia comercial durable ni es compatible con las decisiones aceptadas.

## Decisión aceptada

Mantener 30 días exactos como política general y autorizar una excepción de 15 días únicamente para la oferta inicial v2 de `distribuidora-las-jimenez`. No se extiende a otro tenant, otra oferta, renovaciones, transiciones contractuales ni futuras ofertas del mismo cliente. La excepción solo se materializa desde datos server-side de la oferta aprobada durante el Bootstrap canónico por la ruta de plataforma autorizada; la callable pública de autoservicio no puede consumirla. La identidad objetivo se fija en la allow-list server-side y debe coincidir en oferta, Bootstrap y tenant; un nombre comercial enviado por el cliente nunca es autoridad.

### Contrato versionado

La implementación debe versionar el contrato, no reinterpretar ofertas existentes:

- Las ofertas actuales `schemaVersion: 1` siguen significando la política anual de 30 días. No se migran ni se infiere otro plazo a partir de sus fechas.
- Una nueva oferta `schemaVersion: 2` para el caso autorizado guardaría `trialDias: 15` y `referenciaAceptacionCliente`, un identificador opaco de la aceptación expresa del cliente, además de los campos existentes. La referencia no contendría nombres, teléfonos, correos ni transcripciones.
- El Bootstrap solo resuelve ese plazo desde la oferta aprobada y dirigida al `empresaId` esperado. No acepta `trialDias`, versión ni referencia de aceptación del cliente o del operador como autoridad. La excepción requiere la facultad de plataforma `BOOTSTRAP_EMPRESARIAL_SOLICITAR`, revalidada server-side, y el registro de auditoría canónico. Una oferta no aprobada, vencida, revocada, consumida o con otro destinatario no puede iniciar el Trial.
- El `snapshotContrato` de esta relación sería `schemaVersion: 2` e incluiría `trialDias: 15` junto con `vigencia.inicio/fin`. El dato de consulta `suscripciones/{empresaId}.trialInicio/trialFin` y el snapshot deben coincidir exactamente. La oferta consumida, el snapshot y el evento `TrialIniciado` deben conservar la referencia de oferta, duración y fechas bajo la misma transacción e idempotencia.
- `iniciaEn` y `expiraEn` de la oferta conservan su significado actual de elegibilidad. `trialInicio` y `trialFin` se calculan al confirmar Bootstrap; la fecha de la oferta nunca los adelanta ni los inicia por calendario.
- Precio `1.600.000 COP`, modalidad de pago manual, capacidades, ausencia de cobro automático y demás términos aprobados no cambian por esta decisión.

El intervalo seguirá siendo `[trialInicio, trialFin)`. Para un inicio UTC `2026-10-23`, el ejemplo de vencimiento a 15 días es `2026-11-07`: el último día completo con acceso sería `2026-11-06`; desde `2026-11-07` el Trial está vencido. La fecha efectiva se calcularía al ejecutar un Bootstrap autorizado, no se fija en esta ADR.

Esta ADR supersede, únicamente para el caso delimitado, el requisito de 30 días de ADR-SAAS-028 y el límite de ADR-SAAS-061 según el cual la oferta solo varía el precio. ADR-SAAS-028 y ADR-SAAS-061 conservan todas sus demás decisiones. El Goal, el runbook y la vista arquitectónica se sincronizan con esta aceptación; la política general permanece en 30 días.

### Límite de autorización para el Bootstrap

El Bootstrap público de autoservicio no puede crear el tenant objetivo ni consumir la excepción. Solo la operación de plataforma autenticada y autorizada para `BOOTSTRAP_EMPRESARIAL_SOLICITAR` puede entrar a la ruta canónica con registro de auditoría. El servidor verifica el destinatario preasignado contra el registro exacto de la oferta v2 y resuelve allí el plazo y precio. La ausencia de oferta válida, la discrepancia de tenant, la falta de facultad o un campo comercial aportado en el payload produce rechazo antes de confirmar el núcleo del Bootstrap.

## Flujo y pruebas de aceptación requeridas

La implementación no podrá solicitarse a revisión hasta cumplir todo lo siguiente en pruebas unitarias y de Emulator, sin escrituras remotas:

1. Una oferta anual `schemaVersion: 1` existente continúa creando un Trial de exactamente 30 días; un cliente no puede forzar 15 mediante su payload.
2. Una oferta v2 aprobada para `distribuidora-las-jimenez`, con aceptación referenciada y `trialDias: 15`, crea el Trial de 15 días; ofertas para otro tenant, sin aprobación o sin referencia de aceptación son rechazadas antes del commit.
3. Con reloj fijo, comprobar que `trialFin - trialInicio` equivale a `15 × 86.400.000 ms` en UTC y que la operación funciona cruzando fin de mes, año bisiesto y cambio de año. Las fechas del snapshot deben coincidir con las fechas de la Suscripción y el evento de auditoría.
4. Verificar el límite semiabierto: el tenant sigue dentro del Trial en `trialFin - 1 día`; `readinessComercial` es falsa en `trialFin`, y el scheduler/transición protegida suspende idempotentemente desde esa fecha, sin periodo de gracia.
5. Repetir el mismo Bootstrap idempotente conserva el inicio y vencimiento originales, no extiende el plazo, no duplica `TrialIniciado` y no vuelve a consumir la oferta. Un comando distinto no consume la misma oferta.
6. Verificar que la oferta queda `CONSUMIDA`, conserva precio/Plan y referencia de aprobación, y que ni la oferta consumida ni el snapshot se pueden editar para extender o acortar el Trial.
7. Verificar que el precio anual acordado sigue siendo `1.600.000 COP`, que el pago continúa siendo manual y que no se invoca ni registra un cobro automático.
8. Confirmar que los lectores/lifecycle admiten el snapshot v2, mantienen intactos los snapshots v1 y rechazan versiones desconocidas; las rutas de Trial que no consumen la oferta autorizada continúan rechazando 15 días.

Un build verde solo demostraría compilación. La conformidad arquitectónica requiere cumplir esta ADR y sus pruebas. La autorización para desplegar y la autorización para ejecutar Bootstrap/oferta/Trial son decisiones operativas separadas; esta decisión no concede ninguna de ellas.

## Alternativas

| Alternativa | Consecuencias |
| --- | --- |
| **A. Excepción individual de 15 días** | **Aceptada.** Refleja el plazo aprobado para Diana y conserva 30 días como regla general. Requiere oferta/snapshot v2, verificación server-side, ruta de plataforma autorizada y pruebas de borde/idempotencia. |
| **B. Mantener 30 días para este cliente** | Rechazada para este caso por la aprobación expresa de la excepción; sigue siendo la regla para todas las ofertas sin excepción v2 aprobada. |
| **C. Cambiar todos los Trials anuales a 15 días** | Rechazada: alteraría la política global, el Goal y futuros contratos sin autorización. |
| Pasar 15 en Bootstrap o cambiar las fechas manualmente | Rechazada: carece de una fuente comercial versionada, rompe la validación y permite estados contractuales inconsistentes. |

## Consecuencias, rollout y rollback

La implementación debe actualizar coordinadamente el contrato de ofertas, su validación/aprobación, Bootstrap, snapshot, auditoría y pruebas. Los documentos y datos v1 conservan 30 días; el v2 se admite solo bajo la allow-list de esta ADR. La aceptación de esta decisión no autoriza registrar la oferta, crear el tenant, ejecutar Bootstrap, activar el Trial ni desplegar.

Antes de consumir la oferta, rollback es revocarla mediante el comando canónico y no iniciar el Bootstrap. Después de consumirla, no se reescriben fechas ni snapshot; cualquier ajuste requeriría una nueva decisión comercial y un comando canónico auditado. No se borran evidencias.

## Gates operativos pendientes

- Implementar y probar la excepción según este contrato en un PR revisable; hasta el merge, no se considera operativa.
- Superar preflight vigente de staging/producción y verificar Functions, Rules, App Hosting, identidad y recuperación para el SHA que se proponga.
- Obtener autorizaciones operativas separadas para registrar la oferta, crear el tenant e iniciar Trial, y para cada despliegue.
- Verificar que el catálogo y el inventario estén aprobados antes de declarar que Diana puede vender o comprar.
