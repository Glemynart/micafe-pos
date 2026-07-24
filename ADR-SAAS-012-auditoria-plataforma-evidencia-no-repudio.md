# ADR-SAAS-012 — Auditoría de plataforma, evidencia y no repudio

## Estado

**Aceptado.** Complementa ADR-SAAS-011 y materializa exclusivamente el contrato de evidencia global requerido por MT-U9 B3 y B4.

No modifica `saas_operadores`, autorización, facultades, claims, Bootstrap, lifecycle, Empresa, Suscripción, tenant activo, Electron ni multiempresa. `saas_auditoria` no es una fuente de permisos, estado, soporte ni ejecución.

## 1. Decisión y autoridades

Se adopta `saas_auditoria/{evidenciaId}` como colección global, append-only y de propiedad exclusiva del backend. Un documento registra un hecho único ya confirmado —o una denegación/conflicto ya determinado—; no es una orden pendiente ni una proyección mutable.

| Concepto | Autoridad canónica | La evidencia no puede |
|---|---|---|
| Facultades/estado de operador | `saas_operadores/{uid}` | Conceder, conservar o revocar facultades. |
| Lifecycle de Empresa | `empresas/{empresaId}.estado` y su servicio | Cambiar acceso, lifecycle o retención tenant. |
| Comercial | Plan/versiones y `suscripciones/{empresaId}` | Activar acceso o reactivar Empresa. |
| Hechos fiscales/operativos | Venta, snapshot, estado operativo, ledger y tesorería | Duplicar, alterar o reconstruir hechos tenant. |
| Soporte | Autorización/sesión separada de MT-U9 B4 | Autorizar, extender o mantener soporte. |
| Evidencia plataforma | `saas_auditoria/{evidenciaId}` | Ser comando, token, claim o contexto tenant. |

Una referencia de Empresa solo correlaciona el hecho; no crea tenant activo ni habilita acceso a datos tenant.

## 2. Contrato físico de `saas_auditoria`

### 2.1 Colección, identidad y ownership

- **Ruta:** `saas_auditoria/{evidenciaId}`; plano global, sin pertenencia tenant.
- **ID:** UUID aleatorio opaco generado exclusivamente por backend. Coincide con `evidenciaId`; no usa UID, email, `empresaId`, comando ni timestamp predecible.
- **Ownership:** el escritor backend de auditoría es el único creador. Clientes, panel, procesos tenant, Rules de autoservicio y jobs no autenticados no pueden crear, modificar ni eliminar.
- **Sin estados:** la evidencia no tiene estado de procesamiento. Al existir, su `resultado` es definitivo. Colas y reintentos pertenecen al escritor, no al documento.
- **Deduplicación:** la tupla `(comando.id, tipo, resultado)` es única cuando existe `comando`. Un reintento recupera la existente; nunca produce un segundo `CONFIRMADO` del mismo hecho.

### 2.2 Documento exacto

Campos no enumerados se rechazan. Cambiar el esquema requiere ADR posterior y `schemaVersion` nuevo.

| Campo | Tipo | Restricción |
|---|---|---|
| `schemaVersion` | entero | Fijo `1`; versiona evidencia, no agregado. |
| `evidenciaId` | UUID string | Exactamente igual al ID del documento; inmutable. |
| `tipo` | enum | Valor de §3.1; inmutable. |
| `resultado` | enum | `CONFIRMADO`, `DENEGADO`, `CONFLICTO`, `FALLO_RECUPERABLE`; inmutable. |
| `origen` | enum | `PLATAFORMA`, `SISTEMA` o `SOPORTE`. |
| `actor` | objeto | `{ tipo: "OPERADOR" | "SISTEMA", uid: string | null }`; UID obligatorio para `OPERADOR`, `null` solo para `SISTEMA`. |
| `facultad` | enum o `null` | Facultad exacta de ADR-011; `null` solo para proceso de sistema sin facultad humana. |
| `comando` | objeto o `null` | `{ id: string, tipo: string }`, ambos 1–128 caracteres; `null` solo para hecho autónomo de sistema listado. |
| `agregado` | objeto | `{ tipo: enum, id: string }`; tipo §3.2 e ID opaco 1–256 caracteres. |
| `empresaObjetivoId` | string o `null` | ID opaco de Empresa cuando aplique; nunca es contexto tenant. |
| `revision` | objeto | `{ esperada: entero | null, resultante: entero | null }`. |
| `correlacionId` | string | ID opaco 1–128 caracteres; une la operación causal. |
| `causacionId` | string o `null` | ID de intención/proceso previo; nunca el propio `evidenciaId`. |
| `motivo` | objeto | `{ codigo: string, resumen: string | null }`; código 1–128, resumen máximo 256. |
| `soporte` | objeto o `null` | En soporte: `{ autorizacionId: string, sesionId: string | null, alcanceCodigo: string }`; en otro origen es `null`. |
| `ocurrioEn` | timestamp servidor | Hora del hecho durable, denegación o conflicto; nunca reloj cliente. |
| `registradoEn` | timestamp servidor | Hora de persistir evidencia; igual o posterior a `ocurrioEn`. |

`actor` no copia email, nombre, token, claims, Membresía ni perfil. `motivo` usa código y resumen mínimo; no contiene secretos, credenciales, PIN, tokens, datos de pago, credenciales fiscales ni payloads tenant.

### 2.3 Restricciones entre campos

1. `CONFIRMADO` exige hecho durable confirmado por su agregado; nunca una intención sin commit.
2. `DENEGADO` y `CONFLICTO` no implican mutación. `FALLO_RECUPERABLE` solo es fallo reconocido por el dominio, no un rechazo encubierto.
3. Una mutación confirmada sobre agregado revisionado exige `revision.resultante`; en los demás casos puede ser `null`.
4. `facultad` coincide con la validada por el comando, pero la evidencia nunca se usa para validarla otra vez.
5. `origen == SOPORTE` exige `soporte` y `empresaObjetivoId`; otro origen exige `soporte == null`.
6. Se prohíben roles/permisos tenant, `empresaId` dentro de actor, PIN, tokens, secretos, payloads de venta, snapshot fiscal, ledger, tesorería, cliente, reserva o incorporación.

## 3. Taxonomía

### 3.1 Valores de `tipo`

| Familia | Valores permitidos |
|---|---|
| Operadores | `OPERADOR_INCORPORADO`, `OPERADOR_FACULTADES_CAMBIADAS`, `OPERADOR_SUSPENDIDO`, `OPERADOR_REACTIVADO`, `OPERADOR_REVOCADO` |
| Oferta | `PLAN_CREADO`, `PLAN_VERSION_CREADA`, `PLAN_BORRADOR_ACTUALIZADO`, `PLAN_VERSION_PUBLICADA`, `PLAN_VERSION_RETIRADA` |
| Suscripción | `SUSCRIPCION_CREADA`, `SUSCRIPCION_ACTIVADA`, `SUSCRIPCION_RENOVADA`, `SUSCRIPCION_PLAN_CAMBIADO`, `SUSCRIPCION_MORA_MARCADA`, `SUSCRIPCION_SUSPENDIDA`, `SUSCRIPCION_CANCELACION_PROGRAMADA`, `SUSCRIPCION_CANCELACION_REVOCADA`, `SUSCRIPCION_CANCELADA`, `SUSCRIPCION_REACTIVADA` |
| Provisionamiento empresarial | `BOOTSTRAP_EMPRESARIAL_SOLICITADO`, `BOOTSTRAP_EMPRESARIAL_COMPLETADO` |
| Lifecycle/conservación | `EMPRESA_ACTIVADA`, `EMPRESA_SUSPENDIDA`, `EMPRESA_CANCELADA`, `EMPRESA_REACTIVADA`, `EMPRESA_ARCHIVADA`, `EMPRESA_RESTAURADA`, `EMPRESA_ELIMINADA`, `EXPORTACION_SOLICITADA`, `EXPORTACION_COMPLETADA`, `EXPORTACION_RECHAZADA`, `EXPORTACION_FALLIDA` |
| Seguridad | `AUTORIZACION_DENEGADA`, `FACULTAD_AUSENTE`, `OPERADOR_INACTIVO`, `AUTOESCALAMIENTO_DENEGADO`, `ALCANCE_DENEGADO`, `CONTEXTO_PLATAFORMA_OBSOLETO`, `CONFLICTO_IDEMPOTENCIA`, `CONFLICTO_REVISION` |
| Soporte B4 | `SOPORTE_SOLICITADO`, `SOPORTE_RECHAZADO`, `SOPORTE_AUTORIZADO`, `SOPORTE_REVOCADO`, `SOPORTE_EXPIRADO`, `SOPORTE_INICIADO`, `SOPORTE_FINALIZADO`, `SOPORTE_ALCANCE_RECHAZADO`, `SOPORTE_ACCESO_FUERA_DE_ALCANCE_DENEGADO`, `SOPORTE_DIAGNOSTICO_ALTO_RIESGO` |

Las lecturas ordinarias del panel no se auditan. Solo se registran decisiones sensibles, comandos y diagnósticos de soporte de alto riesgo; no se crea analítica masiva de navegación.

### 3.2 Valores de `agregado.tipo`

Solo: `OPERADOR`, `PLAN`, `SUSCRIPCION`, `EMPRESA`, `PROVISIONAMIENTO_EMPRESARIAL`, `CONSERVACION`, `SOPORTE_AUTORIZACION`, `SOPORTE_SESION`, `SEGURIDAD_PLATAFORMA`. `PROVISIONAMIENTO_EMPRESARIAL` referencia exclusivamente el registro canónico ya definido por ADR-SAAS-007; no crea un agregado nuevo ni convierte la evidencia en autoridad del Bootstrap. No se admiten `VENTA`, `NUMERACION`, `ASIGNACION`, `LEDGER`, `TESORERIA` ni otro agregado operativo/fiscal tenant.

## 4. Append-only formal

Append-only significa que, al hacerse visible una evidencia, su identidad y todos sus campos son históricos, definitivos e inalterables. No existe corrección, transición, reemplazo, anonimización in-place, reindexación con reescritura, TTL ni borrado ordinario.

| Operación | Permitida | Regla |
|---|:---:|---|
| `create` backend | Sí | Un hecho ya determinado, esquema válido e idempotencia de §2.1. |
| Lectura autorizada | Sí | Solo conforme §7. |
| `update` | No | Incluye actor, motivo, timestamp, correlación, resultado, revisión e índices. |
| `delete` | No | Incluye backend, cliente, TTL, limpieza o lifecycle. |
| `create` cliente | No | Rules lo deniegan siempre. |
| Reconstruir agregado desde auditoría | No | El agregado canónico no se corrige ni restaura desde evidencia. |
| Corregir contexto | Solo nuevo `create` | Nuevo ID, motivo y `causacionId`; el original permanece. |

Las Rules declaran `allow create, update, delete: if false` para clientes. El escritor usa IAM de mínimo privilegio y es el único escritor lógico; Admin SDK no es permiso funcional para editar evidencia. Un acceso administrativo directo se trata como incidente, nunca como mantenimiento ordinario.

## 5. Escritura, orden y reconciliación

Solo el escritor backend normaliza y crea evidencia. Recibe un hecho ya decidido; no acepta payload cliente ni deduce actor, facultad o resultado desde UI.

Orden obligatorio:

1. Validar ADR-SAAS-011 y el contrato del agregado.
2. Confirmar el estado durable o decidir denegación/conflicto.
3. Construir evidencia mínima con tiempo servidor y correlación.
4. Crear una única evidencia append-only.
5. Completar la obligación de auditoría antes de devolver resultado terminal.

En una transacción Firestore común, agregado y evidencia se escriben después de validar el agregado y se hacen visibles juntos: no existe evidencia anticipada ni de un hecho inexistente. Para una saga o efecto externo, primero se confirma el estado durable y luego la evidencia; la evidencia describe el hecho durable, no el éxito supuesto del efecto externo.

Si el agregado se confirma y falla la evidencia, no se revierte ni compensa destructivamente el agregado. El comando entrega estado recuperable, no éxito final; el reintento con la misma intención busca la tupla de deduplicación y crea exactamente una vez si falta. Un reconciliador backend procesa resultados durables pendientes de evidencia con esa misma clave. No reconstruye agregados, altera documentos ni produce otro `CONFIRMADO`. Si la transacción común falla, no se publica ni agregado ni evidencia.

## 6. Integridad y no repudio operativo

La garantía se compone de:

1. **Origen atribuible:** actor, origen, facultad, comando y token verificado vinculan el hecho a operador o proceso.
2. **Integridad:** append-only, ownership backend, Rules deny-by-default e IAM de mínimo privilegio impiden cambios por rutas ordinarias.
3. **Causalidad:** `ocurrioEn`, `registradoEn`, correlación, causación, agregado y revisión relacionan intención, commit y evidencia.
4. **No duplicación:** idempotencia evita múltiples confirmados del mismo hecho.
5. **Independencia:** cambios posteriores de operador, Empresa o Suscripción no reescriben la historia.

El no repudio es técnico-operativo, no legal absoluto. Este ADR no añade firma digital, hashes encadenados, sello de tiempo externo, WORM externo, blockchain, custodia legal ni prueba de intención humana. Requisitos criptográficos o legales requieren ADR posterior.

## 7. Lectura, minimización e índices

La lectura es backend-only después de revalidar ADR-SAAS-011. Exige `PLATAFORMA_CONSULTAR` y, cuando se use para una responsabilidad mutante/conservación, la facultad propietaria. El frontend recibe una proyección mínima y no lee directamente la colección.

| Consulta autorizada | Filtro obligatorio | Orden/límite |
|---|---|---|
| Por comando | `comando.id ==` | `registradoEn DESC`, máximo 20 |
| Por agregado | `agregado.tipo ==` y `agregado.id ==` | `registradoEn DESC`, máximo 100 |
| Por Empresa referenciada | `empresaObjetivoId ==` y familia/tipo autorizado | `registradoEn DESC`, máximo 100 |
| Por actor | `actor.uid ==` y familia/tipo autorizado | `registradoEn DESC`, máximo 100 |
| Seguridad/soporte | `tipo IN` permitido y ventana temporal obligatoria | `registradoEn DESC`, máximo 100 |
| Por correlación | `correlacionId ==` | `registradoEn ASC`, máximo 100 |

Paginación obligatoria por cursor opaco `startAfter`, tamaño entre 1 y 100. Se prohíben scans, filtros solo por fecha, búsqueda libre, email/nombre/PII, `ownerUid`, roles tenant, lectura completa y exportación masiva desde panel.

| Patrón | Índice compuesto Firestore |
|---|---|
| Comando/tiempo | `comando.id ASC, registradoEn DESC` |
| Agregado/tiempo | `agregado.tipo ASC, agregado.id ASC, registradoEn DESC` |
| Empresa/tipo/tiempo | `empresaObjetivoId ASC, tipo ASC, registradoEn DESC` |
| Actor/tipo/tiempo | `actor.uid ASC, tipo ASC, registradoEn DESC` |
| Tipo/tiempo | `tipo ASC, registradoEn DESC` |
| Correlación/tiempo | `correlacionId ASC, registradoEn ASC` |

Los índices no conceden lectura. Cualquier patrón nuevo necesita finalidad, filtro selectivo, paginación e índice aprobado antes de exponerse.

## 8. Retención y conservación

La evidencia es independiente de la visibilidad de Empresa: suspender, cancelar, archivar o eliminar Empresa no elimina, modifica ni oculta la evidencia de plataforma.

La política vigente es **conservación indefinida dentro de `saas_auditoria`**. No hay TTL, estado `EXPIRADO`, purga normal ni borrado automático. Así se evita inventar plazos, jurisdicciones u obligaciones legales no aprobadas y se conserva trazabilidad mínima.

Una eliminación futura requiere ADR que defina base legal/política, alcance, autorización, archivo inmutable previo cuando corresponda, verificación de integridad y evidencia de la disposición. Hasta entonces no es apropiada. Un archivado por capacidad sería migración de almacenamiento, no cambio de estado: conserva documento, identidad, referencias, inmutabilidad y restricciones de lectura; no se define proveedor ni procedimiento aquí.

## 9. Seguridad

- **Deny-by-default:** no hay lectura/escritura cliente; se deniega Auth inválida, facultad ausente, consulta no selectiva o dato no mínimo.
- **Aislamiento:** `empresaObjetivoId` no habilita acceso tenant ni relaja Rules/helpers de ADR-SAAS-001.
- **Modificación:** create backend-only; update/delete siempre denegados; sin TTL; IAM mínimo y escritor único.
- **Minimización:** IDs opacos, códigos y resúmenes acotados; nunca secretos, tokens, PIN, credenciales, datos de pago ni payloads de dominio.
- **Frontend:** solo proyecta evidencia autorizada; no autoriza, crea, edita, borra ni retiene material sensible.

## 10. Compatibilidad

| Fuente | Compatibilidad preservada |
|---|---|
| Documento Maestro y ADR-001 | Plano global separado, Empresa como frontera y cero bypass de `empresaId`/Rules. |
| ADR-002, 005 y 006 | Auth identifica; perfiles y Membresías no se convierten en autorización de auditoría. |
| ADR-003, 004, 007, 008, 009 y 010 | No cambia comercial, lifecycle, bootstrap, configuración, fiscalidad, snapshots, estado operativo, ledger ni tesorería. |
| ADR-011 | Implementa su obligación de evidencia posterior, no autorizante, minimizada, reconciliable e inmutable sin rediseñar operadores/claims. |
| MT-U9 B0–B6 | Cumple B3 append-only/post-hecho/no autorización, B4 atribución dual de soporte y B5 panel como proyección. |
| MT-U10/U11/U12 | No añade consumo/límites, cambio de tenant ni Electron. |
| MASTER-SECURITY-PLAN | Autoridad servidor, deny-by-default, mínimo privilegio, AUD-1/AUD-2/AUD-3 y SEC-024 sin secretos. |

## 11. Invariantes verificables

- **AUD-012-01:** la evidencia no concede ni conserva facultad, sesión o acceso.
- **AUD-012-02:** una evidencia visible no se modifica ni elimina por cliente, backend normal, TTL o lifecycle.
- **AUD-012-03:** un `CONFIRMADO` referencia un hecho durable confirmable; reintentos no duplican.
- **AUD-012-04:** toda evidencia incluye actor/origen, agregado, resultado, correlación, timestamps servidor y motivo mínimo sin secretos/PII innecesaria.
- **AUD-012-05:** una Empresa referenciada no crea tenant activo ni habilita sus datos.
- **AUD-012-06:** corregir crea evidencia nueva; nunca reescribe historia.
- **AUD-012-07:** lifecycle de Empresa no borra evidencia.
- **AUD-012-08:** soporte conserva referencias mínimas de operador, Empresa, autorización, alcance y resultado, sin convertirse en permiso.
- **AUD-012-09:** no hay scan, exportación masiva ni lectura frontend directa.
- **AUD-012-10:** no registra hechos fiscales/operativos tenant ni sus payloads.

## Relación con otros ADR

ADR-SAAS-011 define quién debe generar evidencia y qué hechos sensibles la requieren; este ADR define su preservación sin alterar autorización. ADR-SAAS-001 a ADR-SAAS-010 mantienen todas sus fuentes de verdad. MT-U9 B3 aporta la taxonomía y B4 la atribución dual/minimización de soporte.

## Anexo A — Obligación durable de auditoría y reconciliación

### A.1 Identidad, persistencia y ownership

Cada hecho obligatorio tiene exactamente una obligación durable en
`saas_auditoria_obligaciones/{obligacionId}`. `obligacionId` es UUID opaco generado por
backend antes del commit y persiste en el resultado durable del comando; es también la
clave de idempotencia de entrega. Esta colección no es evidencia, no autoriza y no
reconstruye agregados: conserva únicamente la obligación de producir una evidencia.

El escritor backend de auditoría es el único creador y actualizador. Clientes no
leen/escriben la colección y las Rules niegan `create`, `update` y `delete`. El
documento contiene exactamente:

| Campo | Tipo y restricción |
|---|---|
| `schemaVersion`, `obligacionId` | Entero fijo `1` y UUID igual al ID, inmutables. |
| `estado` | `PENDIENTE` o `EMITIDA`. Solo transición `PENDIENTE -> EMITIDA`. |
| `evidenciaId` | UUID backend reservado al nacer; igual al ID de la evidencia que debe crearse. |
| `dedupeKey` | Tupla opaca e inmutable de `comando.id`, `tipo`, `resultado`, agregado y revisión resultante cuando exista. Única por hecho. |
| `evidencia` | Copia inmutable y completa de todos los campos de negocio exigidos por §2.2 para `saas_auditoria`, excepto `registradoEn`. |
| `creadaEn`, `emitidaEn` | Timestamps servidor; `emitidaEn` es `null` mientras esté pendiente. |
| `intentos`, `ultimoErrorCodigo` | Entero >= 0 y código opaco/null; no contienen stack, secreto ni PII. |

Índice requerido para reconciliación: `estado ASC, creadaEn ASC`, con lote limitado y
cursor. No hay eliminación, TTL ni compactación de obligaciones; incluso `EMITIDA`
permanece como comprobante de entrega y deduplicación.

### A.2 Nacimiento, cumplimiento y fallos parciales

La obligación nace en la misma transacción que confirma el agregado y antes de hacer
visible ese commit. Para una denegación o conflicto sin mutación, nace en una
transacción propia antes de devolver el resultado. Para una saga, nace junto con el
primer estado durable que representa el hecho. Por tanto, un resultado obligatorio no
puede existir sin su obligación durable.

Se cumple exclusivamente cuando una transacción verifica que existe
`saas_auditoria/{evidenciaId}` con contenido exactamente igual a `evidencia`, cambia
`estado` a `EMITIDA` y asigna `emitidaEn`. Si la evidencia ya existe por reintento, el
escritor compara identidad y contenido inmutable; una diferencia es incidente y nunca
sobrescribe ninguno de los dos documentos.

Un worker de reconciliación procesa solo `PENDIENTE`: intenta crear la evidencia con
el `evidenciaId` reservado; luego marca la obligación emitida. Ante fallo incrementa
`intentos` y registra solo `ultimoErrorCodigo`; no elimina, no compensa el agregado ni
genera un segundo confirmado. Una caída entre crear evidencia y marcar `EMITIDA` se
resuelve al encontrar la evidencia existente y completar la transición. Una caída antes
de crearla conserva `PENDIENTE`. Así, todo commit confirmado conserva una ruta durable
e idempotente hasta su evidencia y ninguna evidencia obligatoria puede perderse.

### A.3 Invariantes

1. Cada hecho obligatorio confirmado, denegado o conflictivo tiene una obligación
   creada atómicamente con su resultado durable.
2. Una obligación no se borra, no se reescribe y no puede volver de `EMITIDA` a
   `PENDIENTE`.
3. Una obligación produce exactamente una evidencia con su `evidenciaId`; reintentos
   y workers concurrentes recuperan la misma identidad.
4. La obligación no es evidencia visible de panel, no concede autoridad y no sustituye
   el agregado, la auditoría append-only ni el contrato de retención de §8.
