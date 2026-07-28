# MT-U5 — Capa 0: preflight arquitectónico

> **Estado:** Aprobado para implementación documental.
>
> **Alcance de este documento:** congela los contratos previos a MT-U5a y MT-U5b. No implementa ni
> modifica código, Firebase Auth, Cloud Functions, Firestore Rules, datos ni migraciones.
>
> **Norma de precedencia para MT-U5:** si una descripción previa de roles, autenticación,
> compatibilidad, Electron o invitaciones discrepa de este documento, prevalece este documento para
> MT-U5. El documento maestro conserva el roadmap y se referencia desde aquí.

## 1. Decisiones cerradas

| Id | Decisión | Efecto obligatorio |
|---|---|---|
| D-U5-0-1 | El conjunto de roles tenant es `admin`, `supervisor`, `cajero`, `cocinero` y `marketing`. | `supervisor` **permanece**; no se elimina ni se convierte en `admin`. |
| D-U5-0-2 | `superadmin` es un claim exclusivo del plano SaaS, no un `RolUsuario`; `operator` de Electron es un rol técnico local, no un rol tenant. | Ninguno de los dos puede aparecer en una membresía, claim `rol`, UI web/PWA ni plantilla de permisos tenant. |
| D-U5-0-3 | Hasta cerrar MT-U5a hay un único tenant operativo: la empresa fundacional. | La Function determina el tenant en el servidor; el cliente no envía ni elige `empresaId`. El selector llega en MT-U11. |
| D-U5-0-4 | MT-U5a introduce la vía operativa `código + PIN → Function privilegiada → custom token`; MT-U5b mueve rol y permisos de autoridad a `membresias`. | Ningún cliente escribe claims, roles ni membresías. |
| D-U5-0-5 | La autenticación local de Electron no migra en MT-U5. | Electron conserva su login SQLite de forma aislada; su convergencia se programa como iniciativa posterior MT-U12, después de MT-U11. |
| D-U5-0-6 | MT-U5b es dueño del ciclo técnico de invitación para una empresa existente; MT-U7 es dueño del onboarding de la empresa. | No se duplican documentos, endpoints, aceptación ni reglas de invitación en MT-U7. |

## 2. Contrato oficial de roles

### 2.1 Vocabulario canónico

El valor de `rol` es exactamente uno de estos literales en minúscula:

```text
admin | supervisor | cajero | cocinero | marketing
```

La semántica estable es la siguiente:

| Rol | Propósito | Límite explícito |
|---|---|---|
| `admin` | Administración integral de su propia empresa. | No es operador SaaS ni accede a otro tenant. |
| `supervisor` | Operación ampliada y supervisión de negocio. Es un rol distinto de `admin`. | No administra identidad SaaS, membresías, invitaciones ni privilegios de plataforma. |
| `cajero` | Operación de caja y POS. | No administra la empresa. |
| `cocinero` | Operación de cocina/KDS. | No adquiere permisos de caja o administración por pertenecer a cocina. |
| `marketing` | Operación de marketing/contenido de empresa. | No adquiere permisos operativos por defecto. |

Los permisos concretos de cada módulo siguen siendo datos de plantilla y overrides; no deben
codificarse como una segunda taxonomía de roles. Las Rules solo expresan las capacidades que les
corresponde proteger. En particular, `supervisor` sigue integrado al conjunto operativo que ya
reconocen las Rules; nunca se asume equivalente a `admin`.

### 2.2 Matriz de autoridad y de transición

| Superficie | Antes de MT-U5 | MT-U5a | Desde cierre MT-U5b | Acción de implementación posterior |
|---|---|---|---|---|
| `RolUsuario` y UI web/PWA | Tipo incompleto: omite `supervisor`. Algunas vistas ya lo usan en runtime; `demo-data` además usa el alias no canónico `cashier`. | Debe aceptar los cinco literales y mostrar sus nombres consistentes. Aún lee el perfil legacy para compatibilidad. | Debe recibir el rol de la sesión/membresía canónica; no puede inferirlo desde etiquetas UI. | Normalizar tipo, selectores, guards y datos demo; eliminar el alias `cashier` de cualquier camino de autorización. |
| `usuarios/{uid}.rol` y `.permisos` | Fuente de autorización legacy. | Fuente transitoria de validación/perfil para las cuentas legacy. | Ya no es fuente de autorización ni de permisos. `usuarios` conserva identidad/perfil global y datos de compatibilidad. | Volteo atómico de lectores de rol/permisos a membresía/sesión. |
| `membresias/{empresaId}_{uid}` | Arista de pertenencia sin rol/permisos (MT-U1). | Sigue sin ser autoridad de rol. | Fuente canónica de `rol`, `permisos` y estado de pertenencia para el tenant activo. | Completar el contrato de membresía y centralizar sus lectores/escritores privilegiados. |
| Claims Firebase `{empresaId, rol}` | Espejo histórico de `usuarios.rol`; los scripts conocidos omiten `supervisor`. | La Function valida uno de los cinco roles y acuña el claim para la sesión de la empresa fundacional. | Espejo de la membresía activa; lo emite solo el backend privilegiado. | Reemitir tokens al cambiar rol, estado de membresía o tenant; preservar claims de plataforma ajenos. |
| Firestore Rules | Reconocen los cinco roles, incluido `supervisor`; se basan en claims. | Sin cambio de semántica: consumen el claim que emite la Function. | Se ajustan en la unidad de implementación de MT-U5b para la autoridad de membresía, no en esta Capa 0. | Mantener los cinco literales y pruebas negativas para valores desconocidos. |
| `permisos_roles` | Plantilla global legacy administrada por `admin`. | Sigue siendo plantilla transitoria; debe contener una definición válida de `supervisor`. | Deja de ser autoridad tenant; los defaults y overrides viven con la membresía/plantilla que MT-U5b defina. | Migrar los lectores y la administración de permisos con el volteo de MT-U5b. |
| Electron local (`src/auth-middleware.js`) | Roles técnicos locales `admin`/`operator`, independientes de Firebase. | Sin cambio. | Sin cambio. | No mapear automáticamente `operator` a un rol tenant; MT-U12 reemplazará el boundary local. |
| Fixtures de Rules | Ya tipan los cinco roles. | Conservan `supervisor` y agregan casos de emisión/denegación cuando corresponda. | Siguen validando el mismo vocabulario. | Reutilizar la unión canónica en vez de listas divergentes. |

### 2.3 Inconsistencias auditadas y resolución

| Hallazgo | Evidencia actual | Resolución congelada |
|---|---|---|
| `supervisor` falta en el tipo y en el acuñador histórico. | `lib/auth-service.ts:32`; `scripts/set-claims-mt-u2.ts:50`. | Se añade al contrato canónico y todo validador/emisor futuro debe rechazar solo valores fuera de los cinco literales. |
| Rules y fixtures sí conocen `supervisor`. | `firestore.rules:11,20`; `firestore-rules/fixtures.ts:3,25`. | Se considera la evidencia de dominio vigente; no se elimina el rol. |
| UI y turnos usan `supervisor`, pero existen datos demo con `cashier`. | `components/pos/turno-gate.tsx:17`; `lib/demo-data.ts:208-226`. | `cashier` no es un alias de producción. Se normaliza a `cajero` o se elimina del dato no productivo. |
| La UI web y los servicios leen `usuarios.rol`; `SaaSContext.rolClaim` es informativo. | `lib/auth-service.ts`; `contexts/saas-context.tsx:18-22`. | Es correcto solo hasta MT-U5b. En U5b se hace un único volteo de autoridad; queda prohibido un período con ambos como fuentes decisorias. |
| Electron reutiliza nombres de rol no equivalentes. | `src/auth-middleware.js:3-8`. | Se declara un dominio local aislado hasta MT-U12; no participa del contrato Firebase tenant. |

## 3. Flujo oficial de autenticación de MT-U5a

### 3.1 Límites y propiedades

- La Cloud Function es la única frontera que puede validar la credencial operativa, resolver el
  principal, establecer claims y emitir un custom token. El cliente jamás realiza esas acciones.
- MT-U5a opera contra la empresa fundacional. La Function resuelve `empresaId` en servidor; el
  frontend no lo propone ni lo persiste.
  > **R-6 (2026-07-26):** La dependencia del campo `esFundacional` fue eliminada del flujo de
  > autenticación. `resolverCredencialOperativa()` ahora usa búsqueda global por código en
  > `credenciales_operativas`, sin prefiltro por empresa fundacional. Ver `INVESTIGACION-R6-ESFUNDACIONAL.md`.
- El custom token siempre representa un `uid` humano real y un rol del conjunto canónico. No existe
  principal de dispositivo, UID compartido ni claim de estación.
- El claim de tenant es exclusivamente `{ empresaId, rol }`. No lleva arrays de permisos, PIN, email,
  nombres ni datos de perfil. Los custom claims son para control de acceso, no para perfil.
- Dado que MT-U5 todavía tiene una sola membresía activa por principal, la Function puede mantener
  el par de claims de la sesión mediante Admin SDK antes de emitir el token. MT-U11 debe rediseñar
  explícitamente la reemisión para multiempresa y sesiones concurrentes; no se adelanta aquí.

### 3.2 Secuencia normativa

```text
Usuario
  → Login operativo web/PWA (código + PIN)
  → Cloud Function privilegiada
  → Validaciones de credencial, cuenta, rol y tenant
  → setCustomUserClaims(uid, { empresaId, rol, ...claims de plataforma preservados })
  → createCustomToken(uid)
  → Cliente: signInWithCustomToken(auth, customToken)
  → Firebase Auth emite ID token con { empresaId, rol }
  → Cliente: getIdTokenResult(true) una vez tras el sign-in
  → onIdTokenChanged actualiza SaaSContext/AuthContext
  → Aplicación habilita UI y operaciones solo cuando el contexto de sesión es válido
```

La Function responde solo con el custom token y los metadatos mínimos no sensibles que el cliente
necesite para continuar. No devuelve PIN, hashes, permisos completos, una membresía editable ni una
explicación que permita enumerar cuentas.

### 3.3 Validaciones de la Function, en orden

1. Aplicar rate limit, registrar el intento y validar forma de `código` y `PIN`. El mensaje externo es
   genérico para credenciales inválidas.
2. Resolver en servidor la empresa fundacional de MT-U5a y el usuario asociado a ese código dentro de
   ella. El cliente no aporta `empresaId`.
3. Verificar credencial, existencia del `uid` de Firebase Auth, cuenta activa, pertenencia activa y
   que no exista bloqueo administrativo aplicable.
4. Validar que el rol sea uno de los cinco valores oficiales. Un valor desconocido es un error interno
   auditable y **no** produce token.
5. En MT-U5a, obtener el rol desde la fuente legacy únicamente para compatibilidad. En MT-U5b, obtener
   rol, permisos y estado desde la membresía: no hay fallback de autorización a `usuarios`.
6. Preservar claims de plataforma administrados por otro flujo, actualizar solo el bloque tenant,
   emitir el custom token y auditar el resultado sin secretos.

### 3.4 Refresh, revocación y contexts

- Tras `signInWithCustomToken`, el cliente fuerza una sola lectura fresca del ID token antes de liberar
  la aplicación. Los contexts reaccionan con `onIdTokenChanged`; no construyen roles ni tenants por
  su cuenta.
- Al cambiar rol, desactivar una membresía o revocar acceso, el backend actualiza/revoca la sesión y
  obliga la renovación de token. Un token anterior no se considera prueba suficiente después de la
  señal de revocación.
- En MT-U5a, `AuthContext` conserva el perfil legacy como adaptación de compatibilidad; `SaaSContext`
  consume el `empresaId`/`rol` del token para el estado de sesión. En MT-U5b, un único contexto de
  autorización debe proyectar el rol desde la membresía y el token; `usuarios.rol` no puede seguir
  gobernando guards, UI o servicios.
- El fallback de `SaaSContext` a la empresa fundacional, documentado en MT-U2, se retira al cerrar
  MT-U5a. Un token sin `empresaId` o `rol` canónico tras el refresh es una sesión inválida y termina
  en estado de login/error, no en descubrimiento de tenant.

### 3.5 Contrato de credencial operativa (adenda MT-U5a)

La credencial operativa es independiente de Firebase Email/Password. La contraseña de Firebase puede
seguir existiendo para identidad SaaS o para la contingencia legacy, pero **nunca** se reutiliza, se
compara ni se deriva como PIN operativo.

| Elemento | Contrato MT-U5a |
|---|---|
| Identificador operativo | `codigo`, normalizado por la Function (trim + minúsculas) y único dentro de la empresa fundacional. Formato: 3–32 caracteres `[a-z0-9._-]`. No es un email ni un UID. |
| PIN | Exactamente seis dígitos (`^[0-9]{6}$`). Viaja solo por TLS hacia la Function; nunca se escribe, registra ni devuelve en texto plano. |
| Almacenamiento | `credenciales_operativas/{empresaId}_{codigoNormalizado}`. El id determinístico garantiza unicidad sin queries de login. Contiene `empresaId`, `uid`, `codigo`, `pinHash`, `activo`, `fallosConsecutivos`, `bloqueadoHasta`, `creadaEn`, `actualizadaEn` y `pinActualizadoEn`. |
| Hash | `bcrypt` con coste 12 sobre el PIN concatenado con un pepper privado de Secret Manager. El pepper no vive en Firestore, cliente, repositorio ni logs. |
| Lectura/escritura | Exclusivamente Cloud Functions con Admin SDK. La colección queda sin acceso directo de cliente; no requiere cambiar Firestore Rules en MT-U5a. |
| Fuente de autoridad temporal | La credencial solo resuelve `uid`; `usuarios/{uid}.activo` y `.rol` continúan siendo la fuente de validación/autorización hasta MT-U5b. |

#### Aprovisionamiento y rotación

1. Un administrador autenticado del tenant fundacional aprovisiona una credencial para un `uid` legacy
   existente mediante Function privilegiada. La Function verifica claim `rol == admin`, pertenencia al
   tenant fundacional, existencia y estado activo de `usuarios/{uid}`, y unicidad del código antes de
   guardar el hash.
2. La Function nunca acepta que el cliente asigne `empresaId`, rol ni UID de otro tenant. En MT-U5a el
   tenant se resuelve en servidor como empresa fundacional.
   > **R-6 (2026-07-26):** El mecanismo de resolución por empresa fundacional fue reemplazado por
   > búsqueda global de credenciales por código. Ver `INVESTIGACION-R6-ESFUNDACIONAL.md`.
3. La rotación ordinaria exige el PIN actual y permite al titular cambiar solo su propio PIN. Un `admin`
   puede hacer un reset administrativo sin conocer el PIN anterior. Ambos caminos reemplazan el hash,
   reinician contadores, actualizan `pinActualizadoEn`, auditan la acción y revocan sesiones del UID.
4. Cambiar el código es una operación administrativa: crea el nuevo registro y retira el anterior de
   forma atómica. Ningún código se reutiliza mientras exista una credencial activa con ese identificador.
5. Los usuarios legacy sin credencial aprovisionada no obtienen un custom token. Durante MT-U5a siguen
   teniendo la vía legacy como contingencia; la adopción exige que un admin les aprovisione código y PIN
   nuevos, sin migrar ni exponer contraseñas Firebase.

#### Validación y defensa ante fuerza bruta

- Antes de comparar hash, la Function valida formato, busca por id determinístico y aplica bloqueo
  temporal por credencial. Cinco fallos consecutivos bloquean el código durante quince minutos; un
  éxito reinicia el contador. El backend puede añadir un límite por IP sin cambiar el contrato.
- Toda respuesta por código inexistente, PIN erróneo, cuenta inactiva o credencial bloqueada es el mismo
  error externo: `Credenciales operativas inválidas.` Los detalles se registran solo en auditoría segura,
  sin PIN, hash, token ni pepper.
- Tras superar la comparación bcrypt, la Function valida `usuarios/{uid}.activo`, el rol canónico y la
  membresía fundacional activa antes de emitir claims o custom token.

## 4. Compatibilidad de transición

| Etapa | Sigue funcionando | Cambio introducido | Lo que aún no desaparece |
|---|---|---|---|
| Hasta MT-U4 (estado base) | Login web/PWA `username → @micafe-pos.internal → signInWithEmailAndPassword`; perfil/rol/permisos desde `usuarios`; Electron SQLite independiente. | Claims ya protegen Rules, aunque se originan en el acuñador histórico. | `usuarios` y `permisos_roles` globales; fallback de empresa transitorio. |
| MT-U5a | La vía legacy web/PWA se conserva como contingencia durante el despliegue; Electron no cambia. | La vía operativa pasa a ser la ruta objetivo: código+PIN y custom token. Cada sesión nueva por esa vía trae claim validado por Function. | `usuarios.rol`/`.permisos` siguen siendo autoridad temporal y la vía directa legacy se mantiene mientras se valida la transición. |
| Cierre MT-U5a | Ambas vías completan los flujos POS existentes para la empresa fundacional. | Se elimina el fallback de tenant del cliente y se bloquea el acceso si el token no tiene claims válidos. | El perfil legacy y los permisos legacy siguen hasta el volteo de U5b. |
| MT-U5b | La autenticación operativa de U5a continúa para no interrumpir caja/POS. | Email real, membresía canónica, roles/permisos de membresía y ciclo técnico de invitación para empresa existente. La vía directa cliente `signInWithEmailAndPassword` queda retirada como camino operativo. | Los registros legacy pueden mantenerse como perfil/credencial de compatibilidad, pero no deciden autorización. |
| Cierre MT-U5b | Código+PIN y email real convergen en la misma sesión Firebase y membresía. | El **modelo legacy de autoridad** (`usuarios.rol`, `usuarios.permisos`, `permisos_roles` global) desaparece definitivamente. | La credencial operativa heredada solo puede existir detrás de la Function mientras se complete la adopción. |
| MT-U11 | Los usuarios ya pueden tener varias empresas y cambiar la empresa activa mediante reemisión de token. | Se retira definitivamente la compatibilidad de credencial `username@micafe-pos.internal`; todo acceso usa identidad/membresía o código+PIN namespaced. | Electron local permanece hasta MT-U12, pero ya no es un canal admitido para nuevos tenants. |

**Definición de “desaparece el legacy”.** Hay dos sunsets distintos y no deben confundirse:

1. El *legacy de autorización* desaparece al cerrar **MT-U5b**.
2. El *legacy de credencial username/email interno* desaparece al iniciar **MT-U11**; es una
   precondición de habilitar multiempresa. Mantener una credencial como adaptación interna no vuelve a
   `usuarios` fuente de rol ni devuelve al cliente el sign-in directo.

## 5. Electron

Electron empaquetado y la web/PWA no son dos clientes del mismo login actual: Electron tiene base
SQLite, IPC y roles locales; la web/PWA usa Firebase Auth y Firestore. Por tanto, “reutilizar” el
login Electron actual para MT-U5 sería una falsa compatibilidad y rompería el boundary de seguridad.

| Decisión | Contrato |
|---|---|
| Durante MT-U5a y MT-U5b | Electron conserva su login local y sus permisos IPC actuales. No consume custom token, no escribe claims y no participa en membresías/invitaciones. |
| Datos SaaS | Electron no se declara cliente soportado para nuevos tenants creados por MT-U7. La empresa fundacional puede seguir usándolo como canal local durante la transición. |
| Migración | Se crea en el roadmap **MT-U12 — Convergencia Electron SaaS**, posterior a MT-U11. Su entrada exige tener cerrada la decisión de distribución SaaS y el contrato multiempresa; su salida exige que Electron use la misma sesión Firebase de U5 y no sus propios roles de seguridad. |
| Prohibición | `operator` no se convierte automáticamente en `cajero`, `supervisor` ni otro rol tenant. Cualquier asociación futura requiere una membresía explícita emitida por backend. |

Así, Electron no bloquea MT-U5a: queda fuera de su superficie de implementación, con una fecha de
migración definida y sin prometer compatibilidad multiempresa antes de que exista.

## 6. Invitaciones: frontera exacta MT-U5b / MT-U7

### MT-U5b — contrato de identidad y membresía para empresa existente

MT-U5b es dueño de una única mecánica reutilizable de invitación. Incluye:

- contrato de `invitaciones` (empresa objetivo, rol canónico, email opcional, estado, expiración,
  emisor, trazabilidad y uso único);
- creación, cancelación y aceptación/reclamación por backend privilegiado;
- creación o reutilización de identidad Firebase de email real;
- creación/activación de la membresía y asignación del rol/permisos canónicos;
- emisión o renovación del token después de aceptar;
- autorización y auditoría de la operación; y
- UI mínima de gestión de miembros/invitaciones **dentro de una empresa ya existente**, si resulta
  necesaria para ejercitar el contrato.

MT-U5b no crea empresas, planes, espacios, configuraciones empresariales, numeraciones, ni decide el
canal de distribución.

### MT-U7 — onboarding y orquestación de nueva empresa

MT-U7 consume el contrato de MT-U5b y es dueño de:

- alta de empresa, configuración inicial y primer espacio;
- determinación del primer administrador: el creador/owner, no una invitación que compita con ese
  flujo;
- wizard, UX y progreso de onboarding;
- paso opcional de invitar empleados usando **exactamente** la operación de MT-U5b; y
- entrada al POS cuando el onboarding está completo.

MT-U7 no redefine el documento de invitación, sus estados, aceptación, role assignment, token ni sus
Rules. Si necesita invitar empleados, llama/reutiliza la capacidad de MT-U5b. Esto elimina el
solapamiento: U5b posee el ciclo de vida de una invitación; U7 solo lo orquesta tras crear la empresa.

## 7. Plan de implementación de MT-U5

| Capa | Unidad | Objetivo | Dependencias | Criterio de finalización | Validaciones requeridas |
|---|---|---|---|---|---|
| 0 | Preflight (esta entrega) | Congelar roles, auth, transición, Electron e invitaciones. | Cierre MT-U4. | Documento aprobado y referencias del maestro actualizadas. | Revisión cruzada de Rules, claims, UI, servicios, fixtures y Electron. |
| 1 | MT-U5a: frontera privilegiada | Habilitar el entorno de Functions/Admin SDK, secretos, observabilidad y contrato de emisión de custom token. | Capa 0; proyecto Firebase con Functions habilitadas; cuentas/secretos de despliegue. | Ningún cliente puede emitir claims/tokens; la Function puede validar y emitir solo en entorno controlado. | Pruebas de autorización, rate limit, auditoría sin secretos, errores no enumerables y preservación de claims de plataforma. |
| 2 | MT-U5a: autenticación operativa | Hacer primaria la vía código+PIN para la empresa fundacional e integrar `signInWithCustomToken`, refresh y contexts. | Capa 1; inventario validado de roles/cuentas activas. | Sesión de cada rol canónico trae `{empresaId, rol}` válido; sin fallback de tenant. | E2E login/logout/refresh, tokens inválidos, rol desconocido, cuenta inactiva, PIN erróneo, regresión POS y pruebas de Rules por rol. |
| 3 | MT-U5a: convivencia controlada | Mantener la vía legacy solo como contingencia temporal y medir su uso antes de retirarla. | Capa 2. | Criterio de corte aprobado: la ruta nueva cubre los flujos de caja de la empresa fundacional. | Matriz web/PWA, offline/error controlado, no regresión de turnos/ventas/KDS y verificación de que Electron no cambió. |
| 4 | MT-U5b: identidad/membresía | Voltear una sola vez la autoridad de rol/permisos a membresías y habilitar email real. | MT-U5a estabilizado; contrato de roles; capacidad privilegiada. | Ningún guard, servicio o UI autoriza por `usuarios.rol`/`.permisos`; token refleja membresía activa. | Pruebas de revocación/cambio de rol, lectura de permisos, auditoría, regresión de los cinco roles y pruebas negativas de doble autoridad. |
| 5 | MT-U5b: invitaciones existentes | Implementar el ciclo técnico único de invitación descrito en §6. | Capa 4. | Invitar, cancelar, expirar y aceptar crea/reutiliza identidad y membresía sin fuga intertenant. | E2E con email existente/nuevo, token post-aceptación, uso único, expiración, cancelación, auditoría y aislamiento tenant. |
| 6 | Cierre MT-U5 | Retirar el legacy de autorización y certificar la transición. | Capas 4–5. | U5b cerrado; roadmap de sunset a U11 y de Electron a U12 registrado. | Auditoría de referencias a `usuarios.rol`, `permisos_roles`, login directo, fallback SaaS y contrato de roles. |

No se diseñan archivos, APIs ni migraciones en esta Capa 0. Cada capa posterior debe producir su propio
diseño de implementación antes de modificar runtime, Rules o datos.

### Estado de ejecución

- **Capa 4 — MT-U5b: identidad/membresía:** ✅ **COMPLETADA.** La autoridad runtime de rol, permisos efectivos y estado fue migrada a `membresias`; las correcciones posteriores de notificaciones y selectores de relevo eliminaron sus últimas dependencias runtime de `usuarios.rol`.
- **Capa 5 — MT-U5b: invitaciones existentes:** ⏳ **PENDIENTE.** Es el único alcance restante de MT-U5b.
- **Capa 6 — Cierre MT-U5:** ⏳ **PENDIENTE**, dependiente de completar la Capa 5.

### Actualizacion normativa: incorporacion de usuarios

La Capa 5 de MT-U5b queda ampliada por `ADR-SAAS-006-incorporacion-usuarios.md`.
Las referencias anteriores a una unica invitacion por email se interpretan como el
subflujo `EMAIL` del ciclo comun `incorporaciones`. MT-U5b es propietario de dos
mecanismos reutilizables para empresas existentes:

- `DIRECTA`: personal operativo sin email, con credencial temporal operativa y cambio
  obligatorio antes de acceso operativo;
- `EMAIL`: invitacion por email real, con aceptacion, expiracion, cancelacion, reenvio
  y uso unico.

Ambos crean o reutilizan Firebase Auth, conservan `usuarios` como perfil global y
convergen solamente al activar la membresia y emitir claims tenant. Un administrador
tenant nunca puede sustituir una contrasena o credencial de una identidad global ya
existente. MT-U7 solo invoca este contrato durante el onboarding; no lo redefine.

## 8. Evidencia y trazabilidad

- El documento maestro ya reconoce cinco roles de membresía, incluido `supervisor`
  (`MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md:87-89`) y define la autenticación operativa por custom token
  (`:237-242`).
- MT-U2 registró la discrepancia de `supervisor` entre runtime y `RolUsuario`
  (`MT-U2-runtime-saas-diseno.md:38-41`) y difirió el endurecimiento de claims a MT-U5a (`:235-241`).
- MT-U4 mantiene `usuarios`/`permisos_roles` como excepción legacy hasta MT-U5b
  (`MT-U4-firestore-rules-diseno.md`) y las Rules actuales reconocen explícitamente los cinco roles
  (`firestore.rules:8-21`).
- Firebase establece que los custom claims solo se fijan desde entorno privilegiado y llegan al
  cliente al iniciar o renovar el token; los custom tokens los emite el Admin SDK y expiran antes del
  canje. Véase la documentación oficial de Firebase sobre [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
  y [custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).

## 9. Dictamen de salida

**MT-U5a está listo para comenzar implementación.** No quedan decisiones arquitectónicas abiertas
respecto de roles, fuente de claims, secuencia de login, fallback, Electron ni límite de invitaciones.
La primera implementación debe ser la Capa 1, cuya precondición operacional es habilitar una frontera
privilegiada de Firebase Functions; no es un bloqueo de diseño ni autoriza adelantar MT-U5b, MT-U7,
MT-U11 o MT-U12.
