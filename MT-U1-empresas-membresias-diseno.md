# MT-U1 — Empresas y membresías + backfill fundacional (Especificación definitiva)

> **Estado:** ✅ Especificación definitiva, lista para implementar.
> **Rama:** `feature/saas-mt-u1`
> **Deriva de:** documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§4, §5, §13),
> `ADR-SAAS-001` (tenancy), `ADR-SAAS-002` (identidad), `ADR-SAAS-004` (modelo empresarial).
> **Metodología:** misma que U1–U5 de modificadores (unidad pequeña, mergeable, auditable, sin romper producción).

MT-U1 es una **unidad de datos**. Introduce el modelo de `empresas`/`membresias` y el backfill que
ancla los datos actuales a una empresa fundacional. **No** cambia el comportamiento del POS, **no**
introduce claims, reglas Firestore, aislamiento efectivo ni autenticación multiempresa.

---

## 1. Auditoría del estado actual (resumen)

Inventario de colecciones verificado contra el código real (`grep` de `collection(db, ...)` en todo
`lib/`), no solo contra `PROJECT_DISCOVERY.md` (que es anterior al merge de modificadores U1–U5).

| Categoría | Colecciones / entidades |
|---|---|
| **Pertenecen a una empresa** (ganan `empresaId`) | Las 24 operativas de `ADR-SAAS-004` **+ `producto_modificador_grupos`** = **25** |
| **Permanecen globales** | `usuarios` (identidad), `permisos_roles` (plantilla de plataforma), `eventos` (decisión de producto pendiente), `configuracion/general` (su migración de forma es MT-U6) |
| **Independientes (nuevas, aún inexistentes)** | `saas_operadores`, `planes`, `saas_auditoria`, `consumo` — **no se crean en MT-U1** (pertenecen a MT-U8/MT-U9) |

**Hallazgo #1 — `producto_modificador_grupos`:** colección introducida por U1–U5 (`lib/modificador-grupos-service.ts`),
no registrada en `PROJECT_DISCOVERY.md`. Es catálogo ligado a `productos` → empresa-scoped. El total real
es **25 colecciones operativas**, no 24.

> **Nota de reconciliación (MT-U3, 2026-07-17):** la auditoría de preparación de MT-U3 encontró que este
> conteo, aunque coincide en el total (25), seguía teniendo el conjunto incorrecto: (a) `modificador_grupos`
> —colección hermana de `producto_modificador_grupos`, usa la misma constante `COLLECTION_NAME` y por eso
> se escapó también de este hallazgo— **faltaba**; (b) `proveedores` y `cuentas_cobro`, presentes en la
> lista original de `ADR-SAAS-004`/documento maestro, **no eran colecciones reales en el modelo histórico**
> (el primero era un campo embebido en `compras`; el segundo es el valor `metodoPago=='cuenta_cobro'` sobre
> `ventas`). ADR-SAAS-022 introduce posteriormente un catálogo nuevo de `proveedores`, sin migrar compras
> históricas ni alterar el backfill original. El total
> de 25 se mantiene por coincidencia (−2, +2). La lista oficial, ya corregida, vive en
> `MT-U3-helper-tenant-diseno.md` §7 y es la fuente a usar para el backfill de MT-U3. Esta nota no altera
> el alcance ya ejecutado de MT-U1 (que no tocó ninguna colección operativa).

**Hallazgo #2 — `permisos_roles`:** documento por rol con permisos default; es plantilla de plataforma,
no dato transaccional de un negocio. **Permanece global en MT-U1**, sin tocar. Su eventual
personalización por empresa es una unidad posterior fuera de este alcance.

**Identidad — qué NO cambia:** todo lector de `Usuario` en `lib/auth-service.ts`
(`getUsuarioFirestore`, `onAuthStateChange`, `buscarUsuarioPorUsername`) lee `rol` y `permisos`
directamente de `usuarios/{uid}`. **MT-U1 no toca `auth-service.ts`**; `usuarios` sigue siendo la única
fuente de verdad leída para autorización.

---

## 2. Decisiones definitivas (revisadas y aprobadas)

Esta sección recoge las tres decisiones revisadas que reemplazan a las propuestas iniciales.

### D-U1-1 · Identificador de la empresa fundacional — **id opaco tipo-onboarding**

**Decisión:** la empresa fundacional se crea con un **id opaco autogenerado** (el `id` de un
`doc(collection(db,'empresas'))` de Firestore, o un ULID), **idéntico en forma** al que tendrán las
empresas creadas por el onboarding (MT-U7). **No** se usa un slug placeholder como `empresa-default`.

**Justificación:**
- Un id de documento es **inmutable**; cualquier connotación en él es permanente.
- Consistencia estructural: en MT-U7 las nuevas empresas tendrán id opaco. Si la fundacional llevara un
  id especial, quedaría **especial-casada para siempre** y todo código que resuelva "la empresa"
  tendría que contemplar un caso único. Con id opaco normal, la fundacional es **indistinguible** de
  cualquier futura empresa.

**Forma del documento `empresas/{idOpaco}`:**

| Campo | Valor en MT-U1 |
|---|---|
| `id` | opaco generado (= doc id) |
| `nombre` | copiado de `configuracion/general.nombre_tienda` (snapshot puntual; display, editable siempre) |
| `slug` | handle legible opcional (p. ej. `cafe-atrato`); **campo, no clave** → cambiable sin migrar |
| `estado` | `'activa'` (vocabulario de ADR-SAAS-003; sin trial ni transiciones en MT-U1) |
| `paisFiscal` | `'CO'` (único mercado actual; no existe campo de país hoy) |
| `ownerUid` | uid del primer `usuarios` con `rol==='admin'` y `activo===true`, ordenado por `creadoEn` asc |
| `esFundacional` | `true` (marca de descubrimiento; ver más abajo) |
| `creadaEn` | `Timestamp` |

**Descubrimiento sin hardcodear el id opaco:** hasta MT-U11 existe **exactamente una** empresa. "El
tenant actual" se resuelve leyendo el único documento de `empresas` (o filtrando `esFundacional==true`).
El id opaco **nunca** se escribe a mano en el código.

- **Cambio de marca:** nunca requiere tocar el id; `nombre`/`slug` son editables.
- **Aborta si** no hay ningún admin activo (no se adivina `ownerUid`); se reporta en dry-run si hay >1
  admin para confirmación humana antes de `--execute`.

### D-U1-2 · Membresía — **arista pura de pertenencia, sin duplicar rol/permisos**

**Decisión:** en MT-U1, `Membresia` **no** copia `rol` ni `permisos`. Se crea como arista mínima de
pertenencia. `usuarios.rol`/`usuarios.permisos` sigue siendo la **única** fuente hasta MT-U5b.

**Forma del documento `membresias/{empresaId}_{uid}`:**

```
Membresia {
  empresaId: string     // id opaco de la empresa fundacional
  uid: string           // = usuarios/{uid}
  activo: boolean        // espejo de usuarios.activo al momento del backfill
  creadaEn: Timestamp
}
```

Una `Membresia` por cada `usuarios/{uid}` existente, todas apuntando a la empresa fundacional.

**Justificación (por qué NO se vuelve fuente de lectura antes de MT-U5b):**

1. **Razón dura de ordenamiento:** leer el rol desde `Membresia` exige saber **qué empresa está
   activa** para elegir cuál de las N membresías de la persona leer. Ese dato lo entrega el **claim del
   token en MT-U2**. Antes de MT-U2, un lector solo podría funcionar hardcodeando la empresa
   fundacional — lógica desechable.
2. **Alcance:** mover la fuente de autorización es un **cambio de comportamiento en la ruta crítica de
   seguridad** (roles/permisos; 13 chequeos de rol dispersos, IMP-16). Está fuera del alcance
   "solo datos" de MT-U1.

**Por qué esta forma tiene menos deuda que copiar rol/permisos:** duplicar `rol`/`permisos` en MT-U1 y
seguir escribiéndolos vía `permisos-service.ts` en `usuarios` produciría **desincronización** (dos
fuentes divergentes). Al **no duplicar**, no hay nada que pueda desincronizarse: fuente única todo el
tiempo. MT-U5b hará el movimiento **una sola vez** (copiar rol/permisos a `Membresia` + voltear los
lectores en el mismo PR atómico), sin divergencia previa que reconciliar.

**Consistencia con ADR-SAAS-002:** el ADR describe el estado final (rol/permisos en `Membresia`); la
arista pura de MT-U1 es un peldaño hacia él, no su forma final. No lo contradice.

### D-U1-3 · Backfill — **partido por volatilidad; sin ventana ni segunda ejecución manual**

**Decisión:** el backfill se separa según la tasa de cambio de cada colección.

| Qué | Se puebla en producción | Ventana |
|---|---|---|
| **Entidades estables** (`empresas/{id}`, `membresias`) — baja/nula churn | **En MT-U1** | Ninguna |
| **Colecciones operativas** (las 25) — alta churn | **Como paso 0 del despliegue de MT-U3**, justo antes de activar el estampado en escritura | Ninguna |

**Justificación:** nada consume `empresaId` en colecciones operativas hasta MT-U3. MT-U2 (claims) solo
necesita `membresias`, no que las ventas tengan `empresaId`. Por tanto el backfill operativo **no hace
falta hasta MT-U3**, y al ejecutarse como **primer paso del mismo despliegue** que enciende el
estampado, el instante en que los documentos históricos reciben `empresaId` coincide con el instante en
que los nuevos empiezan a recibirlo → **no queda ventana**.

Esto **elimina** la dependencia de "recordar re-ejecutar": hay **una sola** corrida del backfill
operativo, dentro del procedimiento definido y del criterio de aceptación de MT-U3. El script se
**escribe y valida en dry-run en MT-U1** (idempotente, reanudable), pero su corrida sobre datos
operativos pertenece a la unidad que los consume.

**Beneficio colateral:** MT-U1 escribe muy poco en producción (un doc de empresa + N membresías),
reduciendo su riesgo.

**Alternativa descartada (trigger `onCreate`):** una Cloud Function que estampe `empresaId` en cada
create sin él cerraría la ventana automáticamente si se decidiera poblar operativas ya en MT-U1. Se
descarta: añade infraestructura (Functions) para una necesidad transitoria; la separación por
volatilidad logra el mismo objetivo sin infra nueva.

---

## 3. Servicios base — justificación de qué se crea y qué se difiere

**Decisión:** MT-U1 crea `lib/empresas-service.ts` y `lib/membresias-service.ts` conteniendo
**únicamente las definiciones de tipo** (`Empresa`, `Membresia`) y constantes asociadas (nombres de
colección). **No** se crean funciones de lectura/escritura (CRUD, `obtenerEmpresa`, `obtenerMembresia`)
en esta unidad.

**Justificación:**

1. **Los tipos necesitan un hogar canónico.** El script de backfill (Admin SDK) los consume vía
   `import type`, que se borra en compilación (sin acoplamiento de runtime). Dejar los tipos dentro del
   script los enterraría y obligaría a MT-U2 a redefinirlos.
2. **Crear helpers ahora sería código muerto** hasta MT-U2 (el primer consumidor real). El proyecto ya
   marcó el código muerto commiteado como deuda a evitar (auditoría IMP-17). No se repite ese patrón.
3. **Módulo inerte y seguro:** con solo tipos (sin import de runtime del SDK cliente), el módulo no
   ejecuta nada y **ningún servicio operativo lo importa**. Cumple el mandato "solo datos".
4. **MT-U2 extiende, no reescribe:** cuando exista el primer consumidor, MT-U2 añade a estos mismos
   módulos los helpers de lectura (`obtenerEmpresa`, `obtenerMembresia`) con el SDK cliente. El contrato
   de tipos ya estará estable y auditado.

**Resumen:** tipos en MT-U1 (los usa el script → no son código muerto); funciones cuando exista
consumidor (MT-U2) → cero código muerto, cero acoplamiento prematuro.

---

## 4. Alcance exacto de archivos

**Archivos nuevos:**
- `lib/empresas-service.ts` — **solo** tipo `Empresa` + constantes.
- `lib/membresias-service.ts` — **solo** tipo `Membresia` + constantes.
- `scripts/migrate-mt-u1-fundacional.ts` — crea `empresas/{id}` + `membresias` (ejecuta en MT-U1);
  contiene además la rutina de backfill operativo, **validable en dry-run pero no ejecutada sobre
  operativas en MT-U1** (su `--execute` operativo corre en MT-U3).
- `scripts/rollback-mt-u1-fundacional.ts` — reverso: borra `membresias`, `empresas/{id}`, y (si se
  hubiera corrido) el `empresaId` de operativas vía `FieldValue.delete()`.
- Este documento de diseño.

**Archivos que NO se modifican (explícito, anti scope-creep):**
- Ningún `lib/*-service.ts` operativo (ni lectura ni escritura de `empresaId`).
- `lib/auth-service.ts`, `lib/configuracion-service.ts` — intactos.
- `firestore.rules` — intacto.
- `.github/workflows/*` — intacto.
- Nada en `components/` ni `app/`.

**Nuevos tipos:** `Empresa`, `Membresia`. No se importan desde ningún servicio operativo en esta unidad.

---

## 5. Backfill — mecanismo (diseño, sin escribir la migración aún)

Sigue la convención del repo (`scripts/migrate-fase9d.ts` + `rollback`): Admin SDK, **dry-run por
defecto**, `--execute` explícito, idempotencia por guardas, alcance de escritura acotado y reportado.

**Fase A — MT-U1 (entidades estables):**
1. Dry-run: reporta el `ownerUid` detectado, el `nombre` a copiar, y conteos; alerta si 0 o >1 admins activos.
2. Crear `empresas/{idOpaco}` solo si no existe una empresa fundacional (`esFundacional==true`).
3. Crear una `Membresia` por `usuarios/{uid}` con id determinístico `{empresaId}_{uid}` (la propia clave
   es la guarda de idempotencia; reescribir es no-op).
4. Verificar: nº `membresias` == nº `usuarios`.

**Fase B — MT-U3 (colecciones operativas), paso 0 de su despliegue:**
5. Resolver el `empresaId` leyendo la única empresa fundacional.
6. Para cada una de las 25 colecciones, escribir `empresaId` **solo si el campo no existe**
   (`if (!doc.data().empresaId)`), paginando en lotes ≤500 (`startAfter`) por límite de batch de Firestore.
7. Reporte: docs tocados por colección; alertar (no fallar en silencio) si algún doc ya tenía
   `empresaId` con **otro** valor.

**Idempotencia y "una sola vez sin efectos secundarios":** las guardas de existencia garantizan que N
ejecuciones producen el mismo estado que 1 (incluye el caso de ejecución única), y toleran reintentos
ante fallos parciales (reanudable).

---

## 6. Riesgos

- **Compatibilidad producción:** ningún flujo leído cambia → riesgo de regresión funcional casi nulo,
  siempre que el script solo añada campos y nunca toque otros.
- **Datos existentes:** colecciones grandes (`ventas`, `movimientos_inventario`) requieren paginación;
  mitigado por idempotencia reanudable. Fase B lo asume.
- **Admin ambiguo:** >1 admin activo → elección determinística (`creadoEn` más antiguo) reportada en
  dry-run para confirmación humana; 0 admins → abortar.
- **Referencias entre colecciones:** nada filtra por `empresaId` aún → sin joins rotos. Riesgo real =
  **falsa sensación de aislamiento**: `empresaId` presente NO implica aislamiento (eso es MT-U4). Se
  comunica en el PR.
- **Futuras reglas (MT-U4):** asumirán 100% de docs con `empresaId`. La estrategia D-U1-3 (Fase B como
  paso 0 de MT-U3) garantiza cobertura total sin ventana.
- **Claims (MT-U2):** dependen de que `membresias` exista con un doc por usuario → garantizado por Fase A.
- **MT-U3:** depende de `empresaId` presente en operativas → garantizado por Fase B (mismo despliegue).
- **Deuda que MT-U1 NO resuelve (por alcance):** ninguna desincronización de rol/permisos, porque
  D-U1-2 no los duplica.

---

## 7. Plan de implementación (tres capas)

**Capa 1 — Infraestructura de datos (tipos):**
- Definir `Empresa` y `Membresia` en sus módulos (solo tipos + constantes).
- **Aceptación:** `tsc --noEmit` verde (gate MT-U0); cero imports desde servicios operativos.

**Capa 2 — Backfill (scripts idempotentes):**
- Escribir migrate/rollback. Dry-run contra producción; revisar reporte (confirmar `ownerUid`, `nombre`)
  **contigo** antes de `--execute`.
- Ejecutar Fase A (`--execute`) en MT-U1. Fase B queda escrita y validada en dry-run; su ejecución es MT-U3.
- **Aceptación:** nº `membresias` == nº `usuarios`; `empresas/{id}` fundacional creada; cero campos
  distintos de los previstos modificados.

**Capa 3 — Compatibilidad hacia atrás (verificación):**
- Regresión manual del POS (venta, turno, KDS, salón) → cero cambio observable.
- **Punto de control heredado a MT-U3:** Fase B del backfill es paso 0 de su despliegue (criterio de
  aceptación de MT-U3), inmediatamente antes de activar el estampado.
- **Aceptación de MT-U1:** PR mergeado sin tocar `lib/*-service.ts` operativos, `app/`, `components/`,
  `firestore.rules` ni `.github/` — solo los 2 módulos de tipos + los 2 scripts (+ este doc).

---

## 8. Criterio de aceptación (resumen)

1. `empresas/{idOpaco}` fundacional creada con la forma de D-U1-1.
2. Una `Membresia` pura (sin rol/permisos) por usuario; conteos cuadran.
3. `usuarios`, `auth-service.ts`, `firestore.rules`, CI y UI **intactos**.
4. Comportamiento del POS **idéntico** (verificación manual).
5. Scripts idempotentes con dry-run; Fase B lista pero no ejecutada sobre operativas.
6. `tsc --noEmit` + `test:tickets` + `test:reimpresion` en verde.
