# G-SAAS-02 — Runbook mínimo de Trial y soporte

Estado: `BORRADOR OPERATIVO` hasta validar el flujo con el tenant de referencia.

Este runbook acompaña al Goal `G-SAAS-02`. No autoriza escrituras productivas por sí mismo ni sustituye el acceso administrativo aprobado, un backup o el registro de cambios.

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

El Trial no se cierra por una pantalla de éxito ni por CI verde. Al día 30 se verifica:

1. periodo contractual;
2. operación real y estabilidad;
3. incidentes abiertos;
4. soporte y recuperación;
5. pago o condición de salida;
6. conversión o suspensión mediante comando canónico;
7. evidencia final y auditoría.

Solo entonces M6 y G-SAAS-02 pueden marcarse como completados.
