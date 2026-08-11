# MT — Arquitectura SaaS Multiempresa (Documento Maestro)

> **Estado:** ✅ Aprobado como vista arquitectónica consolidada del proyecto.
> **Base revisada:** `main @ a8a0cf3`.
> **Última revisión:** 2026-07-21.
> **Alcance vigente:** MT-U0 a MT-U5B completados; programa MT-U6→MT-U8 aprobado para diseño e implementación posterior.
>
> **Gobernanza documental:** este documento mantiene la vista consolidada y vigente de la arquitectura
> SaaS. Cada ADR aceptado es la autoridad histórica de la decisión concreta que registra. Las
> especificaciones futuras detallarán contratos y ejecución, pero no podrán redefinir el maestro ni los
> ADR. Ante una contradicción, prevalece el ADR aceptado más reciente que superseda explícitamente la
> decisión anterior y el maestro debe sincronizarse con él.

---

## 1. Principio rector y alcance

**Extender, no reemplazar.** El POS actual —autenticación, ventas, pedidos, reservas, KDS, inventario,
impresión y arquitectura por servicios— se preserva. La multi-tenencia y el ciclo de vida empresarial
son capas transversales que se insertan debajo de los servicios existentes.

El objetivo es operar cientos de empresas sobre una misma infraestructura con aislamiento fuerte,
identidad global y un ciclo SaaS coherente desde la creación del tenant hasta su archivo.

El programa **MT-U6→MT-U8** se trata como un único dominio: **Ciclo de vida empresarial SaaS**. Incluye
bootstrap, configuración, fiscalidad, suscripción, lifecycle y onboarding. Quedan fuera de este
documento el código, las migraciones ejecutables, la pasarela de pago y las dimensiones concretas de
monetización.

---

## 2. Decisiones validadas

| Decisión | Resumen | Autoridad |
|---|---|---|
| **D-1 — Tenancy** | Colecciones planas + `empresaId` + claims + rules. | ADR-SAAS-001 |
| **D-2 — Identidad** | Identidad SaaS global y autenticación operativa por empresa sobre Firebase Auth. | ADR-SAAS-002 |
| **D-3 — Ciclos separados** | `Empresa.estado` gobierna acceso/datos; la suscripción describe la relación comercial. | ADR-SAAS-003 y ADR-SAAS-009 |
| **D-4 — Modelo empresarial** | Configuración por empresa y numeración como entidad independiente. | ADR-SAAS-004 |
| **D-5 — Supervisor** | El rol supervisor es tenant y no pertenece al plano SaaS. | ADR-SAAS-005 |
| **D-6 — Incorporación** | `DIRECTA` y `EMAIL` convergen en membresía y claims; MT-U5B está completado. | ADR-SAAS-006 |
| **D-7 — Bootstrap** | El núcleo empresarial nace atómicamente; los claims se completan mediante una saga idempotente y recuperable. | ADR-SAAS-007 |
| **D-8 — Autoridad fiscal** | La selección de numeración es explícita y el número se asigna atómicamente con la venta. | ADR-SAAS-008 |
| **D-9 — Enforcement** | Claims proyectan contexto; el estado canónico de la empresa se impone en backend y Firestore. | ADR-SAAS-009 |

---

## 3. Estrategia de tenancy

La frontera de seguridad es la **empresa**, no el espacio. Se conserva la estrategia de colecciones
planas y todo dato operativo incorpora `empresaId`.

La defensa en profundidad combina:

1. Claims con `empresaId` y `rol` emitidos por backend privilegiado.
2. Firestore Rules que comparan el tenant del recurso y la escritura con el claim.
3. Helper de tenant en la capa de servicios.
4. Consultas acotadas y filtradas por `empresaId`.

El cliente nunca elige libremente su `empresaId`. Cambiar de empresa requiere reemitir el contexto de
sesión.

---

## 4. Modelo de dominio

### 4.1 Planos

1. **Plataforma SaaS:** operadores, planes, suscripciones, soporte y auditoría global.
2. **Empresa/Tenant:** negocio, configuración, membresías, espacios y datos operativos.
3. **Usuario operativo:** personas que operan el POS mediante una membresía tenant.

Un operador SaaS no obtiene acceso a un restaurante por su rol de plataforma. Para operar un tenant
necesita una membresía explícita o una impersonación separada y auditada.

### 4.2 Entidades

- **Empresa:** unidad de aislamiento y autoridad sobre acceso y conservación.
- **Usuario:** perfil global de una persona; no contiene autoridad tenant.
- **Membresía:** relación usuario–empresa con rol, permisos y estado.
- **Configuración:** parámetros editables y preferencias de una empresa, sin contadores.
- **Espacio:** establecimiento o sucursal dentro de la empresa; no es frontera de seguridad.
- **Numeración:** autorización y secuencia fiscal independiente.
- **Asignación de numeración:** selección determinista por alcance y tipo documental.
- **Plan:** oferta comercial global y versionada.
- **Suscripción:** relación comercial 1:1 entre empresa y plan.
- **Provisionamiento empresarial:** proceso interno que crea el núcleo del tenant.
- **Snapshot fiscal:** evidencia inmutable embebida en cada venta.

### 4.3 Relaciones

```text
Usuario ──< Membresía >── Empresa ──1:1── Suscripción ──N:1── Plan
                              │
                              ├──1:1── Configuración
                              ├──< Espacio
                              ├──< Numeración
                              └──< Asignación de numeración

Provisionamiento empresarial ──crea──> núcleo consistente de Empresa
Venta ──contiene──> Snapshot fiscal inmutable
```

### 4.4 Mapa de autoridades

| Concepto | Fuente única de verdad | No decide |
|---|---|---|
| Identidad técnica | Firebase Auth | Rol, permisos o empresa activa persistente |
| Perfil global | `usuarios/{uid}` | Autorización tenant |
| Rol, permisos y estado tenant | `membresias/{empresaId}_{uid}` | Lifecycle de la empresa |
| Tenant activo de la sesión | Claims emitidos por backend | Estado canónico o facturación |
| Acceso y conservación | `empresas/{empresaId}.estado` | Cobro, rol o numeración |
| Configuración editable | `configuraciones/{empresaId}` | Contadores o resoluciones |
| Resolución y contador fiscal | `numeraciones/{empresaId}_{numeracionId}` | Selección por espacio/tipo |
| Selección fiscal | `asignaciones_numeracion/{empresaId}_{scope}_{tipo}` | Contador o datos históricos |
| Oferta comercial | `planes/{planId}` y su versión | Acceso directo al tenant |
| Relación comercial | `suscripciones/{empresaId}` | Autorización canónica |
| Progreso de creación | Registro de provisionamiento | Membresías o permisos |
| Evidencia fiscal histórica | `ventas/{ventaId}.snapshotFiscal` | Configuración vigente |

`ownerUid` identifica al titular contractual, pero no concede permisos. El owner debe conservar una
membresía administrativa activa; una transferencia coordina ambas relaciones sin duplicar autoridad.

---

## 5. Modelo de datos

### 5.1 Plano plataforma e interno

- `planes/{planId}`
- `saas_operadores/{uid}`
- `saas_auditoria/{id}`
- `consumo/{empresaId}_{periodo}` — capacidad futura, no implica cobro por uso.
- `provisionamientos_empresariales/{id}` — backend-only; existe antes de que haya un tenant utilizable.

### 5.2 Plano empresa

- `empresas/{empresaId}`
- `membresias/{empresaId}_{uid}`
- `suscripciones/{empresaId}`
- `incorporaciones/{id}`
- `configuraciones/{empresaId}`
- `numeraciones/{empresaId}_{numeracionId}`
- `asignaciones_numeracion/{empresaId}_{scope}_{tipo}`
- `espacios` y las colecciones operativas existentes, siempre con `empresaId`.

El contrato `invitaciones/{token}` quedó supersedido por `incorporaciones/{id}` conforme a
ADR-SAAS-006.

### 5.3 Datos globales e históricos

- `usuarios` permanece global y sin autoridad tenant.
- `eventos` es contenido público propiedad de un tenant y usa la colección
  superior `eventos` con `empresaId` obligatorio e inmutable conforme a
  ADR-SAAS-025. B3-A y B3-B preparan y certifican la transición; los documentos
  sin propietario permanecen legacy hasta el cierre operativo autorizado de B3;
  la visibilidad pública no elimina la propiedad tenant.
- Cada venta nueva contiene un snapshot fiscal autosuficiente. No se crea una colección separada para
  snapshots.
- Las ventas históricas conservan su forma original; los lectores compatibles no reconstruyen hechos
  pasados con configuración vigente.

---

## 6. Aislamiento y enforcement

Los claims son autoridad para identificar el **tenant activo** y el rol proyectado de la sesión. No son
la autoridad del lifecycle: pueden permanecer vigentes después de una transición empresarial.

El enforcement combina:

- **UI:** comunica el modo de acceso y evita acciones inválidas.
- **Servicios/backend:** valida comandos, transiciones, fiscalidad e idempotencia.
- **Firestore Rules:** impide acceso cross-tenant y escrituras incompatibles con el estado canónico.
- **Renovación/revocación de sesión:** propaga el nuevo contexto sin depender de ella para la seguridad
  inmediata.

Solo empresas `trial` o `activa` pueden producir escrituras operativas. La matriz completa se define en
ADR-SAAS-009 y se detallará en la especificación futura del bloque de enforcement.

---

## 7. Identidad, membresías e incorporación

### 7.1 Identidad de dos capas

- **SaaS global:** email real, estable y reutilizable entre empresas.
- **Operativa:** mecanismo por empresa, por defecto código + PIN, sin exigir email a personal puramente
  operativo.

Ambas vías terminan en un principal Firebase Auth y una membresía tenant. `usuarios` es perfil;
`membresias` es autoridad de rol, permisos y estado.

### 7.2 Incorporación MT-U5B

MT-U5B está **completado y aprobado**. `DIRECTA` y `EMAIL` pertenecen a ADR-SAAS-006. Antes de `ACTIVE`
no existe membresía activa ni claims tenant derivados de la incorporación.

El onboarding del programa MT-U6→U8 puede invocar MT-U5B para empleados después de crear la empresa,
pero no redefine sus estados, credenciales, aceptación ni tokens.

### 7.3 Bootstrap empresarial

El owner debe existir previamente como identidad SaaS autenticada. `NUEVA` es un estado del proceso de
provisionamiento, no un valor de `Empresa.estado`.

El bootstrap usa una clave de idempotencia y crea en un commit atómico el núcleo empresarial:

1. Empresa en `trial`.
2. Configuración inicial.
3. Primer espacio.
4. Numeración inicial, que puede quedar en borrador.
5. Membresía administrativa del owner.
6. Suscripción `trialing`.

La emisión de claims ocurre después del commit y es recuperable. Un fallo no elimina ni recrea el
núcleo consistente; el mismo provisionamiento reanuda el paso pendiente. ADR-SAAS-007 conserva el
razonamiento y las alternativas de esta decisión.

Completar el bootstrap habilita el acceso del owner. La capacidad de vender requiere además readiness
fiscal: configuración obligatoria y asignación de numeración vigente.

---

## 8. Configuración empresarial

### 8.1 Autoridad y contenido

`configuraciones/{empresaId}` es la única autoridad de configuración. Es un documento versionado,
revisable y sin contadores, organizado conceptualmente en:

- identidad y localización fiscal;
- moneda y políticas tributarias generales;
- branding y ticket;
- preferencias empresariales de impresión;
- POS, módulos y métodos de pago;
- KDS;
- caja;
- autenticación operativa;
- preferencias generales.

Las conexiones físicas, puertos y dispositivos son configuración local del equipo, no de la empresa.
Los cambios se controlan por revisión y nunca alteran ventas históricas.

### 8.2 Retiro del singleton

`configuracion/general` deja conceptualmente de ser autoridad. La transición debe:

1. Clasificar sus campos entre configuración, numeración y preferencias locales.
2. Crear los documentos tenant de la empresa fundacional.
3. Validar paridad.
4. Ejecutar un único corte de lectura y escritura.
5. Prohibir dual-write.
6. Conservar temporalmente el singleton solo como evidencia de rollback.
7. Retirar el fallback después de certificar el nuevo camino.

Los pasos ejecutables, lotes y rollback pertenecen a especificaciones futuras, no al maestro.

---

## 9. Numeración y snapshot fiscal

### 9.1 Numeraciones

Una empresa posee N numeraciones. Cada una representa una autorización y secuencia independiente por
empresa o espacio y por tipo (`pos`, `electronica`, `contingencia`). Contiene resolución, prefijo,
rango, vigencia y último número asignado.

Estados conceptuales:

```text
BORRADOR → HABILITADA → AGOTADA
                     → VENCIDA
                     → REVOCADA
                     → PAUSADA → HABILITADA
```

Una numeración que ya emitió documentos no permite modificar los elementos que identifican su
resolución ni retroceder el contador.

### 9.2 Selección y emisión

La selección no usa “la primera activa”. Una asignación determinista relaciona empresa/espacio y tipo
documental con una numeración habilitada. Se resuelve primero el scope exacto del espacio y después el
fallback de empresa; la ausencia o ambigüedad bloquea la emisión.

Un backend privilegiado asigna el siguiente número dentro de la misma transacción que confirma la
venta. Verifica tenant, scope, tipo, estado, rango y vigencia. Si falla, no crea venta ni consume número.
ADR-SAAS-008 extiende ADR-SAAS-004 con esta autoridad de emisión.

### 9.3 Snapshot fiscal

La venta congela al menos:

- revisión de configuración;
- identidad fiscal, país y moneda;
- régimen y rótulo;
- impuestos por línea;
- numeración, tipo y scope;
- número final y prefijo;
- resolución, rango y vigencia;
- fecha de emisión.

Reimpresión, reportes y auditoría leen la venta, nunca la configuración o numeración actuales.

---

## 10. Ciclo de vida empresarial

`Empresa.estado` gobierna acceso y conservación. La suscripción puede solicitar una transición, pero
no reemplaza esta autoridad.

```text
NUEVA (solo provisionamiento)
  → trial → activa → suspendida → cancelada → archivada → eliminada
                     ↘ reactivaciones controladas ↗
```

### 10.1 Semántica

| Estado | Acceso | Escrituras | Datos |
|---|---|---|---|
| `trial` | Completo | Permitidas, sujetas a readiness fiscal | Vivos |
| `activa` | Completo | Permitidas | Vivos |
| `suspendida` | Administración en solo lectura | Ninguna operación POS | Conservados íntegros |
| `cancelada` | Sin acceso interactivo; exportación por backend | Ninguna | Conservados durante gracia |
| `archivada` | Solo plataforma/soporte autorizado | Ninguna | Conservados fuera de operación |
| `eliminada` | Ninguno | Ninguna | Purga según retención legal |

La política de `suspendida` queda cerrada: owner/admin pueden consultar para regularizar; los roles
operativos no acceden al POS. Una empresa cancelada no conserva lectura directa; la exportación es una
operación backend controlada.

### 10.2 Transiciones

Un único servicio de lifecycle valida la transición, controla la revisión actual, registra actor,
origen y motivo, y coordina empresa, suscripción, auditoría y contexto de sesión. Las transiciones no
borran datos salvo el proceso legal posterior de `eliminada`.

ADR-SAAS-009 supersede la indeterminación de `Suspendida` y el uso de claims como enforcement suficiente
en ADR-SAAS-003.

---

## 11. Planes y suscripciones

### 11.1 Plan

`planes/{planId}` es global y versionado. Describe capacidades y límites mediante un mapa abierto. Una
suscripción conserva la versión o snapshot contratado para que cambios posteriores del plan no alteren
silenciosamente condiciones existentes.

La empresa fundacional se asocia a un plan grandfathered sin límites ni vencimientos retroactivos.

### 11.2 Suscripción

`suscripciones/{empresaId}` es 1:1 y contiene, conceptualmente: plan/version, estado comercial, trial,
período actual, gracia, cancelación al final y fechas efectivas.

Estados:

```text
trialing → active → past_due → suspended → canceled
```

Mientras no exista pasarela, activaciones, extensiones, renovaciones, cambios de plan y cancelaciones son
comandos administrativos idempotentes. `cancelaAlFinal` mantiene la suscripción activa hasta terminar
el período. El vencimiento de trial o gracia puede solicitar la suspensión empresarial a través del
servicio de lifecycle.

La monetización concreta, precios, pasarela y enforcement de límites medidos permanecen fuera del
programa actual.

---

## 12. Administración SaaS

El plano plataforma usa identidad y auditoría separadas (`saas_operadores`, `saas_auditoria`). No usa
membresías de restaurante para gestionar tenants.

Responsabilidades futuras:

- empresas y transiciones de plataforma;
- planes y suscripciones;
- soporte e impersonación explícita;
- consumo;
- facturación;
- archivo, restauración y eliminación conforme a retención.

Un operador solo puede operar un restaurante con membresía explícita o impersonación auditada.

---

## 13. Roadmap

### 13.1 Estado consolidado

| Unidad | Estado | Resultado |
|---|---|---|
| MT-U0 | Completado | Gate técnico previo del programa SaaS. |
| MT-U1 | Completado | Empresas, membresías y tenant fundacional. |
| MT-U2 | Completado | Claims tenant. |
| MT-U3 | Completado | Helper y filtrado tenant en servicios. |
| MT-U4 | Completado | Firestore Rules tenant-aware. |
| MT-U5A | Completado | Autenticación operativa por código + PIN. |
| **MT-U5B** | **Completado y aprobado** | Identidad, autoridad de membresías e incorporaciones `DIRECTA`/`EMAIL`. |

### 13.2 Programa MT-U6→MT-U8 — Ciclo de vida empresarial SaaS

El programa reemplaza la ejecución aislada de U6, U7 y U8 por bloques internos ordenados por
dependencias:

| Bloque | Alcance | Dependencias |
|---|---|---|
| **B0 — Contratos e invariantes** | Modelos, estados, autoridades, snapshots y gates. | MT-U5B |
| **B1 — Configuración empresarial** | Autoridad tenant, revisiones y preparación del backfill. | B0 |
| **B2 — Numeración y emisión fiscal** | Numeraciones, asignaciones, emisión y snapshot. | B1 |
| **B3 — Suscripción y lifecycle mínimo** | Planes, trial, grandfathering y transiciones. | B0 |
| **B4 — Enforcement** | Backend, Rules, sesiones existentes y matriz de acceso. | B3 |
| **B5 — Bootstrap empresarial** | Provisionamiento durable, commit del núcleo y claims recuperables. | B1–B4 |
| **B6 — Onboarding** | Wizard, readiness, primer acceso y orquestación opcional de MT-U5B. | B5 |
| **B7 — Cutover y certificación** | **Completado** — PR #135 integrado a `main` el 2026-07-28; cutover a configuración tenant canónica y certificación integral finalizados. | B2–B6 |

B2 y B3 pueden avanzar después de cerrar B0 y la base necesaria de B1. No se habilita una segunda
empresa para vender hasta certificar numeración, snapshot y enforcement.

### 13.3 Unidades posteriores

| Unidad | Alcance |
|---|---|
| MT-U9 | Panel SaaS, operadores y auditoría de plataforma. |
| MT-U10 | Métricas de consumo y enforcement de límites definidos por planes. |
| MT-U11 | Multiempresa por usuario y cambio de tenant activo. |
| MT-U12 | Convergencia Electron con la sesión SaaS. |

---

## 14. Riesgos

### Fiscales y de datos

- Duplicar o saltar números durante el cutover del contador legacy.
- Interpretar incorrectamente `consecutivo_actual`, rangos o resoluciones textuales.
- Permitir editar una numeración que ya emitió documentos.
- Reimprimir con configuración vigente en vez del snapshot.
- Abrir ventas sin una asignación fiscal válida.
- Reescribir innecesariamente ventas históricas.

### Concurrencia y recuperación

- Dos ventas sobre la misma numeración.
- Dos asignaciones para el mismo scope/tipo.
- Dos bootstraps con una clave o carga incompatibles.
- Transiciones empresariales concurrentes con renovaciones.
- Fallos entre el commit Firestore y la emisión de claims.

### Seguridad y compatibilidad

- Tokens antiguos que conserven capacidad después de suspender una empresa.
- Confiar en `ownerUid` o la suscripción como autorización.
- Permitir al cliente escribir estados, claims o `empresaId`.
- Mantener dual-write entre el singleton y la configuración tenant.
- Aplicar límites o vencimientos retroactivos a la empresa fundacional.
- Exponer Electron como canal multiempresa antes de MT-U12.

### Controles obligatorios antes de la segunda empresa

- Backfill fundacional validado.
- Plan grandfathered y suscripción `active`.
- Cutover fiscal con reconciliación del último número.
- Cero escrituras nuevas a `configuracion/general`.
- Matriz de lifecycle certificada con sesiones antiguas.
- Bootstrap reentrante y reconciliable.

---

## 15. Catálogo de ADR SaaS

| ADR | Estado | Responsabilidad |
|---|---|---|
| ADR-SAAS-001 | Aceptado | Estrategia de tenancy. |
| ADR-SAAS-002 | Aceptado | Identidad y autenticación de dos capas. |
| ADR-SAAS-003 | Aceptado; parcialmente supersedido por ADR-SAAS-009 | Suscripción y separación inicial del lifecycle. |
| ADR-SAAS-004 | Aceptado; extendido por ADR-SAAS-008 | Modelo empresarial, configuración y numeración multi-resolución. |
| ADR-SAAS-005 | Aceptado | Rol supervisor. |
| ADR-SAAS-006 | Aceptado; MT-U5B completado | Incorporación `DIRECTA` y `EMAIL`. |
| ADR-SAAS-007 | Aceptado | Bootstrap atómico, idempotente y recuperable. |
| ADR-SAAS-008 | Aceptado | Autoridad fiscal, selección y asignación de numeración. |
| ADR-SAAS-009 | Aceptado | Enforcement canónico del ciclo de vida empresarial. |

---

## 16. Decisiones de producto pendientes

1. Cierre operativo y retiro de los documentos legacy de `eventos` mediante B3.
   B2 ya implementó la lectura pública por slug y B3-A/B3-B certificaron el
   inventario y el backfill seguro en Emulator. El cierre productivo requiere
   mapeos reales y autorización explícita. El routing futuro por dominio
   personalizado permanece como trabajo independiente: solo resuelve el
   contexto público (`empresaId`) y nunca permisos administrativos.
2. Distribución SaaS definitiva: web/PWA y papel futuro de Electron.
3. Alcance fiscal multi-país.
4. Duración comercial exacta del trial.
5. Períodos de gracia y retención.
6. Dimensiones monetizadas, precios y límites.
7. Proveedor e integración de pagos.
8. Política de medición de consumo.

Estas decisiones no alteran la separación de autoridades definida en este documento. Cualquier cambio
que contradiga un ADR aceptado requiere un nuevo ADR que lo superseda explícitamente.
> **Decisión vigente (2026-08-10):** el canal soportado del producto es Web/PWA. Electron y su distribución quedan retirados; las menciones históricas al programa Electron se conservan únicamente como trazabilidad arquitectónica.
