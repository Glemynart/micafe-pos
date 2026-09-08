Exit code: 0
Wall time: 0.2 seconds
Output:
# ADR-SAAS-040 â€” Binding canÃ³nico POS â†’ Dusema exclusivo de staging

## Estado

**Propuesto.**

Este ADR no autoriza operaciones externas. La creaciÃ³n efectiva de un binding,
el provisioning de staging, el despliegue, el acceso a secretos y las pruebas
end-to-end continÃºan sujetos a los gates operativos y aprobaciones explÃ­citas
de ADR-SAAS-039.

## Goal, iniciativa y lÃ­mite

- **Goal:** `G-SAAS-02`.
- **Iniciativa:** `P2-05` â€” integraciÃ³n administrativa POS â†’ Dusema.
- **Ãmbito propuesto:** Ãºnicamente Firebase `micafe-pos-staging`.
- **RelaciÃ³n:** complementa ADR-SAAS-039 sin modificar su estado, sus gates de
  regiÃ³n ni el alcance de ADR-SAAS-038.

## 1. Contexto y problema

F1 recuperÃ³ el contrato backend-only de
`saas_platform_bindings/{staging:DUSEMA:{empresaPosId}}`; F3 recuperÃ³ la
callable read-only `consultarTenantDusemaSaas`. Esta callable recibe solo
`empresaPosId`, resuelve el binding en backend y usa su `externalTenantId` como
el `tenantId` de Dusema. No se modifica mediante este ADR.

ADR-SAAS-039 identifica que F1 no ofrece una ruta canÃ³nica para crear un
binding y prohÃ­be la escritura directa o ad hoc mediante Admin SDK. La creaciÃ³n
necesita, ademÃ¡s, garantizar la relaciÃ³n activa 1:1 frente a concurrencia,
limitar la autoridad al proyecto staging real y conservar evidencia durable sin
compensar destructivamente un hecho ya confirmado.

`externalTenantId` es el nombre del campo POS que persiste
`Dusema.Tenant.id`. No requiere ni implica un campo `externalTenantId` en
Dusema. `empresaPosId` y `Dusema.Tenant.id` son identificadores distintos y no
se comparan ni se derivan uno del otro.

## 2. DecisiÃ³n propuesta

Se adopta el comando server-authoritative `CrearBindingDusemaStaging`, expuesto
Ãºnicamente mediante una callable administrativa especÃ­fica de staging. La
callable delega; no contiene la lÃ³gica de persistencia ni sustituye el comando.

El comando crea exclusivamente un binding inicial `ACTIVO` de Dusema para una
Empresa POS existente. Fija en servidor:

```text
environment = "staging"
productCode = "DUSEMA"
estado = "ACTIVO"
externalTenantId = dusemaTenantId
```

No acepta del cliente esos campos, actor, timestamps ni campos de auditorÃ­a.
No consulta ni modifica Dusema: la validez operativa de `dusemaTenantId` es un
gate previo separado.

## 3. Autoridad y transporte

Se aÃ±ade la facultad explÃ­cita `DUSEMA_BINDING_GOBERNAR` al contrato cerrado de
facultades de plataforma.

- Autoriza solamente `CrearBindingDusemaStaging`.
- No se hereda de `DUSEMA_TENANT_CONSULTAR`, `COMERCIAL_GOBERNAR`, lifecycle ni
  ninguna otra facultad.
- No forma parte de `FACULTADES_BOOTSTRAP_POR_DEFECTO`.
- Solo puede ser asignada explÃ­citamente por la gobernanza existente de
  operadores.
- No autoriza crear, editar o revocar tenants Dusema, ni modificar Empresas POS
  o bindings existentes.

La callable exige autenticaciÃ³n y realiza una validaciÃ³n inicial de operador,
claims, facultad y `versionAutorizacion`. El comando revalida el mismo predicado
dentro de la transacciÃ³n mediante `autorizarPlataforma(..., tx)`. Si el operador
queda inactivo, pierde la facultad o su contexto queda obsoleto antes del commit,
la transacciÃ³n aborta sin escribir; no existe ventana TOCTOU autorizante.

## 4. Contrato del comando

El envelope obligatorio es:

```text
commandId
idempotencyKey
correlationId
causationId
motivoCodigo
```

Los Ãºnicos datos de negocio son:

```text
empresaPosId
dusemaTenantId
```

El comando valida el envelope con el validador de plataforma existente y valida
ambos identificadores con el contrato canÃ³nico de IDs. `causationId` puede ser
`null` Ãºnicamente para un comando raÃ­z conforme al envelope de plataforma.

El binding se persiste en:

```text
saas_platform_bindings/staging:DUSEMA:{empresaPosId}
```

con `schemaVersion = 1`, la auditorÃ­a de creaciÃ³n/actualizaciÃ³n exigida por el
contrato de bindings y el ID determinista anterior.

## 5. Unicidad y concurrencia

AdemÃ¡s del binding principal se adopta una reserva inversa mÃ­nima y exclusiva de
este caso:

```text
saas_platform_binding_external_tenants/staging:DUSEMA:{externalTenantId}
```

La reserva contiene como mÃ­nimo:

```text
schemaVersion: 1
productCode: "DUSEMA"
environment: "staging"
externalTenantId
empresaPosId
bindingId
bindingPath
creadoPorUid
creadoEn
```

La crea Ãºnicamente `CrearBindingDusemaStaging`, mediante `tx.create`, en la
misma transacciÃ³n que el binding. No se elimina automÃ¡ticamente; una eventual
correcciÃ³n, revocaciÃ³n o reasignaciÃ³n requiere otra autoridad y otro gate.

La transacciÃ³n lee el binding de Empresa y la reserva de Tenant antes de escribir.
Si dos comandos concurrentes intentan usar el mismo `externalTenantId`, ambos
compiten por la misma reserva determinista. Solo uno puede crearla; Firestore
reintenta la transacciÃ³n contendiente, que observa la reserva existente y falla
con conflicto. No se usa una consulta previa seguida de `create` como garantÃ­a.

AsÃ­ se garantiza un Ãºnico binding activo por `staging + DUSEMA + empresaPosId`
y por `staging + DUSEMA + externalTenantId`, sin introducir un gestor genÃ©rico de
bindings ni requerir un Ã­ndice compuesto de Firestore.

## 6. Idempotencia y receipts

Se reutiliza el patrÃ³n de receipts persistidos de plataforma. Cada comando usa
dos documentos deterministas en `saas_comandos`, con prefijos exclusivos:

```text
dusema_binding_idem_{idempotencyKey}
dusema_binding_command_{commandId}
```

Cada receipt conserva `commandId`, `idempotencyKey`, la huella SHA-256 del tipo
de comando mÃ¡s el input validado, el resultado durable, `empresaPosId`,
`externalTenantId`, `bindingId`, `obligacionId` y timestamp servidor.

El comando lee ambos receipts dentro de la transacciÃ³n antes de crear:

1. Un replay con `commandId`, `idempotencyKey` y huella iguales devuelve el
   resultado persistido sin nueva mutaciÃ³n.
2. La misma `idempotencyKey` con huella distinta falla con
   `IDEMPOTENCY_CONFLICT`.
3. El mismo `commandId` con key o identidad distinta falla con
   `COMMAND_ID_CONFLICT`.
4. Un binding existente con el mismo Tenant y receipt compatible es replay
   idempotente.
5. Un binding existente con otro Tenant falla con conflicto; nunca se
   sobrescribe.
6. Una reserva inversa perteneciente a otra Empresa falla con conflicto; nunca
   se reasigna.
7. Un binding igual sin receipt canÃ³nico devuelve `YA_EXISTENTE` sin modificar
   ni atribuir retrospectivamente su creaciÃ³n a un actor nuevo.

Los receipts, binding y reserva se crean en una sola transacciÃ³n. Una
incoherencia entre binding, reserva o receipts es un conflicto de integridad y
nunca se repara automÃ¡ticamente.

## 7. Aislamiento tÃ©cnico de staging

La autoridad solo puede ejecutarse si el proyecto runtime efectivo es
`micafe-pos-staging`. El comando obtiene el valor mediante el patrÃ³n existente:

```text
GCLOUD_PROJECT ?? GCP_PROJECT
```

La ausencia de valor o cualquier valor distinto falla cerradamente. La callable
puede ejecutar esta guardia antes de procesar la solicitud, pero el comando la
impone de nuevo antes y dentro de la transacciÃ³n. Ninguna futura callable o
invocaciÃ³n interna puede usar esta autoridad en producciÃ³n por reutilizar el
servicio.

El campo persistido `environment = "staging"` es una invariante de datos y no
sustituye la comprobaciÃ³n del proyecto runtime.

## 8. AuditorÃ­a durable

Se adopta el patrÃ³n B de ADR-SAAS-012: obligaciÃ³n durable atÃ³mica y evidencia
materializada posteriormente. La transacciÃ³n que confirma la creaciÃ³n debe crear
conjuntamente:

1. el binding;
2. la reserva inversa;
3. los dos receipts;
4. una obligaciÃ³n en `saas_auditoria_obligaciones`.

La obligaciÃ³n reserva su `evidenciaId` y describe el hecho
`DUSEMA_BINDING_CREADO`: actor, facultad, `commandId`, correlaciÃ³n, causaciÃ³n,
motivo, Empresa, binding determinista, producto, ambiente, `externalTenantId`,
resultado y huella. El contrato cerrado de auditorÃ­a debe incorporar el tipo de
evento y el tipo de agregado de binding Dusema antes de implementar.

La evidencia append-only en `saas_auditoria` se materializa por el emisor y
reconciliador existentes. Si esa materializaciÃ³n falla, el binding vÃ¡lido no se
borra ni se compensa; la obligaciÃ³n permanece `PENDIENTE` y se reintenta de
forma idempotente. Si falla la creaciÃ³n de la obligaciÃ³n, la transacciÃ³n completa
falla y no deja binding, reserva ni receipt.

La obligaciÃ³n y la evidencia no pueden contener secretos, JWT, claves privadas,
payload S2S ni valores de Secret Manager.

## 9. Rules, seguridad y rollback

Las Firestore Rules continÃºan denegando toda lectura o escritura directa del
cliente sobre bindings, receipts y auditorÃ­a. El uso tÃ©cnico de Admin SDK no
equivale a autorizaciÃ³n: la Ãºnica escritura admisible es la del comando tras
validar todas sus precondiciones.

No existe rollback automÃ¡tico destructivo:

- un conflicto no modifica documentos existentes;
- un fallo antes del commit no publica ningÃºn documento;
- un fallo de evidencia posterior preserva el binding y la obligaciÃ³n durable;
- un error posterior al commit se recupera con el receipt y la reconciliaciÃ³n;
- cambiar, revocar, eliminar o reasignar un binding requerirÃ¡ un ADR, autoridad
  y gate posteriores.

## 10. Alcance y fuera de alcance

Tras aprobaciÃ³n, este ADR autoriza exclusivamente la implementaciÃ³n documental y
tÃ©cnica de la ruta canÃ³nica descrita; no autoriza su despliegue ni su uso contra
un entorno externo.

Quedan fuera de alcance:

- producciÃ³n y bindings de producciÃ³n;
- crear, modificar o consultar adicionalmente tenants Dusema;
- modificar Empresas POS o bindings existentes;
- cambios S2S, acceso a secretos, Secret Manager, IAM o configuraciÃ³n externa;
- deploy, provisioning, E2E o contacto con Dusema;
- migraciones de datos, CRUD genÃ©rico, sincronizaciÃ³n, colas, microservicios o
  abstracciones no necesarias;
- cualquier modificaciÃ³n de `consultarTenantDusemaSaas`.

## 11. Consecuencias y alternativas descartadas

La creaciÃ³n queda limitada por mÃ­nimo privilegio, aislada de producciÃ³n,
resistente a carreras y trazable aun si la evidencia se materializa despuÃ©s. El
coste deliberado es una reserva inversa especÃ­fica y dos receipts por comando,
que son necesarios para mantener unicidad y replay seguro.

Se descartan:

- reutilizar `DUSEMA_TENANT_CONSULTAR`, comercial o lifecycle;
- una consulta previa seguida de `create`;
- un Ã­ndice compuesto como mecanismo de unicidad;
- escritura ad hoc por Admin SDK;
- evidencia directa como un sistema nuevo, ignorando la obligaciÃ³n durable
  vigente;
- CRUD o gestor genÃ©rico de bindings.

## 12. RelaciÃ³n con ADR-SAAS-039 y gates de implementaciÃ³n

ADR-SAAS-039 conserva su estado `Propuesto`, su gate de regiÃ³n Firestore y sus
prohibiciones. Este ADR complementa exclusivamente su secciÃ³n 5 al definir la
ruta administrativa canÃ³nica que esa secciÃ³n exige; no reescribe sus etapas ni
autoriza los pasos operativos posteriores.

Antes de implementar deben cumplirse todos estos gates:

1. aprobaciÃ³n humana de este ADR y de ADR-SAAS-039;
2. aprobaciÃ³n explÃ­cita de la regiÃ³n Firestore staging;
3. autorizaciÃ³n de alcance y PR para P2-05 Etapa B;
4. actualizaciÃ³n coherente de contratos de facultad, comando, agregado,
   auditorÃ­a y cÃ³digos de conflicto;
5. pruebas focalizadas de autorizaciÃ³n, contexto obsoleto, guardia runtime,
   concurrencia, unicidad, replay, conflictos, Rules y obligaciÃ³n durable;
6. autorizaciÃ³n operativa independiente para cualquier operaciÃ³n externa.
