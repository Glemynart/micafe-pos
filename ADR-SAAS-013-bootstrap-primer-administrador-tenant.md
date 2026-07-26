# ADR-SAAS-013 — Bootstrap del primer administrador de un tenant

- **Estado:** PROPUESTO (pendiente de aprobación)
- **Fecha:** 2026-07-25
- **Contexto arquitectónico:** MT-U9 (plano plataforma), ADR-SAAS-007 (bootstrap empresarial), ADR-SAAS-011 (operadores y facultades), ADR-SAAS-012 (auditoría), MT-U5a (autenticación operativa)
- **Sustituye/complementa:** ninguno. Cierra el hueco de arranque del plano tenant, equivalente al que `initial-bootstrap` cerró en el plano plataforma (IMP-002).

---

## 1. Contexto y problema

El sistema no puede dar acceso al primer administrador de ningún tenant. Verificado en producción el 2026-07-25 sobre la empresa fundacional `1ae0rD9H8t3ZFSBKrrHR`:

| Recurso | Estado |
|---|---|
| Empresa | ✅ existe, `estado=activa`, `esFundacional=true` |
| Membresía admin (`ht5nCeZ8xxatv4Te1nm4WEPf3iV2`) | ✅ `rol=admin`, `estado=activa`, 19 permisos |
| Custom claims | ✅ `{empresaId, rol:"admin"}` |
| **`credenciales_operativas`** | ❌ **0 documentos** |
| **`incorporaciones`** | ❌ **0 documentos** |

`autenticarOperativo` (`functions/src/operational-auth.ts`) **empieza** resolviendo una credencial en `credenciales_operativas`. Sin ella, el login falla para todos los usuarios del tenant, admin incluido, por perfectos que sean membresía y claims.

### 1.1 El bloqueo es circular

Las tres vías de creación de credenciales exigen una sesión tenant previa:

| Vía | Guardia | Utilizable sin sesión |
|---|---|---|
| `provisionarCredencialOperativa` | `exigirAdminTenant` | ❌ |
| `crearIncorporacionDirecta` | `exigirAdminTenant` | ❌ |
| `crearIncorporacionEmail` | `exigirAdminTenant` | ❌ |
| `activarIncorporacionDirecta` | claim `authStage=DIRECTA_TEMP` | ❌ (exige una incorporación previa) |

No existe script ni callable que rompa el ciclo. **`ejecutarBootstrapEmpresarial` tampoco emite credencial**: todo tenant creado desde el Backoffice nace con el mismo bloqueo.

### 1.2 Hallazgo adicional: la incorporación DIRECTA está muerta en el cliente

El backend implementa el ciclo completo de credencial temporal (`requiereCambio` → `emitirSesionActivacionDirecta` → `activarIncorporacionDirecta`). El cliente **no**: `requiereCambio`, `activarIncorporacionDirecta` y `DIRECTA_TEMP` no aparecen en `app/`, `lib/`, `components/` ni `contexts/`.

`lib/operational-auth-service.ts` descarta `requiereCambio`, canjea el token `DIRECTA_TEMP` —que deliberadamente no lleva claims tenant—, comprueba `empresaId` y hace `signOut`. Resultado: **toda alta de usuario por código+PIN produce usuarios que no pueden entrar**, no solo el primer admin.

Por eso este ADR cubre el flujo de extremo a extremo. Resolver solo el bootstrap dejaría el segundo defecto vivo.

### 1.3 Hallazgo colateral: el espacio de códigos es global (H-COD-001)

`resolverCredencialOperativa` no recibe `empresaId` del cliente (correcto: evita que un cliente apunte a otro tenant). Lo deriva consultando **todas** las credenciales con ese código, **en todos los tenants**, y verificando el PIN contra cada candidata:

```ts
const coincidencias = ... // candidatas cuyo PIN verifica
if (coincidencias.length !== 1) { ...; throw errorCredenciales(); }
```

El identificador de documento es `${empresaId}_${codigo}` (único por tenant), pero **la desambiguación en login es global y la decide el PIN**. Si dos tenants tienen el mismo código y el mismo PIN de 6 dígitos, `coincidencias.length === 2` y **ambos usuarios quedan bloqueados**, sin diagnóstico posible desde el cliente.

Con códigos legibles elegidos a mano (`admin`, `caja1`, `cajero`), la colisión de código es la norma, y solo quedan 10⁶ PINs para separar. Por el problema del cumpleaños, con ~1.200 tenants usando `admin` la probabilidad de al menos una colisión `(código, PIN)` supera el 50 %. Es un fallo silencioso, sin causa aparente y sin remedio para el usuario.

Este hallazgo determina la decisión **D-1**.

---

## 2. Decisión

**La plataforma es la autoridad que emite la primera credencial operativa de un tenant.** El tenant nunca se arranca a sí mismo, y ningún script lo hace por él.

La cadena de confianza queda terminada, sin ciclo:

```
initial-bootstrap (one-shot, cerrado tras el primer uso)  →  operador de plataforma
operador de plataforma                                    →  primer admin del tenant   ← este ADR
primer admin del tenant                                   →  resto de usuarios del tenant
```

---

## 3. D-1 — Generación del código operativo: automática

**Decisión: el sistema genera el código. El operador no lo introduce.**

### 3.1 Alternativas evaluadas

| | Manual (operador escribe el código) | Automática (servidor lo genera) |
|---|---|---|
| Colisión global (H-COD-001) | **Alta y creciente** con el número de tenants | **Nula**: unicidad global verificada antes de escribir |
| Memorización | Buena (`admin`, `caja1`) | Aceptable si es pronunciable |
| Errores de tipeo del operador | Sí (código inválido, duplicado en el tenant) | No |
| Enumerabilidad por terceros | Alta: `admin`/`caja1` son adivinables; reduce el secreto a los 10⁶ del PIN | Baja: el código aporta entropía propia |
| Superficie de fuerza bruta | Código conocido + PIN → 10⁶ | Código desconocido + PIN → 10⁶ × entropía del código |
| Carga operativa del operador | Debe inventar y registrar un convenio de nombres | Ninguna |
| Reproducibilidad ante incidencia | Baja (convenios divergentes por tenant) | Alta (formato único) |

### 3.2 Formato adoptado

```
<slug-empresa-6>-<4 caracteres base32 Crockford>
ej.:  atrato-7k2m     cafecen-9xq4
```

- Cumple `CODIGO_REGEX = /^[a-z0-9._-]{3,32}$/` sin cambiar el contrato.
- Base32 Crockford excluye `i`, `l`, `o`, `u`: elimina la confusión `1/l/I` y `0/O` al dictar el código por teléfono.
- 4 caracteres = 32⁴ ≈ 1,05 M combinaciones **por slug**; el slug ya separa por tenant. La unicidad global se **verifica**, no se asume: si el código generado existe en cualquier tenant, se regenera (hasta 5 intentos, luego error explícito).
- Pronunciable y dictable, que es el requisito operativo real: el operador lo transmite una vez, el admin lo teclea una vez.

### 3.3 ¿Es la resolución global por código una decisión arquitectónica definitiva?

El propietario del producto pidió distinguir explícitamente entre "corregir el diseño actual" y "convertir una limitación en decisión permanente". Se analiza aquí.

**Primero, una distinción que el ADR original no hacía explícita:** existen dos problemas de identidad distintos, con vidas independientes.

| | Identidad del tenant | Identidad del operativo dentro del tenant |
|---|---|---|
| Pregunta que responde | "¿en qué empresa estoy?" | "¿quién soy dentro de esa empresa?" |
| Mecanismo hoy | Ninguno explícito — implícito en la instalación del POS | Código + PIN, resuelto globalmente |
| Campo reservado | `empresas.slug` (`lib/empresas-service.ts:51`), declarado desde MT-U1 para MT-U7 (onboarding), **sin consumidor todavía** | `credenciales_operativas` |
| Cardinalidad esperada | Una resolución por dispositivo/sesión de navegador, estable en el tiempo | Varias por turno, por varios operativos en el mismo dispositivo |

Este ADR solo toca la segunda. La primera —cómo un navegador nuevo sabe a qué tenant pertenece— **no está resuelta por nada hoy**, ya sea con código global o con subdominio: el POS actual no tiene selector de tenant en ninguna parte, y `slug` existe reservado precisamente para cuando MT-U7 lo necesite. Conviene no confundir ambas al decidir.

**Alternativas evaluadas para la resolución global por código de login (no para la identidad del tenant, que es un problema aparte):**

| Alternativa | Qué resuelve | Coste | Por qué no ahora |
|---|---|---|---|
| **Subdominio por tenant** (`atrato.micafe-pos.app`) | Elimina la ambigüedad de tenant en el nivel de transporte, antes de tocar Firestore | Wildcard DNS, configuración de dominios en Vercel, resolución de tenant en middleware, y **aun así** el login seguiría necesitando código+PIN para identificar al operativo *dentro* de ese tenant ya resuelto — no sustituye este mecanismo, lo complementa | Es la solución correcta para la identidad del tenant (problema de la fila de arriba), no para la del operativo. Adoptarla no habría evitado H-COD-001: dentro de un mismo subdominio, dos cajeros seguirían pudiendo llamarse `admin` con el mismo PIN si el código se sigue derivando sin `empresaId` |
| **Selector de empresa en el login** | Igual que el subdominio, a nivel de UI | Ninguno en infraestructura, pero **viola directamente el punto 4 del propietario**: "no quiero un rediseño del login". Y es peor UX para un cajero que ya sabe en qué café está — obligarlo a elegir entre una lista es fricción sin beneficio | Descartada por mandato explícito y porque no aporta nada que el dispositivo no sepa ya |
| **Device/localStorage con `empresaId` fijado en la instalación del POS** | Resuelve la identidad del tenant sin tocar el login, apoyándose en que el POS de un café real se instala una vez en un dispositivo que no cambia de tenant | Ninguno arquitectónico: es exactamente la reserva que ya existe (`slug`) más un paso de "vincular este dispositivo" en el primer arranque | Es plausible y barato, pero pertenece a **MT-U7 (onboarding)**, no a este ADR — cambiaría cómo arranca el POS por primera vez en un dispositivo, no cómo se autentica un operativo ya instalado |
| **Generación automática + verificación global de unicidad** (la elegida) | Reduce la probabilidad de colisión de código a la construcción, sin tocar el modelo de resolución | Ninguno: cambia solo cómo se genera el código, no cómo se busca | Resuelve el síntoma inmediato con el menor cambio de superficie, compatible con cualquier evolución futura de la fila de arriba |

**Conclusión: no es una decisión permanente, es la corrección mínima suficiente para el modelo actual, y es compatible con cualquiera de las evoluciones de la tabla.** La resolución global por código seguirá existiendo mientras el login siga siendo código+PIN sin selección previa de tenant — eso no cambia con este ADR ni lo impide. Lo que si el sistema decide alguna vez fijar el tenant antes del login (subdominio o dispositivo vinculado), la búsqueda de credencial se acota a una sola empresa de forma trivial (se le añade `.where('empresaId','==', tenantResuelto)` antes del filtro por código) sin tocar el modelo de datos que este ADR introduce. La generación automática de código no crea ninguna dependencia sobre el mecanismo global: sigue siendo correcta —de hecho, mejora la seguridad— incluso el día que la búsqueda deje de ser global.

**Por qué la generación automática sí es la mejor decisión a largo plazo, independientemente de lo anterior:** un código elegido por una persona (`admin`) es enumerable y memorizable por terceros; uno generado con entropía propia no lo es. Esa propiedad es deseable en cualquier escenario de resolución, global o acotada por tenant. No hay escenario futuro en el que "el operador puede escribir manualmente el código del primer admin" sea preferible a "el sistema lo genera con unicidad verificada".

### 3.4 Consecuencia sobre H-COD-001

Este ADR **elimina** el riesgo de colisión para credenciales iniciales, pero **no** para las que un admin de tenant crea después con `provisionarCredencialOperativa`, que sigue aceptando código manual.

Se registra como deuda **TECH-DEBT-COD-001**: extender la verificación de unicidad global a `provisionarCredencialOperativa` y `crearIncorporacionDirecta`. No se aborda aquí para no ampliar el alcance, pero es un fallo latente con impacto de bloqueo mutuo — y, a la luz de §3.3, no es una deuda cosmética: mientras exista una vía de creación de credenciales sin la misma verificación de unicidad, la garantía "la resolución global es segura porque el código no colisiona" queda incompleta. Se recomienda priorizarla antes de que el número de tenants activos haga la colisión probable en la práctica (estimado en la introducción de §1.3: riesgo material a partir de ~cientos de tenants con convención de códigos compartida).

---

## 4. D-2 — Alcance de `ProvisionarCredencialInicialTenant`

Operación **deliberadamente estrecha**. No es un mecanismo general de gestión de credenciales.

### 4.1 Cuándo puede ejecutarse

Todas las precondiciones se verifican **dentro de la transacción**, no antes:

1. La empresa existe y su `estado` ∈ {`trial`, `activa`}. Estados `suspendida`, `cancelada`, `archivada`, `eliminada` → `EMPRESA_NO_PROVISIONABLE`.
2. El `uid` destino es **exactamente `empresa.ownerUid`**. No acepta un uid arbitrario.
3. Ese uid tiene membresía `rol=admin`, `estado=activa`, `activo=true`.
4. El tenant **no tiene ninguna credencial operativa activa** (`activo=true`), salvo el caso de reprovisionamiento del §4.4.

### 4.2 Quién puede ejecutarla

Operador de plataforma con estado `ACTIVO` y facultad **`LIFECYCLE_GOBERNAR`**, vía `autorizarPlataforma`.

No se crea facultad nueva: obligaría a reproyectar los claims de los operadores vivos y a versionar `versionAutorizacion` sin ganancia semántica. `LIFECYCLE_GOBERNAR` ya gobierna el estado operativo de la empresa (activar/suspender/reactivar), y "poder ser usada por primera vez" pertenece a esa misma categoría.

### 4.3 Si ya existe una credencial operativa activa

**Falla con `PRIMERA_CREDENCIAL_YA_EXISTE`.** Sin excepción, sin bandera de forzado, sin parámetro `override`.

Ésta es la garantía central contra el abuso: la operación no puede reemplazar la credencial de nadie. Si el admin de un tenant pierde su PIN, **este comando no es la solución** — la recuperación de acceso es un problema distinto, con requisitos de verificación de identidad distintos, y se aborda en el §4.7.

### 4.4 Si la credencial temporal expiró o nunca se activó

Único caso de reemisión admitido, y solo cuando **todas** se cumplen:

- existe una incorporación `mecanismo=DIRECTA`, `origen=PLATAFORMA`, para el `ownerUid`;
- su estado es `TEMP_CREDENTIAL` (nunca se activó) o `EXPIRED`;
- la credencial asociada tiene `requiereCambio=true` — **jamás se ha usado para operar**.

La reemisión, en una transacción:
1. marca la incorporación anterior `EXPIRED`;
2. desactiva la credencial anterior (`activo=false`) — no la borra, para conservar la traza;
3. emite código y PIN temporal nuevos;
4. registra evento de auditoría `CREDENCIAL_INICIAL_REEMITIDA` distinguible del alta.

Si la credencial **ya fue activada** (`requiereCambio` ausente o `false`), el estado es indistinguible de una credencial normal en uso y aplica el §4.3: rechazo.

### 4.5 Por qué no puede degenerar en un gestor general de credenciales

| Vector de abuso | Barrera |
|---|---|
| Reemplazar la credencial de un cajero | Solo admite `empresa.ownerUid` (§4.1.2) |
| Reemplazar la credencial del admin en uso | `PRIMERA_CREDENCIAL_YA_EXISTE` (§4.3) |
| Reemitir repetidamente para obtener acceso | Solo sobre credenciales `requiereCambio=true` nunca usadas (§4.4) |
| Usarla sobre un tenant suspendido | Estado ∈ {trial, activa} (§4.1.1) |
| Ejecutarla sin ser operador | `autorizarPlataforma` + operador `ACTIVO` |
| Ejecutarla sin dejar rastro | Auditoría obligatoria (§4.6) |
| Operar el POS con el PIN temporal | El token `DIRECTA_TEMP` no lleva claims tenant: no lee datos ni opera |
| Acumular acceso el operador | No conoce el PIN definitivo ni obtiene membresía en el tenant |

**Invariante de diseño:** el operador de plataforma puede conceder el *primer* acceso, nunca *tomar* un acceso existente.

### 4.6 Auditoría y restricciones

Conforme a ADR-SAAS-012, con obligación append-only en dos fases:

| Evento | Momento | Actor |
|---|---|---|
| `CREDENCIAL_INICIAL_SOLICITADA` | Antes del commit, con obligación `SOLICITADO` | Operador |
| `CREDENCIAL_INICIAL_EMITIDA` | Confirmación en la misma transacción del hecho durable | Sistema |
| `CREDENCIAL_INICIAL_REEMITIDA` | Solo en el caso §4.4 | Operador |
| `CREDENCIAL_INICIAL_ACTIVADA` | Cuando el admin fija su PIN definitivo | Admin del tenant |

Restricciones adicionales:
- **Idempotencia** por `idempotencyKey` del envelope: un reintento devuelve el mismo resultado y **no puede reexponer el PIN temporal**.
- El PIN temporal se genera server-side, **nunca se persiste en claro** (solo bcrypt+pepper, coste 12) y se devuelve una única vez en la respuesta del callable.
- Ni el PIN ni el código aparecen en logs. Los eventos registran `incorporacionId` y `codigo`, nunca el PIN.
- TTL de 72 h (**D-3**). Vencido → `EXPIRED`, reprovisionable por §4.4.
- Bloqueo por fuerza bruta heredado del mecanismo existente: 5 fallos → 15 min.

### 4.7 Fuera de alcance (explícito)

Recuperación de acceso de un admin cuya credencial **ya está en uso**. Requiere verificación de identidad fuera de banda y, previsiblemente, el flujo de soporte con consentimiento de ADR-SAAS-011. Se registra como **deuda D-013-1**, sin diseño en este ADR. Cerrarlo aquí implicaría exactamente la puerta administrativa amplia que se quiere evitar.

---

## 5. D-4 — El Backoffice como superficie de administración de empresas

**Decisión: sí. La credencial inicial se integra en la ficha de empresa, no como comando aislado.**

### 5.1 Justificación

Un comando suelto obligaría al operador a conocer el `empresaId` opaco y a invocarlo desde fuera de contexto, sin ver el estado que lo hace aplicable. La ficha ya es el punto donde el operador consulta estado canónico, suscripción y provisionamiento, y donde ejecuta lifecycle. El acceso inicial pertenece a esa misma superficie por la misma razón.

Además obliga a definir la frontera de planos de forma explícita, que es valor arquitectónico duradero.

### 5.2 Frontera de planos

| Plano | Responsable | Alcance |
|---|---|---|
| **Administración de la empresa** | Backoffice SaaS | Identidad administrativa, ciclo de vida, suscripción y plan, acceso inicial, auditoría, soporte |
| **Operación del negocio** | POS del cliente | Ventas, caja, turnos, inventario, KDS, salón, reservas, productos, precios, usuarios del equipo |

**Regla:** el Backoffice **nunca** lee ni escribe datos operativos del tenant. No accede a `ventas`, `productos`, `turnos` ni a ninguna de las 25 colecciones oficiales de MT-U3. Si un operador necesita ver datos operativos, la vía es el flujo de soporte con consentimiento (ADR-SAAS-011), no la ficha.

### 5.3 Capacidades de la ficha de empresa

| Capacidad | Estado | Facultad |
|---|---|---|
| Consultar información de la empresa | ✅ existe | `PLATAFORMA_CONSULTAR` |
| Ver suscripción y provisionamiento | ✅ existe | `PLATAFORMA_CONSULTAR` |
| Suspender / reactivar | ✅ existe | `LIFECYCLE_GOBERNAR` |
| Archivar / restaurar / eliminar | ✅ existe | `CONSERVACION_GOBERNAR` |
| **Ver administrador inicial** | 🆕 | `PLATAFORMA_CONSULTAR` |
| **Ver estado de la credencial inicial** | 🆕 | `PLATAFORMA_CONSULTAR` |
| **Provisionar / reprovisionar credencial inicial** | 🆕 | `LIFECYCLE_GOBERNAR` |
| **Editar nombre comercial** | 🆕 | `LIFECYCLE_GOBERNAR` |

**Estado de la credencial inicial** — proyección derivada, sin campo nuevo:

| Estado | Significado |
|---|---|
| `SIN_PROVISIONAR` | No hay credencial. Acción disponible: provisionar |
| `PENDIENTE_ACTIVACION` | Emitida, `requiereCambio=true`, dentro del TTL |
| `EXPIRADA` | TTL vencido sin activar. Acción disponible: reprovisionar |
| `ACTIVA` | El admin fijó su PIN. **Sin acciones** |

**Edición del nombre comercial** — comando `ActualizarDatosAdministrativosEmpresa` con `expectedRevision`, que escribe `nombre`/`nombreComercial` en `empresas` y propaga a `configuraciones/{empresaId}`. Alcance limitado a la denominación comercial: `paisFiscal` queda **excluido** por sus implicaciones fiscales sobre numeraciones ya emitidas, y `estado` pertenece a lifecycle. Esto convierte el renombrado del tenant fundacional (§8, D-6) en el primer uso de un mecanismo general, no en un script.

### 5.4 Alcance administrativo, campo por campo

El propietario pidió fijar esta frontera ahora para que no crezca por decisiones puntuales. Se enumera contra los contratos de datos reales (`lib/empresas-service.ts:48` y `lib/configuracion-service.ts:12`, más `suscripciones`/`planes`), no en abstracto.

**Administrado por el Backoffice SaaS** (documentos `empresas`, `suscripciones`, `provisionamientos_empresariales`, `membresias` — solo lectura del rol/estado del admin inicial, `credenciales_operativas` — solo estado derivado):

| Campo | Colección | Operación |
|---|---|---|
| `nombre` / `nombreComercial` | `empresas` | Editar (`ActualizarDatosAdministrativosEmpresa`, §5.5) |
| `estado` (trial/activa/suspendida/cancelada/archivada/eliminada) | `empresas` | Transicionar (lifecycle/conservación, ya existente) |
| `ownerUid` y su membresía (`rol=admin`, `estado`) | `empresas` / `membresias` | Consultar. Ver §4.7 — no se reasigna aquí |
| Estado y ciclo de vida de la credencial inicial | `credenciales_operativas` (proyección) | Provisionar / reprovisionar (§4) |
| `planId`, `planVersion`, estado de suscripción, fechas de trial | `suscripciones` | Consultar y comandar (`ejecutarComandoComercialSaas`, ya existente) |
| Estado del provisionamiento (`CORE_COMMITTED`/`CLAIMS_ISSUED`/`COMPLETED`/...) | `provisionamientos_empresariales` | Consultar |
| `revision`, `schemaVersion`, `creadaEn`, `actualizadaEn` | `empresas` | Consultar (metadatos de sistema, nunca editables a mano) |
| Historial de auditoría del tenant | `auditoria_plataforma` | Consultar |

**Explícitamente fuera — pertenece al tenant, se administra desde `Configuración > Empresa` dentro del POS, nunca desde el Backoffice:**

| Campo | Colección | Por qué es tenant y no plataforma |
|---|---|---|
| `razonSocial`, `nit_tienda` | `configuracion/general` (deuda TECH-DEBT-CONFIG-001 → `configuraciones/{empresaId}`) | Dato fiscal operativo: lo declara el propio negocio ante su autoridad tributaria, no la plataforma que lo aloja. Ya tiene pantalla propia (FASE-CONFIG E1/E2/E3, mergeada) |
| `direccion_tienda`, `ciudad`, `telefono`, `email`, `logoUrl` | idem | Identidad de cara al cliente final del café, no de cara a la plataforma; cambia con frecuencia operativa (mudanza, nuevo logo) sin que la plataforma deba intervenir |
| `prefijo_factura`, `resolucion_dian`, `rangoInicio/Fin`, `regimenTributario` | idem / `numeraciones` | Numeración fiscal: cambiarlo sin control transaccional del propio tenant invalidaría comprobantes ya emitidos. Ya gestionado por `crearNumeracionFiscal`/`transicionarNumeracionFiscal` (plano tenant) |
| `mensaje_ticket`, `modulos_habilitados` | `configuracion/general` | Preferencia operativa diaria del negocio, sin relevancia para el gobierno de la cuenta SaaS |
| `baseCajaSugerida`, `umbralAlertaFaltante` | idem | Parámetro de caja, exclusivamente operativo |
| `paisFiscal` | `empresas` | **Caso límite, decidido explícitamente:** vive en `empresas` (plataforma), pero se excluye de edición en el Backoffice (§5.5) por sus implicaciones sobre numeraciones fiscales ya emitidas bajo ese país. Se fija en el bootstrap y requeriría, si alguna vez cambia, un procedimiento propio con migración de numeración — fuera de este ADR |
| Miembros del equipo distintos del admin inicial (cajeros, cocineros...) | `membresias` | Los crea y gestiona el admin del tenant vía `crearUsuarioConMembresia`/`actualizarMembresia`, ya existentes. El Backoffice no lista ni edita membresías no-admin |
| Cualquiera de las 25 colecciones oficiales de MT-U3 | `ventas`, `productos`, `turnos`, etc. | Dato operativo del negocio, cubierto por la regla de §5.2 |

**Regla de cierre, para que la superficie no crezca por goteo:** un campo entra en la columna "Backoffice" únicamente si describe **la relación comercial/contractual entre la plataforma y el tenant** (quién es el tenant, en qué estado está su cuenta, qué plan paga, quién es su administrador, si puede entrar). Todo lo que describe **cómo el tenant opera su propio negocio** —así sea un dato "administrativo" en sentido coloquial, como el NIT o la razón social— queda en el plano tenant. Ampliar la columna izquierda exige un ADR, no un PR.

### 5.5 Fuera de alcance de la ficha

No se añaden: edición de productos o precios, consulta de ventas, gestión de usuarios del tenant, ni acceso a configuración operativa. Todo eso es plano tenant, conforme a la tabla de §5.4.

---

## 6. D-5 — Flujo de extremo a extremo

```
Plataforma (Backoffice)                        Tenant (POS)
──────────────────────                         ─────────────
1. Operador → "Nueva empresa"
   nombre comercial, país, plan,
   + nombre del administrador
        │
2. solicitarBootstrapEmpresarialSaas
   ├─ empresa, configuración, espacio,
   │  numeración, membresía admin,
   │  suscripción trial        [EXISTE]
   └─ paso H: credencial inicial  [NUEVO]
      · principal Firebase Auth (uid generado)
      · código generado y verificado único
      · incorporación DIRECTA / TEMP_CREDENTIAL
        origen=PLATAFORMA, expiraEn=+72h
      · credencial requiereCambio=true
        │
3. Diálogo de entrega única:
   código + PIN temporal
   "no se volverá a mostrar"
        │
        └── entrega fuera de banda ──►  4. Login POS (pantalla actual)
                                           código + PIN temporal
                                        5. Backend → requiereCambio: true
                                        6. "Define tu PIN"  [NUEVO, en la misma pantalla]
                                           activarIncorporacionDirecta
                                        7. Credencial definitiva + claims
                                           {empresaId, rol:'admin'} → sesión
                                                │
                                        8. El admin da de alta a su equipo  [EXISTE]
```

### 6.1 Una sola implementación, dos puntos de entrada

La emisión de credencial inicial se extrae a un servicio único, invocado desde:

| Entrada | Caso | Facultad |
|---|---|---|
| Paso **H** de `ejecutarBootstrapEmpresarial` | Tenant nuevo, atómico con su creación | `BOOTSTRAP_EMPRESARIAL_SOLICITAR` |
| Comando `ProvisionarCredencialInicialTenant` | Tenant preexistente sin credencial (**fundacional**) o reprovisionamiento §4.4 | `LIFECYCLE_GOBERNAR` |

La empresa fundacional no puede pasar por la primera entrada: `ejecutarBootstrapEmpresarial` falla con `EMPRESA_ALREADY_EXISTS` y crearía una suscripción trial improcedente. Usa la segunda, que es **la misma operación** que cualquier tenant futuro empleará para reprovisionar. **No hay flujo separado ni parche temporal** (§8).

---

## 7. Cambios por componente

### 7.1 Cloud Functions

| Archivo | Cambio |
|---|---|
| `functions/src/contracts.ts` | `generarCodigoOperativo(slug)`, `generarPinTemporal()` (CSPRNG). `CredencialOperativa.origen`, `expiraEn` |
| `functions/src/incorporaciones-service.ts` | Extraer `emitirCredencialInicial()` del cuerpo de `crearIncorporacionDirecta`, parametrizado por origen. Comportamiento del llamador actual sin cambios |
| `functions/src/bootstrap/service.ts` | Paso **H** tras la membresía admin. Estado `CREDENTIAL_ISSUED` entre `CORE_COMMITTED` y `CLAIMS_ISSUED`, con la misma semántica recuperable ya existente |
| `functions/src/platform/callables.ts` | `provisionarCredencialInicialTenantSaas`, `actualizarDatosAdministrativosEmpresaSaas` |
| `functions/src/platform/operations.ts` | Ambos comandos con envelope, idempotencia y auditoría ADR-SAAS-012 |
| `functions/src/platform/command-catalog.ts` | Registro de comandos y facultades |
| `functions/src/platform/queries.ts` | `obtenerDetalleEmpresaPlataforma` devuelve `adminInicial` y `credencialInicial` (proyección §5.3). **Nunca el `pinHash`** |

### 7.2 Backoffice

| Componente | Cambio |
|---|---|
| `components/backoffice/bootstrap-form.tsx` | `ownerUid` deja de ser obligatorio (hoy exige un UID de Firebase que nadie puede crear desde el Backoffice: hueco real). Se añade "Nombre del administrador" |
| `components/backoffice/company-detail.tsx` | Tarjeta "Acceso inicial": administrador, estado de credencial, acciones según facultad. Reutiliza `Card`/`Datum`/`EstadoBadge` existentes |
| Componente nuevo | Diálogo de entrega única de credenciales |

### 7.3 POS — ver §9

### 7.4 Modelo de datos

Campos añadidos (aditivos y opcionales — los documentos existentes siguen siendo válidos sin migración):

| Colección | Campo | Motivo |
|---|---|---|
| `incorporaciones` | `origen: "PLATAFORMA" \| "TENANT"` | Auditar quién emitió el alta |
| `incorporaciones` | `expiraEn: Timestamp` | TTL (D-3) |
| `credenciales_operativas` | `origen`, `expiraEn` | Idem, para la proyección de estado |
| `provisionamientos_empresariales` | `credencialInicial: { codigo, incorporacionId, entregadaEn }` | Trazabilidad. **Nunca el PIN** |

Una colección nueva, `bootstrap_identidades_owner` — ver §7.6.

### 7.6 D-8 — Resolución de identidad del administrador (Capa 4)

`ownerUid` deja de ser obligatorio en `EntradaBootstrapEmpresarial`: se admite `nombreAdministrador` en su lugar. Cuando se usa, Bootstrap crea el principal de Auth ancla — `auth.createUser({ displayName, disabled: true })`, sin email ni password: nunca es un mecanismo de login, el admin siempre entra por código+PIN (§6). Se habilita (`disabled: false`) recién cuando el provisionamiento alcanza `CLAIMS_ISSUED`, para que un intento nunca completado no deje una cuenta utilizable.

`auth.createUser()` no es transaccional, así que la idempotencia no viene de derivar el UID (Firebase lo asigna) sino de persistirlo de inmediato en `bootstrap_identidades_owner/{provisionamientoId}`; cada reintento lo consulta primero y, si ya existe, reutiliza ese UID sin volver a invocar Auth. Riesgo residual aceptado: si el proceso se interrumpe en la ventana no transaccional entre la creación y esa persistencia, el principal creado queda huérfano — inerte (`disabled: true`, sin claims/membresía/credencial), misma clase de riesgo ya aceptada para la ventana de emisión de credencial (§4).

`bootstrap_identidades_owner` es **permanente**, no efímera — mismo ciclo de vida que `provisionamientos_empresariales` (tampoco se borra al completar). Responsabilidad única: proveniencia de una identidad creada por Bootstrap (qué UID, para qué intento, cuándo). Nunca leída fuera de la resolución de identidad.

### 7.5 Verificación bloqueante previa al despliegue de reglas

`credenciales_operativas` e `incorporaciones` **no** están entre las 25 colecciones oficiales de MT-U3 (llevan `empresaId` de nacimiento, por eso el backfill no las tocó). **Antes** de desplegar `firestore.rules` hay que confirmar que están cubiertas por reglas de aislamiento por tenant y que `pinHash` no es legible desde el cliente. Si no lo estuvieran, sería un hueco de aislamiento de severidad alta.

`bootstrap_identidades_owner` (§7.6) se suma a esta misma verificación bloqueante: es de plataforma, no de tenant, y exige acceso denegado a clientes.

---

## 8. D-6 — Empresa fundacional

El desbloqueo del tenant fundacional será **el primer uso del mecanismo definitivo**, no una operación aparte:

1. Se despliega `ProvisionarCredencialInicialTenant`.
2. El operador de plataforma lo ejecuta desde la ficha de `1ae0rD9H8t3ZFSBKrrHR`, cuyo `ownerUid` es `ht5nCeZ8xxatv4Te1nm4WEPf3iV2`, con membresía admin activa. Cumple todas las precondiciones del §4.1.
3. El admin activa su PIN por el flujo del §6, idéntico al de cualquier tenant futuro.
4. Se ejecuta entonces la regresión funcional de §9 Capa 5 de MT-U3.

No se escribe ningún script, ni se usa la clave de servicio, ni se introduce código con fecha de caducidad.

Pendiente de confirmación: si el nombre correcto del tenant es "Café Atrato" y no "Mi Café Especial", se corrige con `ActualizarDatosAdministrativosEmpresa` (§5.3) sobre el mismo documento — de nuevo, primer uso de un mecanismo general.

---

## 9. D-7 — Invariantes del POS

**Aprobado por el propietario: la rama de cambio obligatorio de PIN se implementa dentro del login existente.**

### 9.1 Invariantes de obligado cumplimiento

1. La navegación del POS no cambia: ninguna ruta nueva, eliminada ni redirigida.
2. Los colores, tipografías, espaciados y componentes existentes no se modifican.
3. Un usuario con credencial normal ve **exactamente** el mismo login y la misma secuencia de pasos.
4. Ventas, caja, turnos, KDS, salón y reservas no se tocan.
5. La rama de activación se renderiza **si y solo si** el backend responde `requiereCambio: true`.

### 9.2 Cambios admitidos

| Archivo | Cambio | Justificación |
|---|---|---|
| `lib/operational-auth-service.ts` | Dejar de descartar `requiereCambio` y propagarlo | Sin esto la rama es inalcanzable. Es la corrección del defecto §1.2 |
| `contexts/auth-context.tsx` | Exponer el estado "requiere activación" | El componente necesita conocerlo |
| `app/(tenant)/admin/login/page.tsx` | Renderizado condicional del paso de activación | Único punto de UI |
| Componente nuevo de activación | PIN nuevo + confirmación | Construido con los `Input`/`Button`/`Card` ya usados en esa pantalla |

### 9.3 Verificación de invariancia

- Captura del login **antes y después** con una credencial normal, comparadas.
- Prueba de que con `requiereCambio` ausente o `false` el árbol renderizado es idéntico al actual.
- Ningún archivo bajo `app/(tenant)/pos/`, `components/pos/`, `components/cocina/` ni `components/salon/` aparece en el diff.

Cualquier necesidad de modificar otra pantalla del POS **detiene la implementación** y vuelve a revisión arquitectónica.

---

## 10. Decisiones registradas

| # | Decisión | Resolución |
|---|---|---|
| D-1 | Generación del código operativo | **Automática**, formato `<slug>-<4 base32>`, unicidad global verificada (§3). Confirmado como corrección mínima suficiente, no como fijación permanente del modelo de resolución (§3.3) |
| D-2 | Alcance de `ProvisionarCredencialInicialTenant` | Estrecho: solo `ownerUid`, solo sin credencial activa, sin forzado (§4) |
| D-3 | TTL de la credencial temporal | **72 h** → `EXPIRED`, reprovisionable |
| D-4 | Superficie en el Backoffice | Integrada en la ficha de empresa, con frontera de planos explícita y alcance campo por campo (§5) |
| D-5 | Implementación | Servicio único, dos puntos de entrada (§6.1) |
| D-6 | Empresa fundacional | Primer uso del mecanismo definitivo, sin script (§8) |
| D-7 | Impacto en el POS | Cuatro archivos, rama condicional, invariancia verificada (§9) |

## 11. Deuda registrada

| Id | Descripción |
|---|---|
| **TECH-DEBT-COD-001** | Extender la verificación de unicidad global de códigos a `provisionarCredencialOperativa` y `crearIncorporacionDirecta` (H-COD-001, §3.4). Priorizar: sin esto, la garantía de §3.3 sobre la resolución global queda incompleta |
| **TECH-DEBT-CONFIG-001** | (ya registrada, referenciada en §5.4) migración de `configuracion/general` a `configuraciones/{empresaId}` |
| **D-013-1** | Recuperación de acceso de un admin con credencial ya activada (§4.7) |
| **D-013-2** | Identidad del tenant a nivel de dispositivo/sesión (subdominio o vinculación en primer arranque), evaluada y descartada de este ADR por pertenecer a MT-U7 (§3.3) |

## 12. Consecuencias

**Positivas.** Todo tenant nace utilizable. Se cierra el defecto §1.2 que dejaba muerta el alta de usuarios por código+PIN. Se elimina la colisión global de códigos en credenciales iniciales. El Backoffice gana una superficie coherente de administración de empresas con frontera de planos explícita. No se necesitan scripts ni claves de servicio para operar el SaaS.

**Negativas.** El PIN temporal se transmite fuera de banda (mitigado: alcance nulo, cambio obligatorio, TTL 72 h). El operador de plataforma gana la capacidad de conceder el primer acceso a un tenant — inevitable en cualquier diseño con arranque delegado, y acotada por §4.5 y la auditoría de §4.6.

**Neutras.** Cuatro archivos del POS cambian, ninguno visible para usuarios existentes.
