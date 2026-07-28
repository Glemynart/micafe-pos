# MT-U2 — Runtime SaaS (contexto de empresa activa + custom claims) · Especificación definitiva

> **Estado:** ✅ Implementada — Capas 0–4 completas, auditadas y aprobadas. PR #96 abierto
> (`feat(saas): MT-U2 runtime SaaS (custom claims + SaaSContext)`), pendiente de merge.
> **Nota de sincronización (post-implementación):** este documento fue actualizado tras el cierre de
> la Capa 4 para describir el **estado final realmente implementado** — algunas secciones (§3, §5, §7,
> §9) difieren de su redacción original pre-código en nombres de campos y mecanismos concretos; las
> decisiones (D-U2-1..4) no cambiaron, solo su forma de implementación.
> **Rama:** `feature/saas-mt-u2`
> **Deriva de:** documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§6, §7, §13),
> `ADR-SAAS-001` (tenancy/claims), `ADR-SAAS-002` (identidad/rol), `ADR-SAAS-004` (modelo empresarial).
> **Depende de:** `MT-U1-empresas-membresias-diseno.md` (empresa fundacional + membresías puras, ya mergeado).
> **Metodología:** misma que U1–U5 de modificadores y MT-U1 (unidad pequeña, mergeable, auditable, **sin romper producción**).

MT-U2 introduce el **runtime SaaS para una única empresa**: acuña el **custom claim `{empresaId, rol}`**
en el token de cada usuario y crea el **contexto de empresa activa** que consumirán las unidades
siguientes. **No** cambia el comportamiento funcional del POS, **no** introduce selector de empresa,
onboarding, multi-empresa, ni voltea la fuente de autorización. El claim se **produce e introduce**, pero
permanece **inerte** (nadie lo obedece todavía).

---

## 1. Auditoría del estado actual (resumen verificado contra el código)

- **Autenticación:** Firebase Auth **client SDK**; `username` → email interno `@micafe-pos.internal`
  (`lib/auth-service.ts`). No existe `functions/`; `firebase.json` solo declara Firestore. `firebase-admin`
  (v14) presente, usado por scripts y API routes.
- **Usuario actual:** `AuthProvider` (`contexts/auth-context.tsx`) se suscribe vía `onAuthStateChange` a
  `onSnapshot(usuarios/{uid})`. Servicios obtienen el actor por `auth.currentUser`, `getCurrentUserInfo()`
  o `cajeroId` pasado como parámetro desde la UI.
- **Rol:** **siempre** desde `usuarios/{uid}.rol`. Cliente vía `AuthContext.usuario.rol`; servidor
  re-leyendo el doc tras `verifyIdToken`; Firestore Rules vía `get(usuarios/$(uid)).data.rol`.
  **`usuarios` es la fuente única de autorización.**
- **Negocio actual:** no se identifica. Singleton implícito `configuracion/general`. La única semilla de
  tenancy en código es el literal `empresaId: "default"` hardcodeado en `lib/inventario-ledger.ts` (ver §D-U2-3).
- **Claims:** **cero** uso de `getIdTokenResult`/`setCustomUserClaims`/`request.auth.token.*` en todo el código.
- **Índices:** 8 índices compuestos (`firestore.indexes.json`), **ninguno con `empresaId`**.
- **Superficie de rol:** ~23 chequeos de autorización dispersos en ~20 archivos TS/TSX + ~25 lecturas de
  `usuario.rol` para enmascarar UI (la cifra "13/IMP-16" del maestro está subestimada). **Ninguno conoce empresa.**
- **Discrepancia de tipo:** `'supervisor'` se usa en runtime (`esOperativo()` en rules, `ROLES_CON_TURNO`
  en `turno-gate.tsx`) pero **no** está en el tipo `RolUsuario` (`lib/auth-service.ts`).
- **Estado MT-U1:** `empresas-service.ts`/`membresias-service.ts` contienen **solo tipos**; existe
  `scripts/migrate-mt-u1-fundacional.ts` (Fase A). **No** existe `rollback-mt-u1-fundacional.ts` (desviación
  menor de MT-U1 a registrar).

---

## 2. Decisiones definitivas de MT-U2

### D-U2-1 · Fallback de empresa fundacional — **transitorio, con sunset explícito; ausencia de claim en régimen permanente = estado inválido**

**Decisión:**

1. El `SaaSContext` resuelve la empresa activa **desde el claim `empresaId` del token**. Es el camino normal.
2. **Solo durante la transición** —mientras existan tokens de usuarios aún no acuñados o no refrescados—
   se permite un **fallback de descubrimiento**: leer la única empresa existente
   (`empresas` con `esFundacional == true`, `limit(1)`), **exactamente el mismo mecanismo de descubrimiento
   ya aprobado en MT-U1 (D-U1-1)**. El cliente **no inventa** un `empresaId`: lo lee de datos autoritativos.
3. **En régimen permanente (post-despliegue de MT-U2, con claims ya acuñados), la ausencia de `empresaId`
   en el token es un ESTADO INVÁLIDO**, no un comportamiento normal. El `SaaSContext` debe:
   - distinguir el **origen** de la empresa activa: `origen: 'claim' | 'fallback'`;
   - cuando use el fallback, **marcarlo como anómalo** (flag + `console.warn`/telemetría), nunca tratarlo
     como el "camino feliz";
   - **nunca** sobreescribir un claim presente con el fallback.
4. **Sunset:** el fallback es un peldaño de transición, no permanente. Su endurecimiento a *deny* duro está
   agendado en unidades posteriores y **no** en MT-U2:
   - **MT-U4** (rules exigen `request.auth.token.empresaId`): un token sin claim ya produce *deny* en
     Firestore; el fallback de cliente deja de tener valor de rescate.
   - **MT-U5a** (custom token de código+PIN): todo token nace con claim, cerrando la ventana por diseño.
   - **MT-U11** (multi-empresa): "descubrir la única empresa" deja de ser válido conceptualmente; el
     fallback debe estar retirado antes.

**Nota de implementación (decidida en la auditoría de Capa 3):** el punto 3 exige *distinguir* el
origen (claim vs. fallback) y *marcarlo* como anómalo — no exige necesariamente **exponerlo** en el
estado público del contexto. La implementación final reduce el estado expuesto a
`{empresaId, empresa, rolClaim, loading, refresh}` (ver §3): el origen se rastrea **internamente**
dentro de `resolver()` únicamente para decidir si emitir el `console.warn` de la rama fallback: no
existe un campo `origen`/`claimsListos` en el tipo público `SaaSContextValue`. Esto satisface la
intención de D-U2-1 (nunca tratar el fallback como camino feliz, dejar rastro observable) sin ampliar
la superficie que los futuros consumidores (MT-U3+) podrían llegar a leer.

**Por qué así (y por qué no viola la regla de oro):** la regla de oro (maestro §6 / ADR-SAAS-001) es
*"el cliente nunca decide su `empresaId`; lo impone el claim"*. El fallback **no decide** nada: lee el único
tenant existente de una colección autoritativa, y solo cuando el claim aún no ha propagado. Bounded como
transitorio + tratado como inválido en régimen permanente, es una red de seguridad de despliegue, no una
fuente de tenancy paralela. Esto preserva "cero cambios visibles" durante la ventana de propagación de
tokens sin institucionalizar un camino que contradiga la arquitectura.

### D-U2-2 · Fuente de verdad del rol — **el claim es SOLO una copia de `usuarios.rol`; la autoridad sigue siendo `usuarios`**

**Decisión (invariante duro de MT-U2):**

1. Durante MT-U2 el claim `rol` es **únicamente una copia espejo** de `usuarios/{uid}.rol` al momento del
   acuñado. No es una nueva fuente.
2. **La autoridad de autorización sigue siendo `usuarios`** (y, para permisos, `usuarios.permisos` +
   `permisos_roles`), exactamente como hoy.
3. **Ningún servicio, guard, provider ni regla puede empezar a confiar en el claim en MT-U2.** El
   `SaaSContext` **expone** `rolClaim` con fin informativo/de paridad, pero **ningún consumidor cambia su
   decisión** en función de él. Los ~23 gates de rol, `auth-service`, `permisos-service` y `firestore.rules`
   permanecen intactos y siguen leyendo `usuarios`.
4. **El cambio oficial de autoridad ocurre únicamente en MT-U5b** (mover la lectura de rol/permisos a
   `Membresia`/claim en un único PR atómico, como fija MT-U1 D-U1-2 y ADR-SAAS-002).

**Consecuencia deliberada:** como nada obedece el claim, su eventual desincronización frente a `usuarios`
(p. ej. `permisos-service.actualizarRolUsuario` cambia el doc sin re-acuñar) es **cosmética** en MT-U2. Se
documenta como *"claim eventualmente consistente, no autoritativo hasta MT-U5b"* y se re-acuña por script
cuando haga falta. La coherencia dura (re-acuñar en cada cambio de rol) es responsabilidad del backend
privilegiado de MT-U5a, no de MT-U2.

### D-U2-3 · `empresaId: "default"` del inventario — **precondición obligatoria de MT-U3, NO se corrige en MT-U2**

**Hallazgo:** `lib/inventario-ledger.ts` escribe `empresaId: "default"` (literal) en cada
`MovimientoInventario`, documentado como *"Reservado multiempresa. Siempre 'default' en instalación
mono-empresa."* Este valor **no coincide** con el `id` opaco de la empresa fundacional creada por MT-U1
(D-U1-1: id de documento autogenerado, nunca un slug).

**Decisión:**

1. **MT-U2 no toca `inventario-ledger.ts`.** Fuera de alcance.
2. Se **registra formalmente como precondición obligatoria de MT-U3**: el backfill operativo de MT-U3
   (Fase B, MT-U1 §5) usa la guarda `if (!doc.data().empresaId)` y por tanto **saltaría** los movimientos
   con `"default"`, dejándolos con un `empresaId` distinto al del resto del tenant → **inconsistencia de datos**.
3. **MT-U3 deberá, antes o durante su backfill, migrar `"default"` → id opaco de la empresa fundacional.**
   Opciones a decidir en el diseño de MT-U3 (no aquí): (a) tratar `"default"` como sentinela que el backfill
   **sí** sobreescribe; y/o (b) reescribir el ledger para estampar la id resuelta en escrituras nuevas.
   MT-U1 §5 paso 7 ya obliga a *"alertar (no fallar en silencio) si algún doc ya tenía `empresaId` con otro
   valor"*: `"default"` es precisamente ese caso y debe resolverse, no ignorarse.

**Por qué no ahora:** corregirlo en MT-U2 tocaría un servicio operativo (`inventario-ledger`), lo que
violaría el alcance "solo runtime de claims/contexto, sin tocar servicios operativos". El sitio natural es
MT-U3, que es quien introduce el estampado y el backfill operativo.

### D-U2-4 · Mecanismo de acuñación de claims — **script Admin SDK (recomendado); Cloud Function diferida a MT-U5a**

**Decisión (recomendada, adoptada salvo indicación contraria):** los claims se acuñan con un **script
Admin SDK** puntual e idempotente (`firebase-admin` + `tsx` ya presentes; cero infra nueva), que funciona
con cualquier distribución (incluido el `.exe` de escritorio, que es estático `out/**` y **no ejecuta API
routes**). La **Cloud Function** que emite claims/custom tokens (destino de ADR-SAAS-002) se **adelanta
recién en MT-U5a**, cuando el custom token de código+PIN la hace inevitable. Una API route Next.js se
descarta como mecanismo único porque no corre en el artefacto de escritorio.

---

## 3. Diseño del `SaaSContext` (estado final implementado)

**Archivo nuevo:** `contexts/saas-context.tsx` — `SaaSProvider` + hook `useSaaS()`.

- **Responsabilidad:** única fuente de verdad en cliente de *"en qué empresa opero y con qué rol según el
  token"*. Resuelve `empresaId` desde el **claim** (D-U2-1) y lo enriquece con el documento
  `empresas/{empresaId}` vía **lectura directa por id** (`obtenerEmpresaPorId`, §5) — nunca por
  descubrimiento. Es el *seam* donde MT-U3+ engancharán el `empresaId` del helper de tenant.
- **Mecanismo de detección de sesión/token:** se suscribe directamente a
  `onIdTokenChanged(auth, ...)` del SDK cliente de Firebase — **no** lee `useAuthContext()`. Es el
  patrón recomendado por Firebase para reaccionar a custom claims (dispara en login, logout y
  refresh de token) y evita cualquier acoplamiento con `contexts/auth-context.tsx`, que **no se
  modificó** (ver §5).
- **Ciclo de vida:** montado **bajo `AuthProvider`** y por encima de los proveedores de datos
  (`EspaciosProvider`, `ModulosProvider`). Al recibir un `firebaseUser`:
  1. Lee el token **cacheado** (`getIdTokenResult()`, sin forzar red).
  2. Si `claims.empresaId` está ausente, fuerza **un único** refresh (`getIdTokenResult(true)`) —
     así se implementa "refrescar el token cuando corresponda" sin forzar red en cada carga.
  3. Si el claim está presente → camino normal: `empresaId`/`rolClaim` desde el claim;
     `empresa` vía `obtenerEmpresaPorId(empresaId)`.
  4. Si sigue ausente tras el refresh → fallback transitorio (D-U2-1): `console.warn` +
     `empresaId`/`empresa` resueltos vía `obtenerEmpresaFundacional()` (reservado exclusivamente a
     esta rama); `rolClaim = null`.
     > **R-6 (2026-07-26):** `obtenerEmpresaFundacional()` fue marcada `@deprecated`. El flujo de
     > login ya no depende de esta función. El fallback D-U2-1 sigue vigente en el
     > `SaaSContext`/`tenant-context.ts` únicamente para el resolvedor de sesión React, no para
     > la autenticación operativa. Ver `INVESTIGACION-R6-ESFUNDACIONAL.md`.
  Al perder la sesión (`firebaseUser == null`) se resetea todo el estado. `refresh()` fuerza
  `getIdToken(true)` y re-ejecuta la misma resolución.
- **Datos expuestos (tipo público `SaaSContextValue`, exactamente estos 5 campos):**
  ```ts
  {
    empresaId: string | null;
    empresa: Empresa | null;
    rolClaim: RolUsuario | null;
    loading: boolean;
    refresh: () => Promise<void>;
  }
  ```
  No existe `origen`/`claimsListos`/`empresaActivaId`/`empresaNombre`/`cargando` en el tipo público —
  ver nota de implementación en D-U2-1.
- **Consumidores (MT-U2):** **ninguno que cambie comportamiento** (verificado: cero imports de
  `useSaaS`/`SaaSProvider` fuera de su propia definición y del punto de montaje en `app/layout.tsx`).
  Consumidores reales previstos: MT-U3 (helper de tenant lee `empresaId`) y MT-U5b (autorización lee
  el rol).
- **Límites de responsabilidad:** (a) **no** decide el `empresaId` (D-U2-1); (b) **no** autoriza (D-U2-2);
  (c) **no** lee colecciones operativas; (d) **no** escribe claims (eso es el backend); (e) **no** conoce
  suscripciones/planes (MT-U8).

---

## 4. Claims — introducción vs. consumo (separación deliberada)

| Aspecto del claim | Unidad | En MT-U2 |
|---|---|---|
| **Acuñar** `{empresaId, rol}` y que viaje en el token | **MT-U2** | ✅ Se produce y escribe para todos los usuarios |
| **Leerlo** en cliente (`SaaSContext`, informativo/paridad) | **MT-U2** | ✅ Se lee, **no gobierna comportamiento** (D-U2-2) |
| **Consumirlo como fuente de autorización** en la app | **MT-U5b** | ❌ |
| **Consumirlo en Firestore Rules** (`request.auth.token.empresaId`) | **MT-U4** | ❌ |
| **Emitirlo vía custom token** (código+PIN) | **MT-U5a** | ❌ |

El orden MT-U2 → MT-U4 es deliberado (maestro §14): los claims deben **existir** antes de que las rules
dejen de usar `get()`.

---

## 5. Alcance exacto de archivos (estado final)

**Se crean/modifican en MT-U2:**

| Archivo | Cambio | Por qué |
|---|---|---|
| `lib/empresas-service.ts` | **Añadir** `obtenerEmpresaFundacional()` (fallback, query `esFundacional==true`/`limit(1)`) **y** `obtenerEmpresaPorId(id)` (camino normal, `getDoc` directo por id) | `obtenerEmpresaPorId` se añadió durante la auditoría de Capa 3 al detectarse que el camino con claim usaba indebidamente el helper de descubrimiento; ver [[saas-regla-esfundacional-vs-empresaid]]. |
| `lib/membresias-service.ts` | **Añadir** `obtenerMembresia(empresaId, uid)` / `obtenerMembresiasDeUsuario(uid)` | Añadidos en Capa 1 como aditivo puro (helpers de lectura previstos por MT-U1 §3). **Estado final: sin consumidor en MT-U2** — ni `scripts/set-claims-mt-u2.ts` ni `contexts/saas-context.tsx` los llaman (el acuñador resuelve el rol leyendo `usuarios` directamente; `SaaSContext` no consulta membresías). Quedan listos, inertes, para el primer consumidor real en una unidad posterior. |
| `contexts/saas-context.tsx` | **Nuevo** (§3) | Seam de empresa activa. |
| `app/layout.tsx` | **1 línea:** montar `<SaaSProvider>` bajo `AuthProvider` | Ubicación del contexto. |
| `scripts/set-claims-mt-u2.ts` | **Nuevo** (Admin SDK, dry-run/execute, idempotente) | Acuñar `{empresaId, rol}` a cada usuario (D-U2-4). |

**Corrección respecto a la versión pre-código de este documento:** `contexts/auth-context.tsx`
**NO se modificó** — la versión original de esta tabla preveía un "toque mínimo" (`getIdToken(true)`
tras login) ahí. La implementación final resolvió el refresh de claims **enteramente dentro de
`SaaSContext`** vía `onIdTokenChanged` (§3), evitando tocar el archivo compartido de autenticación.

**NO se modifican en MT-U2 (explícito, anti scope-creep):** los 25 servicios operativos, `firestore.rules`,
`auth-service` (lectores de autorización), **`auth-context.tsx`**, `permisos-service`, los ~23 gates de
rol, `configuracion-service`, **`inventario-ledger.ts`** (D-U2-3), y todo `components/`/`app/` salvo la
línea de `app/layout.tsx`.

---

## 6. Riesgos

**Técnicos**
- **R1 — Backend de acuñación:** el `.exe` es estático (`out/**`) y no ejecuta API routes → resuelto por
  D-U2-4 (script Admin SDK).
- **R2 — Claims perezosos:** un claim solo aparece tras un refresh forzado del token. Mitigación: el propio
  `SaaSContext` fuerza un único `getIdTokenResult(true)` cuando el claim cacheado falta (§3); si aun así no
  aparece, degrada al fallback transitorio (D-U2-1) sin romper sesión.
- **R3 — Desincronización claim↔`usuarios`:** cosmética en MT-U2 por D-U2-2; documentada; re-acuñada por
  script; endurecida en MT-U5a.
- **R4 — `'supervisor'` fuera del tipo `RolUsuario`:** el acuñador y el tipado del claim deben contemplarlo
  o fallará `tsc`/quedará sin claim.

**De migración**
- **R5 — `empresaId:"default"` del ledger:** precondición obligatoria de MT-U3 (D-U2-3). No bloquea MT-U2.
- **R6 — Precondición MT-U1:** MT-U2 asume `empresas/{fundacional}` existe y `nº membresias == nº usuarios`.
  Verificar Fase A ejecutada antes de acuñar.

**De compatibilidad**
- **R7 — Usuarios nuevos entre MT-U2 y re-acuñación:** `crearUsuario` no acuña claim → inofensivo ahora
  (nadie obedece el claim), pero *deny* cuando MT-U4 lo exija. Documentar; cerrar en U4/U5a.

**Regresiones**
- **R8 — Refresh mal ubicado** podría parpadear la sesión. Mitigación: refrescar sin bloquear render.
- **Neto:** como **nada consume el claim** (D-U2-2), el riesgo funcional de MT-U2 es casi nulo si el
  acuñado es correcto — misma filosofía que MT-U1.

---

## 7. Plan de implementación por capas (pequeñas, auditables, independientes)

**Capa 0 — Pre-flight (sin código).** Verificar en prod: empresa fundacional existe (`esFundacional==true`)
y `nº membresias == nº usuarios`; enumerar roles reales (¿`supervisor`?). *Aceptación:* checklist confirmado.

**Capa 1 — Helpers de lectura (aditivo puro).** `obtenerEmpresaFundacional()` + `obtenerMembresia*()`. Sin
consumidores. *Aceptación:* `tsc --noEmit` verde; cero imports desde servicios operativos.

**Capa 2 — Acuñación de claims.** `scripts/set-claims-mt-u2.ts` (dry-run por defecto, `--execute`,
idempotente): por cada `usuarios/{uid}` → `setCustomUserClaims(uid, {empresaId, rol})`, `empresaId` resuelto
de la fundacional (nunca hardcodeado), `rol` espejo del doc (D-U2-2). Reporte de divergencias/roles no
tipados (R4). *Aceptación:* dry-run revisado; ejecución acuña N usuarios; token inspeccionado muestra `{empresaId, rol}`.

**Capa 3 — `SaaSContext` (cliente).** `contexts/saas-context.tsx` (§3) montado en `app/layout.tsx`; se
suscribe a `onIdTokenChanged` y refresca el token cuando el claim cacheado falta; expone
`{empresaId, empresa, rolClaim, loading, refresh}`. Sin consumidores que cambien comportamiento.
*Aceptación (cumplida):* `useSaaS()` devuelve el `empresaId` correcto (vía claim, resuelto por
`obtenerEmpresaPorId`) tras login; POS idéntico — verificado en navegador real (login sin cambios,
consola/servidor sin errores).

**Capa 4 — Verificación de compatibilidad.** Regresión manual (venta, turno, KDS, salón) → cero cambio
observable; claims presentes y verificados en producción (7/7 usuarios, `empresaId`/`rol` exactos);
confirmado por código que el fallback (`obtenerEmpresaFundacional`) solo es alcanzable si el claim sigue
ausente tras el refresh forzado — nunca en régimen permanente con claims acuñados. *Aceptación (cumplida):*
informe de Capa 4 sin hallazgos bloqueantes; MT-U2 recomendada para merge sin tocar servicios operativos,
rules, ni la fuente de autorización.

---

## 8. Revisión cruzada de consistencia

**vs. Documento maestro (`MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`):**
- §13: *"MT-U2 | Custom claims: el token lleva `empresaId` + `rol`. Un solo tenant; los claims espejan el
  rol actual."* → **D-U2-2 es exactamente esto.** ✅
- §6 regla de oro (*el cliente nunca decide su `empresaId`*): **D-U2-1** no lo viola — el fallback **lee** el
  único tenant autoritativo, es transitorio, tratado como inválido en régimen permanente, y nunca pisa un
  claim presente. ✅
- §14 (orden MT-U2 antes de MT-U4 para evitar `get()` en rules): respetado por §4. ✅

**vs. ADR-SAAS-001 (tenancy/claims):** claims como fuente de verdad del aislamiento y "cambiar de empresa =
re-emitir token". MT-U2 acuña el claim (paso 3 del ADR) sin activar rules (paso 4 = MT-U4). D-U2-1 reconcilia
la ventana de propagación sin institucionalizar decisión de tenancy en cliente. ✅

**vs. ADR-SAAS-002 (identidad/rol):** el ADR describe el **estado final** (rol/permisos en `Membresia`).
D-U2-2 mantiene `usuarios` como autoridad hasta MT-U5b, **idéntico al peldaño ya aprobado en MT-U1 D-U1-2**
("arista pura; `usuarios` sigue siendo la única fuente hasta MT-U5b"). No contradice; es el paso intermedio. ✅

**vs. ADR-SAAS-003 (ciclo de vida/suscripciones):** MT-U2 no toca suscripciones ni estados de empresa. Sin
contradicción. ✅

**vs. ADR-SAAS-004 (modelo/config/fiscalidad):** la migración de configuración es MT-U6; la de
`empresaId:"default"` es MT-U3. D-U2-3 **difiere** explícitamente a MT-U3, coherente con el reparto del ADR.
Además honra MT-U1 §5 paso 7 (alertar ante `empresaId` con otro valor). ✅

**Sin cambios de alcance en MT-U2:** los tres ajustes son **normativos/documentales**:
- D-U2-1 acota y documenta un fallback que ya formaba parte del diseño del `SaaSContext`; el "estado
  inválido" en régimen permanente se materializa como *flag + log/telemetría* dentro del `SaaSContext` (ya
  en alcance), **no** como bloqueo de UI.
- D-U2-2 es un invariante documental; **no** añade código.
- D-U2-3 es una nota de precondición para MT-U3 y **excluye** explícitamente `inventario-ledger` de MT-U2.
- ✅ Ninguno amplía el conjunto de archivos de §5.

**Filosofía "cero cambios funcionales visibles":**
- D-U2-1: el fallback mantiene el POS operativo durante la propagación; el tratamiento de "inválido" es
  observabilidad, no UI. ✅
- D-U2-2: nada obedece el claim → imposible que cambie comportamiento. ✅
- D-U2-3: no cambia nada en MT-U2. ✅
- ✅ Se preserva "cero cambios visibles" (igual que MT-U1).

**Conclusión de la revisión cruzada:** los tres ajustes son **consistentes** con el documento maestro y con
ADR-SAAS-001…004, **no introducen cambios de alcance** y **mantienen "cero cambios funcionales visibles"**.
La especificación de MT-U2 queda **coherente y lista para congelarse como definitiva**.

---

## 9. Criterio de aceptación (resumen)

1. Claim `{empresaId, rol}` acuñado en **todos** los usuarios; `empresaId` = id opaco fundacional (resuelto,
   nunca hardcodeado); `rol` = espejo de `usuarios.rol` (D-U2-2).
2. `SaaSContext` resuelve `empresaId` desde el **claim**, leyendo el documento vía `obtenerEmpresaPorId`
   (nunca por descubrimiento); el fallback (D-U2-1, `obtenerEmpresaFundacional`) solo actúa como red
   transitoria y emite `console.warn` cuando se usa — nunca como camino feliz.
3. **Autoridad de autorización intacta:** `usuarios`, `auth-service`, `permisos-service`, los ~23 gates y
   `firestore.rules` **sin cambios**; ningún consumidor confía en el claim (D-U2-2).
4. `inventario-ledger.ts` **sin tocar**; `empresaId:"default"` registrado como precondición de MT-U3 (D-U2-3).
5. Comportamiento del POS **idéntico** (verificación manual): venta, turno, KDS, salón.
6. Scripts idempotentes con dry-run; `tsc --noEmit` + `test:tickets` + `test:reimpresion` en verde.
7. PR sin modificar servicios operativos, rules, ni la fuente de autorización — solo los archivos de §5.
