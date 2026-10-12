# ADR-SAAS-073 — Perfil comercial del primer acceso Bodega sin activación fiscal

## Estado

**PROPUESTO — pendiente de aprobación explícita.**

- **Fecha de propuesta:** 2026-10-12.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.1 — Tenant de referencia` / `E2.2 — Configuración inicial`.
- **Decisor:** responsable del producto. **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-013, ADR-SAAS-047, ADR-SAAS-049, ADR-SAAS-054, ADR-SAAS-061 y ADR-SAAS-071.
- **Complementa, si se acepta:** ADR-SAAS-013 §5.4 únicamente para permitir que el admin tenant complete el perfil empresarial básico en su primer acceso; no amplía la edición de datos por operadores de plataforma.
- **Aprobación previa de alcance:** se autorizó redactar esta propuesta para que Diana complete datos reales del negocio al primer acceso, sin exigir facturación electrónica.
- **Límite:** este ADR no autoriza implementación, deploy, cambios de Rules/IAM/Secrets, creación del tenant real, incorporación de usuarios, entrega de credenciales, envío por WhatsApp ni escrituras de datos.

## Contexto y problema

Distribuidora Las Jiménez iniciará el Trial en modo DEMO, con pago manual y sin facturación electrónica. El administrador inicial será Diana; ella completará la información real del negocio y posteriormente creará sus vendedores y asignará sus roles. No se ha proporcionado el NIT, la dirección, el teléfono ni el correo reales, por lo que no se deben inventar ni escribir durante el desarrollo.

El flujo actual de `OnboardingGate` permite operar en DEMO cuando la readiness fiscal está incompleta, pero solo ofrece abrir el wizard fiscal opcional. El wizard actual reúne en un mismo paso la identidad/domicilio y datos tributarios (régimen, CIIU y responsabilidades), y luego exige numeración POS. Eso no corresponde a la experiencia aprobada: Diana debe registrar primero datos empresariales básicos y poder continuar en DEMO sin resolución ni numeración fiscal.

La configuración canónica ya contiene campos para nombre comercial, razón social, tipo de persona, NIT y dígito de verificación, contacto, dirección, departamento y municipio. La readiness fiscal exige además régimen tributario, actividad económica CIIU y numeración POS vigente. Por tanto, guardar solo el perfil básico no debe marcar el tenant como fiscalmente listo ni habilitar emisión electrónica.

Existe una restricción arquitectónica adicional: ADR-SAAS-047 define `saas-tenant-configuration` como codebase estrictamente read-only, con una única callable de lectura. El flujo fiscal actual está dentro de `saas-auth`, cuyo despliegue amplio no es la frontera aislada recomendada para esta mutación. La implementación debe respetar ambas fronteras o proponer formalmente su modificación; no puede introducir una escritura directa desde navegador.

## Impulsores de decisión

- Obtener de Diana datos reales y declarados del negocio antes de operar.
- Permitir continuar en modo DEMO sin numeración ni facturación electrónica.
- Mantener separadas la finalización del perfil empresarial y la readiness fiscal.
- Usar una sola fuente de datos para identidad y domicilio; evitar copias divergentes.
- Mantener escritura server-authoritative, idempotente, tenant-aware y auditable.
- Preservar el codebase read-only de ADR-SAAS-047 y evitar desplegar `saas-auth` como atajo.
- No enviar credenciales por WhatsApp sin número/destinatario y autorización de canal independientes.

## Opciones consideradas

### Opción 1 — Callable aislada para perfil empresarial (recomendada)

Agregar una callable única, sin Secrets, en un codebase aislado nuevo (por ejemplo, `saas-tenant-profile`). La callable revalida Auth, tenant activo y membresía `admin`; valida el payload y lo persiste con un servicio tenant-aware. El servicio compone el núcleo transaccional canónico de configuración con la actualización de `empresas.nombre`/`nombreComercial` en una sola transacción, siguiendo el patrón ya existente de `actualizarDatosAdministrativosEmpresa`; no hace escrituras cliente ni deja que Empresa y Configuración diverjan. Reutiliza los campos existentes de `identidadFiscal` y `localizacion`, sin duplicar NIT, dirección o contactos en un nuevo agregado. Para `BODEGA_MVP1`, la app presenta un paso inicial “Datos del negocio” antes de renderizar la superficie administrativa; el admin debe completarlo para terminar ese primer paso. Vendedores y tenants fuera de ese vertical conservan el flujo actual. Tras guardarlo, el tenant puede operar en DEMO aunque la fiscalidad siga incompleta.

- **Ventajas:** conserva intacta la callable read-only de ADR-SAAS-047 y el despliegue amplio de `saas-auth`; conserva un solo origen de datos y la auditoría/revisión/idempotencia del comando de configuración.
- **Costes:** añade un codebase y una callable con discovery, pruebas y gates propios; requiere demostrar el cierre de dependencias, ausencia de Secrets y compatibilidad de despliegue antes de certificarla.

### Opción 2 — Ampliar `saas-tenant-configuration`

Mantener el endpoint de lectura y agregar una callable de escritura acotada al perfil empresarial en el mismo codebase.

- **Ventajas:** nombre y dominio alineados, sin duplicar la lectura de configuración; menos codebases que la Opción 1.
- **Costes:** contradice el boundary estrictamente read-only y la callable única aceptados por ADR-SAAS-047. Exige una decisión que lo superseda, pruebas nuevas de escritura y revisar el riesgo de despliegue del conjunto.

### Opción 3 — Reutilizar el wizard fiscal / callable de `saas-auth`

Adaptar el wizard existente para aceptar campos parciales y guardar mediante `completarPasoFiscalOnboardingCallable`.

- **Ventajas:** reutiliza el servicio y el contrato existente con menor código nuevo.
- **Costes:** el contrato actual requiere régimen y CIIU y el flujo continúa con numeración; cambiarlo acopla la primera experiencia a fiscalidad y amplía el riesgo del codebase `saas-auth`. No garantiza por sí mismo la separación de experiencia aprobada.

### Opción 4 — Nuevo agregado `perfilComercial` separado

Crear una colección o sección de configuración nueva que duplique identidad, documento, dirección y contacto para distinguir explícitamente el perfil de los datos fiscales.

- **Ventajas:** separación semántica explícita y estado de completitud independiente.
- **Costes:** duplica información que ya existe en la configuración, abre dos fuentes de verdad y requiere definir sincronización y migración al activar fiscalidad. No se justifica para el primer cliente mientras la readiness fiscal ya distingue DEMO de FISCAL.

## Recomendación y decisión propuesta

Se recomienda la **Opción 1**. El perfil es un paso lógico distinto del alta fiscal, no una nueva copia del agregado: se guardan los datos básicos en los campos canónicos ya existentes, con una callable aislada y con la autoridad transaccional de configuración. Se conserva la callable de lectura de ADR-SAAS-047 sin cambios y no se despliega `saas-auth`.

La pantalla solicitará a Diana: nombre comercial, razón social, tipo de persona, NIT y dígito de verificación, dirección, departamento y municipio, teléfono y correo de contacto. Completar este conjunto es obligatorio para cerrar el paso de primer acceso de la administradora Bodega; los campos no se inventan ni se rellenan con datos de fixtures. Se reutilizan las validaciones canónicas existentes de NIT/DV, contacto y códigos territoriales y se muestran como información declarada por la administradora; el sistema no afirma haber verificado datos ante DIAN ni otro registro externo. La administración de vendedores y roles queda fuera del wizard, bajo responsabilidad de Diana.

Al completar el perfil, el tenant entra a la superficie operativa en modo DEMO. El estado de readiness fiscal continúa derivándose exclusivamente de sus requisitos existentes: identidad fiscal completa, régimen/CIIU y numeración POS vigente. No se inventan esos datos, no se crea numeración y no se emite factura, CUFE ni efecto tributario. La activación fiscal posterior seguirá el flujo fiscal existente cuando el cliente entregue datos y decida habilitarla.

El campo de contacto del negocio no se considera consentimiento ni destinatario de entrega de credenciales. El envío por WhatsApp requiere un destinatario confirmado y un canal de entrega aprobado por separado.

## Consecuencias y límites

- La experiencia de primer acceso cambia solo para un admin de tenant Bodega cuyo perfil básico esté incompleto; no debe bloquear a vendedores ni a tenants de otros verticales. Un perfil ya completo omite el paso.
- La definición de completitud debe derivarse de los campos obligatorios aprobados; no se persiste un booleano de readiness duplicado.
- La escritura usa el `empresaId` autenticado, revalida la membresía activa y rol admin en servidor, envelope con revisiones e idempotencia, el núcleo de configuración y auditoría existente, y actualiza el nombre de Empresa/configuración atómicamente.
- La operación no cambia estado de Empresa, Plan, suscripción, trial, módulos, capacidades ni numeración.
- La pantalla de primer acceso no equivale a aceptar el contrato ni a iniciar/reiniciar el Trial; esas fechas siguen siendo autoridad del Bootstrap contractual.
- No se permite escritura directa desde el cliente a `configuraciones/{empresaId}`.
- NIT, contacto y dirección son datos sensibles/comerciales: no se registran en logs, analítica, títulos de comandos ni evidencia pública. Las pruebas usan valores sintéticos.

## Migración, rollback y validación propuesta

No se requiere migración de datos: se reutilizan campos opcionales ya admitidos por el esquema vigente. La condición de perfil completo se deriva de esos campos. Datos ya existentes que cumplan el contrato no deben volver a solicitarse.

Antes de implementar se deberá probar en Emulator que: solo admin tenant activo puede guardar; el `empresaId` del cliente se ignora; datos incompletos/malformados se rechazan; NIT/DV y municipio/departamento se validan; la revisión e idempotencia se preservan; se crea auditoría sin filtrar PII; y, tras guardar solo el perfil básico, DEMO permanece disponible y readiness fiscal/numeración permanecen incompletas. E2E debe verificar primer acceso, reingreso con perfil completado y tenants existentes.

El rollback de código consiste en revertir la callable y la UI, sin borrar los campos ya guardados. Como no se añade un agregado ni se modifica el schemaVersion, el código anterior debe tolerar esos campos opcionales. No habrá deploy hasta Gate C, auditoría, CI verde y autorización operativa específica; este ADR no autoriza deploy por sí mismo.

## Referencias

- `docs/goals/GOAL-MVP-COMERCIAL.md` — G-SAAS-02, M2/E2.1/E2.2.
- `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md` — no inventar datos ni iniciar operaciones productivas fuera de sus gates.
- `components/onboarding/onboarding-gate.tsx` y `components/onboarding/onboarding-wizard.tsx` — flujo cliente actual.
- `functions/src/onboarding/service.ts` y `functions/src/onboarding/callables.ts` — autoridad del onboarding fiscal actual.
- `lib/configuracion/contrato.ts`, `lib/configuracion/readiness.ts` y `functions/src/configuracion/service.ts` — campos canónicos, readiness y escritura auditable.
- `functions/src/suscripciones/service.ts` — patrón actual de sincronización atómica del nombre comercial de Empresa y Configuración.
- `ADR-SAAS-013-bootstrap-primer-administrador-tenant.md` — autoridad de identidad y primer administrador.
- `ADR-SAAS-047-aislamiento-codebase-configuracion-tenant-staging.md` — frontera read-only que se preserva con la opción recomendada.
- `ADR-SAAS-049-aislamiento-codebase-bodega-staging.md`, `ADR-SAAS-054-superficie-operativa-bodega-staging.md` y `ADR-SAAS-071-frontera-compras-bodega.md` — aislamiento de funciones Bodega y límites de despliegue.
- `ADR-SAAS-061-oferta-comercial-tenant-especifica.md` — oferta anual específica aprobada, separada del precio público.
