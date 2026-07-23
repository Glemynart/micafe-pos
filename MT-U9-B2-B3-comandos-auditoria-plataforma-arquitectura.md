# MT-U9 — U9-B2 y U9-B3: comandos administrativos y auditoría de plataforma

> **Estado:** especificación arquitectónica para revisión.  
> **Alcance:** U9-B2, comandos administrativos de plataforma; U9-B3, auditoría de plataforma.  
> **Precondición:** U9-B0 y U9-B1 aprobados. Este documento no redefine sus autoridades, facultades, perfiles, fronteras ni invariantes.  
> **Fuera de alcance:** soporte e impersonación (U9-B4), Panel SaaS (U9-B5), certificación (U9-B6), MT-U10, MT-U11, MT-U12 y toda implementación.

---

# Parte I — U9-B2: comandos administrativos de plataforma

## B2.1 Propósito y límite

U9-B2 define cómo una facultad de plataforma ya aprobada puede expresar una intención administrativa sin crear una autoridad nueva ni una vía de escritura directa. Un comando administrativo de plataforma es una solicitud de cambio sobre un agregado canónico existente; no es un endpoint, una pantalla, una Function, una regla, una transacción concreta ni un evento de auditoría.

El comando nunca convierte al operador en autoridad de Empresa, Plan, Suscripción, Membresía, Configuración, Numeración, Asignación, Bootstrap, Venta, Snapshot, ledger o estado operativo. El agregado objetivo decide la validez final conforme a su contrato ya aprobado.

## B2.2 Modelo conceptual común

Todo comando de plataforma debe transportar, conceptualmente:

| Elemento | Propósito | Restricción |
|---|---|---|
| Identidad de comando | Distingue una intención administrativa única. | No es un identificador de usuario ni una autorización. |
| Clave de idempotencia y huella de intención | Permite reconocer reintentos equivalentes y rechazar reutilización incompatible. | No permite volver a ejecutar un cambio ya confirmado con otra carga. |
| Actor de plataforma | Identifica al principal y su facultad canónica. | No deriva de rol tenant, `ownerUid` ni claim aislado. |
| Origen | Distingue la actuación de plataforma de origen tenant o de sistema. | No sustituye al actor ni a la facultad. |
| Agregado objetivo | Identifica Plan, Suscripción, Empresa u Operador que conserva la autoridad. | Una empresa objetivo no crea contexto tenant ni acceso operativo. |
| Revisión esperada | Protege contra conflicto de concurrencia en agregados mutables. | Un conflicto no se resuelve con last-write-wins. |
| Motivo | Explica transiciones sensibles, conservación o delegación. | No incluye secretos ni PII innecesaria. |
| Correlación y causación | Permiten relacionar la intención con sus efectos y evidencia posterior. | No reemplazan el estado canónico ni constituyen autorización. |

Las fechas efectivas, vigencias, trial, gracia, retención y transiciones se evalúan con reloj servidor y con la semántica ya definida por los agregados. El cliente no habilita transiciones, consume gracia, asigna números ni selecciona un estado canónico.

## B2.3 Precondiciones de autorización

Antes de que un comando pueda llegar al agregado objetivo deben cumplirse todas estas condiciones:

1. El actor posee una identidad técnica autenticada.
2. El actor mantiene pertenencia canónica activa en `saas_operadores/{uid}`.
3. El actor tiene la facultad B0 explícita correspondiente y su perfil B1 puede recibirla.
4. El comando pertenece a la clasificación permitida para dicha facultad.
5. El agregado objetivo existe y su operación es admisible por sus contratos, estado, revisión y tiempo canónico.
6. La solicitud no intenta crear contexto tenant, soporte, impersonación, cambio de tenant, consumo o límites medidos.
7. La intención no modifica datos fiscales, operativos o históricos prohibidos por PLT-B0-06 y OPR-B1-05.

Una membresía tenant, `ownerUid`, una suscripción activa, un claim tenant, una identidad Auth o la lectura previa de un recurso no satisfacen por sí solos estas precondiciones.

## B2.4 Clasificación de comandos administrativos

U9-B2 reconoce únicamente las siguientes familias. Los nombres expresan intención de dominio; no obligan a una interfaz técnica ni redefinen los comandos existentes.

| Familia | Facultad requerida | Intenciones administrativas permitidas | Agregados que permanecen autoridad |
|---|---|---|---|
| Gobernanza de operadores | Gobernanza de operadores | Asignar facultades, retirar facultades, activar o desactivar pertenencia de plataforma, cuando sea admisible. | `saas_operadores/{uid}`. |
| Oferta comercial | Gobernanza comercial | Crear o versionar Plan en borrador, actualizar borrador, publicar o retirar versión, conforme a la máquina de estados comercial. | Plan y versión publicada. |
| Relación comercial | Gobernanza comercial | Crear suscripción administrativa permitida, activar, renovar, cambiar plan, marcar mora, suspender, programar/revocar cancelación, cancelar o reactivar, conforme a la Suscripción. | `suscripciones/{empresaId}`. |
| Lifecycle empresarial | Gobernanza de lifecycle | Activar, suspender, cancelar, reactivar, archivar, restaurar o eliminar Empresa exclusivamente en las transiciones admisibles. | `empresas/{empresaId}.estado` y servicio único de lifecycle. |
| Conservación y exportación controlada | Conservación de plataforma | Solicitar archivo, restauración, eliminación o exportación únicamente cuando lifecycle, retención y autorización de plataforma lo permitan. | Lifecycle, conservación legal y proceso controlado correspondiente. |

No se define en B2 un comando para crear empresas fuera de Bootstrap, cambiar owner, emitir o alterar claims tenant, incorporar usuarios, manejar soporte, consumir métricas, imponer límites, cambiar tenant activo, modificar configuración, gestionar numeraciones, confirmar/anular ventas ni aplicar efectos operativos.

## B2.5 Postcondiciones comunes

Si un comando es aceptado y confirmado:

1. Solo el agregado canónico afectado refleja el nuevo estado, revisión o relación permitidos.
2. Los demás agregados solo cambian cuando la transición canónica ya exige coordinación entre ellos; B2 no inventa efectos laterales.
3. La respuesta observable del reintento equivalente es el resultado durable ya confirmado; no se repite el efecto autoritativo.
4. Se conserva la correlación necesaria para que B3 pueda registrar evidencia posterior al hecho confirmado.
5. No se crea una Membresía, tenant activo, sesión de soporte, autoridad fiscal, autoridad operativa ni excepción de retención como efecto colateral.

Si el comando se rechaza, entra en conflicto, expira o falla antes de confirmar, no modifica el agregado, no consume recursos fiscales ni habilita una operación alternativa. El detalle de la respuesta técnica queda fuera de B2.

## B2.6 Reglas de idempotencia, concurrencia y ejecución

- La misma identidad de idempotencia con la misma huella de intención debe recuperar el mismo resultado durable; con otra huella debe rechazarse como conflicto.
- Un comando mutante debe respetar la revisión esperada del agregado. La revisión obsoleta produce conflicto explícito, nunca last-write-wins.
- Las transiciones y períodos comerciales deben conservar su no solapamiento, inmutabilidad de versión publicada y grandfathering, conforme a ADR-SAAS-003.
- Las transiciones de Empresa se ejecutan únicamente a través del servicio de lifecycle; una Suscripción puede solicitar, pero no escribir ni sustituir, el estado de Empresa.
- Los efectos externos recuperables siguen el patrón de estado durable primero y reconciliación posterior cuando el dominio existente así lo establece. B2 no amplía ese patrón a nuevos efectos.
- Un comando de plataforma no puede combinar en una sola intención una mutación comercial, una transición empresarial y una operación fiscal/operativa no permitida. La coordinación existente entre comercial y lifecycle se conserva en el servicio canónico.
- Ninguna repetición administrativa puede crear un segundo trial, duplicar período, repetir una eliminación, publicar dos veces la misma versión ni revivir una entidad terminal fuera de su máquina de estados.

## B2.7 Relación con lifecycle y conservación

Los comandos de lifecycle son consumidores del contrato de ADR-SAAS-009:

- `Empresa.estado` continúa siendo la única autoridad de acceso y conservación.
- Solo las transiciones admitidas por la máquina de estados pueden confirmarse; la plataforma no crea atajos por ser actor privilegiado.
- `suspendida` conserva lectura administrativa tenant restringida para owner/admin, sin escrituras operativas; B2 no amplía ese acceso.
- `cancelada` no permite acceso interactivo ordinario; la exportación sigue siendo controlada por backend y no es una lectura general de datos tenant.
- `archivada` puede ser atendida solo por plataforma o soporte autorizado según el Maestro; B2 cubre la facultad de plataforma, no define soporte ni impersonación.
- `eliminada` es terminal y solo procede tras retención y obligaciones aplicables. B2 no define plazos, política legal ni purga física.

Archivo, restauración, eliminación y exportación son operaciones de conservación: no son mecanismos de soporte, no introducen acceso tenant ni habilitan cambios fiscales u operativos.

## B2.8 Relación con comercial

Los comandos comerciales consumen el contrato de Plan y Suscripción sin modificarlo:

- Una versión publicada de Plan es inmutable; los cambios crean una versión superior y retirar una versión no altera suscripciones grandfathered.
- La Suscripción es 1:1 con Empresa y conserva el plan/version o snapshot contratado.
- Trial, período, gracia, `past_due`, cancelación y reactivación respetan sus estados y fechas canónicas.
- Regularizar o reactivar una Suscripción no reactiva automáticamente una Empresa suspendida por seguridad, soporte o decisión de plataforma.
- B2 no define precio, pasarela, facturación, dimensiones de monetización, medición ni enforcement de límites; estos asuntos siguen fuera, incluyendo MT-U10.

## B2.9 Restricciones sobre datos tenant, fiscalidad y operación

### Datos tenant

Un comando de plataforma puede identificar una Empresa o su Suscripción como agregado objetivo, pero no obtiene acceso operativo general ni permite una consulta o escritura cross-tenant libre. La empresa continúa siendo la frontera de seguridad; `empresaId` identifica el agregado y no representa una selección de tenant activa.

### Fiscalidad, snapshots y ledger

U9-B2 no puede:

- crear, habilitar, pausar, reasignar, revocar o consumir Numeraciones;
- seleccionar asignaciones, confirmar/anular ventas o modificar `snapshotFiscal`;
- alterar `estadoOperativo`, movimientos de inventario, tesorería o compensaciones;
- reconstruir evidencia histórica desde Configuración, Numeración o datos vigentes;
- cambiar hechos fiscales, rangos, prefijos, contadores, resoluciones o documentos emitidos.

Estas prohibiciones preservan ADR-SAAS-008, ADR-SAAS-010 y la autoridad histórica de ventas/snapshots. Una transición de Empresa o Suscripción no justifica una excepción fiscal ni operativa.

## B2.10 Riesgos arquitectónicos

| Riesgo | Consecuencia | Control contractual |
|---|---|---|
| Un comando de plataforma se trata como escritura directa. | Duplica autoridad o salta validaciones de dominio. | B2.1, B2.3 y B2.5. |
| Reintento produce doble período, trial o transición. | Divergencia comercial/lifecycle. | B2.2 y B2.6. |
| Suscripción activa se interpreta como reactivación de Empresa. | Acceso indebido a tenant suspendido/cancelado. | B2.7, B2.8 y PLT-B0-04. |
| Comando de conservación se usa como soporte. | Acceso tenant o exportación fuera de control. | B2.7 y PLT-B0-07. |
| Actor de plataforma modifica fiscalidad u operación. | Ruptura de inmutabilidad fiscal, ledger o tesorería. | B2.9 y PLT-B0-06. |
| Uso de `empresaId` como tenant activo. | Fuga cross-tenant o escalamiento. | B2.3, B2.9 y PLT-B0-05. |
| Actualización sobre revisión obsoleta. | Pérdida silenciosa de cambios. | B2.2 y B2.6. |

## B2.11 Criterios de aceptación

U9-B2 está completo solo si:

1. Cada comando pertenece a una facultad B0 y puede ser ejercido solo por un perfil B1 compatible.
2. Cada comando identifica un agregado canónico y respeta su estado, transición, revisión, tiempo e idempotencia.
3. Los comandos comerciales y de lifecycle mantienen separadas Suscripción y Empresa.
4. No existe comando de B2 que cree acceso tenant, soporte, impersonación, cambio de tenant, consumo/límites, Electron o una autoridad nueva.
5. Ningún comando toca Configuración, Numeración, Asignación, Venta, Snapshot, estado operativo, ledger, tesorería ni datos históricos.
6. La conservación respeta lifecycle y retención sin convertirse en lectura interactiva general ni en soporte.
7. Todo resultado confirmado conserva correlación suficiente para B3, sin que B2 defina el registro de auditoría.

**Cierre de B2:** con los comandos clasificados y acotados, B3 puede registrar sus hechos confirmados sin determinar facultades, perfiles, transiciones ni efectos de dominio.

---

# Parte II — U9-B3: auditoría de plataforma

## B3.1 Precondición y propósito

U9-B3 se construye sobre B0, B1 y B2. La auditoría de plataforma preserva evidencia global de acciones administrativas ya confirmadas y de decisiones de autorización relevantes; no crea comandos, facultades, perfiles, acceso tenant, soporte ni una fuente alternativa de estado.

`saas_auditoria/{id}` es una colección global del plano plataforma. Puede referenciar conceptualmente el agregado o empresa afectada para trazabilidad, pero la referencia no convierte el documento de auditoría en dato tenant, no lo hace dueño de `empresaId` y no le concede semántica de contexto tenant.

## B3.2 Objetivos de auditoría

La auditoría debe permitir:

1. atribuir una acción administrativa confirmada a un actor de plataforma, proceso autorizado u origen de dominio;
2. reconstruir qué facultad y qué intención administrativa estuvieron asociadas al hecho;
3. relacionar el hecho con el agregado objetivo, su revisión/resultante y, cuando aplique, la empresa referenciada;
4. distinguir hechos confirmados, rechazos de autorización y conflictos sin convertir estos últimos en mutaciones;
5. demostrar que las acciones de plataforma respetan lifecycle, comercial, conservación y límites de B0/B1/B2; y
6. apoyar detección y respuesta de seguridad sin exponer secretos ni PII innecesaria, conforme a AUD-1, AUD-2, AUD-3 y SEC-024.

La auditoría no es analítica de consumo, facturación, monitoreo de límites, historial operativo de un tenant ni registro de soporte/impersonación.

## B3.3 Modelo conceptual de evidencia

Una evidencia de plataforma representa un hecho ocurrido, no una orden pendiente. Contiene conceptualmente:

| Elemento | Propósito | Restricción |
|---|---|---|
| Identidad única de evidencia y versión de tipo | Distingue el hecho y permite evolución controlada. | No es un permiso ni una clave de idempotencia del comando. |
| Clasificación del hecho | Describe familia y resultado del hecho. | No reemplaza el estado del agregado. |
| Actor y origen | Atribuye principal o proceso autorizado. | No registra credenciales, tokens, PIN ni secretos. |
| Facultad ejercida, cuando aplique | Explica la base de autorización plataforma. | No constituye la fuente canónica de la facultad. |
| Referencia de intención | Relaciona el hecho con el comando administrativo o proceso que lo causó. | No permite reejecutarlo. |
| Agregado y revisión/resultante | Vincula la evidencia al hecho durable confirmado. | No sustituye el agregado ni permite editarlo. |
| Correlación y causación | Reconstruye la cadena de acciones. | No crea event sourcing ni una cadena de autorización. |
| Tiempo servidor | Ordena y atribuye el hecho confirmado. | No usa reloj de cliente como autoridad. |
| Motivo y resumen mínimo | Aporta contexto verificable. | No contiene payload completo, secretos o PII innecesaria. |

El modelo físico, índices, rutas de escritura, reglas, alertas y almacenamiento quedan fuera de B3.

## B3.4 Eventos auditables y clasificación

Solo son auditables los hechos definidos por las facultades y comandos de B2, más las decisiones de autorización necesarias para proteger la frontera de plataforma. La clasificación no crea comandos adicionales.

| Clase de evento | Hechos auditables | Resultado posible |
|---|---|---|
| Gobernanza de operadores | Facultad asignada, retirada; pertenencia de plataforma activada o desactivada. | Confirmado, rechazado, conflicto. |
| Oferta comercial | Plan creado; versión creada, actualizada en borrador, publicada o retirada. | Confirmado, rechazado, conflicto. |
| Relación comercial | Suscripción creada, activada, renovada, cambiada de plan, marcada en mora, suspendida, cancelación programada/revocada, cancelada o reactivada. | Confirmado, rechazado, conflicto. |
| Lifecycle empresarial | Empresa activada, suspendida, cancelada, reactivada, archivada, restaurada o eliminada. | Confirmado, rechazado, conflicto. |
| Conservación | Exportación controlada solicitada, completada, rechazada o fallida; operación de conservación confirmada o rechazada. | Confirmado, rechazado, conflicto o fallo recuperable. |
| Seguridad de plataforma | Autorización de plataforma denegada, facultad ausente, pertenencia inactiva, intento de autoescalamiento o intento de acceso fuera de alcance. | Denegado o conflicto; nunca mutación confirmada. |

Los eventos fiscales, de venta, inventario, tesorería y operación POS permanecen en sus evidencias y auditorías de dominio respectivas. B3 no los duplica, reinterpreta ni ingiere sus payloads.

## B3.5 Correlación y orden de acciones

La correlación debe conservar, conceptualmente, una relación inequívoca entre:

```text
actor/facultad → intención administrativa → agregado canónico → hecho confirmado → evidencia de plataforma
```

Reglas:

1. La evidencia de resultado confirmado solo existe después de que el agregado canónico confirma el hecho.
2. Un rechazo, denegación o conflicto registra la intención y razón mínima, sin simular un cambio de agregado.
3. Un reintento idempotente se relaciona con la misma intención y resultado durable; no debe generar una segunda evidencia de mutación confirmada.
4. Una operación coordinada entre Suscripción y lifecycle conserva la causalidad, pero no funde ambas autoridades ni oculta cuál agregado confirmó cada hecho.
5. Si un proceso posterior recuperable completa un efecto ya autorizado, su evidencia se relaciona con la intención original sin reescribir la evidencia inicial.

## B3.6 Integridad e inmutabilidad de la evidencia

- La evidencia es append-only a nivel arquitectónico: una vez confirmada no se modifica para corregir la historia ni se elimina por conveniencia.
- Una corrección de contexto se registra como un nuevo hecho relacionado, sin alterar el hecho original.
- La evidencia no se publica antes del commit del hecho que representa y no convierte una intención en resultado confirmado.
- La identidad de la evidencia, el agregado referenciado, la correlación y el tiempo servidor deben permitir reconstruir la secuencia sin depender de datos mutables del tenant.
- Una evidencia no puede contener instrucciones ejecutables, facultades efectivas ni material suficiente para repetir el comando que describe.

Estos principios preservan el enfoque append-only de seguridad y no sustituyen los snapshots fiscales, el ledger ni las evidencias operativas inmutables existentes.

## B3.7 Retención conceptual

La retención de auditoría de plataforma debe ser independiente de la visibilidad interactiva de una Empresa y compatible con obligaciones legales, fiscales, seguridad y conservación aplicables.

- Suspender, cancelar o archivar una Empresa no autoriza borrar su evidencia de plataforma.
- La eliminación de una Empresa no convierte automáticamente la auditoría en eliminable; cualquier eliminación o anonimización posterior depende de la política legal aplicable y debe conservar la trazabilidad mínima exigible.
- B3 no fija plazos, jurisdicciones, política de anonimización, mecanismo de exportación ni procedimiento de purga.
- La retención de `saas_auditoria` no reemplaza retención fiscal, conservación de facturas, backups ni logs operativos.

## B3.8 Separación entre auditoría y autorización

La evidencia no concede, amplía, mantiene ni revoca facultades. La autorización se decide exclusivamente mediante identidad técnica, pertenencia canónica de plataforma, facultad B0/B1 y operación admisible del agregado, conforme a B1.5.

Por ello:

- una evidencia de asignación no es la pertenencia canónica del operador;
- una evidencia de transición no es `Empresa.estado`;
- una evidencia comercial no es la Suscripción ni el Plan publicado;
- una evidencia de consulta no habilita mutación ni soporte;
- una evidencia histórica no habilita acceso tenant ni reconstruye hechos fiscales u operativos.

## B3.9 Protección de PII, secretos y datos tenant

La evidencia debe usar identificadores opacos y resúmenes mínimos. Está prohibido registrar:

- contraseñas, PIN, custom tokens, tokens de sesión, secretos de integración, credenciales fiscales o material criptográfico;
- payloads completos de Configuración, Venta, Snapshot, ledger, tesorería, reserva, cliente o incorporación;
- datos de tarjeta, datos personales no necesarios, contenido documental fiscal completo o información cuyo detalle pertenezca a una auditoría tenant/fiscal;
- un `empresaId` como marcador de pertenencia tenant o como mecanismo para derivar acceso.

Una referencia conceptual a Empresa o agregado se permite solo para atribución y correlación global de plataforma. No transforma `saas_auditoria` en recurso tenant ni permite consultar los datos del recurso referenciado sin la autorización independiente correspondiente.

## B3.10 Riesgos arquitectónicos

| Riesgo | Consecuencia | Control contractual |
|---|---|---|
| Auditoría usada como fuente de permisos. | Privilegio obsoleto o escalamiento. | B3.8 y PLT-B0-10. |
| Evidencia emitida antes del hecho. | Falsa trazabilidad o repudio. | B3.5 y B3.6. |
| Reintentos producen múltiples “confirmados”. | Historia administrativa inconsistente. | B3.5 y B2.6. |
| Registro de secretos o PII excesiva. | Divulgación de información sensible. | B3.9 y SEC-024. |
| Auditoría global tratada como tenant. | Ruptura de frontera y posible fuga cross-tenant. | B3.1, B3.9 y PLT-B0-05. |
| Auditoría sustituye Snapshot o ledger. | Reinterpretación o corrupción de evidencia fiscal/operativa. | B3.4 y B3.6. |
| Retención de auditoría depende de acceso actual a Empresa. | Pérdida de evidencia tras cancelación/archivo. | B3.7. |
| Registro de soporte implícito. | Anticipación de B4 y bypass de su frontera. | B3.2, B3.4 y B3.8. |

## B3.11 Criterios de aceptación

U9-B3 está completo solo si:

1. La auditoría registra hechos confirmados y decisiones de autorización de B2 sin crear nuevos comandos, facultades o perfiles.
2. Cada clase de evento tiene actor/origen, intención, agregado, resultado, correlación y tiempo servidor suficientes para trazabilidad, sin depender de datos mutables como autoridad.
3. La evidencia es append-only, posterior al hecho confirmado y segura frente a reintentos idempotentes.
4. Auditoría, autorización y estado canónico permanecen separados; `saas_auditoria` nunca es fuente de permisos ni lifecycle/comercial.
5. La evidencia global puede referenciar agregados o Empresa para correlación, pero no se convierte en dato tenant ni habilita acceso a sus datos.
6. No se incluyen secretos, PIN, tokens, PII innecesaria, payloads fiscales/operativos completos ni mecanismos de acceso tenant.
7. Retención conceptual respeta conservación, fiscalidad y seguridad sin definir plazos, purga, soporte, consumo, cambio de tenant o Electron.
8. B3 no adelanta U9-B4, B5, B6, MT-U10, MT-U11 ni MT-U12.

**Cierre de B3:** con B2 y B3 aprobados, U9-B4 podrá decidir soporte/impersonación sin que los comandos o la auditoría existentes otorguen acceso tenant implícito.
