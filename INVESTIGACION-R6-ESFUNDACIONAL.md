# INVESTIGACION-R6 — Eliminación de `esFundacional` del flujo de autenticación

> **Rama:** `feature/r6-remove-fundational-login`
> **Fecha:** 2026-07-26
> **Alcance:** Investigación y diseño. No implementa nada.
> **Deuda objetivo:** R-6 (`esFundacional` en el camino caliente del login)
> **Investigación previa relacionada:** INVESTIGACION-AUTH-RECUPERACION-CONFIG.md

---

## Fase 1 — Inventario exhaustivo

### 1.1 Origen del campo

`esFundacional` fue introducido en **MT-U1** (`MT-U1-empresas-membresias-diseno.md:78`):

> `esFundacional | true (marca de descubrimiento)`

Su propósito documentado (`MT-U1:82`):

> "El tenant actual se resuelve leyendo el único documento de `empresas` (o filtrando `esFundacional==true`). El id opaco nunca se escribe a mano en el código."

Y en `lib/empresas-service.ts:45-46`:

> "`esFundacional` marca la única empresa existente hasta que el onboarding cree la segunda; permite descubrirla sin hardcodear su `id` opaco."

**Es una marca transitoria de descubrimiento, por diseño.** MT-U5-CAPA0 §3.5 punto 2 lo declara explícitamente:

> "En MT-U5a el tenant se resuelve en servidor como empresa fundacional — declarado explícitamente transitorio en el propio diseño. Su sustitución es precondición de MT-U11."

---

### 1.2 Ocurrencias en código

| # | Archivo | Función / contexto | Propósito | Lectura / Escritura |
|---|---|---|---|---|
| 1 | `functions/src/operational-auth.ts:85` | `obtenerEmpresaFundacional()` | Login: resolver tenant fundacional para buscar credencial por código | Lectura |
| 2 | `functions/src/operational-auth.ts:123` | `resolverCredencialOperativa()` | Login: obtiene `empresaId` del tenant fundacional como primer intento de búsqueda de credencial | Lectura |
| 3 | `lib/empresas-service.ts:55` | `interface Empresa` | Declaración del campo en el tipo | Tipo |
| 4 | `lib/empresas-service.ts:65-88` | `obtenerEmpresaFundacional()` | Helper: query `where("esFundacional","==",true).limit(1)` | Lectura |
| 5 | `lib/empresas-service.ts:81` | `obtenerEmpresaFundacional()` | Implementación de la query | Lectura |
| 6 | `lib/tenant.ts:48` | `withEmpresaId()` (comentario) | Documentación: menciona `esFundacional` como patrón de resolución Admin | Solo docs |
| 7 | `lib/reservas-service.ts:78` | Comentario sobre rutas de API | Documentación: explica que las rutas server-side resuelven por `esFundacional==true` | Solo docs |
| 8 | `app/api/webhooks/wompi/route.ts:74` | `POST` | Webhook Wompi: fallback a empresa fundacional para reservas sin `empresaId` | Lectura |
| 9 | `app/api/reservas/disponibilidad/route.ts:32` | `resolverEmpresaIdFundacional()` | API pública: resuelve tenant para visitante sin sesión | Lectura |
| 10 | `app/api/reservas/hold/route.ts:61` | `resolverEmpresaIdFundacional()` | API pública: resuelve tenant para crear reserva | Lectura |
| 11 | `app/api/reservas/cancelar/route.ts:17` | `resolverEmpresaIdFundacional()` | API pública: resuelve tenant para cancelar reserva | Lectura |
| 12 | `app/api/reservas/salas/route.ts:5` | `resolverEmpresaIdFundacional()` | API pública: resuelve tenant para catálogo de salas | Lectura |
| 13 | `functions/src/bootstrap/service.ts:280` | `ejecutarBootstrapEmpresarial()` | Bootstrap: establece `esFundacional: false` para tenants nuevos | Escritura |
| 14 | `scripts/migrate-mt-u1-fundacional.ts:145` | `resolverEmpresaFundacional()` | Script histórico MT-U1: crea empresa fundacional con `esFundacional: true` | Escritura |
| 15 | `scripts/migrate-mt-u1-fundacional.ts:128` | `resolverEmpresaFundacional()` | Script histórico: query de existencia | Lectura |
| 16 | `scripts/migrate-mt-u3-operativo.ts:249` | Backfill MT-U3 | Resuelve `empresaId` para el backfill operativo | Lectura |
| 17 | `scripts/migrate-mt-u5b-membresias.ts:37` | Backfill MT-U5B | Resuelve `empresaId` para el backfill de membresías | Lectura |
| 18 | `scripts/set-claims-mt-u2.ts:100` | Script MT-U2 | Resuelve `empresaId` para acuñar claims | Lectura |
| 19 | `scripts/rollback-mt-u1-fundacional.ts:108` | Rollback MT-U1 | Ubica la empresa a revertir | Lectura |
| 20 | `scripts/rollback-mt-u3-operativo.ts:227` | Rollback MT-U3 | Ubica la empresa a revertir | Lectura |
| 21 | `scripts/backfill-empresa-fundacional-contrato.ts:133` | Backfill de contrato | Ubica la empresa fundacional | Lectura |
| 22 | `scripts/verificar-activacion-mt-u3.ts:92` | Verificación post-MT-U3 | Confirma existencia de empresa fundacional | Lectura |
| 23 | `functions/src/email-integration.test.ts:29,31` | Test de integración email | Crea empresa fundacional para fixtures de prueba | Escritura (test) |
| 24 | `functions/src/bootstrap/service.test.ts:216` | Test de Bootstrap | Aserta `esFundacional: false` en empresa nueva | Lectura (test) |
| 25 | `firestore-rules/global-platform.test.ts` | Reglas Firestore (tests) | Usa fixtures con `esFundacional` | Escritura (test) |

---

### 1.3 Ocurrencias en documentación (fuera de código)

| # | Documento | Contexto |
|---|---|---|
| D1 | `MT-U1-empresas-membresias-diseno.md:78,82,211` | Diseño original del campo como marca de descubrimiento |
| D2 | `MT-U2-runtime-saas-diseno.md:57,212,261` | Resolución de tenant por `esFundacional` para claims |
| D3 | `MT-U3-helper-tenant-diseno.md:37,109,230,254,320-332,355,386` | Scripts de migración que usan `esFundacional`; API routes; diseño transitorio |
| D4 | `MT-U3-CAPA5-runbook-activacion.md:177` | Advertencia: el mecanismo `esFundacional` de rutas de reservas debe migrarse antes de MT-U11 |
| D5 | `MT-U3-CAPA6-cierre.md:136` | Misma advertencia |
| D6 | `MT-U5-CAPA0-preflight-arquitectonico.md:18,77,111,146,155-160,187` | Diseño de MT-U5a contra empresa fundacional; declarado transitorio |
| D7 | `MT-U5A-CHANGELOG.md:7,22` | Infraestructura de autenticación para la empresa fundacional |
| D8 | `TECH-DEBT-CONFIG-001:39` | Menciona la empresa fundacional como contexto del singleton |
| D9 | `ADR-SAAS-013:17,322,404,407,464-519` | Estado de la empresa fundacional, D-6 |
| D10 | `MT-U10-B0-B1:81,143,156,177` | Grandfathering de la empresa fundacional |
| D11 | `INVESTIGACION-AUTH-RECUPERACION-CONFIG.md:90,299,452,579,634,679,762` | R-6 documentado como deuda |

---

## Fase 2 — Clasificación

Cada ocurrencia se clasifica en una de cinco categorías:

### 2.1 Categoría 1 — Debe eliminarse

**El campo `esFundacional` como mecanismo de descubrimiento en el login.**

| # | Archivo | Cambio requerido |
|---|---|---|
| 1 | `functions/src/operational-auth.ts:85,123-126` | **Eliminar `obtenerEmpresaFundacional()` del `resolverCredencialOperativa`.** La búsqueda de credencial ya es global (`where("codigo","==",codigo)` en L127). El prefiltro por empresa fundacional es redundante (L124-126 ya se incluye en el conjunto global vía L131) y además **introduce el requisito de que exista exactamente una empresa fundacional** (si `obtenerEmpresaFundacional()` retorna null, el sistema falla). |

**Justificación técnica detallada:**

El código actual en `operational-auth.ts:118-155`:

1. L123: `const empresaFundacional = await obtenerEmpresaFundacional()` — consulta `empresas where esFundacional==true limit 1`
2. L124: `const refFundacional = referenciaCredencial(empresaFundacional.id, codigo)` — genera una ruta con el `empresaId` fundacional
3. L125-127: Lee en paralelo esa ruta + query global `credenciales_operativas where codigo==codigo`
4. L130-133: Junta ambos resultados en `candidatas`

**El prefiltro por empresa fundacional es innecesario** porque ya existe una query global por código en L127. Peor aún: L131 incluye el resultado fundacional en `candidatas` aunque ya se resolvió por separado — es decir, la misma credencial se busca dos veces. Y si `obtenerEmpresaFundacional()` devuelve null (porque no existe ninguna empresa con `esFundacional==true`, p.ej. tras crear una segunda empresa sin esa marca), el sistema lanza error incluso aunque la credencial buscada exista en el tenant correcto.

**Corrección:** Eliminar L123-126 y L131. La query global L127 ya cubre todas las credenciales. Para las credenciales que sí tienen `empresaId` (L148-154), la validación de empresa y estado ya se hace correctamente.

### 2.2 Categoría 2 — Debe sustituirse

| # | Archivo | Problema | Sustitución |
|---|---|---|---|
| 2 | `lib/empresas-service.ts:77-88` | `obtenerEmpresaFundacional()` es usada exclusivamente por `operational-auth.ts`. Al eliminar ese uso, la función queda sin consumidores en runtime. | **Conservar la función** pero marcarla como `@deprecated`. Si se confirma que ningún otro módulo la importa tras la migración, eliminar en una limpieza posterior. |

### 2.2 bis — Rutas públicas: FUERA del alcance de R-6

Las rutas `app/api/reservas/*` y `app/api/webhooks/wompi/route.ts` usan `esFundacional` para resolver el tenant sin sesión autenticada. **No se modifican en R-6.** Permanecen como deuda de MT-U11.

**Justificación:**

1. **R-6 es una deuda del flujo de autenticación.** Estas rutas no son autenticación — son endpoints públicos que corren con Admin SDK porque el visitante no tiene sesión de Firebase Auth. Resolver el tenant en estas rutas es un problema **anterior e independiente** de R-6.

2. **Sustituir `esFundacional==true` por `estado in ['trial','activa']` sería cambiar un mecanismo temporal por otro.** Ambos asumen "una sola empresa" y ambos dejarán de ser válidos con múltiples tenants. No hay ganancia arquitectónica. La solución real para estas rutas requiere resolver el tenant por subdominio, slug en URL, o vinculación de dispositivo — todo ello fuera del alcance de R-6 y dentro del alcance de MT-U11/D-013-2.

3. **La documentación ya anticipa esta deuda.** MT-U3-CAPA5-runbook-activacion.md:177: *"Activar una segunda empresa (MT-U11) — el mecanismo `esFundacional` de las rutas de reservas debe migrarse"*. MT-U3-CAPA6-cierre.md:136: misma advertencia.

4. **El webhook de Wompi ya tiene la lógica correcta parcialmente**: L96 prefiere `reservaData.empresaId` sobre `empresaIdFundacional`. El fallback a `esFundacional` solo aplica a reservas legacy creadas antes de MT-U3. Sustituir la query del fallback no aporta nada — cuando haya múltiples tenants, este fallback será incorrecto independientemente de qué query se use.

**Conclusión:** Las rutas públicas quedan **exactamente como están.** Eliminarlas del alcance de R-6 reduce el riesgo de regresión y evita introducir un mecanismo temporal que también deberá migrarse después. R-6 se enfoca exclusivamente en `operational-auth.ts` y `obtenerEmpresaFundacional()`.

### 2.3 Categoría 3 — Debe conservarse (scripts históricos)

| # | Archivo | Justificación |
|---|---|---|
| 13 | `functions/src/bootstrap/service.ts:280` | Bootstrap escribe `esFundacional: false` para tenants nuevos. Es la **fuente canónica del valor `false`** y debe conservarse exactamente como está. Sin cambios. |
| 14 | `scripts/migrate-mt-u1-fundacional.ts:128,145` | Script histórico que creó la empresa fundacional. Está **ya ejecutado en producción.** Conservarlo para trazabilidad y para el caso hipotético de restaurar una empresa desde backup. Sin cambios. |
| 15 | `scripts/migrate-mt-u3-operativo.ts:249` | Script histórico de MT-U3. Ya ejecutado. Sin cambios. |
| 16 | `scripts/migrate-mt-u5b-membresias.ts:37` | Script histórico de MT-U5B. Ya ejecutado. Sin cambios. |
| 17 | `scripts/set-claims-mt-u2.ts:100` | Script histórico de MT-U2. Ya ejecutado. Sin cambios. |
| 18 | `scripts/rollback-mt-u1-fundacional.ts:108` | Rollback. Sin cambios. |
| 19 | `scripts/rollback-mt-u3-operativo.ts:227` | Rollback. Sin cambios. |
| 20 | `scripts/backfill-empresa-fundacional-contrato.ts:133` | Script histórico. Ya ejecutado. Sin cambios. |
| 21 | `scripts/verificar-activacion-mt-u3.ts:92` | Herramienta de verificación. Sin cambios. |

### 2.4 Categoría 4 — Solo documentación

| # | Archivo | Acción |
|---|---|---|
| 6 | `lib/tenant.ts:48` | Actualizar comentario para reflejar que `esFundacional` ya no se usa en caminos de runtime. |
| 7 | `lib/reservas-service.ts:78` | Actualizar comentario para reflejar el nuevo mecanismo de resolución. |

### 2.5 Categoría 5 — Solo pruebas

| # | Archivo | Acción |
|---|---|---|
| 23 | `functions/src/email-integration.test.ts:29,31` | Actualizar fixtures de prueba para que no dependan de `esFundacional`. |
| 24 | `functions/src/bootstrap/service.test.ts:216` | Sin cambios. La aserción `esFundacional: false` es correcta para tenants nuevos. |
| 25 | `firestore-rules/global-platform.test.ts` | Actualizar fixtures para no depender de `esFundacional` si aplica. |

### 2.6 El tipo `Empresa`

| # | Archivo | Acción |
|---|---|---|
| 3 | `lib/empresas-service.ts:55` | **Conservar el campo `esFundacional: boolean` en la interfaz.** No eliminarlo: (a) el documento en producción lo tiene, (b) Bootstrap sigue escribiéndolo, (c) los scripts históricos lo leen. El campo no se elimina de la base de datos ni del tipo — solo se elimina su uso como mecanismo de **descubrimiento en runtime**. |

---

## Fase 3 — Diseño

### 3.1 Principio rector

> Eliminar la dependencia de `esFundacional` del flujo de autenticación SIN cambiar el modelo de resolución de credenciales. La búsqueda por código ya es global; `esFundacional` solo añadía una lectura innecesaria antes de una query que ya cubría el mismo espacio.

### 3.2 Cambio en `operational-auth.ts`

**Antes (líneas 118-155, simplificado):**

```typescript
async function resolverCredencialOperativa(codigo, pin) {
  const empresaFundacional = await obtenerEmpresaFundacional();        // ← ELIMINAR
  const refFundacional = referenciaCredencial(empresaFundacional.id, codigo); // ← ELIMINAR
  const [fundacionalSnap, credencialesConCodigo] = await Promise.all([
    refFundacional.get(),                                              // ← ELIMINAR
    db.collection("credenciales_operativas").where("codigo","==",codigo).get(), // ← CONSERVAR
  ]);
  const candidatas = [
    ...(fundacionalSnap.exists ? [fundacionalSnap] : []),              // ← ELIMINAR
    ...credencialesConCodigo.docs.filter(...)                           // ← CONSERVAR
  ];
  // ... validación de PIN, coincidencias, empresaId, estado ...
}
```

**Después:**

```typescript
async function resolverCredencialOperativa(codigo, pin) {
  const db = getFirestore();
  const credencialesConCodigo = await db
    .collection("credenciales_operativas")
    .where("codigo", "==", codigo)
    .get();

  const candidatas = credencialesConCodigo.docs;

  const coincidencias = (await Promise.all(candidatas.map(async (snap) => {
    const credencial = snap.data() as CredencialOperativa;
    if (credencial.activo !== true || await estaBloqueada(snap.ref) || !credencial.pinHash) return null;
    return await verificarPin(pin, credencial.pinHash, obtenerPepper())
      ? { ref: snap.ref, credencial }
      : null;
  }))).filter((c): c is { ref: ...; credencial: CredencialOperativa } => c !== null);

  if (coincidencias.length !== 1) {
    if (candidatas.length === 1) await registrarFallo(candidatas[0].ref);
    throw errorCredenciales();
  }

  const { ref, credencial } = coincidencias[0];
  if (typeof credencial.empresaId !== "string" || credencial.empresaId.trim().length === 0) {
    throw errorCredenciales();
  }
  const empresaSnap = await db.collection("empresas").doc(credencial.empresaId).get();
  const estado = empresaSnap.data()?.estado;
  if (!empresaSnap.exists || (estado !== "activa" && estado !== "trial")) throw errorCredenciales();
  return { empresa: { id: empresaSnap.id, estado: estado as string }, ref, credencial };
}
```

**Cambio neto:** Se eliminan 6 líneas (la consulta a `obtenerEmpresaFundacional`, la ruta prefiltrada, el `Promise.all`, y la inclusión manual en candidatas). La lógica de validación de PIN, empresa y estado (L134-154) permanece idéntica.

### 3.3 Rutas de API públicas — SIN cambios

Las rutas `app/api/reservas/*` y `app/api/webhooks/wompi/route.ts` **no se modifican en R-6.** Permanecen con su resolución actual por `esFundacional==true`. La justificación detallada está en §2.2 bis.

Estas rutas son deuda de MT-U11. R-6 se enfoca exclusivamente en el flujo de autenticación.

### 3.4 Matriz de equivalencia funcional del login

Esta sección demuestra que la eliminación del prefiltro por `esFundacional` en `resolverCredencialOperativa` **no modifica ningún comportamiento observable de autenticación.** Cada escenario se analiza con el código actual y con el código propuesto.

| # | Escenario | Antes (con `esFundacional`) | Después (sin `esFundacional`) | ¿Cambio? |
|---|---|---|---|---|
| **E1** | Login con código+PIN válidos, credencial en tenant fundacional | Obtiene `empresaFundacional` → busca credencial por ruta específica `credenciales_operativas/{fundacionalId}_{codigo}` + query global por código → ambas devuelven la misma credencial → `candidatas` contiene el mismo documento dos veces (L131 lo incluye, L124-126 también) → `filter` por PIN deja una coincidencia → éxito. | Query global por código devuelve la credencial en el conjunto de resultados → `filter` por PIN deja una coincidencia → éxito. | **No.** Resultado idéntico. La credencial se encuentra por el mismo código. |
| **E2** | Login con código+PIN válidos, credencial en tenant NO fundacional (futuro, MT-U11) | Obtiene `empresaFundacional` → busca credencial en tenant fundacional (no existe) → query global encuentra la credencial en su tenant → `candidatas` contiene solo el resultado global → éxito. | Query global encuentra la credencial en su tenant → éxito. | **No.** Resultado idéntico. En ambos casos es la query global la que encuentra la credencial. |
| **E3** | Login con PIN incorrecto | `candidatas` contiene la(s) credencial(es) con ese código → `verificarPin` falla para todas → `coincidencias.length === 0` → `registrarFallo` si hay exactamente 1 candidata → `throw errorCredenciales()`. | Ídem. | **No.** La validación de PIN (L134-140) no se modifica. |
| **E4** | Login con código inexistente | `fundacionalSnap` no existe → query global devuelve vacío → `candidatas` vacío → `coincidencias.length === 0` → como `candidatas.length !== 1`, no se registra fallo → `throw errorCredenciales()`. | Query global devuelve vacío → `candidatas` vacío → `coincidencias.length === 0` → `throw errorCredenciales()`. | **No.** Resultado idéntico. |
| **E5** | Login con código duplicado entre tenants, mismo PIN | Ambas credenciales pasan `verificarPin` → `coincidencias.length === 2` → `throw errorCredenciales()`. | Ídem. La query global devuelve ambas credenciales. | **No.** La validación de coincidencia única (L142-145) no se modifica. |
| **E6** | Login con credencial bloqueada (5 fallos previos) | `estaBloqueada(snap.ref)` retorna `true` → la credencial se filtra en L136 → si es la única, `coincidencias.length === 0`. | Ídem. | **No.** La verificación de bloqueo (L136) no se modifica. |
| **E7** | Login con credencial inactiva (`activo !== true`) | La credencial se filtra en L136 → `coincidencias` no la incluye. | Ídem. | **No.** El filtro de `activo` (L136) no se modifica. |
| **E8** | Login con credencial sin `empresaId` | L148: `if (typeof credencial.empresaId !== "string" ...) throw errorCredenciales()`. | Ídem. | **No.** La validación de `empresaId` (L148-150) no se modifica. |
| **E9** | Login con empresa en estado `suspendida` o `cancelada` | L152-153: `if (estado !== "activa" && estado !== "trial") throw errorCredenciales()`. | Ídem. | **No.** La validación de estado de empresa (L152-153) no se modifica. |
| **E10** | Login con `obtenerEmpresaFundacional()` retornando `null` (no existe empresa con `esFundacional==true`) | **Crash en L124:** `empresaFundacional.id` sobre `null` → `TypeError`. El sistema es inoperable. | Query global funciona normalmente. Si existe la credencial, el login procede. Si no, `errorCredenciales()`. | **Sí — mejora.** El código actual tiene un bug: si la empresa fundacional no existe, el login falla con un error no controlado. El código propuesto maneja este caso sin crash. |
| **E11** | Login con credencial que pertenece a empresa `archivada` o `eliminada` | L152-153: `estado !== "activa" && estado !== "trial"` → cubre `archivada`/`eliminada` → `throw errorCredenciales()`. | Ídem. | **No.** La validación de estado ya cubre todos los estados no operativos. |

**Conclusión de la matriz:** En 10 de 11 escenarios el comportamiento es **idéntico.** En el escenario restante (E10), el código propuesto **corrige un bug** donde el código actual produciría un `TypeError` no controlado. Ningún escenario muestra una regresión.

**Propiedades de seguridad conservadas:**

| Propiedad | ¿Se conserva? | Evidencia |
|---|---|---|
| Las credenciales se buscan por código | Sí | La query global `where("codigo","==",codigo)` permanece intacta |
| El PIN se verifica con bcrypt+pepper | Sí | `verificarPin()` no se modifica |
| Solo una coincidencia de PIN es válida | Sí | `coincidencias.length !== 1` → error |
| Las credenciales inactivas se rechazan | Sí | `activo !== true` permanece |
| Las credenciales bloqueadas se rechazan | Sí | `estaBloqueada()` permanece |
| La empresa debe estar `trial` o `activa` | Sí | Validación de estado en L152-153 permanece |
| El `empresaId` debe existir en la credencial | Sí | Validación en L148-150 permanece |
| El cliente no elige el tenant | Sí | El `empresaId` se lee de la credencial, no del input del cliente |

### 3.4 Cambio en `lib/empresas-service.ts`

Marcar `obtenerEmpresaFundacional()` como `@deprecated`:

```typescript
/**
 * @deprecated Desde R-6. Usar `obtenerEmpresaPorId(id)` con el `empresaId`
 * del claim, o resolver por `estado in ['trial','activa']` en rutas Admin.
 * Se conserva únicamente para compatibilidad con scripts históricos ya ejecutados.
 */
export async function obtenerEmpresaFundacional(): Promise<Empresa | null> {
```

La función se conserva en el módulo porque los scripts de migración (`migrate-mt-u1-fundacional.ts`, etc.) usan el patrón de query directamente (no importan esta función — hacen la query inline), así que `obtenerEmpresaFundacional()` no tiene consumidores en producción. Pero conservarla como `@deprecated` evita romper imports no detectados y sirve como documentación de la transición.

### 3.5 Lo que NO cambia

| Aspecto | Estado |
|---|---|
| Bootstrap escribe `esFundacional: false` | Sin cambios |
| Scripts históricos leen `esFundacional` | Sin cambios |
| El campo `esFundacional` en la interfaz `Empresa` | Sin cambios |
| El documento `empresas/1ae0rD9H8t3ZFSBKrrHR` en producción | Sin cambios (conserva `esFundacional: true`) |
| La resolución de PIN y validación de empresa | Sin cambios |
| Las reglas de Firestore | Sin cambios (no referencian `esFundacional`) |
| La búsqueda global de credenciales por código | Sin cambios (ya es el mecanismo correcto) |

### 3.6 Decisión arquitectónica nueva

**No se requiere ADR nuevo.** La eliminación de `esFundacional` del login es una **corrección de implementación**, no una decisión arquitectónica. La arquitectura ya decidió que el campo es transitorio (MT-U1 D-U1-1, MT-U5-CAPA0 §3.5 punto 2). Este cambio simplemente ejecuta esa decisión.

### 3.7 Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Credencial con código duplicado entre tenants no se resuelve correctamente | Baja (hoy: 1 tenant) | TECH-DEBT-COD-001 ya cubre este caso. La query global + validación de PIN ya maneja la desambiguación. El cambio no modifica esa lógica. |
| `obtenerEmpresaFundacional()` tiene consumidores no detectados | Baja | Se marca `@deprecated`, no se elimina. El compilador advertirá si hay usos residuales. |
| Regresión en login tras el cambio | Baja | La matriz de equivalencia funcional (§3.4) demuestra 10/11 escenarios idénticos y 1 mejora (corrección de bug en E10). La lógica de validación de PIN y empresa no se modifica. |

### 3.8 Plan de implementación

```
Fase 1 — operational-auth.ts (único cambio de runtime)
  ├─ Eliminar obtenerEmpresaFundacional() de resolverCredencialOperativa()
  ├─ Eliminar el prefiltro por empresa fundacional (L123-126, L131)
  ├─ Simplificar candidatas = credencialesConCodigo.docs directamente
  └─ Verificar que la lógica de validación (L134-154) no se modifica

Fase 2 — Limpieza
  ├─ Marcar obtenerEmpresaFundacional() como @deprecated
  ├─ Actualizar comentario en lib/tenant.ts
  └─ Actualizar fixtures de prueba (solo email-integration.test.ts)

Fase 3 — Verificación
  ├─ Ejecutar test suite: test:tenant, test:auth-foundation, test:tickets
  ├─ Prueba manual: login con credencial existente
  └─ Prueba manual: login con credencial nueva (post-bootstrap)
```

---

## Resumen

| Aspecto | Conclusión |
|---|---|
| **Archivos modificados** | 2 (`operational-auth.ts` + `empresas-service.ts` con `@deprecated`) |
| **Rutas API modificadas** | 0 (aplazado a MT-U11, ver §2.2 bis) |
| **Archivos sin cambios** | ~23 (scripts históricos, Bootstrap, rutas API, tests, documentación) |
| **ADR nuevo requerido** | No |
| **Riesgo de regresión** | Bajo. La lógica de validación de PIN/empresa no se modifica. |
| **Precondición de MT-U11** | Sí. MT-U11 no puede implementarse mientras el login dependa de que exista exactamente una empresa fundacional. |
| **Relación con TECH-DEBT-COD-001** | Independiente. La unicidad de códigos es un problema separado que R-6 no resuelve ni agrava. |
