# ADR-SAAS-107 — Fuente verificable del representante del tenant

## Estado

**Propuesto** — pendiente de aprobación. `G-SAAS-02 → M2 → E2.2`.

Este ADR no cambia ni habilita exportaciones reales, despliegues productivos,
recolección de documentos de identidad ni selección de un proveedor de correo o
mensajería.

## Contexto

ADR-SAAS-106 acepta, para implementación controlada, una aprobación de exportación
de un solo uso enviada a un contacto representante del tenant previamente
verificado. El validador de exportación consume un registro server-side, pero el
repositorio no contiene un contacto versionado ni un flujo que verifique el
control del canal.

El recibo existente en `empresas/{empresaId}/aceptacionesLegales` registra el
`uid` que aceptó el contrato, `relacion=ADMIN_TENANT_REPRESENTANTE_DECLARADO` y
`facultadRepresentacionDeclarada=true`. Sirve como declaración del administrador
de su representación para esa relación contractual; no identifica por sí solo
un medio de entrega del enlace, no prueba que siga activo ni acredita control de
correo/teléfono. No se debe confundir con el consentimiento para una exportación
específica.
No se presume que exista un recibo aplicable en producción: los documentos
continúan en borrador y su aceptación no está activada para clientes.

Sin esa autoridad, no debe crearse un registro aprobable usando datos elegidos
por el operador o una atestación libre. La exportación real permanece fail-closed.

## Decisión requerida

Definir cómo Dusema establece, versiona, verifica, reemplaza y revoca el contacto
que puede recibir y aprobar una solicitud de exportación conforme a ADR-SAAS-106.

## Alternativas

### A. Registro server-side versionado con dos verificaciones — recomendada

Mantener un registro por tenant, inaccesible al cliente y append-only, con una
versión activa de contacto. Para la designación se referenciaría el recibo
vigente de aceptación legal cuando el administrador declarado sea el contacto;
si el negocio designa a otra persona, se conservaría solo una referencia opaca a
su instrucción verificable. Para activar el contacto se exigirían:

1. evidencia de que la persona fue designada por el negocio como contacto
   representante para instrucciones de salida de datos; y
2. prueba de control del canal de entrega mediante desafío de un solo uso.

El registro conservaría referencias opacas a la evidencia, estado, fechas,
canal, versión y operador que verificó; no guardaría copias de cédulas, RUT,
tokens, contenido de correo ni números completos de identidad. Un cambio crea
otra versión y revoca la anterior. El emisor de ADR-SAAS-106 solo lee la versión
activa; no admite un email, teléfono o ID de contacto arbitrario en la solicitud.

El transporte sería una interfaz con idempotencia y evidencia mínima. Un stub
solo serviría para Emulator/staging sintético. Un proveedor real no se elige ni
se habilita con este ADR; se requiere una decisión de proveedor y una prueba
externa de entrega aparte antes de datos reales.

### B. Reutilizar el administrador y correo de Firebase Auth

Usar la membresía admin vigente y `emailVerified` del usuario como contacto.
Simplifica la persistencia y entrega, pero prueba control de una cuenta y rol
administrativo; no prueba por sí sola que el negocio designó a esa persona para
autorizar exportaciones ni que conserve esa facultad.

### C. Verificación manual por cada solicitud

Un operador registra una referencia externa para cada exportación, sin mantener
un contacto. Evita una nueva fuente permanente, pero vuelve a depender de una
atestación difícil de comprobar, no permite revocación/versionado confiables y
no satisface la validación independiente de ADR-SAAS-106.

## Consecuencias de la recomendación

- Añadir una autoridad server-side separada de membresías, aceptación legal,
  reclamos y autorizaciones de soporte.
- Definir facultad de plataforma, evento de auditoría, reglas de versionado,
  revocación, retención y prueba de aislamiento antes de implementar.
- Mantener fail-closed hasta que exista contacto activo y canal verificado.
- No requiere cuenta activa del tenant para la aprobación del enlace.
- No implica contactar a Diana, leer payloads reales, cambiar el contrato ni
  habilitar un proveedor externo.

## Validación prevista si se aprueba

Pruebas con fixtures sintéticos: contacto ausente/no verificado, control de
canal fallido, tenant equivocado, versión reemplazada, revocación, repetición,
expiración, cambio de alcance y aislamiento entre tenants. Probar envío solo con
un adapter stub en Emulator/staging. El smoke con proveedor real, persona real y
exportación requiere gates operativos separados.

## Aprobación

Pendiente del responsable del producto. Hasta entonces no se implementa la nueva
fuente de autoridad ni el flujo que emite autorizaciones reales.
