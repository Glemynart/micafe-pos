# ADR-SAAS-106 — Autorización verificable para exportar datos de un tenant

## Estado y alcance

**Aceptado para implementación controlada**, 2026-11-27, por decisión técnica
delegada expresamente por el responsable. `G-SAAS-02 → M2 → E2.2`.
Se selecciona la alternativa A. La aceptación habilita implementación y pruebas
sintéticas/Emulator/staging; no autoriza exportaciones reales, despliegues ni
cambios IAM. La comprobación del proveedor/canal sigue siendo un gate para datos
reales.

## Problema

El CLI de ADR-SAAS-100 recibe una referencia y una confirmación manual. Eso
registra la declaración del operador, pero no comprueba de forma independiente
que la solicitud exista, corresponda al tenant/alcance ni siga vigente.

No hay un registro existente cuyo propósito sea autorizar una exportación
completa. `saas_soporte_autorizaciones` limita su alcance a soporte, mientras
`privacidad_consultas` y `privacidad_reclamos` registran derechos de titulares;
reutilizarlos para una exportación de negocio confundiría finalidades. El puerto
actual de correo de invitaciones tampoco tiene un proveedor real.

## Alternativas

### A. Aprobación de un solo uso por enlace verificado — recomendada

Crear una solicitud temporal y acotada a proyecto, tenant, categorías de datos,
archivos y propósito. Entregar el enlace a un contacto representante previamente
verificado para ese tenant. La persona revisa el alcance y lo aprueba una vez; el
servidor registra identidad declarada, canal/versión del contacto, hora, alcance,
vigencia y evidencia opaca. El secreto del enlace se almacena como hash, expira,
se consume una sola vez y puede revocarse/cerrarse. La exportación valida ese
registro dentro de su ciclo, además de revalidar al operador con
`CONSERVACION_GOBERNAR`.

No requiere una cuenta del tenant. Requiere elegir y validar un canal de entrega
que permita demostrar control del contacto oficial; ese proveedor todavía no
está disponible en el proyecto. No almacenar copias de identidad ni payloads en
el registro. Las operaciones remotas se mantienen read-only.

### B. Aprobación autenticada por el administrador del tenant

Usar la sesión y facultad admin ya existentes para aprobar alcance y vigencia.
Ofrece una identidad técnica más fuerte, pero requiere que Diana use su cuenta
del tenant y contradice la preferencia de ejecutar el piloto sin esa cuenta.

### C. Referencia y atestación manual del operador

Conservar el proceso actual y registrar folio/fecha. Es simple, pero el CLI no
puede rechazar referencias inventadas, cambios de alcance, revocación o cierre;
no satisface la comprobación independiente solicitada.

## Reglas propuestas

- Una autorización debe enlazar tenant, proyecto, solicitante/contacto
  representante, propósito, categorías/archivos, operador, hora de aprobación,
  vencimiento y estado.
- El destinatario se obtiene de un contacto de representante verificado y
  versionado previamente por Dusema. Nunca se acepta una dirección arbitraria
  como prueba ni un cambio de contacto sin verificación independiente.
- El token se emite y entrega únicamente por un proveedor configurado. Una salida
  de desarrollo que registre el link, o que lo devuelva al operador, no constituye
  verificación y no habilita exportación real.
- El endpoint de exportación falla cerrado ante registro ausente, tenant/proyecto
  distinto, alcance más amplio, autorización vencida, consumida, revocada o
  cerrada. No se permite ampliar un grant existente.
- La entrega del enlace y su aprobación deben producir evidencia append-only sin
  registrar el secreto ni información personal innecesaria.
- Revalidar estado, vigencia, alcance y facultad del operador antes de iniciar,
  durante los lotes y antes de marcar la exportación reconciliada.
- El token de aprobación es opaco, aleatorio, con hash en persistencia, TTL corto,
  consumo atómico/idempotente y revocación antes de consumir.
- El diseño final del canal, límites de envío y responsable de comprobar que el
  contacto pertenece al representante requieren evidencia del proveedor y del
  contacto configurado antes de operar.

## Pruebas y límites

Pruebas sintéticas/emuladas: solicitud inexistente, tenant/proyecto/solicitante
distintos, alcance ampliado, estado revocado/cerrado/consumido, vencimiento,
token inválido/repetido, revocación durante lotes y reintentos. Verificar que el
canal no registra secretos y que una autorización no cruza tenants.

La implementación puede usar un puerto de entrega con stub en Emulator/staging.
No certificaría el proveedor real, identidad de Diana, exportación integral ni
borrado. Si no hay contacto representante ya verificado y un proveedor de entrega
validado, la exportación real seguirá bloqueada. La ejecución con datos reales y
producción requieren sus gates operativos separados.

## Contrato de implementación controlada — 2026-11-27

- El CLI ya no acepta una referencia ni una atestación escrita por el operador
  como autorización. `--request-id` es solo una clave de consulta; la prueba se
  obtiene de `saas_export_authorizations` y debe coincidir con proyecto, tenant,
  operador, representante y versión de contacto, canal/entrega, aprobación,
  alcance versionado, vigencia y estado no revocado/no cerrado.
- El registro no contiene el token en claro ni el correo/teléfono. Conserva el
  digest de token, referencias opacas, hash del alcance y timestamps. La primera
  transacción reclama la solicitud para un operador y un `runId`; las
  revalidaciones durante el recorrido requieren el mismo run. `COMPLETADA` o
  `FALLIDA` es terminal; otra ejecución requiere nueva aprobación.
- La colección se excluye del bundle de cliente. El CLI falla cerrado si no hay
  un registro aprobado y consumido; nunca convierte un folio en evidencia.
- El corte de implementación controlada añade el orquestador de enlace, la
  previsualización de propósito/alcance y el adaptador transaccional Firestore.
  La versión del contacto se revalida dentro de las transacciones de lectura y
  consumo. El token solo se conserva como hash y el enlace lleva el token en el
  fragmento; fallos de entrega, expiración, repetición y cambio de contacto
  bloquean la aprobación. Un operador autorizado puede revocarla antes o
  durante la exportación; se conserva UID del operador y hora del servidor.
- Los puertos de autorización del operador, resolución de contacto y entrega
  usan stubs en pruebas. No existe una callable/API de producto, pantalla de
  aprobación, registro persistente del representante ni proveedor real. El
  emisor no está conectado y no se puede poblar un expediente operativo válido
  ni completar el smoke positivo en staging hasta que ADR-SAAS-107 sea aprobado
  e implementado, se integre un proveedor validado y se conecte la experiencia
  de aprobación con autorización y controles de abuso.
- Las pruebas sintéticas de unidad y Firestore Emulator están registradas en
  [resultado controlado](docs/legal/evidence/RESULTADO-ADR106-IMPLEMENTACION-CONTROLADA-2026-11-27.md).

La reconciliación V3 del bundle revisa el inventario declarado/observado,
conteos y hashes, relaciones tenant y padre/hijo cubiertas por esquema, assets,
bytes y exclusiones. Su estado es `RECONCILED_DECLARED_SCOPE_NOT_CERTIFIED`:
integridad interna aprobada no equivale a comparar independientemente todos los
payloads históricos reales ni a una certificación legal.

## Consecuencias

Se añade una persistencia de autorización específica para salida de datos y un
flujo de verificación de contacto. No se reutilizan credenciales, roles, grants
de soporte ni solicitudes de derechos de titulares. Si no se puede verificar el
contacto o sostener el canal, la exportación real continúa bloqueada.

## Decisión de ingeniería sobre el canal — 2026-11-27

Por delegación técnica del responsable, se decide **no seleccionar ni configurar
un proveedor externo todavía**. Se mantiene un puerto de entrega desacoplado y
fail-closed; en Emulator/staging se usa exclusivamente un stub sintético. Elegir
Gmail personal, correo transaccional o mensajería ahora comprometería una cuenta,
condiciones de tratamiento, región, retención de mensajes/metadatos, costos y
controles de abuso que aún no están verificados para Dusema. No se enviará un
enlace real ni se devolverá el secreto al operador para simular verificación.

Antes de decidir el proveedor se verificará: titularidad de la cuenta de Dusema,
condiciones contractuales y de tratamiento, región y subencargados, retención y
eliminación, protección del secreto, límites/rate limiting, evidencia opaca de
entrega, manejo de rebotes/errores y costo. Esta decisión no impide completar
adaptadores, pruebas y trabajo independiente; sí mantiene bloqueada cualquier
exportación real hasta verificar el canal y el contacto.
