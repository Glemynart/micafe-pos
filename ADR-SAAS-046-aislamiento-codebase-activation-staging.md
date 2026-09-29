# ADR-SAAS-046 — Arquitectura para activación de incorporación directa

## Estado

**ACEPTADO.**

**Fecha de aceptación formal:** 2026-09-22.

Este ADR formaliza la decisión arquitectónica para aislar la callable
`activarIncorporacionDirecta` en `saas-operational-activation`. La
regularización de E2.2 versiona el codebase, la frontera neutral, el manifiesto
y el retiro de la exportación legacy; no autoriza ni ejecuta despliegues,
activaciones, provisioning ni escrituras remotas.

### Trazabilidad de aceptación

- **Tercera revisión formal:** `APPROVE WITH OBSERVATIONS`, 2026-09-22.
- **Aceptación formal:** `Aceptado`, 2026-09-22.
- **Opción aprobada:** codebase `saas-operational-activation` con la única
  callable prevista `activarIncorporacionDirecta`.
- El boundary de ADR-SAAS-045 permanece intacto: `saas-operational-auth`
  conserva exactamente `autenticarOperativo`.
- Bootstrap y su boundary de ADR-SAAS-044 permanecen fuera de esta decisión.
- El único Secret previsto para el nuevo boundary es
  `OPERATIONAL_PIN_PEPPER`.
- La ausencia actual de una revisión legacy remota utilizable no invalida la
  aceptación, pero es un gate obligatorio del preflight/cutover.
- Producción permanece fuera de alcance.

## 1. Contexto

El trabajo pertenece a `G-SAAS-02 → M2 → E2.2`. ADR-SAAS-045 fue aceptado e
implementado para aislar la autenticación operativa inicial:

```text
saas-operational-auth
└── autenticarOperativo
```

La certificación de `autenticarOperativo` en `micafe-pos-staging` demuestra que
el login inicial, `OPERATIONAL_PIN_PEPPER`, la emisión del custom token y el
IAM de runtime funcionan. Cuando la credencial es temporal, el Preview debe
completar una segunda operación: `activarIncorporacionDirecta`.

La callable existe localmente en `functions/src/incorporaciones.ts`, es
exportada por `functions/src/index.ts` y utiliza
`functions/src/incorporaciones-service.ts`. No está materializada en staging.
El endpoint observado en staging devuelve `404`; el inventario remoto no
contiene `activarIncorporacionDirecta`.

El despliegue dirigido desde `saas-auth` no constituye automáticamente una
solución: Firebase descubre el entrypoint completo antes de aplicar `--only`.
Ese entrypoint carga superficies que declaran Secrets ajenos, incluido
`WOMPI_EVENTS_SECRET`. Provisionar esos Secrets para desbloquear una operación
de incorporación no relacionada ampliaría la superficie sensible.

## 2. Problema

La activación de una incorporación directa tiene una dependencia funcional del
login, pero no forma parte del endpoint único aprobado por ADR-SAAS-045. La
ubicación actual dentro del entrypoint monolítico de `saas-auth` impide un
deploy seguro y targeted bajo el boundary de Secrets vigente.

La decisión arquitectónica adoptada es que la activación pertenezca a una
superficie aislada, sin:

- duplicar PIN, TTL, claims, membresía, auditoría, transacciones o emisión de
  tokens;
- introducir Secrets de Wompi, Dusema, email, Bootstrap o comercial;
- modificar el contrato público;
- producir dos endpoints con el mismo nombre;
- perder un rollback verificable.

## 3. Objetivo y alcance

Este ADR decide y documenta la frontera arquitectónica futura para
`activarIncorporacionDirecta`; la implementación queda pendiente de los gates
operativos definidos aquí.

Incluye:

- dependencia real de la callable;
- boundary de Secrets;
- comparación de las opciones A, B y C;
- frontera neutral y codebase aceptados, sujetos a implementación controlada;
- cutover, discovery, Firebase plan, rollback y criterios de aceptación.

No incluye:

- implementación de módulos o codebases;
- cambios en `saas-auth`, `saas-operational-auth`, ADR-SAAS-045 o ADR-SAAS-044;
- cambios en `firebase.json`, Rules, Firestore, Auth, Secrets o IAM;
- despliegues, creación de tenants, activación de credenciales o producción.

## 4. Gobernanza vinculante

La precedencia aplicable es:

1. ADR aceptados y vigentes;
2. documentos maestros sincronizados;
3. Goal, Milestone y Epic activos;
4. implementación y pruebas como evidencia del estado real.

La metodología exige un ADR previo cuando se crea una frontera de despliegue,
se cambia la autoridad, se altera la identidad o se introduce una migración.
La implementación debe ejecutarse en una rama separada y un PR auditable,
después del preflight y de los gates definidos en este ADR. La aceptación no
declara creado el codebase ni iniciado el cutover.

Decisiones vinculantes:

- ADR-SAAS-043: una frontera de discovery no puede arrastrar Secrets de otra
  capacidad y debe conservar una única implementación del dominio.
- ADR-SAAS-044: Bootstrap conserva su codebase y su boundary; no se modifica
  por esta decisión.
- ADR-SAAS-045: `saas-operational-auth` expone exactamente
  `autenticarOperativo`; su contrato y boundary permanecen intactos.
- ADR-SAAS-013 y ADR-SAAS-017: la credencial temporal, su activación, claims,
  revocación, auditoría e idempotencia funcional conservan sus garantías.

## 5. Estado actual demostrado

- El frontend selecciona `activarIncorporacionDirecta` cuando el usuario tiene
  `authStage = DIRECTA_TEMP`.
- El payload efectivo es `{ pinActual, pinNuevo }`.
- La función local está en `functions/src/incorporaciones.ts` y la lógica de
  dominio en `functions/src/incorporaciones-service.ts`.
- `firebase.json` mantiene `functions` como source de `saas-auth`.
- Staging no contiene la Function; el endpoint de Cloud Functions responde
  `404` y no hay una revisión remota de esa callable.
- El login inicial de `autenticarOperativo` termina con
  `operational_auth_direct_activation_required` y HTTP 200. El error de UI
  `internal` aparece después, al invocar la callable ausente; los avisos CSP
  del navegador no son evidencia de un fallo de esta operación.

## 6. Dependency closure real

La ruta de ejecución es:

```text
Preview
  → activarSesionOperativa
  → activarIncorporacionDirecta (adapter onCall)
  → activarIncorporacionDirecta (incorporaciones-service)
```

La ruta anterior no implica que el nuevo codebase pueda importar los
entrypoints actuales sin más. El cierre debe evaluarse por módulo y por fase
de ejecución. El grafo observado en el código actual es el siguiente:

| Módulo | Relación | Uso en runtime de activación | Registra Secrets | I/O durante module-load | ¿Puede entrar al boundary nuevo? |
|---|---|---|---|---|---|
| `functions/src/incorporaciones.ts` | adapter `onCall` actual; importa el servicio y `operational-auth.ts` | publica la callable | Sí: `OPERATIONAL_PIN_PEPPER` y `EMAIL_INVITATION_TOKEN_PEPPER` | No | **No**; debe reemplazarse por un adapter dedicado |
| `functions/src/incorporaciones-service.ts` | servicio actual importado por el adapter | Sí, pero solo el subconjunto de activación directa | No | No | **Solo el subconjunto extraído**; no el archivo monolítico completo |
| `functions/src/operational-auth.ts` | dependencia transitiva del adapter y del servicio | helpers de Empresa, claims, bloqueo, permisos y `createCustomToken` | Sí: `OPERATIONAL_PIN_PEPPER` | No; `initializeApp()` es inicialización local | **Solo helpers neutrales extraídos**; no el entrypoint |
| `functions/src/operational-auth-executor.ts` | importado por `operational-auth.ts` | No; pertenece a autenticación operativa | No | No | **No** |
| `functions/src/credential-recovery-service.ts` | import transitivo del executor de autenticación | No; recuperación de credenciales | No | No | **No** |
| `functions/src/platform/credencial-inicial.ts` | importado por el servicio monolítico y recovery | No en la activación directa observada | No | No | **Solo si el executor extraído demuestra necesitarlo** |
| `functions/src/platform/reserva-codigo-operativo.ts` | importado por el servicio monolítico | No en la activación directa observada | No | No | **No**, salvo evidencia de uso en el subconjunto extraído |
| `functions/src/platform/vigencia-credencial-temporal.ts` | helper de vigencia usado por planificación | Sí | No | No | **Sí** |
| `functions/src/platform/audit.ts` | auditoría y obligaciones append-only | Sí, dentro de la transacción/post-proceso | No | No | **Sí** |
| `functions/src/incorporaciones-query.ts` | constante/query helper importado por el servicio | Solo si el executor extraído usa esa consulta | No | No | **Solo el helper requerido** |
| `functions/src/contracts.ts` | tipos, validadores e identificadores | Sí | No | No | **Sí, únicamente contratos/helpers usados** |
| `functions/src/pin-security.ts` | bcrypt para verificar/hash del PIN | Sí | No | No | **Sí** |

El subconjunto permitido debe contener, como mínimo, el adapter dedicado, el
executor de activación directa, `pin-security`, contratos/identificadores,
vigencia temporal, auditoría y los helpers neutrales equivalentes a
`validarSnapshotEmpresaEscribible`, `estaBloqueada`, `registrarFallo`,
`normalizarPermisosEfectivos`, `actualizarClaimsTenant` y
`emitirSesionTenant`. Estos helpers se extraerán sin importar el módulo
desplegable `operational-auth.ts` completo.

`permisosPredeterminados` queda explícitamente fuera de este subconjunto: es
una dependencia de creación de incorporaciones (se usa en
`incorporaciones-service.ts:178` y `incorporaciones-service.ts:674`), no es
necesaria para `activarIncorporacionDirecta` (ruta
`incorporaciones-service.ts:410–594`) y no debe incorporarse al nuevo codebase.

El grafo futuro debe verificarse mecánicamente contra los imports reales. Un
módulo no entra al boundary por estar listado aquí: entra únicamente si el
manifest del nuevo codebase demuestra que forma parte del subconjunto y no
introduce otra callable, Secret o side effect de module-load.

### A — Lógica propia de activación

- `planificarActivacionDirecta` y `prepararActivacionDirecta`;
- validación de mecanismo, UID, empresa, rol, estado y permisos efectivos;
- validación de expiración de credencial temporal;
- verificación del PIN actual y hash del PIN nuevo;
- transacción de credencial, membresía, incorporación y auditoría;
- generación de IDs deterministas de auditoría;
- resultado `ACTIVE` e indicador `idempotente`.

### B — Lógica compartible con autenticación

- `pin-security.ts` (`bcryptjs`);
- lectura de `credenciales_operativas` y control de bloqueo;
- validación de Empresa escribible;
- `actualizarClaimsTenant`, revocación y `createCustomToken`;
- contratos e identificadores de credencial;
- validación de TTL temporal.

Estas piezas deben quedar en una frontera neutral o en módulos neutrales
pequeños. No deben copiarse entre adapters.

### C — Infraestructura Firebase

- `onCall` de Functions v2;
- Admin Auth para usuario, claims, revocación y token;
- Admin Firestore para lecturas y una transacción;
- `OPERATIONAL_PIN_PEPPER` resuelto únicamente durante la ejecución.

No se observa I/O remoto durante module-load. `initializeApp()` y
`defineSecret()` son inicialización/configuración local; Firestore, Auth y
Secret Manager solo se usan dentro del handler o de servicios invocados por él.

### D — Dependencias accidentales de `saas-auth`

La callable se encuentra en un módulo que también:

- declara `EMAIL_INVITATION_TOKEN_PEPPER` para otras callables;
- importa las rutas de email de incorporaciones;
- es cargado desde `functions/src/index.ts`, que importa Wompi, Dusema,
  Bootstrap, plataforma, POS y demás superficies.

Estas dependencias afectan discovery y despliegue del codebase actual, aunque no
sean necesarias para ejecutar la activación directa.

### E — Dependencias que deben permanecer fuera

Wompi, Dusema, invitaciones email, Bootstrap, comandos comerciales y las demás
callables POS no deben entrar en el closure de una futura superficie dedicada.

## 7. Secret closure

### Runtime de `activarIncorporacionDirecta`

El único Secret requerido es:

```text
OPERATIONAL_PIN_PEPPER
```

Se usa para verificar el PIN temporal y generar el hash definitivo. La ruta no
lee `EMAIL_INVITATION_TOKEN_PEPPER`, `WOMPI_EVENTS_SECRET`, `DUSEMA_*`, Secrets
de Bootstrap ni Secrets comerciales.

### Discovery de `saas-auth`

El entrypoint actual declara y carga además Secrets de email, Wompi, Dusema y
otras superficies. Firebase resuelve el manifiesto global antes de aplicar un
target. Por eso un `--only saas-auth:activarIncorporacionDirecta` no demuestra
un boundary secret-free y queda sujeto al bloqueo ya observado por
`WOMPI_EVENTS_SECRET`.

Una futura superficie dedicada debe demostrar:

```text
Secrets = [OPERATIONAL_PIN_PEPPER]
parámetros sensibles adicionales = []
```

Esta conclusión depende del closure anterior. El nuevo entrypoint **no puede
importar** `functions/src/index.ts`, `functions/src/incorporaciones.ts` ni
cualquier módulo que registre Secrets ajenos. En particular,
`incorporaciones.ts` registra también `EMAIL_INVITATION_TOKEN_PEPPER`, aunque
la activación directa no lo consuma en runtime. La topología permitida es:

```text
saas-operational-activation
└── activarIncorporacionDirecta
    └── neutral activation boundary
        └── OPERATIONAL_PIN_PEPPER
```

El manifiesto debe demostrar esa regla, no solo inferirla desde la declaración
de `onCall`.

No se crea ni se modifica ningún Secret mediante este ADR.

## 8. Contrato preservado

```text
Callable: activarIncorporacionDirecta
Región:   us-central1
Runtime futuro: Node.js 22
```

Payload público:

```ts
{
  pinActual: string;
  pinNuevo: string;
}
```

Autoridad:

- Firebase Auth obligatorio;
- `authStage === "DIRECTA_TEMP"`;
- `incorporacionId` derivado de claims;
- UID y Empresa resueltos en servidor;
- nunca se acepta `empresaId` desde el cliente como autoridad.

Respuesta:

```ts
{
  incorporacionId: string;
  estado: "ACTIVE";
  customToken: string;
  idempotente: boolean;
}
```

Errores públicos que deben preservarse:

- `invalid-argument`: payload o PIN definitivo inválido;
- `internal`: `OPERATIONAL_PIN_PEPPER` no disponible o una condición interna
  equivalente ya expuesta por la ruta actual;
- `permission-denied`: sesión temporal ausente o inválida;
- `not-found`: incorporación inexistente;
- `failed-precondition`: estado, TTL, permisos, credencial o Empresa
  inconsistentes;
- `unauthenticated`: PIN inválido o credencial bloqueada;
- `already-exists`: membresía incompatible;
- `aborted`: cambio concurrente detectado.

Efectos preservados:

- lecturas de `incorporaciones`, `credenciales_operativas`, `membresias` y
  `empresas`;
- actualización de credencial y transición de incorporación a `ACTIVE`;
- creación/validación de membresía;
- auditoría tenant y obligación append-only;
- claims `empresaId`/`rol`, revocación y emisión de custom token.

La idempotencia es funcional, no una idempotency key: una incorporación
`ACTIVE` con credencial definitiva y membresía coherente toma la rama de
reintento y no duplica hechos durables ni auditoría determinista.

## 9. Opciones evaluadas

### Opción A — Permanecer en `saas-auth`

**Ventajas:** conserva la ubicación actual y no requiere ampliar ADR-SAAS-045.

**Desventajas y riesgos:**

- discovery global sigue cargando Wompi, Dusema, email y otras superficies;
- el target no evita la resolución de Secrets ajenos;
- un deploy completo podría actualizar o eliminar Functions no relacionadas;
- contradice el patrón de aislamiento aprobado por ADR-SAAS-043/044/045 si se
  usa como workaround provisionar Secrets no propietarios.

Un target-only solo sería aceptable si un preflight demuestra un manifiesto
completo resoluble, ningún cambio no relacionado y un Firebase plan seguro.
La evidencia actual no lo demuestra; el dry-run histórico quedó bloqueado por
`WOMPI_EVENTS_SECRET`.

### Opción B — Añadirla a `saas-operational-auth`

**Ventajas:** login y activación podrían compartir una superficie operacional y
el mismo Secret lógico.

**Desventajas y riesgos:**

- contradice el criterio aceptado de ADR-SAAS-045: exactamente una callable;
- requiere ampliar el boundary y los criterios de discovery de ADR-045;
- exige extraer más lógica neutral sin duplicar claims, auditoría o
  transacciones;
- obliga a actualizar cutover, rollback, pruebas y documentación de ADR-045.

No puede implementarse bajo la decisión aprobada actualmente.

### Opción C — Codebase dedicado `saas-operational-activation`

**Ventajas:**

- discovery de una sola callable;
- único Secret `OPERATIONAL_PIN_PEPPER`;
- no arrastra Wompi, Dusema, email, Bootstrap ni comercial;
- conserva separado el boundary de login de ADR-045;
- permite un adapter delgado y una única implementación neutral.

**Costes y riesgos:**

- nuevo codebase y nuevo ADR aceptado;
- extracción cuidadosa del cierre de `incorporaciones-service.ts`;
- cutover y rollback adicionales;
- necesidad de demostrar que no existe una exportación legacy simultánea.

La Opción C queda aceptada como decisión arquitectónica para un deploy aislado;
su implementación continúa sujeta al preflight, al Firebase plan y a los gates
de cutover y rollback.

## 10. Arquitectura propuesta

```text
saas-operational-auth
└── autenticarOperativo

saas-operational-activation
└── activarIncorporacionDirecta
       │
       └── frontera neutral de activación
              ├── validación PIN/TTL/credencial
              ├── transacción de incorporación/membresía
              ├── claims y revocación
              ├── auditoría append-only
              └── emisión de custom token

saas-auth
└── adapters legacy restantes durante la transición
```

La frontera neutral debe contener una única implementación del executor de
activación y solo sus contratos, helpers y servicios necesarios. No debe
contener:

- adapters de entrypoints desplegables;
- `functions/src/index.ts`;
- callables de email, Wompi, Dusema, Bootstrap o comercial;
- Secrets ajenos;
- una segunda máquina de estados, auditoría, membresía o emisión de token.

El adapter legacy y el adapter nuevo deben invocar esa misma implementación.
No debe existir importación directa entre entrypoints desplegables.

## 11. Cutover propuesto

1. Sincronizar la aceptación formal únicamente con la gobernanza necesaria de
   `G-SAAS-02 → M2 → E2.2`.
2. Crear una rama técnica separada y extraer la frontera neutral con pruebas,
   sin despliegue.
3. Crear el adapter `saas-operational-activation` y comprobar el closure de
   imports, Secret y module-load.
4. Resolver el estado remoto del endpoint legacy antes de retirar cualquier
   exportación local. El orden posterior depende de ese preflight:

   **Caso 1 — existe endpoint legacy remoto**

   1. ejecutar preflight remoto;
   2. desplegar el nuevo endpoint;
   3. verificar exactamente una nueva callable y ausencia de colisiones;
   4. ejecutar el smoke funcional;
   5. confirmar equivalencia contractual;
   6. retirar el export/deployment legacy;
   7. volver a ejecutar discovery y Firebase plan;
   8. confirmar exactamente un endpoint activo.

   **Caso 2 — no existe endpoint legacy remoto**

   1. registrar evidencia del 404/ausencia;
   2. permitir el corte aditivo;
   3. desplegar el nuevo endpoint;
   4. ejecutar el smoke funcional;
   5. confirmar exactamente un endpoint activo;
   6. retirar el código legacy local en el mismo cambio técnico;
   7. volver a ejecutar discovery y Firebase plan.

5. En ambos casos, el Firebase plan read-only es obligatorio y debe demostrar
   cero borrados no aprobados, cero colisiones, ningún endpoint ajeno, ningún
   cambio en Bootstrap o `saas-operational-auth` y destino exclusivo de
   staging.
6. Verificar Function ACTIVE, revisión, región, runtime, binding de Secret,
   IAM de transporte y continuidad de `autenticarOperativo`.
7. Ejecutar una certificación funcional con identidad sintética, preservando
   el payload y sin usar tenants reales.
8. Considerar producción solo mediante un gate posterior independiente.

El estado remoto actual es favorable a un corte aditivo porque
`activarIncorporacionDirecta` devuelve `404`; aun así, el plan de Firebase es
obligatorio antes de materializarlo.

## 12. Discovery y Firebase plan

El nuevo manifiesto debe demostrar:

- exactamente una callable: `activarIncorporacionDirecta`;
- región `us-central1`;
- runtime Node.js 22;
- `OPERATIONAL_PIN_PEPPER` como único Secret;
- module-load sin Firestore, Auth, Secret Manager, HTTP ni lectura de Secret;
- ausencia de Wompi, Dusema, email, Bootstrap y comercial.

El plan debe confirmar:

- no se crea una segunda Function con el mismo nombre;
- no se elimina `autenticarOperativo`;
- no se actualizan Functions no relacionadas;
- no se borran Secrets, datos, tenants, membresías ni auditoría;
- el target es exclusivamente `micafe-pos-staging`.

Cualquier plan que incluya borrado, reasignación, producción o una segunda
declaración detiene el cutover.

## 13. Rollback

### Compila pero no despliega

No hay mutación remota. Se corrige la rama y no se ejecuta un segundo deploy
automático.

### Despliega pero falla el healthcheck

Se detiene el gate. No se ejecuta activación. Se conserva
`autenticarOperativo`; el nuevo endpoint no se considera usable. Se registra
revisión y artifact para diagnóstico.

### Despliega y falla la certificación funcional

No se repite la activación ni se corrigen datos manualmente. Si no hubo
operaciones mutantes, se retira la declaración nueva solo mediante un PR y un
plan aprobado. Si hubo una operación parcial, se conserva el estado y se escala
por el recovery canónico; un rollback de código no revierte Firestore/Auth.

### Falla después del cutover

Restaurar una revisión conocida del endpoint que haya pasado el smoke, o
restaurar un endpoint legacy solo si existe una revisión remota desplegable y
un gate operativo explícito. No se usa `--force` como rollback implícito.

Nunca se borran automáticamente:

- Secrets;
- empresas, membresías, credenciales o auditoría;
- documentos de Firestore;
- usuarios de Auth;
- producción.

La ausencia actual de una revisión legacy remota usable es una condición que
debe resolverse en el preflight; no se promete rollback sin esa evidencia.

El preflight de rollback debe, de forma obligatoria:

- buscar explícitamente una revisión legacy remota;
- identificar si puede restaurarse de forma reproducible;
- registrar la revisión, artifact y estado encontrados.

Si no existe una revisión restaurable, esa ausencia se registra como una
limitación operativa. No se inventa un rollback: se exige evidencia de que el
nuevo despliegue es reversible a nivel de código y se documenta que ningún
rollback técnico revierte escrituras ya realizadas en Firestore o Auth.

## 14. Seguridad y compatibilidad

- La Empresa, UID, incorporación, rol y permisos se derivan y validan en
  servidor.
- El cliente no aporta `empresaId` autoritativo.
- El PIN nunca se registra en claro.
- Tokens y credenciales no entran en logs ni auditoría.
- Claims se emiten únicamente desde Admin Auth.
- El transporte callable puede ser públicamente invocable, pero la operación
  exige la sesión temporal y sus claims server-side.
- `autenticarOperativo` y `saas-bootstrap` no cambian por este ADR.
- No se modifican Rules, IAM, Secrets, Firestore ni Auth durante la fase
  documental y pre-implementación.

## 15. Criterios de aceptación para implementación posterior

### Codebase y discovery

- exactamente un endpoint remoto: `activarIncorporacionDirecta`;
- `us-central1`, Node.js 22;
- solo `OPERATIONAL_PIN_PEPPER`;
- cierre sin Wompi, Dusema, email, Bootstrap o comercial;
- grafo transitivo de imports adjunto a la evidencia de implementación;
- separación demostrada entre dependencias de module-load y runtime;
- manifiesto completo de Secrets y parámetros sensibles;
- prohibición verificable de importar `functions/src/index.ts`,
  `functions/src/incorporaciones.ts` o módulos que registren Secrets ajenos;
- module-load sin I/O remoto;
- build y discovery reproducibles.

### Contrato y autoridad

- payload y respuesta sin cambios;
- `authStage` e `incorporacionId` exigidos;
- Empresa/UID derivados server-side;
- ningún `empresaId` autoritativo desde cliente;
- catálogo completo de errores públicos preservado, incluidos
  `invalid-argument` e `internal`;
- claims, revocación y custom token server-authoritative.

### Dominio y seguridad

- PIN temporal validado con pepper y nunca registrado;
- TTL y estado de incorporación preservados;
- transacción de credencial/membresía/incorporación intacta;
- auditoría append-only e IDs deterministas preservados;
- rama `ACTIVE` repetible sin duplicar hechos;
- no se crean permisos, roles o relaciones nuevas.

### Migración y operación

- `saas-auth` no declara la callable tras el cutover;
- Firebase plan sin colisión ni eliminación accidental;
- `autenticarOperativo` y `saas-bootstrap` permanecen activos;
- estado remoto del endpoint legacy documentado antes del cutover;
- staging validado antes de producción;
- rollback reproducible con revisión conocida;
- CI, typecheck, lint, build, pruebas de servicio, discovery y E2E en verde;
- ninguna escritura de producción.

## 16. Evidencia requerida

La implementación futura debe adjuntar:

- manifests local y remoto con hashes;
- grafo de imports y lista de Secrets;
- separación module-load/runtime y prohibición de importar el entrypoint
  monolítico o módulos con Secrets ajenos;
- prueba de module-load sin I/O;
- Firebase plan read-only;
- revision, artifact, runtime, IAM y Secret binding;
- catálogo de errores públicos observado contra la implementación vigente;
- estado remoto legacy y evidencia de revisión restaurable o limitación
  operativa explícita;
- smoke funcional sintético de activación;
- evidencia de no duplicación y no borrado;
- rollback probado o una limitación explícita documentada.

## 17. Riesgos

- extraer un closure incompleto y producir divergencia de claims o auditoría;
- importar accidentalmente el `index.ts` monolítico;
- reintroducir `EMAIL_INVITATION_TOKEN_PEPPER` u otros Secrets;
- materializar dos endpoints con el mismo nombre;
- retirar la única ruta usable sin revisión de rollback;
- asumir que un rollback de código corrige datos parcialmente activados;
- confundir una sesión temporal válida con una autorización administrativa.

## 18. Decisiones pendientes

1. Confirmar el nombre final del codebase dedicado.
2. Confirmar la ubicación física de la frontera neutral.
3. Confirmar la revisión legacy remota que serviría de rollback o una
   aceptación operativa explícita de su ausencia.
4. Confirmar el Firebase plan y la política de IAM/Invoker para el endpoint.
5. Confirmar el smoke sintético y la ventana de staging.

## 19. Consecuencias

La decisión aceptada añade una frontera de despliegue y un artefacto de
gobernanza,
pero no cambia el contrato ni la lógica de negocio. Reduce la dependencia de
Secrets ajenos y hace posible materializar la activación sin desplegar toda la
superficie de `saas-auth`, a cambio de una extracción neutral, pruebas de
equivalencia y una migración cuidadosamente auditada.

La aceptación no autoriza todavía la implementación ni ningún staging write.

## Referencias

- `ADR-SAAS-043-aislamiento-codebase-comercial-staging.md`.
- `ADR-SAAS-044-aislamiento-codebase-bootstrap-staging.md`.
- `ADR-SAAS-045-aislamiento-codebase-operational-auth-staging.md`.
- `docs/governance/METODOLOGIA-GOAL.md`.
- `docs/goals/GOAL-MVP-COMERCIAL.md`.
- `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`.
- `ADR-SAAS-013-bootstrap-primer-administrador-tenant.md`.
- `ADR-SAAS-017-recuperacion-segura-credenciales.md`.
- `functions/src/incorporaciones.ts`.
- `functions/src/incorporaciones-service.ts`.
- `functions/src/operational-auth.ts`.
- `functions/src/index.ts`.
- `lib/operational-auth-service.ts`.
- `firebase.json`.

## Estado de implementación

```text
ADR-SAAS-046: ACEPTADO — FUENTE Y TOPOLOGÍA REGULARIZADAS EN E2.2
saas-operational-activation: VERSIONADO EN GIT
activarIncorporacionDirecta: RETIRADA DE LA EXPORTACIÓN LEGACY EN GIT
staging deploy por esta regularización: NO REALIZADO
producción: SIN CAMBIOS
```

La fuente corresponde a la implementación histórica `2bafcde` y conserva la
corrección reproducible `fd67e912` para la dependencia local. La comparación
Git directa con el artefacto histórico de staging sigue siendo `UNKNOWN`;
E2.2 no declara esa procedencia como demostrada. Cualquier deploy, validación
funcional, cutover o cambio remoto posterior requiere un gate separado.
