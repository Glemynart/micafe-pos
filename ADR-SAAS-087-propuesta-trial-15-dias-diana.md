# ADR-SAAS-087 — Excepción propuesta de Trial anual de 15 días para Diana

## Estado

**PROPUESTO — pendiente de aprobación expresa; no vigente.**

Esta propuesta no cambia la política aceptada, el Goal, los contratos, el código, las ofertas ni los datos existentes. Bootstrap y los despliegues deben seguir rechazando un Trial anual de 15 días mientras esta ADR no sea aceptada e implementada por un PR separado.

- **Fecha de propuesta:** 2026-10-23.
- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 — Provisioning y onboarding → E2.1 — Tenant de referencia`.
- **Caso propuesto:** `distribuidora-las-jimenez`, Bodega MVP-1, oferta anual de `1.600.000 COP`, pago manual.
- **ADRs relacionados:** [ADR-SAAS-028](ADR-SAAS-028-contrato-comercial-anual-snapshot.md), [ADR-SAAS-061](ADR-SAAS-061-oferta-comercial-tenant-especifica.md) y [ADR-SAAS-073](ADR-SAAS-073-perfil-comercial-primer-acceso-bodega.md).

La aceptación reportada por el responsable cubre el precio anual de `1.600.000 COP` y el pago manual. La mención de Diana a 15 días no demuestra por sí sola que haya aceptado expresamente ese plazo y su efecto de vencimiento. Antes de materializar una oferta de 15 días se requiere registrar esa aceptación específica y la aprobación comercial correspondiente, sin guardar datos personales en el repositorio.

## Política vigente y evidencia revisada

1. `G-SAAS-02` define como resultado un Trial anual server-side de 30 días.
2. `ADR-SAAS-028` establece 30 días exactos, calculados por el servidor, sin gracia, con intervalo semiabierto `[inicio, fin)`. En la fecha `fin` ya no hay acceso de Trial. El Bootstrap anual no admite otro valor.
3. `ADR-SAAS-061` permite que una oferta por tenant varíe el precio acordado; los demás términos derivan del Plan y del contrato. No añade la duración del Trial al contrato de oferta.
4. En `functions/src/bootstrap/service.ts`, Bootstrap usa 30 como valor por defecto y rechaza una duración anual distinta de 30. Deriva `trialInicio` desde el reloj del servidor y `trialFin` sumando días de 24 horas antes de formatear ambas fechas como fecha UTC `YYYY-MM-DD`.
5. En `functions/src/suscripciones/service.ts`, el creador transaccional de Trial anual también rechaza intervalos cuya diferencia no sea 30 días. Guarda `trialInicio` y `trialFin` en `suscripciones/{empresaId}`, crea `snapshotContrato.vigencia.inicio/fin` con las mismas fechas y registra `TrialIniciado` en la auditoría.
6. La oferta vive bajo `ofertas_comerciales_tenant/{empresaId}/ofertas/{ofertaId}`. Su contrato actual contiene el precio, Plan/version, destinatario, estado, revisión, `referenciaAprobacion` y la ventana de elegibilidad `iniciaEn`/`expiraEn`. No contiene `trialDias`. Esas fechas determinan cuándo se puede consumir la oferta; no son las fechas de inicio y vencimiento del Trial.

Por tanto, el comportamiento vigente no permite iniciar 15 días de forma conforme. Pasar `trialDias: 15` al payload o cambiar a mano las fechas después del Bootstrap no ofrece evidencia comercial durable ni es compatible con las decisiones aceptadas.

## Resolución propuesta

Mantener la regla global de 30 días y proponer una excepción nueva, limitada a la oferta inicial de `distribuidora-las-jimenez`, para un Trial de 15 días. Esta excepción solo entraría en vigor después de aprobar esta ADR, obtener la aceptación expresa de Diana y completar un PR de implementación separado. No se extendería a otros tenants, renovaciones ni transiciones contractuales.

### Contrato versionado propuesto

La implementación posterior debe versionar el contrato, no reinterpretar ofertas existentes:

- Las ofertas actuales `schemaVersion: 1` siguen significando la política anual de 30 días. No se migran ni se infiere otro plazo a partir de sus fechas.
- Una nueva oferta `schemaVersion: 2` para el caso autorizado guardaría `trialDias: 15` y `referenciaAceptacionCliente`, un identificador opaco de la aceptación expresa del cliente, además de los campos existentes. La referencia no contendría nombres, teléfonos, correos ni transcripciones.
- El Bootstrap solo resolvería ese plazo desde la oferta aprobada y dirigida al `empresaId` esperado. No aceptaría `trialDias` del cliente ni del operador como autoridad. Una oferta no aprobada, vencida, revocada, consumida o con otro destinatario no podría iniciar el Trial.
- El `snapshotContrato` de esta relación sería `schemaVersion: 2` e incluiría `trialDias: 15` junto con `vigencia.inicio/fin`. El dato de consulta `suscripciones/{empresaId}.trialInicio/trialFin` y el snapshot deben coincidir exactamente. La oferta consumida, el snapshot y el evento `TrialIniciado` deben conservar la referencia de oferta, duración y fechas bajo la misma transacción e idempotencia.
- `iniciaEn` y `expiraEn` de la oferta conservan su significado actual de elegibilidad. `trialInicio` y `trialFin` se calculan al confirmar Bootstrap; la fecha de la oferta nunca los adelanta ni los inicia por calendario.
- Precio `1.600.000 COP`, modalidad de pago manual, capacidades, ausencia de cobro automático y demás términos aprobados no cambian por esta propuesta.

El intervalo seguirá siendo `[trialInicio, trialFin)`. Para un inicio UTC `2026-10-23`, el ejemplo de vencimiento a 15 días es `2026-11-07`: el último día completo con acceso sería `2026-11-06`; desde `2026-11-07` el Trial está vencido. La fecha efectiva se calcularía al ejecutar un Bootstrap autorizado, no se fija en esta ADR.

La propuesta supersedería, únicamente para este caso y una vez aceptada, el requisito de 30 días de ADR-SAAS-028 y el límite de ADR-SAAS-061 según el cual la oferta solo varía el precio. Las demás condiciones de ambos ADR permanecen vigentes. El Goal y el runbook tendrían que sincronizarse como parte del evento formal de aceptación; no se editan en esta propuesta.

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

Un build verde solo demostraría compilación. La conformidad arquitectónica requiere cumplir esta ADR y sus pruebas. La autorización para desplegar y la autorización para ejecutar Bootstrap/oferta/Trial son decisiones operativas separadas; esta propuesta no concede ninguna de ellas.

## Alternativas

| Alternativa | Consecuencias |
| --- | --- |
| **A. Excepción individual de 15 días (recomendada)** | Refleja el plazo solicitado por Diana y conserva 30 días como regla del resto del SaaS. Requiere aceptación expresa, versión nueva de oferta/snapshot, cambios server-side y pruebas de borde/idempotencia. |
| **B. Mantener 30 días** | Conserva sin cambios la política y contratos aceptados. Diana debe aceptar expresamente los 30 días o se pospone la activación; no requiere cambio de código. |
| **C. Cambiar todos los Trials anuales a 15 días** | Rechazada para este alcance: altera la política global, el Goal y todos los futuros contratos, aunque el caso solo necesita una decisión individual. |
| Pasar 15 en Bootstrap o cambiar las fechas manualmente | Rechazada: carece de una fuente comercial versionada, rompe la validación actual y permitiría estados contractuales inconsistentes. |

## Consecuencias, rollout y rollback

Si se acepta, el trabajo posterior debe actualizar de forma coordinada el contrato de ofertas, su validación/aprobación, Bootstrap, snapshot, auditoría, política de vencimiento, documentos maestros y pruebas. Los documentos y datos v1 conservarán 30 días. El cambio no autorizará por sí mismo crear el tenant, registrar la oferta, ejecutar Bootstrap, activar el Trial ni desplegar.

Antes de consumir la oferta, rollback es revocarla mediante el comando canónico y no iniciar el Bootstrap. Después de consumirla, no se reescriben fechas ni snapshot; cualquier ajuste requeriría una nueva decisión comercial y un comando canónico auditado. No se borran evidencias.

## Decisiones pendientes para aceptación

- Confirmar que la excepción de 15 días se limita a `distribuidora-las-jimenez` y no cambia el estándar de 30 días para otros clientes.
- Obtener evidencia de que Diana acepta expresamente el plazo de 15 días, separada de la aceptación reportada del precio anual y pago manual.
- Aprobar la versión de oferta/snapshot y los criterios de prueba establecidos en esta ADR.
- Autorizar por separado cualquier PR de implementación, operación de Bootstrap/Trial o despliegue cuando la preparación esté completa.
