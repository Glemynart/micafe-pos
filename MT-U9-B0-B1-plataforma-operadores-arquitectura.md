# MT-U9 — U9-B0 y U9-B1: plataforma y operadores SaaS

> **Estado:** especificación arquitectónica para revisión.  
> **Alcance:** contratos e invariantes de plataforma (U9-B0) y modelo conceptual de operador/autorización (U9-B1).  
> **Fuera de alcance:** comandos administrativos (U9-B2), auditoría de plataforma (U9-B3), soporte e impersonación (U9-B4), Panel SaaS (U9-B5), certificación (U9-B6), y toda implementación.  
> **Autoridad:** `MT-U9-panel-saas-operadores-auditoria-arquitectura.md`, subordinado al Documento Maestro, ADR-SAAS-001→010 y `MASTER-SECURITY-PLAN.md`.

---

# Parte I — U9-B0: contratos e invariantes de plataforma

## B0.1 Propósito y límite

U9-B0 establece el marco que separa el plano plataforma del plano tenant antes de definir perfiles concretos de operador. Fija qué autoridades ya existen, qué facultades abstractas puede reconocer el plano plataforma, qué datos pertenecen a cada plano y qué límites no pueden cruzarse.

U9-B0 no define tipos de operadores, perfiles, delegaciones concretas, comandos, sesiones de soporte, esquema de auditoría, UI, reglas ni mecanismos de ejecución. Esas materias quedan, respectivamente, para U9-B1, B2, B3, B4 y B5.

## B0.2 Modelo de autoridades de plataforma

Las siguientes fuentes son exclusivas dentro de su responsabilidad. La plataforma las consume o actúa mediante los flujos que correspondan; nunca las sustituye.

| Concepto | Autoridad canónica | Puede decidir | No puede decidir |
|---|---|---|---|
| Identidad técnica de un actor | Firebase Auth | Identificación técnica del principal. | Facultades plataforma, rol tenant, empresa activa o lifecycle. |
| Pertenencia y facultades de plataforma | `saas_operadores/{uid}` | Si un principal puede ejercer facultades de plataforma y cuáles. | Membresía, rol/permisos tenant, lifecycle o suscripción. |
| Identidad/perfil global | `usuarios/{uid}` | Perfil global. | Autorización tenant o de plataforma. |
| Pertenencia y autorización tenant | `membresias/{empresaId}_{uid}` | Rol, permisos y estado del usuario en una empresa. | Facultades de plataforma, lifecycle o soporte. |
| Tenant activo de una sesión tenant | Claims emitidos por backend | Contexto temporal de tenant y rol proyectado. | Estado empresarial canónico, suscripción o facultad de plataforma. |
| Lifecycle y conservación | `empresas/{empresaId}.estado` | Acceso y conservación de la empresa. | Precio, plan, rol o numeración. |
| Oferta comercial | Plan y versión publicada | Capacidades y límites de la oferta. | Acceso directo al tenant. |
| Relación comercial | `suscripciones/{empresaId}` | Trial, período, gracia y estado comercial. | Acceso canónico o reactivación automática de Empresa. |
| Evidencia fiscal y operativa histórica | Venta, `snapshotFiscal`, ledger y estado operativo correspondientes | Hechos históricos de emisión y efectos operativos. | Facultades de plataforma o reconstrucción desde estado vigente. |
| Auditoría de plataforma | `saas_auditoria/{id}` | Registro de evidencia global una vez se defina en U9-B3. | Autorización, lifecycle, estado comercial o modificación de hechos. |

Una facultad de plataforma permite actuar solo dentro del agregado que ya conserva la autoridad canónica. No crea una fuente alternativa de verdad ni convierte al operador en propietario de los recursos que administra.

## B0.3 Fronteras de confianza

### B0.3.1 Plataforma ↔ tenant

La empresa sigue siendo la frontera de seguridad. El plano plataforma puede estar autorizado a administrar agregados globales y a invocar procesos de dominio sobre una empresa, pero dicha autorización no equivale a contexto tenant ni a acceso operativo general a sus datos.

- Las colecciones globales de plataforma —incluidos `planes`, `saas_operadores` y `saas_auditoria`— no son datos tenant ni adquieren `empresaId` por pertenecer al plano plataforma.
- Existen recursos internos de plataforma asociados a una empresa cuya identidad incorpora `empresaId`, como `consumo/{empresaId}_{periodo}`. Este recurso continúa reservado a MT-U10 y no se convierte en dato tenant ni en alcance de B0/B1.
- Los datos de Empresa y los datos operativos conservan `empresaId`, se aíslan conforme a ADR-SAAS-001 y no son legibles ni mutables por la sola existencia de una facultad de plataforma.
- El `empresaId` nunca llega desde una elección libre del cliente. Cuando una operación de plataforma se refiere a una empresa, la referencia identifica el agregado objetivo; no crea ni simula un tenant activo.

### B0.3.2 Operador ↔ soporte

Un operador de plataforma no recibe una membresía tenant ni acceso operativo por ser operador. Soporte e impersonación son una frontera distinta: solo pueden existir mediante el contrato específico de U9-B4. Por tanto, B0 y B1 no conceden, describen ni presuponen una sesión de soporte, un contexto tenant delegado o acceso a POS.

### B0.3.3 Observación ↔ mutación

La capacidad de consultar evidencia o estado no autoriza una mutación. Toda mutación futura debe atravesar el agregado y la transición que ya son autoridad, con sus controles de concurrencia, idempotencia, tiempo y lifecycle. U9-B0 no define esos comandos; solo prohíbe rutas administrativas paralelas.

### B0.3.4 Plataforma ↔ secretos y PII

La condición de plataforma no autoriza acceder a credenciales, tokens, PIN, secretos fiscales ni datos personales innecesarios. La minimización, redacción e higiene de logs se preservan como límites de seguridad de `MASTER-SECURITY-PLAN`; U9-B3 definirá la evidencia de auditoría sin convertirla en un canal de datos sensibles.

## B0.4 Facultades abstractas de plataforma

Una facultad es una autorización de dominio del plano plataforma, no un rol tenant, un claim tenant, una membresía ni un comando. Las facultades se declaran aquí sin asignarlas todavía a tipos de operador; U9-B1 hará esa asignación.

| Facultad abstracta | Alcance permitido | Límites obligatorios |
|---|---|---|
| Gobernanza de operadores | Administrar la pertenencia y facultades del plano plataforma. | No concede acceso tenant ni modifica `usuarios` o `membresias` como vía de autorización. |
| Gobernanza comercial | Administrar la oferta comercial y la relación comercial conforme a sus contratos existentes. | No usa Suscripción como autoridad de acceso ni define límites/consumo de MT-U10. |
| Gobernanza de lifecycle | Solicitar o ejecutar transiciones empresariales admisibles por la autoridad de lifecycle. | No salta la máquina de estados, revisión, motivo, retención ni el servicio único de lifecycle. |
| Conservación de plataforma | Intervenir en archivo, restauración, eliminación o exportación solo cuando el lifecycle y la retención lo permitan. | No borra por conveniencia ni altera datos fiscales, operativos o históricos. |
| Consulta de plataforma | Consultar el mínimo estado canónico y evidencia necesarios para una responsabilidad de plataforma. | No equivale a operación tenant, exportación indiscriminada ni soporte. |

No existe en B0 una facultad de consumo, límites medidos, cambio de tenant, operación POS, modificación de numeración, modificación de venta, conciliación operativa, soporte o impersonación.

## B0.5 Actores autorizados

| Actor conceptual | Puede participar en | No puede participar en |
|---|---|---|
| Principal autenticado con facultad canónica de plataforma | Ejercer la facultad de plataforma que tenga asignada, dentro de sus límites. | Acceso tenant ordinario, operación POS o soporte por defecto. |
| Proceso de dominio autorizado | Ejecutar procesos ya definidos por el dominio con actor/origen y controles canónicos. | Inventar facultades, sustituir autoridades o usar datos de plataforma como autorización tenant. |
| Usuario con membresía tenant | Operación y administración de su Empresa según membresía, lifecycle y permisos. | Facultades de plataforma por su rol tenant. |
| Titular contractual (`ownerUid`) | Responsabilidades que ya le otorgue su membresía administrativa activa. | Autoridad por sí mismo, facultades plataforma o bypass de lifecycle. |
| Actor de soporte | Ninguno en B0/B1; queda sin autorización hasta U9-B4. | Acceso a empresa, datos tenant o sesión delegada. |

La autenticación por sí sola no es un actor autorizado de plataforma. La identidad técnica, la facultad de plataforma y la operación concreta deben coincidir; una de ellas ausente implica denegación.

## B0.6 Clasificación arquitectónica de datos

| Clase | Ejemplos | Regla de pertenencia y acceso |
|---|---|---|
| Globales de plataforma | `planes`, `saas_operadores`, `saas_auditoria`. | No pertenecen a un tenant. Requieren autorización de plataforma; no se acceden mediante membresía de restaurante. |
| Internos de plataforma asociados a empresa | `consumo/{empresaId}_{periodo}`; registros internos que referencien una Empresa sin ser datos operativos. | Pueden identificar empresa sin convertirse en datos tenant. Consumo queda fuera de U9 y pertenece a MT-U10. |
| Tenant de control | `empresas`, `membresias`, `suscripciones`, `incorporaciones`, `configuraciones`, `numeraciones`, `asignaciones_numeracion`, `espacios`. | Se sujetan a `empresaId`, claims/rules/helpers y a su propia autoridad. Plataforma no los convierte en globales. |
| Tenant operativo e histórico | Ventas, pedidos, reservas, inventario, ledger, tesorería y snapshots fiscales. | Conservan aislamiento por empresa y sus invariantes de inmutabilidad/atomicidad. No son superficie de B0/B1. |
| Identidad global | `usuarios/{uid}` y Firebase Auth. | No contiene autoridad tenant ni de plataforma por sí sola. |

La clasificación no adelanta el esquema de auditoría de B3 ni los datos de consumo de MT-U10.

## B0.7 Operaciones permitidas y prohibidas

### Permitidas por el contrato B0

- Reconocer y limitar facultades de plataforma sin convertirlas en membresías tenant.
- Administrar conceptualmente la oferta, suscripción, lifecycle y conservación solo a través de las autoridades y transiciones ya aceptadas.
- Consultar datos mínimos que permitan ejercer una facultad de plataforma.
- Identificar una empresa objetivo para un proceso de plataforma sin crear un tenant activo.
- Preservar la trazabilidad como obligación de los procesos sensibles, sin diseñar aún su modelo de auditoría.

### Prohibidas por el contrato B0

- Crear un rol tenant de plataforma, ampliar `supervisor`, o derivar autoridad de plataforma desde `admin`, `ownerUid`, `usuarios`, `membresias` o un claim tenant.
- Operar una empresa, POS, fiscalidad, ventas, inventario, tesorería o configuración tenant por ser operador.
- Modificar directamente `Empresa.estado`, Suscripción, Plan, Numeración, Asignación, Venta, Snapshot o ledger fuera de su autoridad y transición canónicas.
- Elegir, imponer o reutilizar un `empresaId` para simular contexto tenant, o aceptar un tenant libre desde cliente.
- Autorizar soporte, impersonación, lectura operacional o exportación masiva mediante B0/B1.
- Añadir métricas, límites, consumo, monetización, selector multiempresa o comportamiento Electron.
- Definir el registro, retención, consultas o alertas de auditoría de plataforma antes de U9-B3.

## B0.8 Invariantes obligatorios

- **PLT-B0-01 — Separación de planos.** Una facultad de plataforma no es una membresía tenant ni concede acceso operativo a una Empresa.
- **PLT-B0-02 — Autoridad única.** La plataforma nunca sustituye Empresa, Membresía, Plan, Suscripción, Configuración, Numeración, Asignación, Bootstrap, Snapshot fiscal ni estado operativo como fuente de verdad.
- **PLT-B0-03 — Lifecycle canónico.** Toda intervención de plataforma sobre una Empresa respeta `Empresa.estado`, la máquina de estados y el servicio único de ADR-SAAS-009.
- **PLT-B0-04 — Ciclos separados.** Ninguna facultad comercial convierte `Suscripcion.estado` en autorización de acceso ni reactiva Empresa de manera automática.
- **PLT-B0-05 — Tenancy inalterado.** Los datos tenant conservan `empresaId`, aislamiento, filtrado y enforcement establecidos; una referencia de plataforma a empresa no los globaliza.
- **PLT-B0-06 — Fiscalidad y operación inmutables.** Ninguna facultad de plataforma reescribe Snapshot, venta fiscal, contador, numeración emitida, ledger, tesorería ni los estados de ADR-SAAS-010.
- **PLT-B0-07 — Sin soporte implícito.** Un operador no obtiene soporte, impersonación, contexto tenant ni operación POS por defecto.
- **PLT-B0-08 — Mínimo privilegio.** La autorización de plataforma se concede por facultad explícita y no se infiere de identidad, rol tenant, propiedad contractual o presencia de documentos.
- **PLT-B0-09 — Contexto temporal.** Claims y sesión proyectan contexto; no reemplazan la autoridad canónica de facultades, lifecycle o datos empresariales.
- **PLT-B0-10 — Trazabilidad sin autoridad.** Los hechos trazables derivados de acciones sensibles no conceden permisos ni preceden al hecho confirmado; su contrato persistente queda reservado a B3.
- **PLT-B0-11 — Límites de unidad.** B0 no define ni habilita consumo/límites, cambio de tenant, Electron, soporte/impersonación, comandos ni auditoría de plataforma.

## B0.9 Riesgos arquitectónicos

| Riesgo | Consecuencia | Invariante o límite aplicable |
|---|---|---|
| Convertir operador en superusuario tenant. | Lectura o mutación cross-tenant y escalamiento de privilegios. | PLT-B0-01, 05, 07 y 08. |
| Tratar Suscripción como acceso. | Reactivación, lectura o escritura incompatible con lifecycle. | PLT-B0-03 y 04. |
| Permitir una vía administrativa directa a datos fiscales/operativos. | Ruptura de snapshots, ledger, numeración y evidencia histórica. | PLT-B0-02 y 06. |
| Confundir recurso interno asociado a empresa con dato tenant. | Reglas de clasificación erróneas, fuga o ampliación indebida de alcance. | B0.3.1 y PLT-B0-05. |
| Convertir una consulta de plataforma en soporte implícito. | Acceso no auditado al tenant y confusión de autoridad. | B0.3.2 y PLT-B0-07. |
| Confiar solo en claims de plataforma. | Privilegios persistentes tras revocación o cambio canónico. | PLT-B0-09 y `MASTER-SECURITY-PLAN` SEC-017. |
| Registrar secretos o PII excesiva al trazar acciones. | Divulgación de información sensible. | B0.3.4 y `MASTER-SECURITY-PLAN` AUD-3/SEC-024. |

## B0.10 Criterios de aceptación

U9-B0 está completo solo si:

1. Cada autoridad de plataforma y tenant tiene una única responsabilidad, sin duplicar las autoridades aceptadas.
2. La frontera plataforma↔tenant distingue colecciones globales, recursos internos asociados a empresa y datos tenant, incluido el caso de `consumo/{empresaId}_{periodo}` sin adelantar MT-U10.
3. Ninguna facultad de B0 concede operación tenant, soporte, impersonación, cambio de tenant o acceso a Electron.
4. Las facultades abstractas no describen comandos ni implementaciones, y respetan lifecycle, comercial, fiscalidad y bootstrap existentes.
5. Todos los invariantes PLT-B0 son compatibles con ADR-SAAS-001, 002, 003, 004, 005, 006, 007, 008, 009 y 010.
6. La clasificación de datos no transforma recursos tenant en globales ni crea una autoridad nueva sobre datos históricos.
7. Los riesgos identificados tienen un límite arquitectónico explícito, sin diseñar B2–B6.

**Cierre de B0:** con estos contratos aprobados, B1 puede asignar facultades a operadores sin decidir nuevamente tenancy, lifecycle, comercial, fiscalidad, bootstrap, soporte o auditoría.

---

# Parte II — U9-B1: modelo de operador y autorización de plataforma

## B1.1 Precondición y propósito

U9-B1 se construye exclusivamente sobre las autoridades, facultades abstractas, fronteras e invariantes de U9-B0. No modifica B0 ni crea nuevas facultades; organiza su asignación a operadores de plataforma.

Un operador SaaS es un principal autenticado cuya pertenencia y facultades de plataforma se resuelven canónicamente en `saas_operadores/{uid}`. No es un rol tenant, no es una Membresía, no es un tipo de Usuario operativo y no recibe un tenant activo por defecto.

## B1.2 Modelo conceptual del operador SaaS

El agregado conceptual Operador contiene la relación entre una identidad técnica global y sus facultades de plataforma. Su identidad es `uid`; la pertenencia al plano plataforma no se deduce de email, `usuarios`, `ownerUid`, rol tenant, plan, suscripción ni claim aislado.

El modelo requiere, conceptualmente:

| Elemento | Semántica | Límite |
|---|---|---|
| `uid` | Referencia estable al principal Firebase Auth. | No es por sí mismo autorización. |
| Estado de pertenencia plataforma | Determina si sus facultades pueden ejercerse. | No reemplaza estado de Membresía ni Empresa. |
| Facultades asignadas | Subconjunto explícito de las facultades B0. | No incluye soporte, impersonación, consumo, límites, cambio de tenant ni operación POS. |
| Metadatos de asignación | Identifican el origen y vigencia de la asignación para control de plataforma. | No definen el esquema de auditoría B3. |
| Contexto proyectado de sesión | Puede transportar información de plataforma para resolver sesión. | No sustituye el estado/facultades canónicos. |

La forma física, campos persistidos, claims concretos, APIs y mecanismos de revocación quedan fuera de B1.

## B1.3 Tipos de operadores

Los tipos son perfiles de facultades B0. No son roles tenant, no forman una jerarquía implícita y no tienen poder residual. Un operador puede tener uno o varios perfiles solo cuando la combinación conserve las restricciones de B1.6 y B1.7.

| Tipo conceptual | Facultades B0 que puede recibir | Responsabilidad | Exclusiones expresas |
|---|---|---|---|
| Administrador de plataforma | Gobernanza de operadores. | Mantener la pertenencia y asignación de facultades del plano plataforma. | No obtiene gobernanza comercial, lifecycle, conservación, soporte ni acceso tenant por defecto. |
| Operador comercial | Gobernanza comercial y consulta de plataforma necesaria para ella. | Administrar oferta comercial y relación comercial conforme a las autoridades existentes. | No impone lifecycle, no mide/ejecuta límites de MT-U10, no opera tenant. |
| Operador de lifecycle | Gobernanza de lifecycle, conservación de plataforma y consulta mínima necesaria. | Intervenir en transiciones empresariales admisibles y conservación conforme a lifecycle/retención. | No administra operadores, no altera fiscalidad/operación, no confunde Suscripción con acceso. |
| Observador de plataforma | Consulta de plataforma. | Consultar el mínimo estado/evidencia de plataforma para seguimiento autorizado. | No muta agregados, no exporta datos tenant por defecto y no brinda soporte. |

No existe en B1 un tipo “superadmin”, “soporte”, “impersonador”, “operador POS”, “administrador tenant”, “operador de consumo” ni “cambiador de tenant”. Cualquier necesidad de esos dominios permanece en su bloque o unidad reservada.

## B1.4 Capacidades y alcance de autoridad

| Facultad B0 | Alcance para el tipo que la reciba | Fuente que permanece autoridad | Restricción decisoria |
|---|---|---|---|
| Gobernanza de operadores | Asignar, retirar o revisar facultades de plataforma bajo el modelo B1. | `saas_operadores/{uid}`. | No puede autoatribuirse facultades ni cambiar Membresías tenant. |
| Gobernanza comercial | Gestionar el Plan publicado/versionado y Suscripción a través de las transiciones permitidas por esos agregados. | Plan/version y `suscripciones/{empresaId}`. | No autoriza Empresa ni habilita límites/consumo. |
| Gobernanza de lifecycle | Actuar sobre transiciones empresariales admisibles según `Empresa.estado`. | `empresas/{empresaId}.estado`. | No escribe una transición fuera del servicio canónico ni reactiva por regularizar una Suscripción. |
| Conservación de plataforma | Intervenir en archivo, restauración, eliminación o exportación cuando su precondición canónica exista. | Lifecycle, retención y autorización de plataforma. | No elimina datos ni expone acceso interactivo por decisión del operador. |
| Consulta de plataforma | Leer el mínimo estado canónico asociado a su responsabilidad. | El agregado consultado. | No muta, no crea contexto tenant ni se convierte en soporte. |

Las capacidades se expresan como autorizaciones de dominio; U9-B2 definirá, si se aprueba, la relación con comandos concretos. B1 no crea una vía directa de escritura.

## B1.5 Modelo de autorización de plataforma

Una decisión de autorización de plataforma es válida solo cuando se cumplen simultáneamente:

1. existe una identidad técnica autenticada;
2. existe una pertenencia de plataforma canónica activa para ese `uid`;
3. la facultad requerida está asignada explícitamente;
4. la operación solicitada cae dentro del alcance B0/B1 de esa facultad;
5. el agregado objetivo conserva una operación admisible según sus contratos canónicos;
6. no se intenta crear o asumir un contexto tenant, soporte o impersonación; y
7. la sesión/claim, si existe, no contradice la autoridad canónica.

La ausencia de cualquiera de estas condiciones implica denegación. Un claim de plataforma solo puede proyectar contexto; no basta cuando la pertenencia o facultad canónica no es válida. De igual modo, una membresía tenant válida no satisface una decisión de plataforma.

## B1.6 Reglas de delegación

La delegación significa asignar o retirar una facultad B0 a un `uid` dentro del agregado Operador; no significa delegar una Empresa, un tenant activo, una Membresía, un claim tenant o una sesión de soporte.

- Solo el Administrador de plataforma puede realizar gobernanza de operadores, y solo dentro de esa facultad.
- Una delegación concede únicamente la facultad expresa; no incorpora facultades adyacentes, acceso operativo ni una jerarquía implícita.
- Nadie puede autoasignarse, autorrenovarse o ampliar su propia facultad por el resultado de una acción que ejecuta.
- Retirar una facultad no altera Membresías tenant, `ownerUid`, Plan, Suscripción, lifecycle ni hechos históricos.
- La delegación debe poder evaluarse contra la pertenencia canónica actual; una proyección de sesión obsoleta no conserva la facultad revocada.
- B1 no define el comando, persistencia, auditoría, flujo de aprobación ni propagación técnica de una delegación; esos detalles no pueden contradecir estas reglas.

## B1.7 Reglas de separación de funciones

La separación se define por fuente de autoridad y ámbito, no por una multiplicación de cuentas o por una nueva jerarquía de privilegios.

1. **Plataforma y tenant:** ninguna combinación de tipos de operador reemplaza una Membresía tenant ni concede operación de restaurante.
2. **Operadores y soporte:** ningún tipo de B1 habilita soporte o impersonación; ambos siguen fuera hasta B4.
3. **Comercial y lifecycle:** el Operador comercial puede tratar la relación comercial, pero no decide acceso empresarial; el Operador de lifecycle solo actúa sobre transiciones admisibles y no sustituye la Suscripción.
4. **Administración de operadores y facultades recibidas:** una persona no puede usar una facultad ya recibida como fundamento para asignarse o ampliarse otra facultad.
5. **Consulta y mutación:** el Observador de plataforma no adquiere facultad mutante por la lectura de datos canónicos.
6. **Fiscalidad y operación:** ningún tipo de B1 puede editar fiscalidad, ventas, ledger, tesorería, snapshots o estados operativos.

## B1.8 Restricciones de acceso

- La autorización de plataforma no permite acceso interactivo a una empresa `cancelada`; la exportación sigue siendo un flujo backend controlado por lifecycle.
- Una empresa `archivada` sigue accesible solo a plataforma o soporte autorizado conforme al Maestro; B1 no convierte esa excepción de lifecycle en soporte, operación tenant o acceso a datos sin facultad.
- La suspensión mantiene la matriz de ADR-SAAS-009: owner/admin tenant tienen solo lectura administrativa y los roles operativos no operan POS. B1 no la amplía ni la reemplaza.
- Ningún tipo de B1 puede crear empresa fuera de Bootstrap, alterar sus pasos, emitir claims tenant, incorporar empleados ni completar onboarding.
- Ningún tipo de B1 puede seleccionar/consumir numeración, emitir/anular ventas, aplicar efectos operativos o reescribir evidencia histórica.
- B1 no autoriza acceso a secretos, credenciales fiscales, PIN, tokens ni PII que no sea estrictamente necesaria para la facultad, conforme al límite B0.3.4.

## B1.9 Invariantes del modelo de operadores

- **OPR-B1-01 — Pertenencia explícita.** Un operador solo existe arquitectónicamente como principal Auth con pertenencia canónica en `saas_operadores/{uid}`; Auth por sí sola no basta.
- **OPR-B1-02 — Facultad explícita.** Toda autorización de plataforma requiere una facultad B0 asignada de manera explícita; no existen privilegios por defecto ni rol residual.
- **OPR-B1-03 — Sin tenant implícito.** Ningún tipo, combinación de tipos o facultad B1 crea `empresaId` activo, Membresía o acceso operativo.
- **OPR-B1-04 — Sin soporte implícito.** Ningún tipo B1 habilita soporte, impersonación o sesión delegada.
- **OPR-B1-05 — Autoridad conservada.** Los tipos B1 nunca sustituyen Empresa, Suscripción, Plan, Membresía, Configuración, Numeración, Asignación, Bootstrap, Snapshot ni estado operativo.
- **OPR-B1-06 — Separación comercial/lifecycle.** La facultad comercial no concede lifecycle y la regularización comercial nunca reactiva Empresa automáticamente.
- **OPR-B1-07 — Delegación acotada.** Una delegación solo modifica facultades de plataforma; no puede autoampliarse ni modificar autoridad tenant.
- **OPR-B1-08 — Consulta no mutante.** La facultad de consulta no concede mutación, exportación general ni soporte.
- **OPR-B1-09 — Revocación canónica.** Una proyección de sesión o claim no mantiene una facultad retirada canónicamente.
- **OPR-B1-10 — Fuera de alcance protegido.** Tipos B1 no habilitan MT-U10, MT-U11, MT-U12, B2, B3, B4, B5 o B6.

## B1.10 Riesgos arquitectónicos

| Riesgo | Consecuencia | Control B1 |
|---|---|---|
| Perfil administrador interpretado como superadmin. | Escalamiento hacia tenant, soporte o datos fiscales. | Perfiles sin jerarquía implícita; OPR-B1-02, 03 y 04. |
| Delegación circular o autoescalamiento. | Adquisición no autorizada de facultades. | B1.6 y OPR-B1-07. |
| Operador comercial que reactiva la Empresa. | Confusión de cobro con lifecycle. | B1.4/B1.7 y OPR-B1-06. |
| Operador de lifecycle que usa datos tenant como operación. | Modificación fiscal/operativa fuera de dominio. | B1.8 y OPR-B1-05. |
| Observador convertido en canal de exportación o soporte. | Exposición de datos y bypass de B4. | B1.4, B1.7 y OPR-B1-08. |
| Claim de plataforma persistente tras revocación. | Privilegio obsoleto. | B1.5, B1.6 y OPR-B1-09. |
| Mezclar identidad global, operador y membresía. | Autoridades duplicadas o acceso cross-tenant. | B1.2, B1.5 y OPR-B1-01/03. |

## B1.11 Criterios de aceptación

U9-B1 está completo solo si:

1. Todo tipo de operador es un perfil de facultades B0 y no introduce una facultad nueva.
2. Cada facultad está limitada a su agregado canónico y no duplica autoridades de tenant, lifecycle, comercial, fiscalidad, bootstrap u operación.
3. La decisión de autorización exige identidad, pertenencia canónica, facultad explícita, alcance válido y operación admisible; ningún claim o rol tenant aislado basta.
4. Delegación y separación de funciones impiden autoescalamiento, acceso tenant implícito, soporte implícito y mezcla comercial/lifecycle.
5. Ningún tipo de operador habilita consumo/límites, cambio de tenant, Electron, comandos, auditoría, soporte/impersonación, panel o certificación.
6. Todas las restricciones de acceso preservan la matriz de ADR-SAAS-009, Bootstrap de ADR-SAAS-007, fiscalidad de ADR-SAAS-008 y estado operativo de ADR-SAAS-010.
7. Los riesgos de B1 quedan cubiertos por una regla o invariante B0/B1, sin definir implementación.

**Cierre de B1:** con B0 y B1 aprobados, U9-B2 puede definir comandos administrativos sin rediseñar autoridades, perfiles, facultades, fronteras de confianza o separación de funciones.
