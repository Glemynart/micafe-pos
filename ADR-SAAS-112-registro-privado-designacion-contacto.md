# ADR-SAAS-112 — Registro privado de designación del contacto de exportación

## Estado

**Aceptado para implementación sintética** el 2026-11-28, bajo la delegación
explícita de decisiones técnicas de la misión de cierre legal. `G-SAAS-02 → M2 → E2.2`.

Esta decisión habilita código, Emulator y fixtures sintéticos. No autoriza
registrar el contacto real de un negocio, enviar enlaces reales, desplegar,
exportar o suprimir datos reales, ni activar documentos en producción.

## Contexto

ADR-SAAS-106 exige que la aprobación de salida de datos llegue al representante
designado por el negocio. ADR-SAAS-107 aceptó una autoridad versionada con una
referencia verificable a la instrucción del negocio y prueba separada del canal.
ADR-SAAS-109 separó la facultad del operador que administra esa autoridad.

El dominio ya valida el desafío de canal y persiste su hash, estado y evidencia
de auditoría, pero no existe una fuente server-side para resolver la designación
ni el destino. El recibo de aceptación de términos no puede suponerse vigente ni
disponible: los documentos siguen en borrador y su aceptación real no está
activada.

## Decisión

Mantener la designación vigente en una colección server-only independiente:
`saas_export_contact_designations/{empresaId}`. Solo Functions puede leerla o
escribirla; las Security Rules deniegan el acceso de SDKs cliente a la raíz y
subcolecciones. Las funciones aceptan escrituras únicamente tras verificar
operador activo y `EXPORTACION_CONTACTO_GOBERNAR`.

El registro activo contiene únicamente: proyecto y tenant, ID/versionado del
contacto, canal, destino de entrega, referencia opaca a la instrucción externa,
UID del operador que la verificó y marcas de tiempo. No almacena el documento
fuente, identificación, contenido del mensaje, token ni destino en auditoría.
La UI requiere que el operador confirme que cotejó una instrucción del negocio;
la verificación del correo/teléfono se hace después mediante el desafío
independiente de un solo uso ya definido por ADR-SAAS-107.

Al reemplazar o revocar una designación, se invalida su versión y se elimina el
destino activo; el historial append-only conserva solo IDs, referencias opacas,
versiones, actores y fechas. Cualquier exportación exige que tanto la autoridad
de contacto como la versión de designación sigan activas al resolver el destino.

## Alternativas

### A. Registro privado mínimo en Firestore — aceptada

Mantener solo el destino activo y metadatos minimizados, con Rules deny-all,
acceso por callable con facultad dedicada, y eliminar el destino al reemplazar
o revocar. Es compatible con el dominio existente y permite invalidación
server-side sin dar acceso a una cuenta del tenant.

### B. Reutilizar el recibo de aceptación legal

No agrega un almacén de destinos, pero no está garantizado que exista un recibo
vigente y no prueba el control actual del canal. No cumple la operación temporal
antes de que los documentos se publiquen y acepten.

### C. Aceptar un destino arbitrario en cada exportación

Evita mantener un registro, pero permite que el operador cambie el destinatario
en el momento de entregar datos y no ofrece una designación revocable ni
versionada. Se descarta.

## Consecuencias y límites

- El servidor resuelve la designación; la llamada de exportación nunca acepta un
  correo, teléfono o ID de contacto como destino.
- Los eventos de auditoría excluyen destino, token y contenido fuente.
- La referencia opaca debe apuntar a una instrucción verificable conservada por
  el canal de negocio autorizado. El sistema no certifica la autenticidad de
  esa instrucción: la persona operadora deja constancia de su verificación.
- El destino es dato personal. Se conserva solo mientras la designación está
  activa; las retenciones técnicas de copias de seguridad deben describirse y
  validarse por separado.
- El proveedor de correo/mensajería permanece sin seleccionar. Sin proveedor
  aprobado y prueba externa, no existe envío real y la exportación permanece
  bloqueada.
- Firebase Admin SDK opera en el plano servidor y no queda limitado por
  Firestore Security Rules; el acceso también depende de la identidad y los
  permisos IAM de Functions. Por eso este ADR no declara que Rules sustituyan
  el control IAM ni resuelve ADR-SAAS-105/111.

## Validación requerida

Fixtures sintéticos y Emulator deben comprobar facultad ausente/revocada,
operador inactivo, proyecto/tenant incorrecto, referencia inválida, reemplazo,
revocación, challenge pendiente revocado, carrera de versión, doble consumo,
aislamiento y ausencia de PII/token en auditoría. Las pruebas no deben crear
contactos reales. La activación externa requiere un gate aparte.

## Referencias

- [ADR-SAAS-106 — autorización de exportación por tenant](ADR-SAAS-106-autorizacion-exportacion-tenant.md).
- [ADR-SAAS-107 — fuente verificable del representante](ADR-SAAS-107-contacto-representante-tenant.md).
- [ADR-SAAS-109 — facultad para administrar el contacto](ADR-SAAS-109-facultad-contacto-exportacion.md).
- `functions/src/legal/contact-authority.ts`.
