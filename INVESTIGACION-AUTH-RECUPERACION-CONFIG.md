# Investigación — Autenticación operativa, recuperación de credenciales y configuración de tenant

> **Naturaleza:** documento de investigación y diseño. **No implementa nada.**
> **Fecha:** 2026-07-26. **Rama de observación:** `debug/directa-temp-session` (HEAD `197b686`).
> **Método:** lectura de la documentación arquitectónica vigente (ADR-SAAS-001..013, MT-U1..U12,
> TECH-DEBT-CONFIG-001) contrastada campo por campo contra el código real en `functions/src/`,
> `lib/`, `contexts/` y `components/`. Donde documentación e implementación divergen, se marca
> explícitamente con **[DIVERGENCIA]**.
> **No modifica** ningún documento existente. **No ejecuta** ninguna migración ni lectura de producción.
>
> ⚠️ **Leer primero el [Anexo B](#anexo-b--clasificación-de-hallazgos-pendiente-de-implementación-vs-vacío-arquitectónico).**
> Clasifica cada hallazgo según si la arquitectura **ya define** cómo resolverlo (entregable
> pendiente) o **aún no lo define** (vacío arquitectónico). Esa distinción corrige la lectura de
> varios hallazgos de §3–§7, que en la primera redacción quedaron descritos como defectos de diseño
> sin serlo. Las secciones 5, 6, 7 y 16 deben leerse con el Anexo B delante.

---

## 1. Estado actual

### 1.1 Lo que funciona hoy, verificado en código

| Capacidad | Estado | Evidencia |
|---|---|---|
| Creación de tenant nuevo desde Backoffice (empresa + configuración + espacio + numeración BORRADOR + membresía admin + suscripción trial + credencial inicial) | ✅ Completo y atómico | `functions/src/bootstrap/service.ts:246-381` (transacción), paso H en `:404-454` |
| Emisión de credencial operativa inicial (código generado + PIN temporal, revelación única) | ✅ | `functions/src/platform/emitir-credencial-inicial.ts` |
| Login operativo código + PIN con emisión de claims `{empresaId, rol}` | ✅ | `functions/src/operational-auth.ts:589-678` |
| Rama de activación obligatoria de PIN (`DIRECTA_TEMP` → PIN definitivo → sesión tenant) | ✅ | `lib/operational-auth-service.ts:82-150`, `components/auth/activacion-credencial.tsx` |
| Provisionamiento de credencial inicial para un tenant **preexistente** (caso fundacional) | ✅ | `functions/src/platform/provisionar-credencial-inicial-tenant.ts:91-159` |
| Reemisión de una temporal **vigente nunca usada** | ✅ | `ibid.:166-242`, ADR-SAAS-013 §4.4.1 |
| Rotación de PIN por el propio titular (conociendo el PIN actual) | ✅ | `functions/src/operational-auth.ts:734-763` |

### 1.2 Lo que no existe

| Capacidad ausente | Consecuencia inmediata |
|---|---|
| Recuperación de acceso de una credencial **ya activada** | Bloqueo permanente ante PIN olvidado |
| Cualquier superficie de UI que emita una credencial operativa a un miembro del equipo | El admin del tenant **no puede dar de alta operadores utilizables** |
| Inicialización de `configuraciones/{empresaId}` para tenants creados antes del Bootstrap | `CONFIG_NOT_FOUND` post-login en el tenant fundacional |
| Numeración fiscal BORRADOR para tenants preexistentes | El wizard de onboarding tampoco podría completarse aunque la configuración existiera |

---

## 2. Arquitectura existente

### 2.1 Los tres planos y sus autoridades

```
PLANO PLATAFORMA                 PLANO TENANT (empresa)              PLANO OPERATIVO (POS)
saas_operadores                  empresas/{empresaId}                credenciales_operativas
auditoria_plataforma             configuraciones/{empresaId}         incorporaciones
provisionamientos_empresariales  membresias/{empresaId}_{uid}        turnos, ventas, ...
bootstrap_identidades_owner      numeraciones, asignaciones_...
                                 suscripciones/{empresaId}
                     ┌──────────────────────────────────────┐
                     │ Firebase Auth (principal único)      │
                     │ claims { empresaId, rol } + { saas } │
                     └──────────────────────────────────────┘
```

Autoridades declaradas y verificadas en código:

- **`membresias`** es la única fuente de rol, permisos efectivos y estado
  (`operational-auth.ts:296-323`, `esMembresiaActivaYValida`). ADR-SAAS-006 lo exige y el código
  lo cumple: `usuarios` es perfil global sin autoridad (`lib/auth-service.ts:164-176` proyecta el
  rol desde la membresía, nunca desde `usuarios`).
- **`credenciales_operativas`** es un **mecanismo de autenticación**, no una identidad
  (ADR-SAAS-002 §3). Documento por `(empresaId, codigo)`:
  `{ empresaId, uid, codigo, pinHash, activo, requiereCambio?, origen?, expiraEn?, incorporacionId?, fallosConsecutivos, bloqueadoHasta }`.
- **`incorporaciones`** modela el ciclo de **entrada** a una empresa
  (`INVITED | TEMP_CREDENTIAL | ACTIVE | CANCELLED | EXPIRED`, ADR-SAAS-006). No modela
  deshabilitación (eso es `membresias.estado`) ni — hoy — recuperación.
- **`configuraciones/{empresaId}`** es, desde el cutover B7, la única autoridad de configuración
  editable (`MT-U6-U8-B1` §2.1). El singleton legacy `configuracion/general` quedó de solo lectura
  (`lib/configuracion-service.ts:90` lanza al escribir).

### 2.2 Flujo de autenticación operativa real, paso a paso

```
login-screen.tsx  ("Código operativo" + "PIN de 6 dígitos")
   │  components/pos/login-screen.tsx:88,103
   ▼
lib/auth-service.ts:87  loginConCodigoYPin
   ▼
lib/operational-auth-service.ts:82  iniciarSesionOperativa
   ▼
callable  autenticarOperativo          functions/src/operational-auth.ts:589
   ├─ normalizarCodigo + esPinValido
   ├─ resolverCredencialOperativa      :168-267
   │    ├─ obtenerEmpresaFundacional() ← lee empresas where esFundacional==true, exige EXACTAMENTE 1
   │    ├─ query GLOBAL  credenciales_operativas where codigo == <codigo>
   │    ├─ bcrypt+pepper contra cada candidata
   │    └─ exige EXACTAMENTE 1 coincidencia (si no → CREDENTIAL_MATCH_AMBIGUOUS)
   ├─ si credencial.requiereCambio === true
   │    └─ valida incorporación DIRECTA/TEMP_CREDENTIAL/TTL → emitirSesionActivacionDirecta
   │         customToken con { authStage: "DIRECTA_TEMP", incorporacionId }, SIN claims tenant
   └─ si no  → validarMembresiaActiva → acuñarSesionTenant → claims { empresaId, rol }
```

**Observación estructural:** la resolución del tenant en el login es **global por código**, no por
empresa. El código operativo es, de facto, el identificador que selecciona simultáneamente empresa
y persona. Esto es coherente con ADR-SAAS-013 §3 (códigos generados con unicidad global verificada)
y es la razón de que exista la deuda **D-013-2** (identidad de tenant a nivel de dispositivo).

### 2.3 Superficies de UI existentes

| Superficie | Ruta | Qué hace |
|---|---|---|
| Login operativo POS | `components/pos/login-screen.tsx` | Código + PIN. Rama de activación condicional (`:83`) |
| Login admin tenant | `app/(tenant)/admin/login/page.tsx` | Idéntico contrato |
| Gate de onboarding | `components/onboarding/onboarding-gate.tsx:29` | Llama `obtenerEstadoOnboarding` inmediatamente después del login |
| Gestión de usuarios (tenant) | `components/pos/user-management.tsx` | Formulario "Nuevo Usuario": usuario + **contraseña** + nombre + rol |
| Ficha de empresa (Backoffice) | `components/backoffice/company-detail.tsx` | Tarjeta "Acceso inicial": provisionar / reemitir |

---

## 3. Diagnóstico

### 3.1 CASO 1 — Recuperación de credenciales

**No existe ningún flujo de recuperación. La ausencia es deliberada y está registrada.**

ADR-SAAS-013 §4.7 lo declara fuera de alcance con texto explícito:

> Recuperación de acceso de un admin cuya credencial **ya está en uso**. Requiere verificación de
> identidad fuera de banda […] Se registra como **deuda D-013-1**, sin diseño en este ADR.

Y el código materializa ese cierre de puerta sin ambigüedad
(`provisionar-credencial-inicial-tenant.ts:130-134`):

```ts
// §4.3 — activada: ya se usó para operar. No se reemplaza bajo ninguna
// circunstancia por esta vía; es la puerta que el ADR se niega a abrir.
if (estado === "ACTIVE") {
  fail("already-exists", "PRIMERA_CREDENCIAL_YA_EXISTE");
}
```

La ficha del Backoffice refleja el mismo cierre: estado `ACTIVA` → **"Sin acciones"**
(ADR-SAAS-013 §5.3, tabla de estados).

**Las tres primitivas que sí existen, y por qué ninguna resuelve el caso:**

| Primitiva | Autorización | Por qué no sirve |
|---|---|---|
| `rotarPinOperativo` (`operational-auth.ts:734`) | El propio titular | Exige `pinActual`. Inútil por definición si se olvidó |
| `provisionarCredencialOperativa` (`:680`) | `exigirAdminTenant` | (a) Exige una **sesión admin activa** — si el único admin es quien perdió el PIN, no hay quien la invoque. (b) **No tiene ningún consumidor de UI** (verificado: solo aparece en `functions/src/index.ts` y en los ADR). (c) Recibe el PIN **en claro elegido por el admin** y no marca `requiereCambio` → el admin conoce el PIN del operador, sin cambio obligatorio. (d) Acepta código manual, sin verificación de unicidad global (TECH-DEBT-COD-001) |
| `ReemitirCredencialInicialTemporalTenant` (`:166`) | Operador de plataforma, `LIFECYCLE_GOBERNAR` | Exige `estado === "TEMP_CREDENTIAL"` **y** TTL vigente **y** `origen === "PLATAFORMA"` (`:194-198`). Una credencial activada nunca cumple |

**Escenario de bloqueo total, hoy alcanzable:** tenant con un único administrador que olvida su PIN
meses después de activarlo. No existe operación en ninguno de los tres planos capaz de restaurar el
acceso. Ni siquiera el operador de plataforma puede hacerlo sin escribir directamente en Firestore
con la clave de servicio — precisamente lo que ADR-SAAS-013 §8 declara que no debe volver a ocurrir.

### 3.2 CASO 2 — Dos modelos de autenticación coexistiendo

**Confirmado. Y el modelo legacy no solo coexiste: está roto de forma estructural.**

**Modelo A — SaaS (ADR-SAAS-002/006/013).** Código operativo + PIN → `credenciales_operativas` →
`autenticarOperativo` → claims. Es el único modelo que la pantalla de login sabe consumir.

**Modelo B — legacy (pre-SaaS).** `lib/permisos-service.ts:101-128`:

```ts
export async function crearUsuario(username, password, nombre, rol) {
  const email = usernameToEmail(username.toLowerCase().trim());   // username@micafe-pos.internal
  const secondaryApp = initializeApp(firebaseConfig, appName);    // app secundaria en el cliente
  creado = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await callable({ uid: creado.user.uid, nombre, username, email, rol });  // crearUsuarioConMembresia
}
```

`crearUsuarioConMembresia` (`operational-auth.ts:770-817`) crea `usuarios/{uid}` +
`membresias/{empresaId}_{uid}` y **emite claims inmediatamente** (`:814`).

**El defecto crítico:** este camino **nunca crea un documento en `credenciales_operativas`**. Como
el único login existente pide código + PIN, **todo usuario creado desde "Permisos → Nuevo Usuario"
es estructuralmente incapaz de iniciar sesión.** La contraseña se escribe en Firebase Auth y
ninguna pantalla del sistema la consume jamás.

Y no hay forma de repararlo desde la UI: ni `provisionarCredencialOperativa` ni
`crearIncorporacionDirecta` tienen consumidor de cliente (verificado por búsqueda exhaustiva en
`app/`, `components/`, `lib/`; `crearIncorporacionDirecta` solo aparece en `functions/src/index.ts`).

**Conclusión funcional: hoy el administrador de un tenant no puede incorporar a ningún operador
utilizable.** El único acceso operativo existente en cualquier tenant es el del admin inicial
emitido por la plataforma.

**[DIVERGENCIA]** ADR-SAAS-002 §5 dice que los usuarios `@micafe-pos.internal` "se migran […] y
quedan clasificados como autenticación operativa", y ADR-SAAS-006 §Contexto dice que ese alta
"está programada para desaparecer". La implementación no solo no la retiró: la mantiene como el
**único** camino de alta expuesto en la UI del tenant, mientras el camino canónico
(`crearIncorporacionDirecta`) está implementado pero desconectado.

**Sobre la hipótesis del propietario (código = empresa, PIN = operador):** ver §6.2. Es la respuesta
correcta a un problema real de UX, pero la mecánica propuesta colisiona frontalmente con el
resolutor actual y con la seguridad del PIN. Hay una tercera vía mejor.

### 3.3 CASO 3 — `CONFIG_NOT_FOUND`

**Trazado exacto, sin ambigüedad:**

| Paso | Ubicación |
|---|---|
| 1. Login correcto → sesión con claims `{empresaId, rol}` | — |
| 2. `OnboardingGate` se monta y llama el callable | `components/onboarding/onboarding-gate.tsx:29` |
| 3. `obtenerEstadoOnboarding` → `exigirTenantActivo` (pasa: empresa y membresía existen) | `functions/src/onboarding/callables.ts:15-18` |
| 4. Lee `configuraciones/{empresaId}` | `functions/src/onboarding/service.ts:34` |
| 5. **`if (!configSnap.exists) fail("not-found", "CONFIG_NOT_FOUND")`** | `functions/src/onboarding/service.ts:40` |
| 6. El gate captura `err.message` y lo pinta literal en pantalla | `onboarding-gate.tsx:36-38, 57-67` |

**Documento esperado:** `configuraciones/1ae0rD9H8t3ZFSBKrrHR` (empresa fundacional, Café Atrato).

**¿Existe?** Según TECH-DEBT-CONFIG-001 §1 y §3, evidencia recogida sobre producción `micafe-pos`
el 2026-07-25:

```
configuracion            1 doc    conEmpresaId=0    docId="general"
configuraciones          0 docs   (colección vacía)
```

y la fila de la tabla de estado: **"Migración de datos ejecutada — ❌ No — `configuraciones` está
vacía"**. Nada en el historial posterior (`git log`, PR #123..#126) ejecuta esa migración: esos PR
tocan credenciales, permisos y aislamiento de sesión, no configuración.

**Por qué la empresa fundacional quedó sin configuración.** Bootstrap **sí** crea el documento
(`bootstrap/service.ts:258` reserva la ref y `:289` invoca
`inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion`), pero la empresa fundacional, por
diseño explícito, **nunca pasa por Bootstrap** (ADR-SAAS-013 §6.1):

> La empresa fundacional no puede pasar por la primera entrada: `ejecutarBootstrapEmpresarial`
> falla con `EMPRESA_ALREADY_EXISTS` y crearía una suscripción trial improcedente.

Usa en su lugar `ProvisionarCredencialInicialTenant`. Y esa operación **solo emite credenciales**:
`resolverPlanEmisionCredencialInicial` valida empresa, owner y membresía, y devuelve un plan de
emisión (`provisionar-credencial-inicial-tenant.ts:91-159`). No toca `configuraciones`, ni
`numeraciones`, ni `espacios`.

**Clasificación de la causa:** es **inicialización incompleta del tenant**, agravada por una
**migración no ejecutada**. No es un bug de código, ni un cambio de rutas: es un hueco en el camino
de provisionamiento de tenants preexistentes. Bootstrap tiene ocho pasos; la vía fundacional
implementa uno.

**Hallazgo adicional — el fallo no termina en la configuración.** Aunque se creara
`configuraciones/{empresaId}`, el wizard tampoco podría completarse: su paso de numeración exige
que ya exista un documento `numeraciones/{empresaId}_{numeracionId}` en BORRADOR
(`onboarding/service.ts:155-158`, `NUMERACION_NOT_FOUND`), y ese documento lo crea exclusivamente
Bootstrap (`bootstrap/service.ts:308-328`). La empresa fundacional tampoco lo tiene. **Corregir solo
la configuración desplazaría el error, no lo resolvería.**

**Sobre la migración de la configuración histórica de Café Atrato — ¿debía ocurrir automáticamente?**

No, y no ocurrió. Tres razones documentadas:

1. **Reparto de destino.** De los 21 campos legacy, solo 5 van a `configuraciones/{empresaId}`
   (`direccion_tienda`, `email`, `mensaje_ticket`, `nombre_tienda`, `regimenTributario`); 6 van a la
   autoridad de numeración fiscal (B2/ADR-SAAS-008) y **B1 §2.3 prohíbe explícitamente copiarlos** a
   Configuración (TECH-DEBT-CONFIG-001 §4).
2. **Cuatro campos exigen decisión humana.** `nit_tienda`, `responsable_iva`, `telefono`,
   `tipo_contribuyente` están clasificados `CONFLICTO`. El analizador de paridad
   (`lib/configuracion/legado-paridad.ts`) se niega a inferirlos y devuelve
   `bloqueaReadinessFiscal: true`. Determinan obligaciones tributarias reales: **no son
   automatizables**.
3. **Tema, colores y branding no existen en el legacy.** El analizador clasifica `logoUrl`,
   `razonSocial`, `ciudad`, `modulos_habilitados`, `baseCajaSugerida`, `umbralAlertaFaltante` como
   `IGNORADO` = **ausentes en el legacy**. No hay paleta, ni logo, ni identidad visual que migrar:
   el modelo B1 introduce `branding` como concepto **nuevo**. Sin configuración, el runtime resuelve
   la paleta neutral (`lib/configuracion/branding-runtime.ts`, `neutral()` con `valido: false`), que
   es el comportamiento correcto por diseño, no una pérdida de datos.

---

## 4. Causa raíz de cada problema

| Caso | Causa raíz | Naturaleza |
|---|---|---|
| **1** | El ciclo de vida de la credencial operativa se diseñó completo para la **incorporación** (emisión → temporal → activación) y **truncado** para la **operación continua**. `ACTIVE` es un estado terminal sin salida de recuperación. La decisión fue consciente (§4.7) y la deuda quedó abierta (D-013-1), pero el sistema ya está en producción con un único admin por tenant | Alcance diferido, hoy vencido |
| **2** | La migración de identidad de ADR-SAAS-002 se hizo **por debajo** (backend, claims, membresías, credenciales) y **no por arriba** (la UI de alta de usuarios sigue siendo la legacy). Se sustituyó el mecanismo de *login* sin sustituir el mecanismo de *alta*, dejando los dos extremos desconectados | Migración parcial: backend migrado, superficie no |
| **3** | Existen **dos caminos de nacimiento de tenant** (Bootstrap completo / provisionamiento fundacional) y solo uno inicializa el estado que el runtime exige. `ProvisionarCredencialInicialTenant` se diseñó, correctamente, como operación estrecha de credenciales; nadie asumió la responsabilidad complementaria de inicializar el resto del tenant preexistente | Hueco de responsabilidad entre dos operaciones |

**Patrón común a los tres:** el bloque SaaS construyó los mecanismos canónicos con rigor
(idempotencia, transacciones, auditoría, TTL) y **dejó sin conectar los puntos de entrada**. Las tres
piezas que faltan ya tienen su primitiva implementada: `crearIncorporacionDirecta` existe sin UI,
`emitirCredencialInicial` existe sin caso de recuperación,
`inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion` existe sin invocador para tenants
preexistentes.

---

## 5. Riesgos

| # | Riesgo | Prob. | Impacto | Notas |
|---|---|---|---|---|
| R-1 | Bloqueo permanente del único admin de un tenant | Alta (a 6-12 meses) | **Crítico** | Sin salida técnica. Obligaría a escritura directa con clave de servicio, violando ADR-SAAS-013 §8 |
| R-2 | El tenant no puede incorporar operadores | **Ya materializado** | **Crítico** | Bloquea la operación real del negocio (cajeros, cocina) |
| R-3 | Usuarios fantasma en Firebase Auth (`@micafe-pos.internal`) con membresía activa, claims emitidos y sin capacidad de login | **Ya materializado** | Alto | Contaminan `usuarios`, `membresias` y el namespace global de Auth. Su limpieza requerirá inventario |
| R-4 | El tenant fundacional no puede completar onboarding | **Ya materializado** | Alto | `CONFIG_NOT_FOUND`, y detrás `NUMERACION_NOT_FOUND` |
| R-5 | Fuga de frontera de tenant en datos fiscales al crear la 2ª empresa | Media | **Crítico** | TECH-DEBT-CONFIG-001 §2. `configuracion/general` sigue siendo global |
| R-6 | El login depende de `esFundacional` en el camino caliente | Alta al crear la 2ª empresa | Alto | `operational-auth.ts:124-151` exige `esFundacional == true` con `size === 1`; si no, `internal`. Contradice la regla de memoria "código nuevo SOLO usa `empresaId`" |
| R-7 | `CREDENTIAL_MATCH_AMBIGUOUS` por colisión de códigos entre tenants | Media | Alto | La resolución es global (`:178`) y `provisionarCredencialOperativa`/`crearIncorporacionDirecta` no verifican unicidad global (TECH-DEBT-COD-001) |
| R-8 | Un admin de tenant conoce el PIN de sus operadores | Alta si se conecta `provisionarCredencialOperativa` tal cual | Medio | Recibe el PIN en claro y no fuerza cambio. Rompe el no-repudio de la atribución por `cajeroId` |
| R-9 | Código operativo escrito en logs | **Ya materializado** | Bajo-Medio | `operational-auth.ts:650` (`logger.info` con `codigo`) y `lib/operational-auth-service.ts:103` (`console.info` con `codigo`). **[DIVERGENCIA]** con ADR-SAAS-013 §4.6: *"Ni el PIN ni el código aparecen en logs"*. El PIN sí se respeta; el código no. La instrumentación del cliente pertenece a la rama de debug `197b686` |

---

## 6. Alternativas evaluadas

### 6.1 CASO 1 — Recuperación de credenciales

| # | Alternativa | Veredicto |
|---|---|---|
| A-1 | Abrir `ProvisionarCredencialInicialTenant` al estado `ACTIVE` | **Rechazada.** Convierte una operación de arranque en una puerta administrativa universal: el operador de plataforma podría tomar el control de cualquier tenant en cualquier momento con una facultad pensada para otra cosa. Es exactamente lo que ADR-SAAS-013 §4.3 se niega a hacer |
| A-2 | Conectar `provisionarCredencialOperativa` a la UI y llamarlo "restablecer" | **Rechazada como solución completa.** No cubre el caso del admin único (exige sesión admin), entrega el PIN en claro al admin, no fuerza cambio y no verifica unicidad global. Sí es la **base** de la solución para no-admin, previa corrección |
| A-3 | Recuperación por email real de la identidad SaaS (ADR-SAAS-002 capa 1) | **Parcial.** Correcta y deseable para admins con email real, pero hoy el admin inicial nace `createUser({ displayName, disabled:true })` **sin email** (ADR-SAAS-013 §7.6). No aplica al parque actual sin un paso previo de vinculación de email |
| A-4 | Preguntas de seguridad / códigos de recuperación impresos en el alta | **Rechazada.** Introduce un tercer secreto que gestionar, con su propia recuperación. Antipatrón conocido |
| A-5 | **Operación de restablecimiento dedicada, con dos niveles de autoridad** | **Recomendada.** Ver §7.1 |

### 6.2 CASO 2 — Modelo de autenticación

| # | Alternativa | Veredicto |
|---|---|---|
| B-1 | Mantener los dos modelos | **Rechazada.** El modelo legacy produce usuarios que no pueden entrar (R-2, R-3). No es coexistencia: es una vía muerta |
| B-2 | Hacer que el login acepte también usuario + contraseña | **Rechazada.** Reintroduce el namespace global `@micafe-pos.internal` que ADR-SAAS-002 rechazó explícitamente, duplica la superficie de ataque y la de auditoría, y contradice la decisión congelada D-2 |
| B-3 | **Hipótesis del propietario:** código operativo **de empresa** (uno solo) + PIN individual que identifica al operador | **Rechazada en su mecánica, aceptada en su intención.** Tres objeciones concretas, dos de ellas de código: (a) el resolutor actual exige **exactamente una** coincidencia entre las credenciales que comparten código (`operational-auth.ts:232`); con un código compartido, **dos operadores con el mismo PIN de 6 dígitos producen `CREDENTIAL_MATCH_AMBIGUOUS`** y ambos quedan bloqueados — con 30 operadores la probabilidad de colisión no es despreciable. (b) El PIN pasaría a ser **identificador y secreto a la vez**: no puede rotarse libremente (colisiona), no puede elegirse libremente, y su espacio efectivo se reduce al crecer la plantilla. (c) El bloqueo por fuerza bruta (5 fallos → 15 min) se aplica **por documento de credencial**; con código compartido, el bloqueo pasaría a ser por empresa → **un atacante puede dejar sin POS a todo el negocio** con 5 intentos |
| B-4 | **Código por operador (se mantiene) + PIN individual + resolución de tenant por dispositivo** | **Recomendada.** Conserva la unicidad y el aislamiento del bloqueo, y resuelve el problema de UX real que motiva B-3 — que el código sea largo y global — vinculando la empresa al dispositivo en el primer arranque. Es exactamente la deuda **D-013-2** ya identificada, cuyo dueño natural es MT-U7. Con la empresa fijada en el dispositivo, el código operativo puede volver a ser **corto y namespaced por tenant** (`01`, `02`…), que es la ergonomía que el propietario busca |

Sobre la pregunta específica — **¿debe "Nuevo Usuario" abandonar las contraseñas?** **Sí, sin
reservas.** La contraseña que hoy pide ese formulario no se usa en ningún punto del sistema. El
reemplazo canónico ya está implementado y sin conectar: `crearIncorporacionDirecta` →
`TEMP_CREDENTIAL` → activación obligatoria → misma máquina de estados que el admin inicial.

### 6.3 CASO 3 — Configuración del tenant

| # | Alternativa | Veredicto |
|---|---|---|
| C-1 | Script puntual que cree `configuraciones/{empresaId}` | **Rechazada.** ADR-SAAS-013 §8: *"No se escribe ningún script, ni se usa la clave de servicio, ni se introduce código con fecha de caducidad"* |
| C-2 | Que `OnboardingGate` tolere `CONFIG_NOT_FOUND` y arranque el wizard igualmente | **Rechazada.** Enmascara la ausencia de la autoridad de configuración y desplaza el fallo al primer comando (que exige `expectedRevision` de un documento inexistente) y luego a `NUMERACION_NOT_FOUND` |
| C-3 | Backfill masivo automático del legacy → B1 | **Rechazada.** Cuatro campos exigen decisión humana; el analizador se niega a inferirlos y con razón (§3.3) |
| C-4 | **Extender el provisionamiento de tenants preexistentes a una operación de "completar inicialización"** que reutilice los mismos pasos B/C/D de Bootstrap, seguida de la resolución humana de los 4 conflictos mediante los callables B1 ya existentes | **Recomendada.** Ver §7.3 |

---

## 7. Recomendación arquitectónica

### Principio rector

> Cada uno de los tres problemas se resuelve **conectando o completando un mecanismo canónico que
> ya existe**, nunca añadiendo un camino paralelo. Ninguna de las recomendaciones exige revisar
> ADR-SAAS-001 (tenancy) ni ADR-SAAS-002 (identidad de dos capas): ambas decisiones congeladas se
> confirman.

### 7.1 CASO 1 — `RestablecerCredencialOperativa`, con dos niveles de autoridad

Una operación **nueva y explícitamente nombrada**, nunca una bandera de `Provisionar`. Dos niveles,
porque los dos escenarios tienen requisitos de verificación de identidad radicalmente distintos:

**Nivel 1 — Restablecimiento intra-tenant (operadores no-admin).**
- **Quién:** administrador del tenant (facultad de membresía), sobre cualquier miembro **que no sea
  el propio owner**.
- **Desde dónde:** módulo Permisos → ficha del usuario → "Restablecer acceso".
- **Mecánica:** genera server-side código (si se rota) y **PIN temporal**, `requiereCambio: true`,
  TTL 72 h, revelación única en diálogo. El admin **nunca elige ni ve un PIN permanente**.
- Corrige de paso el defecto de `provisionarCredencialOperativa` (PIN en claro elegido por el admin).

**Nivel 2 — Restablecimiento del administrador del tenant.**
- **Quién:** operador de plataforma con facultad **nueva y específica** (p. ej.
  `ACCESO_RESTABLECER`), jamás reutilizando `LIFECYCLE_GOBERNAR`, para que la capacidad sea
  auditable y revocable por separado.
- **Precondiciones no automatizables:** verificación de identidad fuera de banda contra los datos
  administrativos del tenant, registrada como evidencia en el propio comando (referencia del caso de
  soporte, medio de verificación, actor). Encaja con la frontera de ADR-SAAS-011.
- **Control adicional recomendado:** ventana de demora anunciada (p. ej. 24 h) con notificación al
  contacto administrativo registrado, cancelable dentro de la ventana. Es lo que convierte la
  operación en resistente a ingeniería social sin volverla inusable.

**Respuestas directas a las preguntas planteadas:**

| Pregunta | Respuesta |
|---|---|
| ¿Quién puede restablecer una credencial? | Operadores no-admin: el admin del tenant. El admin/owner: solo el operador de plataforma con facultad dedicada y verificación fuera de banda |
| ¿Desde qué módulo? | Nivel 1: POS → Permisos. Nivel 2: Backoffice → ficha de empresa → tarjeta "Acceso inicial", como acción **distinta** de "Provisionar" y de "Reemitir" |
| ¿Proceso diferente al de incorporación? | **Sí, y debe serlo.** Comparte la *primitiva de emisión* (`emitirCredencialInicial`), pero **no** el registro de `incorporaciones`. Razón concreta: `resolverPlanEmisionCredencialInicial` decide leyendo la **incorporación DIRECTA más reciente** del owner (`:118`); si un restablecimiento se registrara como incorporación DIRECTA, corrompería esa decisión y ADR-SAAS-006 quedaría con dos fuentes de autoridad sobre "entrada a la empresa". Se propone un registro propio: `restablecimientos_credencial/{id}`, con estados `SOLICITADO → PENDIENTE_ACTIVACION → ACTIVADO`/`CANCELADO`/`EXPIRADO` |
| ¿Debe invalidarse el PIN anterior? | **Sí, inmediatamente y en la misma transacción**, junto con `revokeRefreshTokens(uid)` para cerrar toda sesión viva. Rotar además el código en el Nivel 2 (la pérdida de acceso puede deberse a compromiso, no a olvido) |
| ¿PIN temporal nuevo? | **Sí.** Generado server-side (CSPRNG), bcrypt+pepper coste 12, jamás persistido en claro, revelación única, TTL 72 h — idéntico contrato al de ADR-SAAS-013 §4.6 |
| ¿Cambio obligatorio otra vez? | **Sí.** `requiereCambio: true`, reutilizando íntegra la máquina `DIRECTA_TEMP` → `activarIncorporacionDirecta` ya construida y probada. Cero UI nueva en el login |
| ¿Qué eventos de auditoría? | `RESTABLECIMIENTO_CREDENCIAL_SOLICITADO` (actor, sujeto, empresa, motivo, evidencia de verificación, correlación), `..._EMITIDO` (confirmado en la misma transacción del hecho durable, con `incorporacionId`/`restablecimientoId` anterior y nuevo, código anterior y nuevo), `..._ACTIVADO` (fijado el PIN definitivo por el sujeto), `..._CANCELADO`/`..._EXPIRADO`. **Nunca PIN ni hash.** Nivel 2 además en `auditoria_plataforma` con obligación en dos fases (ADR-SAAS-012) |

### 7.2 CASO 2 — Un solo modelo: credencial operativa para todos

**Decisión propuesta:** el Modelo B (usuario + contraseña) se **elimina**, no se mantiene en
paralelo.

```
Empresa (tenant)
 └─ Operador
     ├─ identidad     : principal Firebase Auth (sin email para personal operativo)
     ├─ perfil        : usuarios/{uid}              (nombre, sin autoridad)
     ├─ autoridad     : membresias/{empresaId}_{uid} (rol, permisos, estado)
     └─ autenticación : credenciales_operativas      (código propio + PIN individual)

Alta      : crearIncorporacionDirecta → TEMP_CREDENTIAL → activación obligatoria
Login     : código + PIN                        (sin cambios)
Restablec.: RestablecerCredencialOperativa Nivel 1 → PIN temporal → activación obligatoria
```

- El **usuario interno** (`username`) se conserva **solo** como identificador legible para
  administración y auditoría: deja de ser credencial. `usernameToEmail` y
  `createUserWithEmailAndPassword` desaparecen del cliente.
- La **capa EMAIL** de ADR-SAAS-002/006 **se conserva intacta** para identidad SaaS real
  (propietarios, personas en varias empresas). No es duplicidad: es la capa 1 del modelo de dos
  capas, con propósito distinto y sin superposición con el login del POS.
- El **código operativo sigue siendo por operador** (no por empresa), por las razones de §6.2 B-3.
  La ergonomía que motiva la propuesta se resuelve en D-013-2 (tenant fijado en el dispositivo →
  códigos cortos por tenant), que es trabajo de MT-U7 y no debe adelantarse aquí.

### 7.3 CASO 3 — Completar la inicialización del tenant preexistente

Dos entregas distintas que no deben confundirse:

**(a) Inicialización estructural — automatizable, sin decisión humana.**
Una operación de plataforma `CompletarInicializacionTenant`, idempotente y transaccional, que
ejecute para un tenant preexistente los mismos pasos B/C/D de Bootstrap que le faltan, reutilizando
las mismas funciones (`inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion` + espacio +
numeración BORRADOR), **sin** crear empresa ni suscripción (ya existen). Deja el tenant en el mismo
estado que uno recién creado por Bootstrap: con configuración inicial en su plantilla y con el
wizard de onboarding operable.

Esto respeta ADR-SAAS-013 §8 (nada de scripts ni clave de servicio) y convierte el desbloqueo del
tenant fundacional en el primer uso de un mecanismo general, exactamente como se hizo con la
credencial inicial.

**(b) Migración del contenido histórico — requiere decisión humana.**
Ruta ya especificada en TECH-DEBT-CONFIG-001 §5, sin cambios: resolver los 4 conflictos con el
responsable del negocio → reejecutar el analizador hasta `bloqueaReadinessFiscal: false` → aplicar
los 5 campos `CONFIGURACION_B1` mediante los **callables B1 existentes** (nunca escritura directa) →
dejar los 6 `RESERVADO_B2` en la autoridad de numeración → conservar el singleton como archivo de
solo lectura → migrar el último lector (`components/pos/historial.tsx:81`).

**No hay tema, colores ni branding histórico que migrar** (§3.3, punto 3): son conceptos nuevos de
B1. El branding se configurará desde cero en `Configuración > Empresa` cuando el negocio lo decida.

---

## 8. Impacto sobre autenticación

| Elemento | Impacto |
|---|---|
| Pantalla de login (POS y admin) | **Ninguno.** Sigue siendo código + PIN, y la rama de activación ya existente absorbe el restablecimiento sin UI nueva. Se preservan las invariantes de ADR-SAAS-013 §9.1 |
| `autenticarOperativo` | Sin cambios en el camino feliz. Solo debe reconocer una credencial marcada `requiereCambio` cuyo origen sea un **restablecimiento** además de una incorporación — hoy `obtenerIncorporacionDirectaTemporal` (`:325`) solo contempla incorporaciones |
| Claims | Sin cambios. `{empresaId, rol}` sigue emitiéndose solo tras activación, desde backend privilegiado |
| Modelo de identidad | Se **confirma** ADR-SAAS-002 sin enmienda. Lo que cambia es qué superficie de UI se usa para el alta |
| Deuda R-6 (`esFundacional` en el login) | Debe cerrarse antes de la segunda empresa: `resolverCredencialOperativa` no debe depender de que exista exactamente un tenant fundacional |

## 9. Impacto sobre Firestore

| Colección | Cambio |
|---|---|
| `credenciales_operativas` | Sin cambio de forma. Se reutilizan `requiereCambio`, `origen`, `expiraEn` |
| `incorporaciones` | **Sin cambios.** Deliberado: el restablecimiento no es una incorporación (§7.1) |
| `restablecimientos_credencial` | **Nueva.** Plano tenant, con `empresaId`. Escritura exclusiva de backend privilegiado; **acceso denegado a clientes** en Rules, igual que `credenciales_operativas` e `incorporaciones` |
| `configuraciones` | Sin cambio de contrato. Se puebla: 1 documento para el tenant fundacional |
| `numeraciones`, `espacios` | Se pueblan para el tenant fundacional con los mismos valores que Bootstrap genera |
| `usuarios` | Sin cambio de forma. `email` pasa a ser opcional de hecho para personal operativo |
| `auditoria_plataforma` | Eventos nuevos del Nivel 2 |
| **Índices** | El restablecimiento necesitará su índice por `(empresaId, uid, creadoEn desc)`, análogo al de `consultarIncorporacionDirectaMasReciente` |

Verificación bloqueante previa al despliegue, en la línea de ADR-SAAS-013 §7.5: confirmar que
`restablecimientos_credencial` queda cubierta por regla de denegación a clientes **antes** de
desplegar.

## 10. Impacto sobre seguridad

**Mejoras:**
- Se cierra la vía muerta que dejaba principales de Auth activos, con claims y sin uso posible (R-3).
- Desaparece del cliente `createUserWithEmailAndPassword` y con él el manejo de contraseñas en el
  navegador y el namespace global `@micafe-pos.internal`.
- El admin del tenant deja de poder fijar el PIN de sus operadores: solo puede disparar la emisión
  de un temporal de un solo uso. Refuerza el no-repudio de la atribución por `cajeroId` (R-8).
- El restablecimiento de admin queda tras una facultad dedicada, revocable por separado.

**Riesgos que la propuesta introduce, y su mitigación:**
- **El Nivel 2 es, por construcción, una vía de toma de control de un tenant.** Es inevitable en
  cualquier SaaS con recuperación delegada. Mitigación: facultad separada, verificación fuera de
  banda registrada como evidencia, demora anunciada con notificación cancelable, auditoría en dos
  fases, y la garantía estructural de que el destino **solo puede ser `empresa.ownerUid`** —el mismo
  patrón de `provisionar-credencial-inicial-tenant.ts:101-104`, que no acepta ningún uid del
  llamador—.
- **Entrega fuera de banda del PIN temporal.** Riesgo ya aceptado y acotado en ADR-SAAS-013 §12:
  alcance nulo hasta activación, cambio obligatorio, TTL 72 h.
- **R-9 debe corregirse:** retirar `codigo` de `logger.info` (`operational-auth.ts:650`) y toda la
  instrumentación de consola del cliente antes de que la rama de debug llegue a `main`.

## 11. Impacto sobre UX

| Actor | Antes | Después |
|---|---|---|
| Operador que olvida su PIN | Sin salida | Pide restablecimiento a su admin; recibe un temporal y fija su PIN en la misma pantalla de login que ya conoce |
| Admin de tenant que olvida su PIN | **Bloqueo permanente** | Contacta soporte; verificación de identidad; recibe temporal; activa. Con demora anunciada, es más lento — deliberadamente |
| Admin dando de alta a un cajero | Rellena una contraseña que no sirve para nada y el cajero no puede entrar | Rellena nombre y rol; recibe código + PIN temporal para entregar; el cajero fija su PIN al primer ingreso |
| Cajero nuevo | — | Un único flujo, idéntico al del admin inicial: entra con lo que le dieron y elige su PIN |
| Café Atrato tras el login | Pantalla de error con el texto crudo `CONFIG_NOT_FOUND` | Wizard de onboarding operativo |

Un detalle a corregir con independencia de todo lo anterior: `OnboardingGate` muestra
`err.message` sin traducir (`onboarding-gate.tsx:38`). Los códigos de error de backend no deberían
llegar crudos a un usuario final.

## 12. Impacto sobre auditoría

- Todos los eventos nuevos siguen el patrón append-only en dos fases de ADR-SAAS-012 ya
  implementado en `functions/src/platform/audit.ts`, incluida la reconciliación programada.
- **Trazabilidad completa del ciclo de vida de una credencial**, que hoy se corta al activarse:
  emitida → activada → *(hueco actual)* → restablecida → reactivada.
- El Nivel 1 se registra en el plano tenant (actor = admin del tenant); el Nivel 2 además en
  `auditoria_plataforma` con obligación confirmada en la misma transacción del hecho durable.
- Se registra la **evidencia de la verificación fuera de banda** como campo de primera clase del
  comando: sin ella, la operación no puede ejecutarse. Esto convierte un control de proceso en un
  control técnico.
- Invariante a preservar: ningún evento contiene PIN ni hash. Extender explícitamente la prohibición
  al **código**, hoy incumplida (R-9).

## 13. Compatibilidad con la arquitectura SaaS actual

| Decisión vigente | Efecto de esta propuesta |
|---|---|
| ADR-SAAS-001 — tenancy Estrategia A | **Sin cambios.** La colección nueva lleva `empresaId` de nacimiento |
| ADR-SAAS-002 — identidad de dos capas (D-2, congelada) | **Se confirma.** No se añade identidad nueva; el restablecimiento actúa sobre el *mecanismo*, no sobre la identidad. La capa EMAIL permanece intacta |
| ADR-SAAS-006 — incorporación | **Se respeta y se refuerza.** El restablecimiento se mantiene deliberadamente **fuera** de `incorporaciones` para no crear una segunda fuente de autoridad — el mismo razonamiento con el que ADR-006 excluyó `DISABLED` |
| ADR-SAAS-011 — frontera de soporte | **Se apoya en él.** El Nivel 2 es el primer consumidor real del requisito de verificación fuera de banda |
| ADR-SAAS-012 — auditoría de plataforma | **Se apoya en él** sin extensión del contrato |
| ADR-SAAS-013 — bootstrap del primer admin | **Se completa.** Cierra D-013-1 (§4.7) sin tocar §4.3: `Provisionar` sigue negándose a reemplazar una credencial activada; lo hace una operación distinta, con autoridad distinta |
| MT-U3 — helper de tenant | Sin impacto. La colección nueva no entra en las 25 oficiales (nace con `empresaId`, como `credenciales_operativas`) |
| MT-U6→U8 B1 — configuración empresarial | **Se apoya en él.** La migración usa sus callables; no se redefine el contrato |
| MT-U7 | Recibe D-013-2 sin cambios. §7.2 evita explícitamente adelantarlo |

**Se necesitarán ADR nuevos** para: (1) el modelo de restablecimiento y su facultad dedicada
(cerraría D-013-1); (2) la retirada del alta legacy por contraseña, si se considera que enmienda la
transición descrita en ADR-SAAS-002 §5. **No** se necesita ADR para completar la inicialización del
tenant preexistente ni para la migración de configuración: ambas están cubiertas por decisiones ya
aceptadas.

## 14. Cambios necesarios

Inventario, sin implementar. Los archivos son los puntos de intervención identificados en la
investigación.

**CASO 1 — restablecimiento**
- `functions/src/` — servicio de restablecimiento (reutiliza `emitir-credencial-inicial.ts` como
  primitiva; nuevo planificador análogo a `provisionar-credencial-inicial-tenant.ts`).
- `functions/src/operational-auth.ts` — `obtenerIncorporacionDirectaTemporal` (`:325`) debe admitir
  una credencial `requiereCambio` originada en un restablecimiento. Corregir el log de `:650`.
- `functions/src/platform/{command-catalog,operations,callables}.ts` — comando Nivel 2 y facultad.
- `functions/src/platform/queries.ts` — proyección del estado en la ficha.
- `components/backoffice/company-detail.tsx` — acción "Restablecer acceso del administrador", con
  confirmación y diálogo de revelación única (reutiliza `credential-reveal-dialog.tsx`).
- `components/pos/user-management.tsx` — acción "Restablecer acceso" por usuario.
- `firestore.rules` — denegación de `restablecimientos_credencial` a clientes.
- `firestore.indexes.json` — índice `(empresaId, uid, creadoEn desc)`.

**CASO 2 — modelo único**
- `lib/permisos-service.ts:101-128` — sustituir `crearUsuario` por invocación de
  `crearIncorporacionDirecta`; eliminar `createUserWithEmailAndPassword`, `initializeApp` secundaria
  y `deleteUser`.
- `components/pos/user-management.tsx` — retirar el campo Contraseña; añadir el diálogo de entrega
  única de código + PIN temporal.
- `lib/auth-service.ts:307` — retirar `usernameToEmail` una vez sin consumidores.
- `functions/src/operational-auth.ts:770` — `crearUsuarioConMembresia` deja de exigir `email` y
  deja de emitir claims en el alta (los emite la activación). Evaluar su retirada completa una vez
  `crearIncorporacionDirecta` sea el único camino.
- Inventario y saneamiento de los usuarios `@micafe-pos.internal` ya creados (R-3).

**CASO 3 — inicialización y configuración**
- `functions/src/platform/` — operación `CompletarInicializacionTenant` (pasos B/C/D reutilizados de
  `bootstrap/service.ts:288-328`).
- `components/backoffice/company-detail.tsx` — acción y estado derivado "Tenant inicializado".
- `components/onboarding/onboarding-gate.tsx:38` — traducir códigos de error de backend.
- `components/pos/historial.tsx:81` — último lector del singleton legacy, a migrar al modelo B1.

**Transversal**
- R-6: eliminar la dependencia de `esFundacional` del camino caliente de login
  (`operational-auth.ts:124-151`).
- R-7 / TECH-DEBT-COD-001: extender la verificación de unicidad global de códigos a
  `provisionarCredencialOperativa` y `crearIncorporacionDirecta`.
- R-9: retirar la instrumentación de debug de la rama `197b686` antes de integrar.

## 15. Estrategia de migración

**Aplica solo al CASO 2 y al CASO 3.** El CASO 1 es funcionalidad nueva sin datos que migrar.

**CASO 3 — tenant fundacional (Café Atrato)**
1. Verificar en producción el estado real de `configuraciones/1ae0rD9H8t3ZFSBKrrHR`,
   `numeraciones` y `espacios` para `empresaId = 1ae0rD9H8t3ZFSBKrrHR` — solo lectura. La evidencia
   de TECH-DEBT-CONFIG-001 es del 2026-07-25 y debe confirmarse antes de actuar.
2. Ejecutar `CompletarInicializacionTenant` (idempotente). El tenant queda con configuración en
   plantilla y numeración BORRADOR.
3. Resolver los 4 campos en `CONFLICTO` con el responsable del negocio y **registrar las decisiones
   por escrito** — alimentan el snapshot fiscal.
4. Reejecutar el analizador de paridad hasta `bloqueaReadinessFiscal: false`.
5. Completar la identidad fiscal real desde el wizard de onboarding / `Configuración > Empresa`,
   mediante los callables B1.
6. Migrar `components/pos/historial.tsx` y verificar que ningún camino resuelve configuración por id
   fijo `general` — el gate de cierre de TECH-DEBT-CONFIG-001 §5.
7. **Solo entonces** dar de alta una segunda empresa.

**CASO 2 — usuarios legacy existentes**
1. Inventariar principales con email `@micafe-pos.internal` y su membresía y credencial operativa
   asociadas (solo lectura).
2. Clasificar: (a) con credencial operativa → ya operan por el modelo A, no requieren acción;
   (b) sin credencial operativa → **no pueden entrar hoy**: emitirles un restablecimiento Nivel 1
   cuando la operación exista; (c) sin membresía activa → candidatos a desactivación.
3. Convivencia durante la transición: no se rompe nada al retirar el formulario de contraseña,
   porque esa contraseña **no autentica en ninguna pantalla**. Es una retirada de código muerto,
   no un cutover.
4. Retirar `usernameToEmail` y el alta por email interno cuando el inventario esté en cero.

**Rollback.** Las tres entregas son aditivas. El punto de no retorno es la retirada del alta legacy
(paso 4 del CASO 2), que debe hacerse después de que la incorporación DIRECTA esté verificada en
producción con al menos un operador real.

## 16. Plan de implementación por fases

Fases pensadas para el gate de aprobación explícita por capa que ya rige en este proyecto: cada una
cierra con resumen, archivos, decisiones, riesgos y auditoría, y ninguna arranca sin el "sí" de la
anterior.

| Fase | Alcance | Desbloquea | Precede a |
|---|---|---|---|
| **F0 — Verificación** | Confirmar en producción (solo lectura) el estado de `configuraciones`, `numeraciones`, `espacios` del tenant fundacional; inventariar usuarios `@micafe-pos.internal`. Retirar la instrumentación de debug (R-9) | Evidencia fresca para F1 y F3 | Todas |
| **F1 — Inicialización del tenant preexistente** | `CompletarInicializacionTenant` + acción en la ficha + traducción de errores en el gate. Desbloquea Café Atrato | CASO 3 (a) | F2 |
| **F2 — Configuración fiscal real** | Resolución humana de los 4 conflictos, analizador en verde, carga por callables B1, migración de `historial.tsx`, cierre de TECH-DEBT-CONFIG-001 | CASO 3 (b) y **la segunda empresa** | F5 |
| **F3 — Alta de operadores por incorporación directa** | Conectar `crearIncorporacionDirecta` a la UI; retirar el campo Contraseña; diálogo de entrega única | **CASO 2 / R-2** — el bloqueo operativo más urgente | F4 |
| **F4 — Restablecimiento Nivel 1** | Operación intra-tenant, registro `restablecimientos_credencial`, Rules, índice, auditoría tenant, UI en Permisos | Recuperación de operadores | F6 |
| **F5 — Restablecimiento Nivel 2** | ADR que cierra D-013-1; facultad dedicada; verificación fuera de banda con evidencia; demora y notificación; auditoría de plataforma; UI en la ficha | **CASO 1 / R-1** | — |
| **F6 — Limpieza de la vía legacy** | Retirar `usernameToEmail`, el alta por email interno y sanear los principales huérfanos; evaluar la retirada de `crearUsuarioConMembresia` | Cierre del modelo dual | — |
| **F7 — Deudas transversales** | R-6 (`esFundacional` fuera del login) y TECH-DEBT-COD-001 (unicidad global de códigos) | **Precondición de la segunda empresa**, junto con F2 | — |

**Orden recomendado por urgencia real:** F0 → **F3** (bloqueo operativo ya materializado) → F1 →
**F5** (riesgo crítico latente) → F4 → F2 → F7 → F6.

F1 y F3 son independientes entre sí y pueden solaparse. F5 exige ADR previo y es la única fase que
requiere una decisión de política del propietario antes de poder diseñarse por completo: **cuál es el
procedimiento de verificación de identidad aceptable** para devolverle el control de un tenant a
quien dice ser su administrador.

---

## Anexo B — Clasificación de hallazgos: pendiente de implementación vs vacío arquitectónico

Añadido tras revisión del propietario. Antes de tratar un hallazgo como defecto de diseño hay que
comprobar si su diseño **ya existe** en un ADR/MT/IMP cuya implementación estaba planificada para
una fase posterior. La verificación se hizo contra el roadmap del documento maestro (§13),
MT-U5-CAPA0 §3.5 y §4, el plan MT-U6→U8 B1-IMP, ADR-SAAS-013 §11 y **el estado real de ramas y
PR del repositorio** (`gh pr list --state all`, `git branch --no-merged`), que resultó decisivo
para el CASO 3: sin él, B7 se habría dado por no iniciado cuando en realidad está mergeado.

La revisión obligó a **reclasificar cinco hallazgos** que la primera redacción presentaba como
defectos. También hizo aparecer una tercera clase que no es ninguna de las dos, y que es la más
peligrosa de todas porque no tiene dueño.

### Las tres clases

| Clase | Definición | Cómo priorizar |
|---|---|---|
| **A — Pendiente de implementación** | La arquitectura ya define cómo se resuelve, hay unidad/bloque dueño, y su no-ejecución es calendario, no deuda de diseño | Respetar el orden del roadmap. No adelantar sin motivo |
| **B — Entregable faltante de una unidad ya cerrada** | La arquitectura lo define y su unidad dueña fue **declarada completa sin entregarlo** — sea porque el código se entregó sin su superficie de uso, sea porque se mergeó sin ejecutar la operación de datos que lo materializaba. No es trabajo futuro: es alcance cerrado que nadie volverá a mirar | **Máxima prioridad de reconocimiento.** Invisible en el roadmap: nada lo va a recoger |
| **C — Vacío arquitectónico real** | La arquitectura no define cómo resolverlo. Requiere decisión de diseño nueva (ADR) antes de poder implementar | Requiere decisión del propietario antes de estimar |

### Clasificación de cada hallazgo

| Hallazgo | Clase | Evidencia decisiva |
|---|---|---|
| **Restablecimiento de credencial de un operador no-admin** (lo que §7.1 llamaba "Nivel 1") | **A** | **MT-U5-CAPA0 §3.5, punto 3**: *"Un `admin` puede hacer un reset administrativo sin conocer el PIN anterior. Ambos caminos reemplazan el hash, reinician contadores, actualizan `pinActualizadoEn`, auditan la acción y revocan sesiones del UID."* Está diseñado **y ya implementado** en `provisionarCredencialOperativa` (`operational-auth.ts:714-728`, que hace exactamente esas cuatro cosas). **Solo falta la UI y dos correcciones** (generar el PIN server-side y marcar `requiereCambio`) |
| **Restablecimiento del admin/owner del tenant** ("Nivel 2") | **C** | ADR-SAAS-013 §4.7: *"Se registra como deuda **D-013-1**, **sin diseño en este ADR**"*. Y §3.5 de MT-U5-CAPA0 presupone que existe un admin que ejecute el reset — precisamente el supuesto que falla. **Único vacío arquitectónico de primer orden de esta investigación** |
| **Coexistencia de los dos modelos de autenticación** | **A** | MT-U5-CAPA0 §4, fila MT-U11: *"Se retira definitivamente la compatibilidad de credencial `username@micafe-pos.internal`"*, y §4 nota 2: *"El legacy de credencial username/email interno desaparece al iniciar **MT-U11**"*. MT-U11 no está ejecutado (roadmap §13.3). La coexistencia **es el estado planificado**, no un defecto |
| **El alta legacy produce usuarios incapaces de iniciar sesión** | **B** | Distinto del anterior y **no planificado**. El plan (MT-U5-CAPA0 §4, fila MT-U5b) preveía que el legacy siguiera *funcionando* como compatibilidad hasta MT-U11. ADR-SAAS-006 asigna la creación directa a **MT-U5B**, declarado *"Completado y aprobado"* (roadmap §13.1) — pero `crearIncorporacionDirecta` se entregó **sin superficie de UI** y el formulario legacy nunca se sustituyó. Resultado: se retiró el *login* legacy sin retirar el *alta* legacy. **Alcance de una unidad cerrada, no trabajo futuro** |
| **ADR-SAAS-013 §5.4 afirma que el admin gestiona su equipo "vía `crearUsuarioConMembresia`/`actualizarMembresia`, ya existentes"** | **C** | Premisa incorrecta en un ADR aceptado: ese camino no crea credencial operativa, luego el equipo así creado no puede entrar. Requiere corregir el ADR, no solo el código |
| **`CONFIG_NOT_FOUND` — `configuraciones/{empresaId}` vacía** | **B + implementación pendiente** | **El desarrollo de B7 fue implementado y mergeado (PR #108). Sin embargo, el backfill y la migración de datos sobre producción no fueron ejecutados, por lo que el resultado esperado de B7 no llegó a materializarse en el entorno productivo.** Con una precisión decisiva verificada después: el único backfill que B7 entregó es `scripts/b7-ejecutar-backfill-fundacional.ts`, que asigna **`ventas.estadoOperativo`** (ADR-SAAS-010) y **no tiene relación con `configuracion/general`**. La migración de configuración **no está implementada**: `inicializarConfiguracionEmpresa` (`functions/src/configuracion/service.ts:201`) no se exporta como callable y su único invocador es `bootstrap/service.ts:289`. Ver la nota de corrección al final de este anexo |
| **Escrituras al singleton legacy desactivadas sin backfill** | **B** | El corte de escritura de B7 **sí** llegó a producción (`lib/configuracion-service.ts:90`, que se autodenomina "B7 Cutover") pero su contrapartida —mover el dato— no existe ni como script ni como callable. La autoridad vieja quedó de solo lectura y la nueva sin datos ni forma de poblarlos |
| **Falta numeración BORRADOR y espacio para el tenant preexistente** | **C (estrecho)** | Bootstrap/B5 los crea solo para tenants nuevos (`bootstrap/service.ts:299-328`); ADR-SAAS-013 §8 cubre **solo** la credencial. B7 —ya mergeado— cubre el backfill de configuración, no la creación de numeración ni espacio para un tenant preexistente. Ninguna unidad reclama esa inicialización estructural |
| **R-6 — `esFundacional` en el camino caliente del login** | **A** | MT-U5-CAPA0 §3.5, punto 2: *"En MT-U5a el tenant se resuelve en servidor como empresa fundacional"* — declarado explícitamente transitorio en el propio diseño. Su sustitución es precondición de MT-U11 |
| **R-7 — unicidad global de códigos (TECH-DEBT-COD-001)** | **A** | ADR-SAAS-013 §11: deuda registrada con solución definida (*"extender la verificación de unicidad global a `provisionarCredencialOperativa` y `crearIncorporacionDirecta`"*) |
| **Ergonomía del código operativo (hipótesis del propietario)** | **A** | D-013-2, registrada en ADR-SAAS-013 §11 y asignada a MT-U7 |
| **R-9 — el código operativo aparece en logs** | **Defecto de cumplimiento** | No es ninguna de las tres clases: contradice una norma ya aceptada y vigente (ADR-SAAS-013 §4.6). Corrección directa |

### Qué cambia respecto a §5, §6, §7 y §16

1. **La recomendación de §7.1 estaba sobredimensionada en su mitad.** El "Nivel 1" no necesita
   diseño nuevo ni colección nueva: es MT-U5-CAPA0 §3.5.3, ya implementado. Se reduce a **UI + dos
   correcciones** sobre `provisionarCredencialOperativa` (PIN generado server-side en vez de elegido
   por el admin, y `requiereCambio: true`). Mucho más barato y disponible mucho antes.
2. **Solo el "Nivel 2" justifica un ADR nuevo.** Es el único de los tres casos que exige una
   decisión de diseño que hoy no existe en ningún documento.
3. **La colección `restablecimientos_credencial` propuesta en §9 queda condicionada** al diseño del
   Nivel 2. Para el Nivel 1 no hace falta: la mecánica ya existe.
4. **El CASO 3 no es diseño pendiente ni calendario: es un resultado no materializado.** El
   desarrollo de B7 fue implementado y mergeado (PR #108), pero el backfill y la migración de datos
   sobre producción no fueron ejecutados, así que el resultado esperado de B7 no existe en el
   entorno productivo. No hay nada que decidir ni que construir: hay que **ejecutar** la ruta de
   TECH-DEBT-CONFIG-001 §5, cuya única parte no automatizable (los 4 campos en `CONFLICTO`) ya
   estaba identificada desde el 2026-07-25.
5. **La clase B es la que exige atención inmediata**, no por gravedad técnica sino porque **no
   aparece en ningún plan**: MT-U5B y B7 figuran como completados —uno por roadmap, otro por PR
   mergeado— y nadie va a volver a revisarlos. Son los tres hallazgos que se perderían si esta
   investigación no existiera.
6. **Corolario de método:** "mergeado" no equivale a "en producción", y el nombre de un bloque no
   garantiza que su alcance documental coincida con lo que entregó. Conviene que el gate de cierre
   de las unidades futuras distinga explícitamente código, despliegue y operación sobre datos.

### Nota de corrección — alcance real del backfill de B7

Dos afirmaciones de redacciones anteriores de este anexo eran incorrectas y se corrigen aquí, con
la evidencia que las desmiente:

| Afirmación anterior | Evidencia que la desmiente | Estado real |
|---|---|---|
| *"El PR #122 (`fix/backfill-bulkwriter-flush`) confirma que el script de backfill de B7 existe y se estuvo depurando"* | `gh pr view 122 --json files`: toca `scripts/migrate-mt-u3-operativo.ts`, `scripts/rollback-mt-u3-operativo.ts` y `scripts/lib/drenar-pagina.ts`. **Es el backfill de MT-U3**, no el de B7. El script de B7 ni siquiera usa `BulkWriter`: usa `db.batch()` (`b7-ejecutar-backfill-fundacional.ts:128`) | El PR #122 **no tiene relación con B7** |
| *"Falta ejecutar el backfill de B7 (migración de configuración)"* | `scripts/b7-ejecutar-backfill-fundacional.ts:4-10`: su objeto es asignar `estadoOperativo` a `ventas` (`COMPLETO` / `ANULADA_CON_EFECTOS`) conforme a ADR-SAAS-010. **No lee ni escribe `configuracion/general` ni `configuraciones`** | Son **dos migraciones distintas**: la de ventas (implementada, ejecución no demostrada) y la de configuración (**no implementada**) |

**Consecuencia sobre TECH-DEBT-CONFIG-001 §5.** Su paso 3 indica *"Crear `configuraciones/{empresaId}`
mediante los callables B1 ya existentes (no con escritura directa: los callables aplican validación,
revisión e idempotencia)"*. Ese paso **no es ejecutable con la superficie desplegada hoy**:

- Los cuatro callables de escritura (`actualizarConfiguracionEmpresa`, `actualizarParametrosFiscales`,
  `actualizarPreferenciasImpresion`, `actualizarPoliticasOperativas`) **exigen que el documento ya
  exista**: `functions/src/configuracion/service.ts:128` → `if (!configSnap.exists) fallo("failed-precondition", "Configuración inexistente.")`.
- La primitiva que sí crea el documento —`inicializarConfiguracionEmpresa`, idempotente
  (`service.ts:169,201`)— **no está expuesta como callable** (`functions/src/configuracion/callables.ts`
  exporta solo los cuatro `actualizar*` y `obtenerConfiguracionEmpresa`) y su único invocador en todo
  el repositorio es `bootstrap/service.ts:289`.

Es decir: la migración de configuración no es solo una **operación pendiente**; le falta además la
**implementación** de un punto de entrada. TECH-DEBT-CONFIG-001 §5 describe una ruta que asume una
capacidad que no existe.

### Priorización corregida

| Prioridad | Trabajo | Clase | Por qué aquí |
|---|---|---|---|
| **1** | Conectar la UI de incorporación DIRECTA y retirar el campo Contraseña | **B** | Bloqueo operativo ya materializado, alcance de una unidad cerrada, sin dueño que lo recoja |
| **2** | UI de reset administrativo + PIN server-side + `requiereCambio` | **A** (adelanto justificado) | Coste bajo, ya diseñado e implementado; cubre la recuperación de todos los operadores salvo el admin |
| **3** | Decisión de propietario sobre verificación de identidad → ADR que cierra **D-013-1** | **C** | Único vacío real. Bloquea el diseño, no la implementación |
| **4** | **Implementar** el punto de entrada de inicialización de configuración y luego ejecutarlo (desbloquea Café Atrato) | **B + impl.** | No basta con "correr B7": el backfill de B7 es el de `ventas.estadoOperativo`. La migración de configuración carece de superficie ejecutable (ver nota de corrección) |
| **5** | Resolver los 4 campos en `CONFLICTO` con el negocio | **A** | Precondición humana de B7, no de ingeniería |
| **6** | Corregir la premisa de ADR-SAAS-013 §5.4 | **C** (menor) | Un ADR aceptado afirma una capacidad que no existe |
| **7** | R-9 (código en logs) | Defecto | Corrección directa, antes de integrar la rama de debug |
| **8** | R-6 y R-7 | **A** | Precondiciones de la segunda empresa y de MT-U11. Siguen su calendario |

**Comparado con §16**, esto adelanta la recuperación de operadores (era F4, ahora prioridad 2, y
mucho más barata) y **reencuadra F1/F2**: no son construcción de software sino la ejecución de una
migración ya construida. Si dar de alta la segunda empresa es inminente, suben a bloqueantes por
TECH-DEBT-CONFIG-001 §2 (fuga de frontera de tenant en datos fiscales).

---

## Anexo — Divergencias entre documentación e implementación

| # | Documentación | Implementación | Severidad |
|---|---|---|---|
| D-1 | ADR-SAAS-002 §5 / ADR-SAAS-006: el alta por email interno "está programada para desaparecer" | Es el **único** camino de alta expuesto en la UI del tenant, y produce usuarios incapaces de entrar (`lib/permisos-service.ts:101`) | **Alta** |
| D-2 | ADR-SAAS-013 §4.6: *"Ni el PIN ni el código aparecen en logs"* | El código se registra en `operational-auth.ts:650` y en `console.info` del cliente (`lib/operational-auth-service.ts:103`, rama de debug) | Media |
| D-3 | ADR-SAAS-013 §5.3: la ficha ofrece acciones según el estado de la credencial | Correcto, pero el estado `ACTIVA` queda sin ninguna acción posible **para siempre**, lo que en producción equivale a un tenant irrecuperable | **Alta** |
| D-4 | ADR-SAAS-013 §6.1: la vía fundacional es "la misma operación que cualquier tenant futuro empleará para reprovisionar" | Cierto para credenciales, pero **no** inicializa configuración, espacio ni numeración — que Bootstrap sí crea. El tenant fundacional queda a medio nacer | **Alta** |
| D-5 | Regla de proyecto: el código nuevo usa solo `empresaId`; `esFundacional` queda para bootstrap y scripts | `resolverCredencialOperativa` consulta `esFundacional` en **cada login** y falla con `internal` si no hay exactamente uno (`operational-auth.ts:124-151, 174`) | Media (crítica al crear la 2ª empresa) |
| D-6 | TECH-DEBT-CONFIG-001 §3: cutover B7 completado, `configuraciones/{empresaId}` es la autoridad | La colección estaba **vacía**: la autoridad nueva no tiene datos y la vieja es de solo lectura | **Alta** |
