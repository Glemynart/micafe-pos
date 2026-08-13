# G-SAAS-02 — Runbook mínimo de Trial y soporte

Estado: `BORRADOR OPERATIVO` hasta validar el flujo con el tenant de referencia.

## Gate adicional de M2

La certificacion read-only del tenant acepta `Empresa.estado = trial` durante el periodo contractual inicial; no se exige activar la suscripcion anual para certificar el provisioning y el onboarding.

Este runbook acompaña al Goal `G-SAAS-02`. No autoriza escrituras productivas por sí mismo ni sustituye el acceso administrativo aprobado, un backup o el registro de cambios.

La lectura productiva actual del tenant de referencia está registrada en
`docs/goals/evidence/G-SAAS-02-READONLY-PRODUCTION-2026-08-12.md` y la
publicación posterior del catálogo anual está registrada en
`docs/goals/evidence/G-SAAS-02-PLAN-ANNUAL-PUBLICATION-2026-08-12.md`. La
revalidación read-only más reciente está registrada en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-13.md`; la
documentación vigente quedó integrada en
`origin/main @ 307e213533f958daaa7394b41fd8029202ddb44e`. La
versión anual v2 de `mvp_comercial` ya está publicada con precio de
`1.800.000 COP`, periodicidad `ANUAL` y nueve capacidades. Café Atrato, sin
embargo, conserva su suscripción mensual histórica y su Trial
`2026-08-03`–`2026-09-02`; por tanto, todavía no se considera iniciado el
Trial anual de este Goal.

## 1. Gate de entrada

Antes de crear o modificar un tenant se registra:

- proyecto Firebase y entorno;
- SHA de aplicación y versión de Functions;
- `empresaId` aprobado;
- plan publicado, versión, precio y periodicidad;
- modo `DEMO` o `FISCAL` elegido;
- administrador y membresía aprobados;
- datos de catálogo y equipo recibidos;
- ventana operativa y responsable;
- punto de recuperación disponible antes de escribir;
- rollback aplicable.

No se usan NIT, credenciales fiscales, PINs o secretos inventados.

## 2. Provisioning y onboarding

1. Confirmar el plan ANUAL publicado y el Trial de 30 días.
2. Ejecutar el comando canónico de bootstrap con envelope e idempotencia.
3. Verificar Empresa, Suscripción, membresía, credencial, claims y Espacio.
4. Confirmar que `configuraciones/{empresaId}.modulos.habilitados` coincide con las capacidades del Plan.
5. Entregar la credencial temporal por canal fuera de Git y registrar únicamente la referencia de evidencia.
6. En modo DEMO, validar entrada al POS y una venta no fiscal.
7. Configurar productos, clientes, usuarios, permisos y flujo inicial del cliente.

### 2.1 Transición del tenant mensual histórico

La transición de Café Atrato solo se ejecuta después de `2026-09-02` y nunca reinicia el Trial mensual:

1. hacer preflight read-only de Empresa, suscripción raíz, relación vigente, plan v2, configuración, operador, Rules y punto de recuperación;
2. ejecutar el cierre canónico del Trial mensual (`suspenderTrialVencido`) si no existe pago; la raíz puede avanzar en su lifecycle, pero no se cambian sus fechas, plan, capacidades históricas ni snapshot;
3. ejecutar `CrearRelacionContractualTrial` mediante `ejecutarComandoComercialSaas`, con `planId=mvp_comercial`, `planVersion=2`, la revisión raíz observada y `relacionAnteriorId=legacy_mensual_v1`;
4. verificar que la nueva relación tiene snapshot ANUAL, nueve capacidades y exactamente 30 días, mientras la raíz conserva `planVersion=1`, sus fechas y sus siete capacidades;
5. ejecutar `TransicionarEmpresa` a `activa` mediante el comando de lifecycle, usando la revisión de Empresa observada después de materializar la relación;
6. actualizar `configuraciones/{empresaId}.modulos.habilitados` mediante el comando canónico de configuración, usando la lista derivada del snapshot vigente;
7. registrar IDs de comandos, revisiones, SHA desplegado, smoke test y evidencia sin secretos.

El preflight reproducible está disponible como
`npx tsx scripts/g-saas-02/trial-transition-preflight.ts`. Solo acepta lecturas `GET` de Firestore y
exige `FIREBASE_ACCESS_TOKEN` entregado fuera del repositorio. Requiere declarar
explícitamente el SHA, CI, hash de Functions, Rules, Storage, Vercel y la
referencia de recovery; siempre emite `productionWrites: false` y
`commandExecutionAllowed: false`. Antes del `2026-09-02` debe devolver
`ESPERAR_VENTANA`; no debe invocar ninguno de los comandos de transición.
La evidencia de la ejecución actual está en
`docs/goals/evidence/G-SAAS-02-TRANSITION-PREFLIGHT-2026-08-13.md`; su estado
también registra recovery y release como gates pendientes, no como hechos
supuestos.

La evidencia automática de release se puede recolectar sin escrituras con:
`npx tsx scripts/g-saas-02/release-evidence.ts --project micafe-pos --repo Glemynart/micafe-pos`.
El colector consulta el SHA de `origin/main`, la CI y Vercel mediante `gh api`,
y el inventario de Functions mediante `firebase functions:list`. Nunca imprime
credenciales ni ejecuta deploy. Las referencias `--rules-ref`, `--storage-ref`,
`--smoke-ref` y `--recovery-ref` se conservan como declaradas, pero no se
consideran atestaciones independientes por el solo hecho de existir.
La ejecución observada más reciente está en
`docs/goals/evidence/G-SAAS-02-RELEASE-EVIDENCE-2026-08-13.md`.

Si cualquier precondición falla, se conserva el estado actual y se registra el rechazo; no se escribe directamente Firestore ni se crea otro tenant.

## 3. Operación y soporte

El operador consulta primero las proyecciones canónicas del Backoffice:

- Empresa y lifecycle;
- Suscripción, Trial y contrato snapshot;
- Plan y capacidades;
- configuración y readiness;
- provisioning;
- administrador, membresía y credencial;
- auditoría y soporte consentido.

Acciones permitidas por procedimiento:

- reemitir o desbloquear credencial;
- activar, suspender o reactivar según comandos de lifecycle;
- autorizar soporte temporal y solo lectura;
- corregir configuración mediante comandos canónicos;
- registrar incidente y su severidad.

El panel y el soporte consultan la relación contractual vigente y su snapshot inmutable. El scheduler canónico suspende la relación al vencer el Trial o el periodo pagado. El pago manual usa `ConfirmarPagoAnualRelacionContractual`, calcula el periodo server-side, crea un recibo ligado a `relacionId` y conserva intacta la suscripción raíz histórica.

El operador no edita directamente `empresas`, `suscripciones`, `membresias`, `configuraciones`, cuentas financieras, ledger o auditoría.

## 4. Clasificación de incidentes

- `P0`: pérdida de aislamiento, corrupción financiera, indisponibilidad total o exposición de secretos. Contener inmediatamente y detener la operación afectada.
- `P1`: operación crítica bloqueada o comportamiento financiero incorrecto sin alternativa segura. Contener, reproducir, corregir por PR, desplegar y verificar.
- `P2`: degradación con workaround documentado.
- `P3`: defecto no bloqueante o mejora fuera del Trial.

Para P0/P1 se conserva la secuencia: detectar → contener → reproducir → corregir → probar → PR → CI → merge → desplegar → verificar → registrar → continuar.

No se reinicia artificialmente el Trial para ocultar un incidente.

## 5. Egresos

Los egresos son append-only para el cliente. No existe eliminación client-side.

Si un egreso debe corregirse:

1. conservar el documento y el movimiento original;
2. registrar el incidente y la justificación;
3. determinar si existe un comando backend canónico aplicable;
4. si no existe, mantener el dato y escalar como dependencia de implementación;
5. nunca modificar directamente la cuenta financiera o el ledger.

## 6. Release, rollback y recuperación

Antes del Trial se registra:

- SHA de `main`;
- resultado de CI;
- versión desplegada de Vercel;
- versión desplegada de Functions;
- Rules y Storage aplicados;
- smoke test productivo;
- punto de recuperación;
- responsable de rollback.

Un rollback de código no revierte automáticamente datos financieros. Los datos se corrigen únicamente mediante comandos idempotentes y auditados.

La recuperación productiva se considera pendiente hasta realizar un ensayo aprobado o documentar formalmente que no aplica al incidente concreto.

## 7. Evidencia del Trial

La evidencia no debe contener secretos, PINs, tokens, service accounts ni documentos completos innecesarios. Debe conservar:

- tenant y SHA;
- fechas de inicio y fin;
- capacidad usada;
- incidentes y severidad;
- correcciones y PRs;
- verificaciones de aislamiento;
- soporte y recuperación cuando aplique;
- decisión final de conversión o suspensión.

## 8. Cierre

La salida contractual se ejecuta sobre la relación vigente: conversión mediante `ConfirmarPagoAnualRelacionContractual` o suspensión automática mediante el scheduler canónico. Los comandos de la suscripción raíz mensual no se reutilizan para operar el contrato anual.

El Trial no se cierra por una pantalla de éxito ni por CI verde. Al día 30 se verifica:

1. periodo contractual;
2. operación real y estabilidad;
3. incidentes abiertos;
4. soporte y recuperación;
5. pago o condición de salida;
6. conversión o suspensión mediante comando canónico;
7. evidencia final y auditoría.

Solo entonces M6 y G-SAAS-02 pueden marcarse como completados.
