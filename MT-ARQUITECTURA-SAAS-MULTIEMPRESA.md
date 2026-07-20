# MT — Arquitectura SaaS Multiempresa (Documento Maestro)

> **Estado:** ✅ **Aprobado como referencia arquitectónica oficial del proyecto** (2026-07-16).
> **Rama de diseño:** `design/multi-tenant-architecture`
> **Base:** `main @ 95c3c80` (modificadores U1–U5 mergeados)
> **Última revisión:** 2026-07-16
> **Naturaleza:** documento maestro del bloque SaaS Multiempresa. Es la **fuente única de verdad** de la
> arquitectura. De aquí se derivarán los ADR específicos (ADR-SAAS-001…004), congelando únicamente
> decisiones ya validadas.
>
> **Gobernanza (regla vigente):** a partir de esta aprobación, toda decisión de arquitectura del bloque
> SaaS se **deriva mediante ADR**. Cualquier cambio futuro que **contradiga** este documento debe
> justificarse mediante un **nuevo ADR** que lo referencie y supersede explícitamente la parte afectada.

---

## 1. Principio rector y alcance

**Extender, no reemplazar.** El POS actual —autenticación, ventas, pedidos, reservas, KDS, inventario
con ledger, impresión, alquileres, modificadores (U1–U5), snapshots comerciales y la arquitectura por
servicios (`lib/*-service.ts`)— se preserva íntegro. La multi-tenencia es una **capa transversal** que
se inserta *debajo* de los servicios existentes, no un rediseño del POS.

**Objetivo de producto:** pasar de un POS mono-establecimiento a una plataforma que **cientos de
restaurantes** distintos usen sobre la misma infraestructura, con aislamiento fuerte entre ellos.

Fuera de alcance de este documento: implementación de código, migraciones ejecutables, integración de
pasarela de pago, elección de un modelo de monetización concreto (§11), y cualquier refactor no
exigido por la multi-tenencia.

---

## 2. Decisiones ya validadas (entradas congeladas)

| # | Decisión | Estado |
|---|---|---|
| **D-1** | **Estrategia de tenancy = A**: colecciones planas + `empresaId` (discriminador) + custom claims + Firestore rules. | ✅ Aprobada |
| **D-2** | **Identidad de dos capas**: (a) identidad SaaS global por **email real**; (b) autenticación operativa del POS por **mecanismo configurable por empresa** (por defecto **código de empleado + PIN**), *namespaced por empresa*, reutilizando y reposicionando la infraestructura `username`+PIN actual. | ✅ Aprobada |

El resto del documento desarrolla la arquitectura sobre estas decisiones y **no las altera**; solo las
fortalece, aclara y cierra vacíos.

---

## 3. Estrategia de tenancy (contexto de D-1)

Tres formas de aislar tenants en Firestore; la elección define el costo de migración:

| Estrategia | Aislamiento | Impacto en servicios actuales | Veredicto |
|---|---|---|---|
| **A. Colecciones planas + `empresaId` + claims + rules** | Fuerte si las rules lo exigen | **Mínimo**: cada servicio añade `where('empresaId','==',x)` en lectura y estampa el campo en escritura | ✅ **Elegida (D-1)** |
| B. Subcolecciones `empresas/{id}/ventas/...` | Muy fuerte (natural) | **Máximo**: reescribir las rutas de colección de todos los servicios | ❌ Viola "no reemplazar" |
| C. Base de datos por tenant | Máximo | Operativamente inviable para cientos de tenants | ❌ |

La Estrategia A conserva la estructura de colecciones planas y el patrón de servicios; el aislamiento
se logra con `empresaId` + custom claims + Firestore rules como **defensa en profundidad** (§6).

---

## 4. Modelo de dominio

### 4.1 Los tres planos del sistema

La arquitectura distingue **tres planos independientes**. Ningún plano hereda del otro; en particular,
el plano de plataforma **no** depende del modelo de membresías de los tenants.

1. **Plano Plataforma (SaaS)** — el operador del producto. Identidad propia (`saas_operadores`), claim
   `superadmin`/`soporte`. Gestiona empresas, planes, suscripciones, consumo, soporte y auditoría de
   plataforma. **Nunca aparece en `membresias` ni tiene rol de restaurante por este plano.**
2. **Plano Empresa (Tenant)** — un restaurante. Sus administradores/supervisores gestionan el negocio.
   Viven en `membresias`. No ven nada fuera de su empresa.
3. **Plano Usuario operativo** — cajeros, cocineros, marketing. Operan el POS. Viven en `membresias`.

> **Regla de separación (ver §12):** un operador de plataforma que además quiera operar un restaurante
> necesita una **membresía explícita** en esa empresa; no se le concede automáticamente. La
> impersonación para soporte es una capacidad distinta y auditada (§12), no una membresía.

### 4.2 Entidades

Nuevas (globales, salvo `Membresia`):

- **Empresa (Tenant)** — unidad de aislamiento. `id`, `nombre`, `estado` (ciclo de vida §10),
  `paisFiscal`, `ownerUid`, `creadaEn`. Todo dato operativo del POS cuelga de aquí vía `empresaId`.
- **Usuario (identidad global)** — persona física. Un `uid` de Firebase Auth. **Puede pertenecer a
  varias empresas.** Tiene una o dos vías de acceso (§7): email/password (SaaS) y/o credencial
  operativa por empresa.
- **Membresia** — puente `Usuario × Empresa`. Contiene el `rol` **dentro de esa empresa**
  (`admin | cajero | cocinero | marketing | supervisor`) y los `permisos` (overrides). **Aquí vive el
  par (rol, permisos)** que hoy está embebido en `usuarios`. Un usuario tiene N membresías.
- **Operador SaaS** — identidad del plano de plataforma (`saas_operadores/{uid}`). **No es una
  Membresia.**
- **Espacio/Sucursal** — **ya existe** hoy como "venue". En SaaS es la sucursal/establecimiento dentro
  de la empresa. Gana `empresaId`. La jerarquía `Espacio → Categoría/Mesa/Producto` se preserva; solo
  se le antepone la Empresa.
- **Numeracion fiscal** — entidad de primera clase (§9): N por empresa, por sucursal y/o resolución
  DIAN, cada una con su propio contador. **No es un campo de configuración.**
- **Plan** — catálogo global de ofertas comerciales (§11). Modelo de dimensiones **abierto**.
- **Suscripcion** — vínculo `Empresa → Plan` con estado de facturación (§11). Una suscripción vigente
  por empresa.

### 4.3 Relaciones

```
Operador SaaS ─(plano plataforma, claim superadmin)─▶ gestiona todas las Empresas

Usuario ──< Membresia >── Empresa ──1:1── Suscripcion ──N:1── Plan
                            │
                            ├──< Espacio(Sucursal) ──< Categoría / Mesa / Producto / ... (POS actual)
                            └──< Numeracion fiscal (N por empresa; §9)
```

Cardinalidades: `Usuario N—N Empresa` (vía Membresia) · `Empresa 1—N Espacio` ·
`Empresa 1—N Numeracion` · `Empresa 1—1 Suscripcion` · `Plan 1—N Empresa`.

**Continuidad con el modelo actual:** el `Usuario` de hoy (con `rol` y `permisos` embebidos) se
**descompone** en identidad global (`Usuario`) + `Membresia` por empresa (rol/permisos). Es el único
cambio de forma en una entidad existente y es inevitable para que una persona trabaje en varias empresas.

---

## 5. Modelo de datos

**Colecciones nuevas — plano plataforma (globales):**

- `saas_operadores/{uid}` — identidades del operador SaaS (independiente de `usuarios`)
- `planes/{planId}`
- `saas_auditoria/{id}` — auditoría cross-tenant del operador, **separada** de `auditoria_logs`
- `consumo/{empresaId}_{periodo}` — métricas por empresa (capacidad para medición futura; §11)

**Colecciones nuevas — plano empresa (con `empresaId`):**

- `empresas/{empresaId}`
- `membresias/{empresaId}_{uid}` — clave compuesta → resolución O(1) del acceso usuario↔empresa
- `suscripciones/{empresaId}` — 1:1 con empresa
- `invitaciones/{token}` — onboarding de usuarios (§7)
- `configuraciones/{empresaId}` — configuración por empresa (§8) **sin contadores**
- `numeraciones/{empresaId}_{numeracionId}` — numeración fiscal por empresa/sucursal/resolución (§9)

**Colecciones existentes que incorporan `empresaId`** (todas las operativas):
`espacios, categorias, productos, insumos, recetas, mesas, pedidos_activos, comandas_cocina, ventas,
turnos, turnos_activos, reservas, agendas, compras, mermas, egresos, clientes, cuentas_bancarias,
transacciones_financieras, liquidaciones, consignadores, movimientos_inventario, auditoria_logs,
modificador_grupos, producto_modificador_grupos`.

> **Nota de reconciliación (MT-U3, 2026-07-17):** esta lista se corrigió contra el inventario verificado
> en código. Se retiran `proveedores` y `cuentas_cobro` (nunca fueron colecciones: el primero es un campo
> embebido en `compras`; el segundo es el valor `metodoPago=='cuenta_cobro'` sobre `ventas`) y se añaden
> `modificador_grupos` y `producto_modificador_grupos` (colecciones reales omitidas por usar una constante
> `COLLECTION_NAME` en vez de un literal). El total se mantiene en 25. La lista oficial y su justificación
> viven en `MT-U3-helper-tenant-diseno.md` §7; ésta se corrige aquí solo para no dejar una fuente
> contradictoria en el documento maestro.

> `movimientos_inventario` **ya tiene `empresaId` reservado** (FASE-15): primer consumidor natural del
> modelo, valida el enfoque.

**Datos que permanecen globales (sin `empresaId`):**

- `planes`, `saas_operadores`, `saas_auditoria` — plano de plataforma.
- `usuarios` — identidad global; el vínculo a empresa vive en `membresias`.
- `eventos` — **decisión de producto pendiente** (§16): landing global de plataforma **o** contenido
  por-empresa (en cuyo caso ganaría `empresaId`).

**Datos que dejan de ser globales:**

- **Configuración** — hoy `configuracion/general` es un **singleton global** → pasa a
  `configuraciones/{empresaId}` (§8).
- **Contador fiscal** — hoy `consecutivo_actual` vive **dentro** del doc de configuración → se
  **extrae** a `numeraciones/` (§9). Es un cambio deliberado, no una migración 1:1 (§8/§9).

*(No se escriben migraciones aquí; el plan de backfill vive en el roadmap, §13.)*

---

## 6. Aislamiento de datos (defensa en profundidad, 4 capas)

Ninguna capa basta por sí sola; se combinan.

**Capa 1 — Auth / Custom Claims.** Tras autenticar (por cualquiera de las vías de §7), el token lleva
`empresaId` activo + `rol`. El plano plataforma usa un claim distinto (`superadmin`/`soporte`). Usar
**claims** (no lecturas dentro de rules) evita `get()` costosos y es la fuente de verdad del aislamiento.

**Capa 2 — Firestore Rules.** Toda regla operativa exige:
- lectura: `resource.data.empresaId == request.auth.token.empresaId`
- escritura: `request.resource.data.empresaId == request.auth.token.empresaId`

Un `where` olvidado en el cliente produce *deny*, no fuga. Es la red de seguridad dura. Las colecciones
del plano plataforma tienen reglas propias que **solo** admiten el claim de operador.

**Capa 3 — Capa de servicios (helper de tenant).** Un único helper inyecta `empresaId` en **toda**
lectura y escritura desde `lib/*-service.ts`. Los servicios **no** reciben `empresaId` suelto por
parámetro: lo toman de un contexto de sesión. Centraliza el punto de fallo en un archivo auditable.

**Capa 4 — Consultas.** Prohibición de queries sin filtro de `empresaId`. Se cierra de paso la deuda
IMP-13 (queries sin `limit()`): a escala N-tenant, una query sin cota es un incidente de costo.

**Regla de oro:** el cliente **nunca** decide su `empresaId`; lo impone el claim del token. Cambiar de
empresa = re-emitir token (§7).

---

## 7. Identidad y autenticación (dos capas, D-2)

El sistema separa **quién eres en la plataforma** (identidad SaaS) de **cómo entras a operar el POS**
(autenticación operativa). Son dos conceptos distintos sobre la misma infraestructura de Firebase Auth.

### 7.1 Identidad SaaS (global)

- **Qué es:** la identidad persistente de una persona en la plataforma, anclada a un **email real**.
- **Para quién:** propietarios, administradores y cualquiera que gestione el negocio o pertenezca a
  **varias empresas**.
- **Mecanismo:** email real + contraseña (Firebase Auth estándar).
- **Propiedad:** es la identidad que recibe **invitaciones** y que soporta **multi-empresa** (una
  persona, N membresías). Es global y única por persona.

### 7.2 Autenticación operativa del POS (por empresa, configurable)

- **Qué es:** el mecanismo de acceso rápido para operar el POS día a día. **No** es una identidad
  nueva: es una forma de *autenticar* a un usuario de la empresa.
- **Para quién:** empleados (cajeros, cocineros) que entran y salen muchas veces al día.
- **Mecanismo (configurable por empresa):** por defecto **código de empleado + PIN**, *namespaced por
  empresa* (el código es único *dentro* de la empresa, no globalmente → resuelve la colisión del
  namespace global actual `@micafe-pos.internal`). La empresa podrá definir otros mecanismos
  operativos en el futuro sin cambiar la arquitectura.
- **Sin email obligatorio:** un empleado puro no necesita email; solo adquiere identidad SaaS (§7.1)
  si además se le invita por email.

### 7.3 Diferencia esencial (para evitar ambigüedad)

| | Identidad SaaS (§7.1) | Autenticación operativa (§7.2) |
|---|---|---|
| Responde a | ¿Quién es esta persona en la plataforma? | ¿Cómo entra a operar hoy? |
| Ámbito | Global (una por persona) | Por empresa |
| Credencial | Email + contraseña | Código + PIN (u otro configurable) |
| Requiere email | Sí | No |
| Soporta multi-empresa | Sí | No (es local a la empresa) |

**Ambas convergen en el mismo aislamiento:** independientemente de la vía, el resultado es un
**principal de Firebase Auth con claim `{empresaId, rol}`**, de modo que las 4 capas de §6 aplican por
igual. La vía operativa se resuelve así: el empleado introduce **código + PIN** → un **backend
privilegiado (Cloud Function)** valida contra las credenciales de *esa* empresa → **emite un custom
token** con `{uid, empresaId, rol}` → el cliente inicia sesión. Rápido, y preserva la **atribución por
usuario** (`cajeroId` real) y las rules per-tenant/per-user intactas.

> **Por qué custom token y no una sesión de "dispositivo":** atar el POS a una identidad de estación
> rompería las rules per-usuario y la trazabilidad de turnos/ventas por `cajeroId`.

### 7.4 Flujos

- **Creación de empresa:** un usuario (email real) se registra → el backend crea `empresas/{id}`, lo
  marca `ownerUid`, crea su `membresia` con `rol:admin` y emite el claim `{empresaId, rol:admin}`.
- **Primer administrador:** es el creador; no existe el estado "empresa sin admin".
- **Invitación de usuarios:** el admin crea `invitaciones/{token}` con `{empresaId, rol, email?}`.
  - Invitado **con email** → §7.1: crea/reutiliza su `Usuario` global y añade una `membresia`.
  - Empleado **sin email** → §7.2: el admin le asigna código + PIN dentro de la empresa.
- **Cambio de empresa** (multi-empresa): el usuario elige empresa activa → el backend **re-emite el
  token** con el nuevo `empresaId`/`rol`; el cliente refresca claims. El `empresaId` jamás lo fija el
  frontend.

### 7.5 Compatibilidad

Los usuarios legacy `@micafe-pos.internal` de la única empresa actual se migran a la **empresa por
defecto** (roadmap §13) conservando acceso, y quedan clasificados como **autenticación operativa**
(§7.2). La adopción de email real (§7.1) es incremental y solo necesaria para quienes gestionen o
trabajen en varias empresas.

> Esta decisión de dos capas es candidata a **ADR-SAAS-002**.

---

## 8. Configuración empresarial

### 8.1 Decisión de ubicación

Hoy la configuración es un **singleton global** `configuracion/general` que además **mezcla el contador
fiscal** (`consecutivo_actual`) con parámetros estáticos. Para el modelo multiempresa se decide:

1. **Colección dedicada por empresa: `configuraciones/{empresaId}`** (un documento por empresa).
2. **El contador fiscal sale de la configuración** hacia `numeraciones/` (§9).

**Alternativas descartadas y por qué:**

- *Mantener `configuracion/general` global* → inviable: un solo doc no puede servir a N empresas sin
  fugas ni contención.
- *Embeber la config dentro de `empresas/{empresaId}`* → descartado: infla el documento del tenant
  (que se lee para resolver acceso en caliente) y mezcla datos de identidad con preferencias que
  cambian por separado.
- *Dejar el contador dentro del doc de configuración* → descartado: **hoy cada venta escribe el mismo
  documento que guarda la configuración** (contención + acoplamiento). A escala N-tenant y con
  múltiples numeraciones por empresa, el contador **debe** vivir en su propia estructura (§9).

**Justificación:** la configuración se lee al iniciar sesión y se **snapshotea** en la venta/ticket
(no se lee en caliente para hechos históricos, consistente con ADR-TRIB-001 y ADR-MOD-001). Un
documento por empresa es suficiente y aislable. Si a futuro alguna sección crece o se vuelve de alta
escritura, podrá dividirse por secciones sin cambiar este modelo. **Los contadores nunca van aquí.**

### 8.2 Qué contiene la configuración por empresa

- **Datos fiscales de identidad** — régimen, NIT/identificación, rótulo fiscal. (Las **resoluciones**
  DIAN y sus rangos/contadores viven en `numeraciones/`, §9.) Se **snapshotea** en cada venta.
- **Moneda e impuestos** — parametrizables por empresa. Hoy INC/IVA colombianos están cableados;
  externalizarlos es habilitador de expansión, no bloqueante para Colombia.
- **Logo / branding del ticket** y **mensaje de ticket** (deuda E4+ ya identificada).
- **Impresión** — anchos 58/80 mm y plantilla (ya soportado por el motor de tickets; pasa a preferencia
  por empresa).
- **Cocina (KDS)** — comportamiento de comandas, `cocinaNombre`.
- **POS** — **`modulos_habilitados` deja de ser global** y pasa a por-empresa; métodos de pago activos.
- **Preferencias** — tema, base de caja sugerida, umbral de alerta de faltante (hoy globales → por
  empresa).

---

## 9. Numeraciones fiscales

### 9.1 Problema

El modelo actual asume **un** prefijo + **una** resolución + **un** contador global. En Colombia una
empresa puede tener **varias resoluciones DIAN simultáneas** (p. ej. por establecimiento, por punto de
venta, o distintas para POS vs. factura electrónica), **cada una con su propio rango y consecutivo
independiente**. Asumir "un consecutivo por empresa" sería un **defecto fiscal**.

### 9.2 Diseño

La **numeración fiscal es una entidad de primera clase**, no un campo de configuración:

`numeraciones/{empresaId}_{numeracionId}` con, conceptualmente:

- `empresaId` — tenant propietario.
- `sucursalId?` — espacio/establecimiento al que aplica (opcional; puede haber numeraciones a nivel
  empresa o a nivel sucursal).
- `tipo` — p. ej. `pos` | `electronica` | `contingencia`.
- `prefijo`, `resolucionDian`, `rangoInicio`, `rangoFin`, `vigenciaDesde`, `vigenciaHasta`.
- `consecutivoActual` — **contador propio e independiente por numeración**.
- `activa` — habilitación.

### 9.3 Reglas de comportamiento

- **Una empresa tiene N numeraciones.** El consecutivo es **por numeración**, nunca por empresa.
- **Selección determinista:** al cobrar, la venta selecciona la numeración aplicable por
  `(sucursal, tipo)` según la configuración vigente de la empresa.
- **Incremento atómico por documento de numeración** (aísla la contención: dos sucursales/resoluciones
  no compiten por el mismo contador).
- **Snapshot en la venta:** el número final, prefijo y resolución se **congelan** en la `venta`
  (consistente con ADR-TRIB-001); la venta no vuelve a consultar la numeración para reimprimir.
- **Control de rango:** al agotar el rango o vencer la resolución, la numeración se marca inactiva y el
  sistema exige activar otra. (El detalle operativo se define en su ADR.)

> Candidata a **ADR-SAAS-004** (numeración fiscal por empresa/sucursal/resolución, extiende
> ADR-TRIB-001).

---

## 10. Ciclo de vida de la empresa

La empresa (tenant) tiene un ciclo de vida **de datos y acceso** que es distinto —aunque relacionado—
de la máquina de estados de *facturación* de la suscripción (§11). Aquí manda el estado de la
**empresa**; la suscripción puede **disparar** transiciones (p. ej. impago → suspendida), pero
archivado y eliminación son decisiones de retención de datos, no de billing.

### 10.1 Estados

`Trial → Activa → Suspendida → Cancelada → Archivada → Eliminada`
(con reactivaciones posibles desde Suspendida/Cancelada, y desde Archivada bajo intervención).

### 10.2 Efectos por estado

| Estado | Acceso al sistema | Usuarios | Ventas / Documentos | Espacios | Backups | Reversible |
|---|---|---|---|---|---|---|
| **Trial** | Completo, con límite temporal | Activos | Se crean y operan normal | Operativos | Incluidos | → Activa |
| **Activa** | Completo | Activos | Operación normal | Operativos | Incluidos | — |
| **Suspendida** | Bloqueado o **solo-lectura** (política de producto, §16) | No pueden operar POS; login puede permitirse solo para regularizar | Intactos, no se generan nuevos | Intactos, no operables | Se siguen tomando | Sí → Activa |
| **Cancelada** | Gestión mínima (export/descarga); operación detenida | Sin acceso operativo; admin puede exportar | Intactos durante periodo de gracia | Intactos, no operables | Se siguen tomando durante la gracia | Sí, dentro de la gracia → Activa |
| **Archivada** | Sin acceso interactivo; datos en frío (export bajo soporte) | Inactivos | Conservados en almacenamiento frío / solo-lectura | No operables; recursos activos liberados (índices, suscripciones realtime) | Último backful conservado según política | Sí, con intervención del operador SaaS |
| **Eliminada** | Ninguno | Purgados | **Purga definitiva** tras retención legal | Purgados | Purgados según política de retención | **No** (irreversible) |

### 10.3 Invariantes

- **Ningún estado borra datos salvo `Eliminada`.** Suspendida/Cancelada/Archivada conservan la
  información; cambian el **acceso** y el **consumo de recursos**, no la existencia de los datos.
- **La transición a `Eliminada`** respeta la retención legal (fiscal/contable) y deja solo el registro
  mínimo de auditoría/facturación que la ley exija; es **irreversible** y requiere acción explícita del
  plano plataforma (§12), nunca del tenant.
- **Reactivación:** desde `Suspendida`/`Cancelada` (dentro de gracia) el retorno a `Activa` es directo;
  desde `Archivada` requiere rehidratar recursos (índices/realtime) y la interviene el operador SaaS.
- **Relación con la suscripción (§11):** el estado de facturación puede **proponer** transiciones de la
  empresa, pero la empresa es la autoridad sobre su ciclo de datos. No se duplican estados: billing
  describe el *cobro*; este capítulo describe el *dato y el acceso*.

---

## 11. Billing (arquitectura preparada, monetización no congelada)

> **Principio:** el documento deja **lista la arquitectura** para suscripciones futuras **sin asumir
> todavía** un modelo de cobro. No se compromete cobro por usuarios, por sucursales, por ventas, por
> almacenamiento, ni ningún otro. La dimensión de monetización es **una decisión de producto posterior**.

- **Planes** (`planes/{planId}`, global): describen una oferta comercial mediante un **mapa abierto de
  dimensiones** (`capacidades`/`limites`) **extensible**. V1 puede tener **cero límites forzados**. Las
  dimensiones son *pluggables*: añadir una nueva (o retirar otra) no cambia la arquitectura.

  *Dimensiones ilustrativas (ninguna comprometida): nº de sucursales, nº de usuarios, volumen de
  ventas, almacenamiento, módulos habilitados. Se listan solo como ejemplo de forma, no como decisión.*

- **Suscripción** (`suscripciones/{empresaId}`, 1:1): `planId`, `estadoFacturacion`, `periodoActual`
  (inicio/fin), `cancelaAlFinal`.

- **Estados de facturación** (máquina de estados de la *suscripción*, distinta del ciclo de la empresa
  §10): `trialing → active → past_due → suspended → canceled` (+ cambio de plan `active ⇄ active`).
  Estos estados **pueden disparar** transiciones del ciclo de vida de la empresa (§10), pero no lo
  sustituyen.

- **Enforcement de límites** (cuando existan): **defensa en profundidad en tres puntos** — UI (ocultar),
  servicio (rechazar), rules (denegar la escritura que exceda). Si un plan no define una dimensión, no
  hay enforcement para ella. El mecanismo existe aunque la política esté vacía.

- **Renovación / integración de pago:** dirigida por **webhook** de una pasarela futura, tras un
  **puerto abstracto** (`PaymentProvider`) para no acoplarse a ningún proveedor. El webhook solo
  transiciona el estado de la suscripción, de forma **idempotente** (mismo patrón ya probado con Wompi
  en reservas). **No se integra pasarela en este bloque.**

- **Medición de consumo:** `consumo/{empresaId}_{periodo}` queda disponible como **capacidad** para una
  futura facturación por uso o para detección de abuso. Tenerla **no** implica adoptar cobro por uso.

> El **mecanismo** de suscripción/estados/enforcement es candidato a **ADR-SAAS-003**; la **elección de
> dimensiones monetizadas NO se congela** y queda fuera de ese ADR.

---

## 12. Administración SaaS (plano plataforma)

Plano separado (§4.1), accesible **solo** con claim de operador (`superadmin`/`soporte`), con identidad
propia (`saas_operadores`) y auditoría propia (`saas_auditoria`). **No** usa `membresias`.

Responsabilidades:

- **Empresas** — listado, estado (§10), alta/suspensión/archivado/eliminación (transiciones que el
  tenant no puede ejecutar por sí mismo).
- **Usuarios** — identidades globales (`usuarios`) y sus membresías (vista, no operación de negocio).
- **Planes** — CRUD del catálogo comercial (§11).
- **Consumo** — métricas por empresa; base para medición futura y detección de abuso.
- **Facturación** — estado de suscripciones, morosidad, historial.
- **Soporte / Impersonación** — acceso a datos de una empresa **explícito y auditado**; **nunca
  silencioso**. Cada acceso queda en `saas_auditoria`.
- **Auditoría de plataforma** — `saas_auditoria`, **separada** de `auditoria_logs` por-empresa, para que
  un admin de restaurante jamás vea acciones de plataforma ni de otras empresas.

**Reglas de separación (no negociables):**

- El claim de operador SaaS **solo lo emite un backend privilegiado**, jamás el cliente. Un `admin` de
  restaurante **no puede** auto-asignarse `superadmin`.
- Un operador SaaS **no** obtiene rol de restaurante por ser operador; para operar un tenant necesita
  **membresía explícita** en él.
- El panel SaaS vive en rutas y reglas distintas del `/admin` del restaurante. Comprometer un admin de
  restaurante no da ninguna visibilidad de plataforma.

---

## 13. Roadmap de implementación (unidades pequeñas, mergeables, auditables)

> *Sin cambios de estructura respecto a la versión aprobada.* Clave para no romper producción: **las
> primeras unidades corren con una única "empresa por defecto"**, de modo que el comportamiento
> observable no cambia hasta muy avanzado el roadmap. Cada unidad = un PR, auditable de forma
> independiente (igual que U1–U5 de modificadores).

| Unidad | Alcance | Por qué no rompe producción |
|---|---|---|
| **MT-U0** *(pre-requisito)* | Gate de CI: `tsc --noEmit` + pruebas en verde como condición de merge. | No toca runtime; protege todo lo que sigue. |
| **MT-U1** | Modelo `empresas`/`membresias` + backfill: todo dato actual se asigna a una "empresa por defecto". Solo datos. | Añadir un campo con valor constante es no-op funcional. |
| **MT-U2** | Custom claims: el token lleva `empresaId` (= empresa por defecto) + `rol`. | Un solo tenant; los claims espejan el rol actual. |
| **MT-U3** | Helper de tenant en capa de servicios: escritura estampa `empresaId`, lectura filtra. | Con un tenant, el filtro es transparente. Cierra IMP-13 de paso. |
| **MT-U4** | Firestore rules exigen `empresaId` (defensa en profundidad). | Los claims ya coinciden; nada cambia para el usuario. |
| **MT-U5a** | Autenticación operativa (§7.2): código+PIN → custom token, namespaced por empresa. | Reposiciona el login actual; el legacy sigue funcionando. |
| **MT-U5b** | Identidad SaaS (§7.1): email real + membresías como fuente de rol. | Aditivo; no rompe la vía operativa existente. |
| **MT-U6** | Configuración por empresa (§8) + numeración fiscal por empresa/sucursal/resolución (§9). | Migración del tenant existente a su config y numeración propias. |
| **MT-U7** | Onboarding: crear empresa → config → primer espacio → admin → empleados → POS. | Feature nueva y aislada; no toca el flujo existente. |
| **MT-U8** | Billing: `planes`/`suscripciones` + máquina de estados (§11), **sin** pasarela ni dimensiones monetizadas, gating en solo-lectura. | La empresa por defecto entra como `active` grandfathered. |
| **MT-U9** | Panel SaaS + `saas_operadores` + claim `superadmin` + `saas_auditoria`. | Plano separado; invisible para tenants. |
| **MT-U10** | Métricas de consumo (capacidad) + enforcement de límites cuando el plan los defina. | La empresa por defecto sin límites. |
| **MT-U11** | Multi-empresa por usuario + cambio de empresa (re-emisión de token). | Se activa solo cuando existe una 2ª empresa. |

Cada unidad tendrá su criterio de aceptación y no romperá dependencias hacia atrás.

---

## 14. Riesgos

**Técnicos:**

- **Explosión de índices compuestos.** Cada query gana `empresaId` → nuevos índices (hay límites por
  proyecto Firestore). Planificar antes de MT-U3.
- **Costo de rules con lecturas.** Si las rules hicieran `get()` de membresía por operación, el
  costo/latencia se disparan. Mitigado con **claims** (por eso MT-U2 va antes que MT-U4).
- **Contención del contador fiscal.** Hoy el `consecutivo` comparte documento con la configuración; la
  extracción a `numeraciones/` con incremento por documento (§9) elimina esa contención y la aísla por
  sucursal/resolución.
- **Tamaño de documento** en pedidos con muchos modificadores (advertido en ADR-MOD-001) se agrava con
  más metadata; vigilar.

**Seguridad:**

- **Fuga cross-tenant por un `where` olvidado** → mitigado por helper (MT-U3) + rules (MT-U4).
- **Escalada al plano plataforma.** Claims de operador solo emitidos por backend privilegiado; nunca
  escribibles por el cliente. Auditoría e identidad separadas (§12).
- **Fuerza bruta de PIN** en la vía operativa (§7.2): la Cloud Function que valida código+PIN debe ser
  rate-limited y auditada.
- **Impersonación de soporte** explícita y auditada, nunca silenciosa (§12).

**Escalabilidad:**

- **Numeración fiscal multi-resolución** (§9): reusar un consecutivo global sería defecto fiscal.
- Queries sin `limit()` (IMP-13) multiplicadas por N tenants = incidente de costo. Cerrar en MT-U3.

**Deuda técnica previa a resolver ANTES de multiplicar por N tenants:**

- **`next.config.mjs: ignoreBuildErrors: true` + cobertura de tests casi nula.** MT toca *todos* los
  servicios; sin CI que imponga `tsc` + pruebas, el riesgo de regresión silenciosa es alto. → **MT-U0**.
- **Migraciones pendientes** (tesorería FASE-9C/9D, turnos duplicados TECH-DEBT-TURNOS-001): triviales
  sobre 1 tenant, costosas sobre N. Cerrarlas antes.
- **IVA legacy hardcodeado (IMP-6)** y **`eliminarCompra` sin revertir costo (C-5)**: inconsistencias
  fiscales/costeo que se replicarían en cada tenant.

**Estratégico (no técnico puro):** el modelo de distribución **Electron + instalador por máquina** choca
con un SaaS. El código ya corre como web/PWA; conviene decidir pronto si el POS multiempresa se entrega
vía web por tenant. No bloquea MT-U1, pero condiciona MT-U7 en adelante (§16).

---

## 15. ADRs a derivar (solo tras aprobación final; no se crean aún)

| ADR | Decisión a congelar | Origen |
|---|---|---|
| **ADR-SAAS-001** | Estrategia de tenancy: colecciones planas + `empresaId` + claims + rules. | D-1 / §3 |
| **ADR-SAAS-002** | Identidad de dos capas (SaaS por email + operativa configurable por empresa; custom token). | D-2 / §7 |
| **ADR-SAAS-003** | **Mecanismo** de suscripción: estados + puntos de enforcement (sin congelar dimensiones monetizadas). | §11 |
| **ADR-SAAS-004** | Numeración fiscal por empresa/sucursal/resolución (extiende ADR-TRIB-001). | §9 |

---

## 16. Decisiones de producto pendientes (no bloquean la aprobación arquitectónica)

1. **`eventos`:** ¿landing global de plataforma o contenido por-empresa (con `empresaId`)?
2. **Estado `Suspendida`:** ¿POS en solo-lectura o bloqueo total? (afecta §10 y §11)
3. **Distribución:** ¿se mantiene Electron por sucursal o se migra a web por tenant? (§14 estratégico)
4. **Multi-país fiscal:** ¿alcance V1 solo Colombia con moneda/impuestos parametrizables como base?
5. **Monetización (§11):** qué dimensión(es) se cobran — deliberadamente **no decidida**.

---

> **Siguiente paso (tras aprobación final):** derivar ADR-SAAS-001…004 a partir de este documento,
> congelando únicamente decisiones validadas, y luego iniciar MT-U0.
> No se implementa código, ni se hace commit ni merge, hasta autorización explícita.
