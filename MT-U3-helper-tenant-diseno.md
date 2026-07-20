# MT-U3 — Helper de Tenant en la capa de servicios (Arquitectura definitiva)

> **Estado:** ✅ Diseño congelado. Implementación por capas completa (Capa 0 a Capa 5, cada una
> auditada y aprobada). Capa 6 (verificación de compatibilidad, §9) en curso.
> **Rama:** `feature/saas-mt-u3`
> **Deriva de:** documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§6 Capa 3 y 4, §13),
> `ADR-SAAS-001` (tenancy: colecciones planas + `empresaId` + claims + rules), `ADR-SAAS-004`
> (pertenencia de datos por plano).
> **Depende de:** `MT-U1` (empresa fundacional + membresías, mergeado), `MT-U2` (claims `{empresaId,rol}`
> + `SaaSContext`, mergeado). Hereda las precondiciones **D-U1-3** (backfill operativo = paso 0 de MT-U3)
> y **D-U2-3** (`empresaId:"default"` del ledger a resolver en MT-U3).
> **Metodología:** unidad pequeña, mergeable, auditable, **sin romper producción** (igual que MT-U1/MT-U2).
> **Naturaleza:** SOLO diseño. No contiene código, migraciones ejecutables ni cambios de runtime.

MT-U3 introduce la **tercera capa de defensa en profundidad** (maestro §6): un **helper de tenant único**
que estampa `empresaId` en toda escritura y lo filtra en toda lectura desde `lib/*-service.ts`, más el
**backfill operativo** que ancla los datos históricos a la empresa fundacional. Con **un solo tenant**,
el filtro es transparente y el comportamiento del POS **no cambia**. MT-U3 **no** toca `firestore.rules`
(eso es MT-U4), **no** cambia la fuente de autorización de rol (MT-U5b) y **no** migra la configuración
(MT-U6).

---

## 0. Precondiciones verificadas contra el código (no se asume nada)

| Hecho | Evidencia en código |
|---|---|
| `SaaSContext` expone `{empresaId, empresa, rolClaim, loading, refresh}` y es inerte (0 consumidores). | `contexts/saas-context.tsx:42-53`; único import en `app/layout.tsx:5,50`. |
| Los servicios cliente ya resuelven el actor **de forma ambiental y asíncrona**, nunca por parámetro. | `getCurrentUserInfo()` lee `auth.currentUser` (`auth-service.ts:177-180`); usado en `compras-service.ts:53,216`, `mermas-service.ts:43`, `insumos-service.ts:80`, `productos-service.ts:121`. `ventas-service.ts:508` y `audit-service.ts:44-45` leen `auth.currentUser` directo. |
| `lib/firebase.ts` exporta `app`, `db`, `auth` como **singletons de módulo** (patrón ambiental ya idiomático). | `firebase.ts:15-25`. |
| El ledger estampa el literal `"default"` en **dos** sitios y **no** tiene `empresaId` en sus params. | `inventario-ledger.ts:339` (apertura lazy), `:374` (movimiento real); `EmitirMovimientoParams` (`:165-197`) sin campo `empresaId`. |
| El kardex **excluye** `empresaId` deliberadamente (K9). | `inventario-kardex.ts:78,210`. |
| El webhook de Wompi usa **Admin SDK** (`getAdminDb()`), no tiene claim, y ya carga `reservaData`. | `app/api/webhooks/wompi/route.ts:8,68-211`; lee `reservaData` (`:77`), estampa `espacioId` en venta (`:169`) y transacción (`:207`). |
| Ninguna query filtra por `empresaId` (0 ocurrencias de `where("empresaId",…)`). | Barrido completo `lib/`+`app/`+`components/`. |
| Índices actuales: 8 compuestos, ninguno con `empresaId`. | `firestore.indexes.json`. |
| Rules usan `get(usuarios/$(uid)).data.rol`; cero uso de `request.auth.token.empresaId`. | `firestore.rules:6-11`. |
| Scripts de migración siguen convención: dry-run por defecto, `--execute`, `service account` loader, `BATCH_LIMIT=500`, resolución de empresa por `esFundacional==true`. | `migrate-mt-u1-fundacional.ts`, `set-claims-mt-u2.ts:99-102`. |
| `rollback-mt-u1-fundacional.ts` y el **backfill operativo (Fase B)** **NO existen** en código. | `scripts/`: sólo Fase A; cabecera de `migrate-mt-u1-fundacional.ts:9-10`. |

---

## 1. Tenant Context — ¿cómo obtiene un servicio TS el `empresaId` sin `useSaaS()`?

### 1.1 El problema

`useSaaS()` es un hook de React (`saas-context.tsx`, `'use client'`) que sólo funciona dentro del árbol
de componentes. Pero `lib/*-service.ts` son **módulos TypeScript planos** invocados desde componentes,
otros servicios, e incluso contextos Admin SDK. No pueden llamar hooks. El maestro §6 (Capa 3) exige que
los servicios tomen `empresaId` de **"un contexto de sesión"**, no por parámetro suelto. Hay que definir
qué es ese "contexto de sesión" fuera de React.

### 1.2 Alternativas analizadas

**Alternativa A — Lectura ambiental del claim del token (recomendada).**
Un módulo nuevo `lib/tenant-context.ts` expone una función asíncrona que lee el `empresaId` directamente
del token cacheado del usuario autenticado:
`auth.currentUser.getIdTokenResult()` → `claims.empresaId`. Es **exactamente** el patrón que ya usa
`getCurrentUserInfo()` para el actor (`auth-service.ts:177-180`): lectura ambiental, asíncrona, sin
parámetros.

- **Pros:** (a) **fuente única de verdad = el claim**, idéntico a la "regla de oro" de ADR-SAAS-001 (*el
  cliente nunca decide su `empresaId`; lo impone el claim*); (b) sin estado mutable global que pueda
  desincronizarse; (c) sin acoplar servicios a React; (d) consistente con el precedente `getCurrentUserInfo`
  ya existente; (e) el token cacheado no genera lecturas de red (el SDK sólo refresca si expiró).
- **Contras:** es asíncrona (los servicios ya tienen prólogo `await`, así que encaja); requiere una única
  ruta de fallback D-U2-1 compartida para no duplicar lógica con `SaaSContext`.

**Alternativa B — Holder de módulo sincronizado por `SaaSProvider`.**
Un singleton mutable (`let empresaIdActivo`) que el `SaaSProvider` escribe en cada `onIdTokenChanged`;
los servicios lo leen de forma síncrona.

- **Pros:** lectura síncrona; reutiliza la resolución (incl. fallback) del provider.
- **Contras:** **estado global mutable** con riesgo de desincronización (un servicio que corra antes de
  que el provider hidrate leería `null`/valor viejo); dos fuentes de verdad (estado React + holder);
  no funciona en Admin SDK (no hay provider); anti-patrón respecto a la "regla de oro" (introduce un
  segundo lugar donde vive el `empresaId`).

**Alternativa C — Parámetro explícito `empresaId` en cada servicio.**
Cada función recibe `empresaId`.

- **Pros:** trivial de razonar; funciona en cliente y servidor.
- **Contras:** **prohibido explícitamente** por el maestro §6 Capa 3 (*"Los servicios no reciben
  `empresaId` suelto por parámetro"*); multiplica la superficie de error (cada llamador podría pasar un
  id equivocado → fuga); contradice el objetivo de "punto único auditable".

### 1.3 Decisión

**Se adopta la Alternativa A (lectura ambiental del claim), con una única función resolvedora compartida
entre `SaaSContext` y el helper de tenant.**

- Nuevo módulo `lib/tenant-context.ts` con el **resolvedor canónico** `resolverEmpresaIdActivo()`:
  1. `const user = auth.currentUser`; si no hay usuario → lanza (o retorna sentinela de "sin sesión",
     ver §2).
  2. `const { claims } = await user.getIdTokenResult()`.
  3. Si `claims.empresaId` presente → lo retorna (**camino normal**).
  4. Si ausente → **fallback transitorio D-U2-1**: `obtenerEmpresaFundacional()` + `console.warn`
     (idéntico criterio que `saas-context.tsx:91-108`). En régimen permanente esto es un estado anómalo,
     nunca el camino feliz.
- **`SaaSContext` se refactoriza (aditivamente) para consumir el mismo `resolverEmpresaIdActivo()`**, de
  modo que exista **una sola** ruta de resolución + fallback en todo el sistema (cliente-React y
  cliente-servicios). No cambia su API pública `{empresaId, empresa, rolClaim, loading, refresh}`.

**Justificación de consistencia:** el codebase ya trata la sesión como estado ambiental asíncrono
(`auth.currentUser`); añadir `empresaId` como otra propiedad ambiental leída del **mismo** principal de
Firebase Auth es la extensión natural, y mantiene el claim como fuente única (ADR-SAAS-001 §3).

> **Servidor (Admin SDK):** la Alternativa A no aplica (no hay `auth.currentUser`). Para esos contextos se
> usa una vía explícita **documentada como excepción** (§3.6, §4): el `empresaId` se **deriva del dato** o
> se resuelve por `esFundacional`. Esto no viola §6 porque no es un servicio cliente recibiendo un id
> suelto desde la UI, sino un backend privilegiado resolviendo el tenant de forma autoritativa.

---

## 2. Tenant Helper — el helper único

Nuevo módulo: **`lib/tenant.ts`** (nombre propuesto; hogar canónico del aislamiento por aplicación).

### 2.1 Responsabilidades (únicas)

1. **Obtener** el `empresaId` activo (delegando en `lib/tenant-context.ts`, §1).
2. **Estampar** `empresaId` en datos de escritura.
3. **Filtrar** por `empresaId` en lectura (construcción de constraints de query).

Es la **única forma válida** de hacer estas tres cosas en `lib/*-service.ts`.

### 2.2 API pública (contrato de diseño; firmas ilustrativas, no código final)

```
// --- Cliente (ambiental) ---
getEmpresaId(): Promise<string>
  // Resuelve el empresaId activo (claim → fallback D-U2-1). Lanza TenantSinSesionError
  // si no hay usuario autenticado.

stampEmpresaId<T>(data: T): Promise<T & { empresaId: string }>
  // Devuelve una copia de `data` con `empresaId` inyectado desde getEmpresaId().
  // Único punto donde se añade el campo en escrituras de servicio.

tenantWhere(): Promise<QueryConstraint>
  // Devuelve where('empresaId','==', await getEmpresaId()) para componer en queries.

tenantQuery(col, ...extraConstraints): Promise<Query>
  // Azúcar: query(col, await tenantWhere(), ...extraConstraints).
  // Impone además la política de limit() de §8/IMP-13 cuando el llamador no aporta cota.

// --- Servidor / Admin SDK (explícito, excepción documentada) ---
withEmpresaId<T>(empresaId: string, data: T): T & { empresaId: string }
  // Estampado explícito para rutas Admin (webhook, scripts). NO lee auth.currentUser.
```

### 2.3 Responsabilidades prohibidas (límites)

- **NO autoriza** — no lee ni decide rol/permisos (eso sigue en `usuarios` hasta MT-U5b).
- **NO escribe claims** — eso es el backend/script.
- **NO decide el `empresaId`** — lo lee del claim; el fallback sólo *descubre* la única empresa existente.
- **NO conoce colecciones concretas** — es agnóstico; no contiene la lista de las 25 colecciones (esa
  vive en el backfill y en cada servicio).
- **NO toca `firestore.rules`** (MT-U4), **`configuracion`** (MT-U6), **suscripciones/planes** (MT-U8).
- **NO gestiona `espacioId`** — el espacio es partición interna (ADR-SAAS-004), ortogonal al tenant.

### 2.4 Flujo interno

- **Escritura:** `servicio → stampEmpresaId(data) → getEmpresaId() → resolverEmpresaIdActivo() → set/add`.
- **Lectura:** `servicio → tenantQuery(col, extra…) → tenantWhere() → getEmpresaId() → getDocs/onSnapshot`.
- **Transacción:** el `empresaId` se resuelve **una vez, fuera** del `runTransaction` (es un valor de
  sesión estable) y se estampa dentro de cada `transaction.set` (§3.3).

### 2.5 Política de resolución del tenant

El `empresaId` se obtiene **bajo demanda** mediante el resolvedor único de tenant
(`lib/tenant-context.ts`, §1). El resolvedor utiliza el token autenticado proporcionado por Firebase
Auth y se beneficia del mecanismo de caché del SDK; **no depende de un holder mutable sincronizado por
React**.

Durante una **operación lógica** (por ejemplo, una venta, una transacción, un listener o un reporte), el
`empresaId` debe resolverse **una única vez al inicio** y reutilizarse durante toda la operación. **No**
debe resolverse repetidamente dentro de bucles, transacciones o escrituras múltiples.

Cualquier optimización futura (memoización, invalidación mediante `onIdTokenChanged`, etc.) deberá
implementarse **dentro del resolvedor**, sin modificar el contrato público del helper de tenant (§2.2).

### 2.6 Puntos de extensión

- **Multi-empresa (MT-U11):** cuando el usuario cambie de empresa activa, sólo cambia el claim → el helper
  sigue leyendo el claim vigente sin cambios de código.
- **MT-U4 (rules):** el helper ya garantiza `empresaId` en escritura y filtro en lectura → los datos
  cumplen las rules el día que se activen, sin tocar servicios.
- **MT-U5a (custom token):** el token nace con claim → el fallback D-U2-1 deja de alcanzarse; el helper no
  cambia.

---

## 3. Patrón de interacción de los servicios con el helper (no se modifica ningún servicio aún)

Regla transversal: **toda** lectura operativa pasa por `tenantQuery`/`tenantWhere`; **toda** escritura
operativa pasa por `stampEmpresaId`. Ningún servicio construye `where('empresaId',…)` ni añade el campo a
mano.

### 3.1 Lecturas (getDocs / getDoc)
- Reemplazar `query(collection(db,'x'), …)` por `await tenantQuery(collection(db,'x'), …)`.
- `getDoc(doc(db,'x',id))` (lectura puntual por id): **no** necesita filtro (el id ya identifica el doc),
  pero el consumidor **debe** verificar `snap.data().empresaId === await getEmpresaId()` cuando el id
  proviene de entrada no confiable. Con un tenant es no-op; se documenta para MT-U4.

### 3.2 Escrituras (addDoc / setDoc / updateDoc)
- `addDoc`/`setDoc` de documentos nuevos: `await stampEmpresaId(data)` antes de escribir.
- `updateDoc`: **no** re-estampa `empresaId` (es inmutable tras creación); si el update tocara `empresaId`
  sería un bug. El helper no expone forma de mutar `empresaId` en update.

### 3.3 Transacciones (`runTransaction`)
- Resolver `const empresaId = await getEmpresaId()` **antes** de abrir la transacción (valor estable de
  sesión; evita I/O dentro del bloque transaccional).
- Dentro de la transacción, estampar con la variante síncrona `withEmpresaId(empresaId, data)` en cada
  `transaction.set` de documento nuevo.
- Las **lecturas transaccionales** (`transaction.get`) siguen siendo por id (idempotencia del ledger,
  saldos) → no requieren filtro; se validará pertenencia en MT-U4.

### 3.4 Listeners (`onSnapshot`)
- Igual que 3.1: `onSnapshot(await tenantQuery(col, …), cb)`. El `empresaId` se resuelve al montar el
  listener; como el claim es estable durante la sesión, no hay necesidad de re-suscribir salvo cambio de
  empresa (MT-U11), que ya re-emite token y re-monta el árbol.

### 3.5 Operaciones batch (`writeBatch`)
- **No hay `writeBatch` en el código de servicios** (verificado); todo lo atómico usa `runTransaction`. Si
  MT-U3 introdujera un batch en el backfill (Admin SDK), aplica la vía explícita (§3.6). Se documenta el
  patrón por si un servicio futuro lo usa: estampar con `withEmpresaId` cada `batch.set`.

### 3.6 Operaciones Admin SDK (webhook, scripts, notificaciones)
- **No usan el helper cliente.** Resuelven el tenant de forma explícita:
  - **Webhook Wompi:** deriva `empresaId` del `reservaData` cargado (§4).
  - **Scripts/backfill:** resuelven por `esFundacional==true` (patrón `set-claims-mt-u2.ts:99-102`).
  - **`notificaciones-push`:** hoy sólo lee `usuarios` (global) → sin cambios en MT-U3.
- Estampan con `withEmpresaId(empresaIdResuelto, data)`.

---

## 4. Webhook de Wompi — estrategia de resolución de tenant

### 4.1 Diagnóstico
`app/api/webhooks/wompi/route.ts` corre **server-side con Admin SDK** (`getAdminDb()`), disparado por
Wompi: **no tiene** `auth.currentUser` ni claim, y **evade Firestore Rules** por diseño del Admin SDK
(MT-U4 no lo protegerá). En una transacción escribe: `reservas`, `agendas`, `configuracion/general`
(consecutivo), `ventas`, `cuentas_bancarias`, `transacciones_financieras`.

### 4.2 Decisión
**El tenant se deriva del documento `reservas/{reservaId}` que el webhook ya carga** (`route.ts:70-77`):
tras el backfill, `reservaData.empresaId` existe. Ese `empresaId` se propaga a **todas** las escrituras
que el webhook crea a nombre de la empresa: la `venta` (`:164`), el doc de `agendas` (`:151`), y la
`transaccion_financiera` (`:197`). La `reserva` misma ya lo tiene.

- **Precondición:** el backfill (Fase B) debe estampar `reservas` **antes** de que el webhook empiece a
  leer `empresaId` de ellas. Como el webhook hoy funciona sin `empresaId`, el orden es seguro: primero
  backfill, luego el webhook empieza a estampar (mismo despliegue, §9).
- **Reserva legacy sin `empresaId`** (creada entre backfill y despliegue, o edge): **fallback** a la
  empresa fundacional (`esFundacional==true`) con `console.warn`, idéntico criterio D-U2-1. Nunca aborta
  el pago.

### 4.3 Justificación
- El webhook actúa **sobre datos de una empresa concreta** (la reserva); el tenant es una propiedad **del
  dato**, no de una sesión → derivarlo del dato es la fuente autoritativa correcta, no una adivinación.
- No introduce claims ni sesión falsa en un contexto sin usuario.
- Es robusto a multi-empresa (MT-U11): cada reserva conoce su empresa.

### 4.4 Fuera de alcance de MT-U3 (se documenta como deuda)
- `configuracion/general` (consecutivo) sigue **global** hasta MT-U6 (numeraciones por empresa). El webhook
  seguirá incrementando el consecutivo global; correcto con un tenant.
- Cuentas hardcodeadas (`'bancolombia'`, `espacioId:'salas-coworking'`) son supuestos mono-tenant
  preexistentes; **no** se corrigen en MT-U3 (no son aislamiento por `empresaId`). Se registran.

### 4.5 Prerrequisito obligatorio de activación — reservas públicas sin sesión (hallazgo de auditoría Capa 3)

> **Origen:** auditoría de cierre de Capa 3 (servicios). Se registra aquí porque afecta directamente el
> diseño de Capa 4 (este webhook) y la condición de arranque de Capa 5 (activación), no la implementación
> de servicios ya cerrada.

**El supuesto de §4.2 ("la reserva misma ya lo tiene") es válido solo para reservas ya ancladas por el
backfill o creadas por una vía que estampe `empresaId`. Hoy esa vía no existe para el flujo público.**

- `getBloquesOcupados`, `crearReservaConHold`, `confirmarAgenda` y `liberarAgenda`
  (`lib/reservas-service.ts`) corren desde la landing pública `/reservar` **sin sesión de Firebase Auth**
  — `firestore.rules` admite `agendas`/`reservas.create` a anónimos con validación de forma, por diseño
  (es la vía de reserva del cliente final, sin login).
- El helper de tenant (§1–§2) resuelve `empresaId` leyendo `auth.currentUser.getIdTokenResult()`. **Sin
  usuario autenticado no hay claim que leer** → el helper ambiental **no puede** resolver `empresaId` en
  este flujo. Por diseño (Capa 3), estas escrituras **no** llaman a `stampEmpresaId`/`getEmpresaId` — de lo
  contrario cada visitante anónimo produciría `TenantSinSesionError` y rompería la reserva pública.
- Consecuencia: toda reserva pública creada **después** de que el backfill (Capa 5, puntual) haya
  corrido queda sin `empresaId`. El backfill solo ancla el histórico en el instante en que se ejecuta; no
  cubre las reservas que se sigan creando por esta vía.

**Antes de activar los filtros multiempresa (Capa 5) es obligatorio definir y resolver:**

1. **El mecanismo que asigna `empresaId` a una reserva pública en el momento de su creación** (una vía no
   ambiental — p. ej. Admin SDK detrás de una ruta de servidor, o equivalente — ya que el cliente anónimo
   no porta un claim del que derivarlo). Esta capa no diseña esa solución; solo dispone que debe existir
   antes de activar.
2. **El webhook de Wompi (Capa 4) debe preservar ese `empresaId`**, no asumir que ya está presente sin
   verificarlo: la decisión de §4.2 de "derivar el tenant de `reservaData.empresaId`" sigue siendo correcta
   como estrategia, pero depende de que el punto (1) exista y lo haya poblado. El fallback a la empresa
   fundacional (§4.2) es aceptable como transitorio **con un solo tenant**, pero dejaría de ser correcto en
   cuanto exista una segunda empresa (asignaría reservas de la empresa B a la empresa A).
3. **El comportamiento de las reservas públicas que nunca llegan a pagarse** (holds expirados, reservas
   canceladas antes de que el webhook dispare) debe quedar definido explícitamente. Estas reservas nunca
   pasan por el webhook, por lo que el mecanismo del punto (1) es su **única** vía de obtener `empresaId`
   — no hay una segunda oportunidad de estampado más adelante en su ciclo de vida.

**Este apartado no bloquea el cierre de Capa 3** (aprobada; ver auditoría) **ni por sí solo autoriza el
diseño de Capa 4**: registra una condición de arranque que Capa 4/5 deben resolver explícitamente antes de
activar filtros/estampado en producción. Sin resolver, la activación introduciría una regresión funcional
visible: reservas públicas nuevas desaparecerían de `suscribirReservasActivas` (POS/Admin) y sus holds
expirados dejarían de limpiarse automáticamente.

### 4.6 Resolución implementada (Capa 4) y su naturaleza transitoria

**Estado:** §4.5 punto 1 quedó resuelto en Capa 4 (aprobada, auditoría de cierre). Se documenta aquí,
explícitamente, la naturaleza de esa resolución para que la transición a multi-empresa (MT-U11) no dependa
de la memoria de esta implementación ni quede solo implícita en el código.

- **Mecanismo implementado:** `app/api/reservas/hold/route.ts` y `app/api/reservas/disponibilidad/route.ts`
  (Admin SDK, sin sesión) y el fallback del webhook de Wompi (§4.2) resuelven `empresaId`
  **exclusivamente por `esFundacional==true`** — la misma consulta que usan los scripts de migración
  (`empresas.where('esFundacional','==',true).limit(1)`).
- **Es deliberadamente una solución de modo mono-tenant, no la arquitectura final.** Es correcta y
  suficiente mientras exista una sola empresa en el sistema (alcance completo de MT-U3), porque en ese
  régimen "la empresa fundacional" y "la única empresa que existe" son el mismo conjunto. Deja de serlo en
  el instante en que exista una segunda empresa: **toda reserva pública nueva de cualquier empresa se
  asignaría a la fundacional**, sin importar en qué sala/espacio se reservó — una fuga de aislamiento, no
  un caso límite.
- **MT-U11 (multi-empresa) deberá sustituir este mecanismo antes de habilitar una segunda empresa.** La
  fuente correcta de tenant en ese régimen es la **entidad de negocio reservada**, no una consulta global:
  `mesaId` (o el `espacioId` que la contiene) ya pertenece a una empresa concreta vía su propio `empresaId`
  (§7.1). El reemplazo consiste en: (a) las rutas públicas derivan `empresaId` leyendo el documento
  `mesas/{mesaId}` (o `espacios/{espacioId}`) referenciado, en vez de consultar `esFundacional`; (b) el
  fallback del webhook deja de tener sentido una vez que toda reserva nace con el `empresaId` correcto por
  esta vía — se retira, no se generaliza.
- **Qué NO cambia con ese reemplazo:** el patrón arquitectónico (Admin SDK explícito, vía no ambiental,
  §3.6) se mantiene igual; solo cambia **de dónde** se lee el `empresaId` (de una mesa/espacio concretos en
  vez de "la única empresa que hay"). No es una revisión de diseño, es sustituir la fuente del dato.
- **No bloquea MT-U3.** Con un solo tenant el comportamiento es correcto y ya fue auditado. Se registra
  como precondición de MT-U11, no como deuda de esta unidad.

---

## 5. Ledger — migración definitiva de `empresaId:"default"`

### 5.1 Estrategia
Doble acción **obligatoria** (D-U2-3 exige ambas, no una):

1. **Reescritura del ledger (escrituras nuevas):** añadir `empresaId` a `EmitirMovimientoParams`
   (`inventario-ledger.ts:165-197`) y sustituir los literales `"default"` de `:339` y `:374` por el valor
   recibido. Cada llamador (`ventas-service`, `compras-service`, `mermas-service`, `productos-service`,
   `insumos-service`) resuelve `empresaId` con `getEmpresaId()` **antes** de abrir su `runTransaction` y lo
   pasa por params (dentro de una transacción no puede leerse el token de forma limpia; el valor es de
   sesión y estable).
2. **Backfill (datos históricos):** remapear los movimientos con `empresaId:"default"` (o ausente) al id
   opaco fundacional. La guarda estándar `if (!doc.empresaId)` **no basta** para `movimientos_inventario`
   porque el campo existe con valor `"default"`; la guarda específica es
   `if (!empresaId || empresaId === 'default')`.

### 5.2 Compatibilidad
- El campo `empresaId` ya existe en el tipo `MovimientoInventario` (`:76`) → no hay cambio de forma, sólo
  de valor. El kardex (`inventario-kardex.ts`) proyecta sin `empresaId` (K9); se le añade el filtro
  `where('empresaId','==',…)` en su lectura (`:695` del ledger / lecturas del kardex) como cualquier otra
  colección.
- El estampado nuevo no altera `claveIdempotencia` ni `secuenciaArticulo` → append-only intacto (I1/I2),
  reintentos idempotentes sin cambio.

### 5.3 Rollback
- Reescritura: revertible por código (git).
- Backfill: el `rollback` restaura `empresaId:"default"` en `movimientos_inventario` (o `FieldValue.delete()`
  según se decida por colección) y borra `empresaId` del resto — parte del `rollback-mt-u1-fundacional.ts`
  a crear (§6.6).

### 5.4 Orden de ejecución
`(1)` reescritura del ledger mergeada → `(2)` backfill de `movimientos_inventario` con remapeo → `(3)`
activación del estampado (mismo despliegue). El backfill del ledger precede al del resto por ser P0.

---

## 6. Backfill (Fase B) — diseño completo (no se implementa)

Nuevo script: **`scripts/migrate-mt-u3-operativo.ts`** (+ `scripts/rollback-mt-u3-operativo.ts`).
Sigue la convención del repo (`migrate-mt-u1-fundacional.ts`, `set-claims-mt-u2.ts`): Admin SDK, dry-run
por defecto, `--execute` explícito, `service account` loader, `BATCH_LIMIT=500`.

### 6.1 Algoritmo
1. Resolver `empresaId` leyendo `empresas` con `esFundacional==true` (`limit(1)`); abortar si no existe.
2. Para cada colección de la lista oficial (§7):
   - Paginar en lotes ≤500 ordenados por `__name__` (doc id) con `startAfter(lastDoc)`.
   - Por doc, aplicar la **guarda de idempotencia por colección**:
     - General: `if (!doc.data().empresaId)` → estampar.
     - `movimientos_inventario`: `if (!empresaId || empresaId === 'default')` → remapear (§5).
   - Acumular en `writeBatch`; `commit()` al llegar a 500; reabrir batch.
3. Emitir reporte final (§6.7).

### 6.2 Paginación
`orderBy(__name__)` + `startAfter(últimoDocDelLote)`; cursor persistible para reanudación. Nunca cargar una
colección completa en memoria.

### 6.3 Idempotencia
La guarda de existencia hace que N ejecuciones == 1 (incluye reintentos). Un doc ya estampado se salta.
Reescribir un doc con el mismo `empresaId` es no-op.

### 6.4 Reanudación
Ante fallo parcial, re-ejecutar: los docs ya estampados se saltan por la guarda; el cursor puede
reiniciarse desde el principio sin daño (idempotente) o desde el último cursor persistido (más rápido).

### 6.5 Validaciones
- **Pre:** existe empresa fundacional; conteo de docs por colección (baseline).
- **Durante:** por cada doc con `empresaId` **distinto** de fundacional y **distinto** de `"default"` →
  **alertar, no sobreescribir** (MT-U1 §5 paso 7): es una anomalía que requiere intervención humana.
- **Post:** por colección, `docs sin empresaId == 0` y `docs con empresaId≠fundacional == 0` (salvo
  anomalías reportadas). Este check es la **condición de arranque** de la activación del filtro (§9).

### 6.6 Rollback
`rollback-mt-u3-operativo.ts`: por colección, `FieldValue.delete()` del campo `empresaId` (y en
`movimientos_inventario`, restaurar `"default"`). Dry-run por defecto. **Debe crearse** (hoy no existe ni
el de MT-U1).

### 6.7 Logging y métricas
Reporte por colección: `{ tocados, saltados_ya_estampados, anomalías: [{docId, empresaIdPrevio}], errores }`
+ totales globales + modo (DRY-RUN/EXECUTE) + duración. Formato consistente con `imprimirReporte()` de los
scripts existentes.

---

## 7. Colecciones — lista oficial definitiva de MT-U3

Reconciliación código ↔ documentación (la lista de docs difería en 4 entradas):
- ❌ `proveedores`: **no es colección** (campo embebido en `compras`). Se elimina de la lista.
- ❌ `cuentas_cobro`: **no es colección** (es `metodoPago=='cuenta_cobro'` sobre `ventas`). Se elimina.
- ✅ `modificador_grupos`: colección real omitida en las listas (usa constante `COLLECTION_NAME`). Se añade.
- ✅ `producto_modificador_grupos`: colección real. Se añade.

### 7.1 Colecciones operativas empresa-scoped (25) — SÍ ganan `empresaId` en MT-U3

`espacios`, `categorias`, `productos`, `insumos`, `recetas`, `mesas`, `pedidos_activos`,
`comandas_cocina`, `ventas`, `turnos`, `turnos_activos`, `reservas`, `agendas`, `compras`, `mermas`,
`egresos`, `clientes`, `cuentas_bancarias`, `transacciones_financieras`, `liquidaciones`, `consignadores`,
`movimientos_inventario`, `auditoria_logs`, `modificador_grupos`, `producto_modificador_grupos`.

> Notas de forma: `turnos_activos` (doc id = `cajeroId`), `agendas` (doc id = `{mesaId}_{fechaLocal}`) y
> `movimientos_inventario` (doc id = `claveIdempotencia`, remapeo desde `"default"`) igualmente ganan el
> **campo** `empresaId`; el doc id no cambia.

### 7.2 Globales — NO ganan `empresaId` en MT-U3

- `usuarios` (identidad global), `permisos_roles` (plantilla de plataforma), `empresas`, `membresias`
  (ya modeladas), `eventos` (decisión de producto pendiente, maestro §16).
- `configuracion` (doc `general`): singleton; su migración a `configuraciones/{empresaId}` es **MT-U6**.

Esta §7 es la **fuente oficial** para el backfill (§6) y para el conjunto de servicios a modificar (§3).

---

## 8. Índices — estrategia definitiva

**Principio:** al anteponer `empresaId` a toda query filtrada/ordenada, casi cada query compuesta necesita
un índice compuesto nuevo. Se **planifica el set completo antes de codificar** (maestro §14: riesgo de
explosión de índices y límite por proyecto).

### 8.1 Índices a modificar (prepend `empresaId` a los 6 compuestos operativos existentes)
- `movimientos_inventario`: `(empresaId, articuloTipo, articuloId, secuenciaArticulo)`.
- `ventas`: `(empresaId, estado, fecha)` y `(empresaId, espacioId, fecha desc)`.
- `compras`: `(empresaId, espacioId, fecha desc)`.
- `mermas`: `(empresaId, espacioId, fecha desc)`.
- `espacios`: `(empresaId, activo, orden)`.
- `reservas`: `(empresaId, mesaId, estadoReserva, fechaInicio)`.
- `eventos`: **sin cambio** (global; no gana `empresaId`).

### 8.2 Índices nuevos a crear
Uno por cada query compuesta que hoy resuelve con índice single-field automático y que, al ganar
`empresaId`, se vuelve compuesta. Como mínimo (derivado del inventario de queries): `categorias`
`(empresaId, espacioId, activo, orden)`; `transacciones_financieras` `(empresaId, fecha)`; `turnos`
`(empresaId, cajeroId, estado)` y `(empresaId, fechaApertura desc)`; `pedidos_activos`/`comandas_cocina`
`(empresaId, espacioId, …)`; `productos`/`insumos` `(empresaId, espacioId, activo)`;
`producto_modificador_grupos` y `modificador_grupos` `(empresaId, espacioId/productoId, activo)`;
`liquidaciones` `(empresaId, consignadorId)`. El set exacto se cierra construyendo cada query con su
constraint final en Capa 1 y dejando que el emulador/consola de Firestore reporte los índices faltantes.

### 8.3 Orden de despliegue
Los índices se **crean y quedan `Enabled` en Firestore ANTES** de activar los filtros en runtime (una query
con filtro sin índice falla en runtime). Secuencia: `(1)` desplegar `firestore.indexes.json` y esperar
build → `(2)` backfill → `(3)` activar filtros/estampado. Esto encaja en el "paso 0" de §9.

### 8.4 Riesgos
- Límite de índices compuestos por proyecto: contabilizar el total (existentes + nuevos) antes; si se
  acerca al límite, consolidar queries.
- Tiempo de build de índices sobre colecciones grandes (`ventas`, `movimientos_inventario`): planificar
  ventana; el build no bloquea escrituras pero sí la disponibilidad de la query.

---

## 9. Implementación por capas (definitiva)

Metodología de aprobación por capa (una capa cierra con resumen/archivos/decisiones/riesgos/auditoría y
**gate de aprobación explícito** antes de la siguiente).

### Capa 0 — Reconciliación, índices y scripts (sin runtime)
- **Objetivo:** dejar lista toda la infraestructura no-runtime.
- **Alcance:** congelar §7 (lista de colecciones); redactar `firestore.indexes.json` con el set completo
  (§8); escribir `migrate-mt-u3-operativo.ts` + `rollback-mt-u3-operativo.ts` (§6) y validarlos en
  **dry-run** contra producción; escribir `rollback-mt-u1-fundacional.ts` pendiente.
- **Dependencias:** MT-U1/MT-U2 mergeados (✅).
- **Aceptación:** dry-run del backfill revisado y aprobado contigo; `tsc --noEmit` + tests en verde;
  índices desplegados y `Enabled`.
- **Auditoría:** la lista de colecciones del script == §7; guardas de idempotencia correctas (incl.
  `"default"`); cero escrituras en dry-run.
- **Gate → Capa 1:** índices `Enabled` + scripts aprobados en dry-run.

### Capa 1 — Tenant context + helper (aditivo puro, sin consumidores)
- **Objetivo:** crear `lib/tenant-context.ts` (§1) y `lib/tenant.ts` (§2); refactor de `SaaSContext` para
  compartir el resolvedor.
- **Alcance:** sólo estos módulos; **cero** servicios modificados aún.
- **Dependencias:** Capa 0.
- **Aceptación:** `tsc` verde; tests unitarios del helper (estampado/filtro/fallback); cero imports desde
  servicios operativos; POS idéntico (SaaSContext sin cambio de API).
- **Auditoría:** helper no autoriza, no escribe claims, no conoce colecciones; `SaaSContextValue` sin
  cambios.
- **Gate → Capa 2:** helper mergeable e inerte.

### Capa 2 — Ledger primero (P0)
- **Objetivo:** eliminar `empresaId:"default"` (§5).
- **Alcance:** `EmitirMovimientoParams` + `:339/:374`; los 5 llamadores del ledger pasan `empresaId`
  resuelto; kardex gana filtro.
- **Dependencias:** Capa 1.
- **Aceptación:** movimientos nuevos con id fundacional; kardex filtra; ventas/compras/mermas idénticas en
  regresión manual.
- **Auditoría:** ningún literal `"default"` en el ledger; `empresaId` resuelto fuera de la transacción.
- **Gate → Capa 3:** ledger multi-tenant-ready sin cambio observable.

### Capa 3 — Estampado + filtrado en servicios + IMP-13
- **Objetivo:** aplicar el helper a los 25 colecciones vía sus servicios.
- **Alcance:** los 28 archivos de servicio (lecturas → `tenantQuery`; escrituras → `stampEmpresaId`;
  transacciones → `withEmpresaId`). Cierre de IMP-13 con la política de `limit()` de §9.1.
- **Dependencias:** Capa 2 + índices (Capa 0).
- **Aceptación:** cada colección con lectura filtrada y escritura estampada; regresión funcional nula con 1
  tenant; cero `where` sin `empresaId`; fix del `limit()` condicional en `ventas-service` (rango de fechas).
- **Auditoría:** grep de `where(` en servicios → todos vía helper; grep de escrituras → todas vía helper.
- **Gate → Capa 4:** servicios tenant-aware, con estampado inactivo hasta el backfill.

### Capa 4 — Webhook Wompi + rutas Admin
- **Objetivo:** estampar tenant en escrituras server-side (§4).
- **Alcance:** `wompi/route.ts` deriva `empresaId` de la reserva y lo propaga a venta/agenda/transacción.
- **Dependencias:** Capa 3.
- **Prerrequisito obligatorio (§4.5, hallazgo de auditoría Capa 3):** antes de dar por cerrada esta capa
  debe estar resuelto el mecanismo que asigna `empresaId` a las reservas creadas por el flujo público
  (`crearReservaConHold`, sin `auth.currentUser`) — el webhook no puede simplemente asumir que
  `reservaData.empresaId` existe si nada lo estampó antes. Debe quedar definido también el comportamiento
  de las reservas públicas que nunca llegan a pagarse (nunca pasan por este webhook).
- **Aceptación:** pago de reserva genera venta/transacción con `empresaId` correcto; fallback a fundacional
  para reservas legacy con warn; mecanismo de estampado para reservas públicas (§4.5) resuelto y verificado,
  no solo el camino ya-pagado.
- **Gate → Capa 5:** todas las vías de escritura (cliente + servidor + landing pública) estampan.

### Capa 5 — Backfill + activación (paso 0 del despliegue)
- **Objetivo:** anclar datos históricos y encender el aislamiento en un mismo despliegue (sin ventana,
  D-U1-3).
- **Alcance:** ejecutar `migrate-mt-u3-operativo.ts --execute` (incl. remapeo del ledger) **inmediatamente
  antes** de desplegar el build con filtros/estampado activos.
- **Dependencias:** Capas 1–4 mergeadas; índices `Enabled`; **§4.5 resuelto** (el backfill ancla el
  histórico una sola vez — no cubre reservas públicas creadas después de activar; si §4.5 sigue abierto,
  activar reproduce el hallazgo de auditoría como regresión visible en el módulo de reservas).
- **Aceptación:** `docs sin empresaId == 0` por colección; POS idéntico verificado (venta, turno, KDS,
  salón, reserva web, **incluida una reserva pública nueva post-activación**).
- **Gate → Capa 6:** aislamiento por aplicación activo, cero regresión.

### Capa 6 — Verificación de compatibilidad
- **Objetivo:** confirmar "cero cambios visibles" y dejar constancia para MT-U4.
- **Alcance:** regresión manual completa + verificación en navegador real; informe de cierre.
- **Aceptación:** informe sin hallazgos bloqueantes; PR sin tocar `firestore.rules`, ni autorización de rol,
  ni `configuracion`.

**Regla de orden dura (no negociable):** índices `Enabled` → backfill (`--execute`) → activación de
filtros/estampado, **en ese orden y en el mismo despliegue**. Activar un filtro `where('empresaId',…)`
antes del backfill haría desaparecer de la UI los documentos históricos sin `empresaId` → **regresión
visible**.

---

## 10. Matriz de riesgos (actualizada)

| # | Riesgo | Clase | Mitigación |
|---|---|---|---|
| R1 | Activar filtros antes del backfill → docs históricos desaparecen de la UI | **Bloqueante** | Regla de orden dura §9 (índices→backfill→filtros, mismo despliegue). |
| R2 | `empresaId:"default"` del ledger no remapeado → inconsistencia | **Bloqueante** | Doble acción §5 (reescritura + backfill con guarda `=== 'default'`). |
| R3 | Backfill y rollbacks inexistentes | **Bloqueante** | Escribirlos y validarlos en dry-run en Capa 0. |
| R4 | Fuente de tenant para servicios no-React indefinida | **Bloqueante (resuelto en diseño)** | §1 Alternativa A (lectura ambiental del claim, resolvedor compartido). |
| R5 | Webhook Wompi sin claim/rules | **Importante** | §4: derivar `empresaId` de la reserva; fallback fundacional. |
| R6 | Explosión de índices / límite Firestore / tiempo de build | **Importante** | §8: planificar set completo, desplegar y esperar `Enabled` antes de filtrar. |
| R7 | IMP-13: `limit()` cambia comportamiento visible en listeners no acotados | **Importante** | Añadir `empresaId` siempre (invisible); `limit()` sólo donde no cambia el resultado observado hoy, o cota generosa > volumen actual; documentar lo diferido. Incluye fix del `limit()` condicional de `ventas-service`. |
| R8 | Aislamiento sólo de aplicación hasta MT-U4 (rules aún permiten cross-tenant) | **Menor (por diseño)** | No crear 2º tenant antes de MT-U4; comunicar en el PR. |
| R9 | Colecciones grandes (`ventas`, `movimientos_inventario`) en backfill | **Menor** | Paginación ≤500 + idempotencia reanudable. |
| R10 | Anomalías de `empresaId` con otro valor durante backfill | **Menor** | Alertar, no sobreescribir (§6.5); intervención humana. |
| R11 | `RolUsuario` sin `'supervisor'` | **Menor** | Fuera de alcance MT-U3 (no toca roles); registrado como deuda. |
| R12 | `configuracion/general` consecutivo sigue global (webhook y ventas) | **Menor (por diseño)** | Diferido a MT-U6; correcto con 1 tenant. |
| R13 | Reservas públicas (`crearReservaConHold`, sin `auth.currentUser`) no tienen vía de estampado de `empresaId`; el backfill (puntual) no cubre las creadas después de activar | **Bloqueante para Capa 5** | §4.5: definir el mecanismo antes de activar filtros; gate explícito en Capa 4/5 (§9). Hallazgo de auditoría de cierre de Capa 3. |

---

## 11. Compatibilidad

### 11.1 Cero cambios funcionales visibles
Con **un solo tenant**, todo doc tiene el mismo `empresaId` → `where('empresaId','==',fundacional)`
devuelve exactamente el mismo conjunto que hoy. El estampado añade un campo con valor constante (no-op
funcional). La regla de orden §9 garantiza que nunca exista un instante con filtro activo sobre datos sin
estampar. Verificación manual obligatoria en Capa 5/6 (venta, turno, KDS, salón, reserva web).

### 11.2 Compatibilidad con MT-U2
- `SaaSContextValue` **no cambia** su API pública (§1.3); sólo comparte el resolvedor internamente.
- El claim `{empresaId, rol}` sigue siendo la fuente; el helper lo **consume** (era el consumidor previsto
  en MT-U2 §3). `rolClaim` sigue informativo (no se autoriza con él).
- El fallback D-U2-1 se mantiene, ahora centralizado y reutilizado.

### 11.3 Compatibilidad con MT-U4 (rules)
MT-U3 deja **todos** los docs con `empresaId` (escritura estampada) y **todas** las lecturas filtradas →
el día que MT-U4 active `resource.data.empresaId == request.auth.token.empresaId` (lectura) y
`request.resource.data.empresaId == ...` (escritura), los datos y las queries **ya cumplen**, sin tocar
servicios. MT-U3 es el habilitador directo de MT-U4.

### 11.4 Compatibilidad con MT-U5 (a/b)
- El helper lee **`empresaId`** del claim, no el `rol` → indiferente a que MT-U5b mueva la autoridad de rol
  a `Membresia`/claim.
- MT-U5a (custom token código+PIN) hará que todo token nazca con claim → el fallback D-U2-1 deja de
  alcanzarse; el helper no cambia (misma lectura del claim).

### 11.5 Compatibilidad con MT-U6 (config/numeraciones)
MT-U3 **no** toca `configuracion` ni introduce `numeraciones`. El webhook y las ventas siguen usando el
consecutivo global `configuracion/general` hasta que MT-U6 lo migre. El helper es agnóstico a esa colección
(no la scoping).

---

## 12. Resumen de decisiones tomadas

1. **Tenant context (§1):** lectura **ambiental del claim** (`auth.currentUser.getIdTokenResult()`) vía
   `lib/tenant-context.ts`, con **un resolvedor compartido** por `SaaSContext` y el helper. Descartadas: el
   holder de módulo mutable (desincronización) y el parámetro explícito (prohibido por §6). Justificada por
   el precedente `getCurrentUserInfo` y la regla de oro de ADR-SAAS-001.
2. **Tenant helper (§2):** `lib/tenant.ts`, único punto para obtener/estampar/filtrar `empresaId`; API
   `getEmpresaId`, `stampEmpresaId`, `tenantWhere`, `tenantQuery` (cliente) + `withEmpresaId` (servidor).
   Prohibido: autorizar, escribir claims, decidir el id, conocer colecciones, tocar rules/config.
3. **Servicios (§3):** patrón uniforme para lecturas, escrituras, transacciones y listeners; batch no
   existe; Admin SDK usa la vía explícita.
4. **Webhook Wompi (§4):** el tenant se **deriva de la reserva referenciada** y se propaga a sus
   escrituras; fallback a fundacional para reservas legacy.
5. **Ledger (§5):** doble acción — reescribir params + eliminar `"default"` (`:339/:374`) y remapear en el
   backfill con guarda `=== 'default'`.
6. **Backfill (§6):** `migrate-mt-u3-operativo.ts` + rollback; paginado ≤500, idempotente, reanudable, con
   validaciones/alertas y reporte; **paso 0 del despliegue** (sin ventana).
7. **Colecciones (§7):** lista oficial de **25** operativas (quita `proveedores`/`cuentas_cobro`; añade
   `modificador_grupos`/`producto_modificador_grupos`); globales y `configuracion` excluidas.
8. **Índices (§8):** modificar 6 compuestos (prepend `empresaId`) + crear los nuevos; desplegar y esperar
   `Enabled` **antes** de filtrar.
9. **Capas (§9):** 0 (infra) → 1 (helper) → 2 (ledger) → 3 (servicios+IMP-13) → 4 (Admin/webhook) → 5
   (backfill+activación) → 6 (verificación), con gate de aprobación por capa y regla de orden dura.
10. **IMP-13 (§10 R7):** `empresaId` siempre; `limit()` sólo donde no cambia el resultado observado; incluye
    fix del `limit()` condicional de `ventas-service`.

## 13. Decisiones pendientes

- **Ninguna decisión arquitectónica de MT-U3 queda abierta.** Los detalles residuales son de
  implementación, no de arquitectura:
  - Set **exacto** de índices nuevos (§8.2): se cerró construyendo cada query final en Capa 3 (no en
    Capa 1, como se anticipaba aquí — los servicios, y por tanto sus queries finales, no existían todavía
    en Capa 1). Resultado: 22 índices en `firestore.indexes.json`, auditados sin duplicados ni faltantes.
    No requirió nueva decisión arquitectónica.
  - Umbral concreto de `limit()` por listener (§10 R7): parámetro de implementación dentro de la política
    ya decidida.
- **Deuda fuera de alcance (registrada, no bloquea):** `RolUsuario` sin `'supervisor'` (R11); cuentas
  hardcodeadas del webhook y consecutivo global (R12, → MT-U6); rules de `modificador_grupos`/
  `producto_modificador_grupos` (→ MT-U4).

## 14. Estado de congelación

La arquitectura de MT-U3 queda **CONGELADA**. La implementación por capas (Capa 0 a Capa 5) está completa,
cada una auditada y aprobada de forma independiente antes de iniciar la siguiente. La implementación no
requirió tomar nuevas decisiones arquitectónicas importantes — los únicos ajustes fueron el registro de
§4.5/§4.6 (prerrequisito de reservas públicas, hallazgo de la auditoría de Capa 3, resuelto en Capa 4) y
la corrección de referencia de §13 (índices cerrados en Capa 3, no en Capa 1). Ninguno contradice una
decisión de un ADR-SAAS existente. Cualquier cambio que sí lo hiciera exigiría justificación explícita y,
si toca una decisión de un ADR-SAAS, un nuevo ADR que lo supere.

> **Siguiente paso:** Capa 6 (verificación de compatibilidad, §9) — regresión manual completa y
> verificación en navegador real, a ejecutar cuando se active MT-U3 en el entorno correspondiente (ver
> `MT-U3-CAPA5-runbook-activacion.md`). No se ha hecho commit/push/PR/merge de ninguna capa — todo el
> trabajo de MT-U3 permanece en el árbol de trabajo de `feature/saas-mt-u3`, pendiente de autorización
> explícita para confirmar.
