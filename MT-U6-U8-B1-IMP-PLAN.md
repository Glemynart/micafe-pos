# MT-U6→U8 — B1-IMP: Plan de implementación de Configuración Empresarial

## 1. Propósito, autoridad y límites

Este documento organiza la implementación de B1 en cambios pequeños, independientes y revisables. Materializa exclusivamente los contratos ya aprobados en:

- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`;
- `ADR-SAAS-004-modelo-empresarial.md`;
- `ADR-SAAS-007-bootstrap-empresarial.md`;
- `MT-U6-U8-B0-contratos-invariantes-dominio.md`;
- `MT-U6-U8-B1-configuracion-empresarial.md`.

No introduce decisiones arquitectónicas, no redefine B0/B1 y no adelanta responsabilidades de B2, B4, B5, B7 ni MT-U12. En particular:

- B1 no implementa Numeración, Asignación, `ConfirmarVentaFiscal`, Snapshot fiscal ni el retiro de los tres escritores de contador; ese trabajo pertenece a B2 y su cutover a B7.
- B1 no cambia la autoridad de lifecycle ni abre a tenants las Rules definitivas de `configuraciones`; B4 aplica enforcement y Rules conforme a su propia dependencia.
- B1 no ejecuta el backfill, no cambia la autoridad runtime del singleton, no habilita dual-write ni implementa el corte de lectura/escritura. Deja preparada la clasificación y paridad para B7.
- B1 no migra la base SQLite, IPC, dispositivos, impresoras físicas, credenciales Factus ni el contador local de Electron. Esos datos permanecen locales hasta MT-U12/B7 certificado.
- B5 integra `InicializarConfiguracionEmpresa` en el commit de Bootstrap. B1 solo entrega la plantilla, validación y frontera invocable por backend que B5 necesita.

Cada bloque debe llegar a `main` sin exigir el despliegue de los bloques posteriores ni alterar la autoridad vigente `configuracion/general`. Los cambios de lectura que aún no puedan hacerse autoridad se incorporan como capas no conectadas al runtime o como adaptadores probados; nunca como fallback o dual-write.

## 2. Auditoría del estado inicial

La auditoría se realizó sobre el árbol actual del repositorio y las rutas de producción indicadas abajo. Los cambios documentales preexistentes del worktree no forman parte de B1-IMP.

### 2.1 Modelo, datos y backend actuales

| Área | Estado auditado | Consecuencia para B1 |
|---|---|---|
| Empresa y tenant | `lib/empresas-service.ts` define `Empresa`, estados y `EMPRESAS_COLLECTION`; `contexts/saas-context.tsx` resuelve `empresaId` por claim y contrasta la membresía; `lib/tenant.ts` expone `getEmpresaId`, `stampEmpresaId` y consultas tenant. | B1 debe recibir el `empresaId` por esta cadena y validarlo contra la Empresa; no puede permitir que el cliente seleccione una configuración ajena. |
| Configuración vigente | `lib/configuracion-service.ts` representa `ConfiguracionGlobal`, lee `configuracion/general`, aplica `DEFAULT_CONFIG` ficticio cuando falta el documento, permite `setDoc(..., merge)` y expone `incrementarConsecutivoTicket`. | Es el punto de convergencia legacy a sustituir por modelos y comandos B1, sin activarlo como autoridad hasta el cutover coordinado. |
| Empresa fundacional | `scripts/migrate-mt-u1-fundacional.ts` solo lee `configuracion/general.nombre_tienda` para nombrar la Empresa inicial. | Debe conservarse como lector histórico/no escritor hasta que B7 certifique su reemplazo o retiro. |
| Functions | `functions/src/index.ts` solo exporta autenticación operativa e incorporaciones; `functions/src/contracts.ts` concentra contratos de ese dominio. Firebase Functions está declarada en `firebase.json`. | B1 necesita una superficie backend nueva para comandos y lecturas autorizadas; no debe reutilizar escrituras directas de cliente. |
| Reglas | `firestore.rules` deja `configuracion/{id}` como colección global y bloquea `configuraciones/{empresaId}` para tenants (solo superadmin). Las pruebas actuales lo afirman en `firestore-rules/global-platform.test.ts`. | B1 no cambia Rules de lifecycle/tenant; B4 reemplazará este cierre con enforcement. Las pruebas B1 preparan fixtures y expectativas sin alterar la fase vigente. |
| Auditoría | `lib/audit-service.ts` escribe una auditoría operativa genérica en cliente y silencia fallos. | No satisface por sí sola la trazabilidad B1. Los comandos backend deben registrar el hecho/auditoría durable requerido por B0/B1. |

### 2.2 Consumidores web y puntos de escritura

| Clase | Rutas auditadas | Situación y tratamiento planificado |
|---|---|---|
| Edición de configuración | `components/pos/settings-module.tsx` suscribe el singleton, muta el objeto completo en memoria y lo guarda con merge. Edita identidad, fiscalidad, ticket y caja en una misma pantalla. | Se dividirá en comandos y secciones B1. Los controles de prefijo, contador, rango, resolución y vigencia se retiran de esta superficie solo junto con B2; no se reubican en Configuración. |
| Módulos | `contexts/modulos-context.tsx`, `app/pos/page.tsx`, `components/pwa/bottom-nav.tsx`. | Actualmente el provider usa defaults y añade `reservas` silenciosamente. Debe consumir la proyección canónica y no ampliar módulos fuera de Configuración/Plan. |
| Caja | `components/pos/shifts-module.tsx`, `components/pos/turno-gate.tsx`, `components/pos/global-close-shift.tsx`. | Solo requieren `caja.baseAperturaSugerida` y `caja.umbralAlertaFaltante`; son consumidores tempranos de bajo riesgo tras existir la proyección B1. |
| Checkout y ticket actual | `components/pos/sell-module.tsx`, `lib/tickets/adapters/checkout-adapter.ts`. | El régimen y el encabezado vigente pueden adaptarse a nombres canónicos para la operación previa a confirmación. La emisión fiscal, número y Snapshot quedan expresamente diferidos a B2. |
| Reimpresión | `components/pos/historial.tsx`, `lib/reimpresion/venta-ticket-adapter.ts`. | Hoy recompone identidad, prefijo, resolución y rango desde configuración vigente. La corrección histórica exige Snapshot y corresponde a B2; B1 solo mantiene el inventario y las pruebas de compatibilidad listas. |
| Escritores fiscales | `lib/ventas-service.ts`, `lib/reservas-service.ts`, `app/api/webhooks/wompi/route.ts` incrementan `consecutivo_actual`; `lib/configuracion-service.ts` conserva una vía adicional. | No se modifica en B1. Se registra como bloqueo de cualquier cutover: B2 debe sustituir las cuatro vías antes de retirar el singleton. |

### 2.3 Providers, presentación y Branding

| Área | Estado auditado | Consecuencia para B1 |
|---|---|---|
| Orden de providers | `app/layout.tsx` monta `AuthProvider → SaaSProvider → EspaciosProvider → UIProvider → ModulosProvider`; este último aún no recibe explícitamente `empresaId`. | El provider/configuración B1 debe colocarse después de resolver SaaS y antes de sus consumidores, sin cambiar la fuente de tenant. |
| Branding | `app/globals.css`, `styles/globals.css`, `components/theme-provider.tsx`, `app/layout.tsx`, `components/pos/sidebar.tsx`, `components/pos/login-screen.tsx`, `components/pwa/admin-header.tsx` contienen tokens, modo visual y marca Café Atrato estáticos. | El resolver B1 debe partir de un tema SaaS neutral y aplicar solo tokens/activos validados cuando el tenant sea inequívoco. No debe afectar gates ni Ticket fiscal. |
| Metadata y rutas públicas | `app/layout.tsx`, layouts de POS/admin/reservas y `app/page.tsx`, `app/reservar/*`, `app/terminos/*`. | Deben inventariarse y clasificarse antes de consumir Branding. Una ruta global o pre-tenant conserva marca neutral y nunca selecciona la empresa fundacional por defecto. |

### 2.4 Frontera Electron y configuración local

`src/database.js`, `main.js`, `preload.js`, `components/pos/configuracion.tsx` y `components/pos/vender.tsx` usan SQLite e IPC propios. Allí existen identidad, datos fiscales, rangos, contador físico, impresora, credenciales Factus y emisión local. No leen `configuracion/general` y no son consumidores del agregado B1.

La frontera es relevante porque comparte nombres y semántica parcial con B1, pero no autoriza convergencia implícita: B1 no lee, escribe ni usa ese almacenamiento como fallback. La coordinación de contador, Factus y configuración local queda fuera de estos bloques.

### 2.5 Dependencias y capacidad de pruebas existente

- El frontend usa Next 16, React 19, Firebase cliente y Zod; Functions usa Firebase Admin/Functions, TypeScript y Node 22.
- Hay pruebas Node para dominio en `lib/**/__tests__`, pruebas de Functions en `functions/src/*.test.ts` y pruebas de Rules con emuladores en `firestore-rules/*`.
- Los scripts disponibles incluyen `test:tenant`, `test:tickets`, `test:reimpresion`, `test:rules:raw`, `test:rules`, `test:auth-foundation`, `build:functions`, `lint` y `build`.
- No existe todavía una implementación de bootstrap B5, un repositorio de Configuración, comandos B1, endpoint/callable B1, validadores de país, provider de Configuración ni pruebas del agregado.

## 3. Orden de implementación y fronteras de merge

```text
B1.1 Contrato puro y catálogos
  ├─ B1.2 Validadores, gates y proyecciones puras
  │    ├─ B1.3 Persistencia y comandos backend
  │    │    ├─ B1.4 Inicialización backend para Bootstrap/backfill
  │    │    ├─ B1.5 Lectura cliente y provider canónico (no conectado al corte)
  │    │    │    ├─ B1.6 Adaptación de consumidores operativos y settings
  │    │    │    └─ B1.7 Resolver de Branding y superficies tenant
  │    │    └─ B1.8 Analizador de paridad/backfill en dry-run
  └─ B1.9 Certificación integrada de B1-IMP
```

Los bloques B1.6, B1.7 y B1.8 pueden desarrollarse después de sus predecesores comunes, pero se integran en el orden indicado para minimizar conflictos sobre `app/layout.tsx`, el servicio legado y la pantalla de settings. B1.9 requiere todos los anteriores. Ningún bloque habilita el cutover; B7 será el único que active de forma coordinada la nueva ruta de lectura/escritura y retire el singleton.

## 4. Bloques de implementación

### B1.1 — Contrato persistible, plantilla y catálogos cerrados

**Objetivo.** Materializar en código los tipos, constantes, plantilla CO v1 y catálogos cerrados que representan exactamente el agregado `configuraciones/{empresaId}`.

**Alcance.**

- Definir el modelo canónico con metadatos, doce secciones, enums, rutas hoja editables y errores conceptuales de B1.
- Implementar la plantilla neutral de revisión 1, sin valores de Café Atrato ni datos legales inventados.
- Centralizar catálogos de módulos, dependencias, métodos de pago, roles de caja, tokens de Branding y perfiles nacionales; reutilizar el catálogo tributario existente sin duplicar sus tarifas.
- Declarar la separación de campos legacy: fiscal/numeración no pertenece al modelo B1.

**Archivos afectados.** Nuevos módulos bajo `lib/configuracion/` (modelo, plantilla, catálogos y errores), posible extracción mínima y compatible de catálogos de `lib/impuestos-service.ts`, y pruebas nuevas bajo `lib/configuracion/__tests__/`. No se modifica `lib/configuracion-service.ts` ni el runtime.

**Dependencias.** B0 y B1 aprobados; ninguna dependencia de bloques de implementación.

**Riesgos.** Duplicar el catálogo de impuestos/módulos, convertir defaults de la empresa fundacional en defaults SaaS, o incluir de forma accidental contador, resolución, claims, hardware o secretos.

**Criterios de aceptación.**

- El modelo expresa la ruta 1:1, `schemaVersion=1`, `revision=1`, metadatos y las doce secciones obligatorias.
- La plantilla CO produce todos los mapas requeridos, Branding neutral y datos fiscales opcionales ausentes.
- No existe representación de prefijo, rango, resolución, consecutivo, membresía, plan, lifecycle, secreto o dispositivo local.
- Cada catálogo acepta solo los valores normativos de B1 y expone dependencias de módulos sin ampliar silenciosamente la selección tenant.

**Estrategia de pruebas.** Unitarias puras: fixture de revisión 1, ausencia de datos ficticios, catálogos cerrados, dependencias de módulos y exclusión de campos prohibidos. Ejecutar TypeScript y lint del proyecto.

### B1.2 — Validación integral, readiness y proyecciones seguras

**Objetivo.** Convertir el contrato B1 en validadores deterministas y proyecciones de lectura, sin persistir ni autorizar cambios todavía.

**Alcance.**

- Validar estructura completa, normalización, límites, campos desconocidos, consistencia cruzada, perfiles nacionales CO, NIT/dígito, moneda/locale/zona y reglas de completitud fiscal/operativa.
- Validar operaciones `SET`/`REMOVE` sobre allowlists por comando y actor; distinguir no-op de mutación efectiva.
- Implementar evaluadores derivados de readiness y de impacto fiscal futuro, sin persistir booleans de readiness.
- Implementar la proyección de compatibilidad de solo lectura para identidad, localización, ticket, módulos y caja; debe omitir numeración y no aceptar escritura legacy.
- Implementar validación de Branding: referencias de assets, token semántico, contraste y versiones compatibles, sin CSS ni ejecución de activos.

**Archivos afectados.** Nuevos módulos bajo `lib/configuracion/` (validadores, perfiles, operaciones, readiness y proyecciones), pruebas unitarias asociadas; lectura de `lib/impuestos-service.ts` y contratos existentes, sin modificar sus autoridades.

**Dependencias.** B1.1.

**Riesgos.** Aceptar merges parciales, degradar un esquema desconocido a objeto parcial, hacer pasar datos incompletos como fiscalmente ready o aplicar Branding inválido como configuración de negocio.

**Criterios de aceptación.**

- Todo cambio valida el documento resultante completo y rechaza rutas/campos no autorizados.
- `expectedRevision` y no-op tienen semántica determinista para su uso posterior por comandos.
- Un país sin perfil conserva estructura mínima pero produce la causa `PAIS_FISCAL_NO_SOPORTADO` para readiness fiscal.
- La proyección legacy no expone `consecutivo_actual` ni reconstruye fiscalidad; los errores estructurales son tipados y no activan defaults silenciosos.
- Fallos recuperables de Branding entregan exclusivamente el tema neutral de presentación, sin alterar readiness.

**Estrategia de pruebas.** Matriz de pruebas para documento faltante/incompleto, versión desconocida, tenant/pais incompatibles, NIT, listas duplicadas, Plan/módulos, KDS, pagos, conflicto de paleta, assets inseguros, contraste, no-op y paths allowlisted.

### B1.3 — Repositorio y comandos backend transaccionales

**Objetivo.** Implementar la única frontera de escritura B1: lectura autoritativa, idempotencia, control de revisión, validación, evento y auditoría durable.

**Alcance.**

- Crear repositorio Admin SDK para `configuraciones/{empresaId}`, Empresa, Plan/capacidades y la evidencia de primera emisión necesaria para bloquear cambios de identidad fiscal.
- Implementar handlers/callables backend para `ActualizarConfiguracionEmpresa`, `ActualizarParametrosFiscales`, `ActualizarPreferenciasImpresion` y `ActualizarPoliticasOperativas`.
- Aplicar actor, tenant, membresía/permisos, lifecycle escribible, `expectedRevision`, clave de idempotencia/fingerprint, transacción y resultado no-op.
- Persistir en la misma frontera durable `ultimaMutacion`, auditoría y los eventos `ConfiguracionEmpresaActualizada` requeridos, sin secretos ni copia completa del documento.
- Exponer una lectura autenticada tipada si se requiere para el provider de B1 mientras B4 mantiene cerrada la lectura Firestore directa; su autorización debe coincidir con el contrato y no debe ser un bypass de Rules.

**Archivos afectados.** Nuevos módulos en `functions/src/configuracion/` y exportaciones en `functions/src/index.ts`; pruebas de Functions; módulos compartidos de contrato puro de B1 si deben compilar en ambos paquetes; configuración de build solo si resulta estrictamente necesaria. No se toca `firestore.rules` ni se reemplaza el servicio legacy.

**Dependencias.** B1.1 y B1.2; infraestructura Functions ya configurada.

**Riesgos.** Crear una ruta de escritura directa alternativa, separar evento/auditoría del commit, resolver tenant desde una entrada no confiable, usar last-write-wins o permitir que una actualización ancha eluda el comando fiscal/restringido.

**Criterios de aceptación.**

- Solo el backend escribe configuraciones B1; cada comando valida agregado, empresa, actor, lifecycle, Plan y revisión dentro de la frontera necesaria.
- La misma idempotencia/fingerprint retorna el resultado confirmado; una reutilización distinta falla; una revisión obsoleta retorna `CONFIG_REVISION_CONFLICT`.
- Una mutación efectiva incrementa una vez; un no-op no escribe ni emite evento; los eventos contienen el envelope/payload B1.
- Se rechazan tenant mismatch, actor sin permiso, país distinto, lifecycle no escribible, campos locales, secreto, ruta fiscal bloqueada y cambio legal posterior a emisión.

**Estrategia de pruebas.** Unitarias de servicio y pruebas de emulador Functions/Firestore: concurrencia de dos revisiones, reintento timeout, idempotencia incompatible, roles, Empresas suspendidas/canceladas, Plan incompatible, eventos/auditoría y no-op. Mantener las pruebas Rules vigentes como regresión, pues B1 no las cambia.

### B1.4 — Inicialización reutilizable para Bootstrap y backfill certificado

**Objetivo.** Entregar la operación backend interna que construye revisión 1 para que B5 y B7 la utilicen sin duplicar la plantilla ni abrir creación de cliente.

**Alcance.**

- Implementar `InicializarConfiguracionEmpresa` como operación interna backend con origen exclusivo `BOOTSTRAP` o `BACKFILL`.
- Garantizar ausencia previa o reintento idempotente exacto, igualdad de `empresaId`/país, timestamps de servidor, revisión 1 y evento `ConfiguracionEmpresaInicializada`.
- Proveer un contrato de invocación transaccional reutilizable por el commit de Bootstrap de B5; no implementar dicho Bootstrap en este bloque.
- Proveer una entrada administrativa restringida para el backfill certificado futuro, no una creación funcional ordinaria.

**Archivos afectados.** Extensión de `functions/src/configuracion/`, sus pruebas y exportaciones. Puede añadir interfaces de integración documentadas por tipos, no scripts ejecutables de backfill.

**Dependencias.** B1.3.

**Riesgos.** Crear configuraciones desde cliente, permitir una segunda inicialización, generar una revisión 1 fuera de un contexto certificado o convertir B1 en una implementación parcial de Bootstrap.

**Criterios de aceptación.**

- La operación crea exactamente una configuración estructuralmente válida con revisión 1 y origen correcto.
- Una repetición idempotente devuelve el mismo resultado; un documento distinto o contexto inválido falla explícitamente.
- El contrato puede ser llamado desde una transacción de Bootstrap sin introducir otro commit ni efectos de claims.
- No se crea Empresa, membresía, espacio, suscripción, numeración ni claim en este bloque.

**Estrategia de pruebas.** Pruebas de transacción y reintento: creación, duplicado exacto, duplicado incompatible, país distinto, Empresa ausente y consistencia de evento. Prueba de integración con un stub de transacción para demostrar que B5 puede incorporarlo atómicamente.

### B1.5 — Lectura canónica y provider React de configuración

**Objetivo.** Incorporar una única fuente de lectura tipada, tenant-aware y libre de defaults ficticios, lista para conectar en la fase autorizada.

**Alcance.**

- Crear el cliente/repositorio de lectura que recibe el `empresaId` del `SaaSProvider`, obtiene el modelo canónico por la frontera autorizada y propaga estados de carga, ausencia, invalidez y revisión.
- Crear `ConfiguracionEmpresaProvider` y hooks de lectura/proyección; establecer claves de caché y reinicio de estado por `empresaId` y `revision`.
- Exponer proyecciones específicas de lectura para módulos, caja, ticket de operación previa a confirmación y Branding, sin devolver el documento mutable a componentes.
- Preparar su inserción junto a `SaaSProvider` en `app/layout.tsx`, pero no cortar la suscripción global actual ni crear fallback al singleton.

**Archivos afectados.** Nuevos `contexts/configuracion-empresa-context.tsx` y/o hooks bajo `lib/configuracion/`; pruebas de hooks/componentes; modificación limitada de `app/layout.tsx` cuando pueda hacerse sin activar consumidores. `lib/configuracion-service.ts` permanece legacy durante esta etapa.

**Dependencias.** B1.2 y B1.3.

**Riesgos.** Leer antes de resolver tenant, conservar datos de la empresa anterior al cambiar sesión, hacer de `DEFAULT_CONFIG` una autoridad, o introducir una segunda lectura que diverja del comando backend.

**Criterios de aceptación.**

- Ningún hook acepta un `empresaId` arbitrario del usuario ni usa la empresa fundacional como default.
- Documento ausente, inválido o de versión no soportada se expresa como error recuperable tipado; no se entrega un objeto parcial.
- Cambiar de tenant limpia el estado y las claves de caché; Branding y proyecciones quedan particionados por tenant/revisión.
- El provider aún no modifica la autoridad runtime ni incorpora fallback por petición.

**Estrategia de pruebas.** Pruebas de React con cambios de sesión/tenant, carga, documento faltante, esquema inválido, cambio de revisión y desuscripción. Pruebas de contrato de la frontera backend de lectura y de que no se consulta `configuracion/general`.

### B1.6 — Adaptación de settings y consumidores operativos no fiscales

**Objetivo.** Hacer que los consumidores B1 lean y editen secciones canónicas mediante proyecciones y comandos, preservando el límite con B2.

**Alcance.**

- Adaptar `contexts/modulos-context.tsx` para consumir la proyección B1, eliminar defaults como autoridad y retirar la inserción silenciosa de `reservas`.
- Adaptar `components/pos/shifts-module.tsx`, `components/pos/turno-gate.tsx` y `components/pos/global-close-shift.tsx` a las políticas de Caja.
- Reestructurar `components/pos/settings-module.tsx` por secciones/comandos, con `expectedRevision`, conflictos, motivo fiscal y errores tipados. Las preferencias de impresión solo contienen defaults empresariales permitidos.
- Adaptar `components/pos/sell-module.tsx` y `lib/tickets/adapters/checkout-adapter.ts` para consumir identidad/régimen/ticket canónicos solo en el checkout previo a confirmación.
- Preparar la activación coordinada posterior sin conectar escrituras directas ni cambiar el lector legacy durante esta fase.

**Archivos afectados.** `contexts/modulos-context.tsx`, `components/pos/settings-module.tsx`, `components/pos/shifts-module.tsx`, `components/pos/turno-gate.tsx`, `components/pos/global-close-shift.tsx`, `components/pos/sell-module.tsx`, `lib/tickets/adapters/checkout-adapter.ts`, pruebas de sus adaptadores y, si procede, nuevos componentes/formularios específicos B1.

**Dependencias.** B1.3 y B1.5.

**Riesgos.** Conflictos de revisión perdidos en formularios, un componente que siga enviando el objeto completo, módulos fuera del Plan, controles de fiscalidad aún vinculados a Configuración, o asumir que la proyección del checkout sirve para reimpresión.

**Criterios de aceptación.**

- Settings no realiza `setDoc`/merge directo ni permite editar campos prohibidos por B1.
- Cada modificación usa el comando más estrecho aplicable, muestra conflicto sin merge automático y conserva el error de validación accionable.
- Módulos y caja no añaden valores por defecto ni capacidades fuera de la selección/Plan; los consumidores no mutan la configuración leída.
- El checkout usa nombres canónicos para datos vigentes, pero no toma número, prefijo, resolución, rango o Snapshot de B1.
- `components/pos/historial.tsx`, `lib/reimpresion/venta-ticket-adapter.ts`, `lib/ventas-service.ts`, `lib/reservas-service.ts` y el webhook Wompi no se alteran como sustitución fiscal: siguen reservados a B2.

**Estrategia de pruebas.** Tests de formulario y hook: allowlists, revisión obsoleta, no-op, campo local rechazado, módulos/dependencias, caja y permisos. Tests de adaptador de checkout con configuración canónica. Ejecutar regresiones de tickets/reimpresión para demostrar que B1 no modifica aún el flujo histórico.

### B1.7 — Resolver de Branding y superficies tenant

**Objetivo.** Desacoplar la presentación tenant de la marca codificada, usando únicamente Branding validado y el tema neutral SaaS.

**Alcance.**

- Crear resolver de tokens semánticos, modo visual, nombre visible y referencias de assets desde la proyección B1.
- Aplicar la resolución después del tenant en el provider de tema y superficies tenant, conservando preferencias personales/accesibilidad compatibles.
- Reemplazar las referencias de marca identificadas en sidebar, login POS, encabezado admin y metadata/superficies tenant que puedan resolver inequívocamente empresa.
- Mantener rutas globales, públicas y pre-tenant con marca SaaS neutral; inventariar explícitamente los contenidos de Café Atrato que no son una superficie tenant y no deben consumirse como Branding.
- Garantizar que Ticket documental y Snapshot no consultan `branding`.

**Archivos afectados.** Nuevos módulos/provider de Branding, `components/theme-provider.tsx`, `app/layout.tsx`, `app/globals.css`, `styles/globals.css`, `components/pos/sidebar.tsx`, `components/pos/login-screen.tsx`, `components/pwa/admin-header.tsx`, layouts metadata tenant pertinentes y pruebas visuales/unidad. Las rutas públicas se modifican solo si su clasificación tenant ya está resuelta; de lo contrario quedan fuera del bloque.

**Dependencias.** B1.2 y B1.5.

**Riesgos.** Fuga de tema entre tenants, hidratar con la marca anterior, activos inseguros, contraste insuficiente, convertir CSS/props en datos persistidos o acoplar visuales al Ticket fiscal.

**Criterios de aceptación.**

- Sin tenant, con Branding ausente o ante fallo recuperable, la UI usa exclusivamente el tema neutral SaaS.
- Los overrides son tokens semánticos validados, parciales y con claves de caché `(empresaId, revision, modo, versiónAsset)`.
- La marca Café Atrato no aparece como default de una empresa nueva; los nombres y assets de configuración se proyectan solo tras resolver tenant.
- Branding no añade comando/evento/autoridad, no cambia gates y no se usa para Ticket o Snapshot.

**Estrategia de pruebas.** Unitarias del resolver y contraste; pruebas de componentes para cambio de tenant, paleta parcial, asset inválido, modo claro/oscuro/sistema, preferencias de accesibilidad y ausencia de flash/fuga de tema. Verificación visual manual de POS/admin y regresión de render de tickets.

### B1.8 — Analizador de legado y preparación de paridad

**Objetivo.** Convertir el singleton actual en una entrada auditada y clasificable para que B7 pueda ejecutar un backfill certificado sin inferencias silenciosas.

**Alcance.**

- Implementar un adaptador de lectura offline/Admin SDK que clasifique cada campo de `configuracion/general` según la matriz B1: destino Configuración, destino B2 o conflicto/incidencia.
- Normalizar y validar candidatos; detectar NIT/régimen contradictorio, logo ambiguo, módulos desconocidos, ciudad sin código territorial y valores fiscales que no se pueden copiar a B1.
- Producir reporte determinista de paridad, diferencias y acciones requeridas, con modo dry-run por defecto y sin escribir datos.
- Definir fixtures de legado representativos para certificar la clasificación. No generar un script `--execute`, no crear documentos tenant y no modificar la ruta legacy.

**Archivos afectados.** Nuevos módulos de adaptación/reporte bajo `lib/configuracion/` y/o `scripts/` en modo solo lectura; fixtures y pruebas. Puede leer `scripts/migrate-mt-u1-fundacional.ts` como antecedente, sin modificar su comportamiento.

**Dependencias.** B1.1, B1.2 y B1.4.

**Riesgos.** Ejecutar escrituras por accidente, tratar valores ficticios como datos legales, copiar una marca ambigua dos veces, mover contador/resolución a B1 o ocultar una discrepancia de paridad.

**Criterios de aceptación.**

- La herramienta no realiza escrituras en todos sus modos B1 y declara claramente el inventario leído.
- Cada campo legacy obtiene un resultado explícito: mapeado, omitido, reservado B2 o conflicto que requiere intervención.
- El informe identifica valores que impedirían una configuración fiscal ready y no inventa códigos/identidad.
- Prefijo, contador, resolución, rango y vigencia nunca aparecen en la salida persistible B1.

**Estrategia de pruebas.** Fixtures de singleton completo, incompleto, contradictorio y con campos desconocidos; aserciones de cero escrituras mediante dobles Admin SDK/emulador; snapshots del informe y pruebas de repetibilidad.

### B1.9 — Certificación integrada y handoff a B2/B4/B5/B7

**Objetivo.** Verificar que la base B1 es integrable sin activar prematuramente el corte de autoridad y dejar evidencias precisas para los bloques dependientes.

**Alcance.**

- Ejecutar la matriz completa de pruebas B1, pruebas existentes de tenant, Rules, tickets, reimpresión y Functions; corregir fallos dentro de alcance B1.
- Auditar estáticamente todas las referencias a `configuracion/general`, escrituras directas, `DEFAULT_CONFIG`, `consecutivo_actual`, datos de Branding Café Atrato y APIs SQLite/Electron.
- Clasificar cada referencia como: sigue activa hasta B2/B7/MT-U12, adaptada sin conectar, o preparada para cutover. No eliminar ni redirigir por petición.
- Preparar la lista de integración: B2 debe sustituir escritores fiscales y reimpresión; B4 debe aplicar Rules/lifecycle; B5 debe invocar inicialización atómica; B7 ejecuta backfill, corte, retención y retiro; MT-U12 trata Electron.

**Archivos afectados.** Pruebas de B1 y sus fixtures; actualizaciones mínimas de scripts de comprobación existentes si solo añaden validación sin escritura. No se modifica el singleton, Rules de producción, migraciones ni Electron.

**Dependencias.** B1.1 a B1.8.

**Riesgos.** Declarar B1 terminado por pruebas unitarias mientras persisten writers fiscales o consumers históricos, confundir preparación con cutover, o introducir una regresión de aislamiento al conectar piezas antes de B4.

**Criterios de aceptación.**

- Se demuestra trazabilidad de cada uno de los doce criterios B1-IMP a pruebas o evidencia concreta.
- La suite existente continúa verde y la nueva cubre conflicto, tenant mismatch, documento faltante/incompleto, país no soportado, bloqueo fiscal tras emisión, restauración, idempotencia, Branding y paridad.
- El inventario deja explícitos los cuatro escritores fiscales y los consumidores de reimpresión pendientes de B2.
- No existe dual-write, fallback por solicitud ni cambio de autoridad de `configuracion/general` como resultado de B1.

**Estrategia de pruebas.** Ejecutar `npm run lint`, `npm run build`, `npm run test:tenant`, `npm run test:tickets`, `npm run test:reimpresion`, `npm run build:functions`, `npm run test:auth-foundation` y la suite Rules/emulador aplicable, además de las nuevas suites B1. La certificación de deploy/cutover queda expresamente para B7.

## 5. Mapa de archivos por responsabilidad futura

| Responsabilidad | Archivos de partida | Bloque responsable |
|---|---|---|
| Contrato, plantilla, validadores y proyecciones | Nuevos `lib/configuracion/*`; `lib/impuestos-service.ts` | B1.1–B1.2 |
| Comandos, idempotencia, evento y auditoría | Nuevos `functions/src/configuracion/*`; `functions/src/index.ts` | B1.3–B1.4 |
| Lectura tenant y estado React | `contexts/saas-context.tsx`, `app/layout.tsx`, nuevos context/hooks B1 | B1.5 |
| Configuración y consumidores operativos | `lib/configuracion-service.ts`, `contexts/modulos-context.tsx`, settings, caja, sell y checkout adapter | B1.6 |
| Tema y marca tenant | `components/theme-provider.tsx`, `app/layout.tsx`, CSS global, sidebar, login, admin header | B1.7 |
| Paridad de singleton | `configuracion/general` como entrada solo lectura, `scripts/migrate-mt-u1-fundacional.ts` como antecedente | B1.8 |
| Reglas y cutover | `firestore.rules`, `firestore-rules/*`, escrituras de ventas/reservas/webhook, reimpresión | Inventariados B1.9; implementación B2/B4/B7 |
| Electron local | `src/database.js`, `main.js`, `preload.js`, `components/pos/configuracion.tsx`, `components/pos/vender.tsx` | Excluido de B1; MT-U12/B7 |

## 6. Riesgos transversales y controles de secuencia

| Riesgo | Punto afectado | Control en el plan |
|---|---|---|
| Ruptura de consumidores actuales | El singleton alimenta módulos, caja, settings, venta y reimpresión. | B1.5/B1.6 crean contratos y adaptadores antes de conectar; B1.9 preserva regresiones. El corte se reserva a B7. |
| Pérdida o invención de configuración | `DEFAULT_CONFIG` incluye NIT, dirección, contacto y marca ficticios. | B1.1 usa plantilla neutral; B1.2 falla explícitamente; B1.8 informa incertidumbres sin escribir. |
| Migración parcial o divergencia | Singleton y documento tenant podrían coexistir. | B1.8 solo analiza; B1 no dual-escribe ni habilita fallback. B7 hará un corte único certificado. |
| Contador/numeración fiscal | Cuatro vías actuales incrementan el contador global. | Se mantienen inventariadas y sin alteración B1; B2 debe eliminarlas transaccionalmente antes del cutover. |
| Bootstrap incompleto | Hoy no existe bootstrap B5; una inicialización aislada podría crear tenants parciales. | B1.4 entrega una operación interna; B5 la invoca dentro del único commit atómico de ADR-SAAS-007. |
| Revisión concurrente | Settings actual guarda un objeto completo con merge. | B1.2/B1.3 imponen allowlists, `expectedRevision`, idempotencia y resolución explícita. |
| Autorización/lifecycle anticipados | Las Rules actuales bloquean `configuraciones` para tenant y no aplican lifecycle B4. | B1 no altera Rules; los comandos backend verifican lo necesario y B4 armoniza backend/Rules antes de activar clientes. |
| Branding entre tenants | CSS y nombre Café Atrato son globales; hay cache/hidratación potencial. | B1.7 usa tema neutral, resolución posterior al tenant, claves por empresa/revisión y validación de assets/contraste. |
| Confusión SaaS/Electron | SQLite contiene datos homónimos, secretos y contador propio. | B1 lo declara frontera local y no crea puente, fallback ni sincronización. |
| Conflictos de revisión | Settings, CSS global y layout son archivos de alto solapamiento. | B1.6 se ejecuta después de B1.5; B1.7 después de provider y con propiedad exclusiva de tema/layout. |
| Snapshot/reimpresión | El adaptador actual lee configuración vigente para ventas pasadas. | B1 no simula Snapshot; B1.9 mantiene el pendiente visible y B2 lo resuelve con pruebas de inmutabilidad. |

## 7. Condición de cierre del plan B1-IMP

B1-IMP estará listo para ejecución por ramas independientes cuando los nueve bloques tengan dueño, pruebas y revisión separables, y cuando se conserve esta frontera de integración:

1. B1 entrega el agregado Configuración, sus comandos, lectura/proyección, Branding y análisis de paridad.
2. B2 recibe la configuración canónica para construir Snapshot y sustituir toda numeración/contador.
3. B4 recibe comandos/lecturas B1 para imponer tenant y lifecycle en backend y Rules.
4. B5 recibe `InicializarConfiguracionEmpresa` para incorporarlo al núcleo atómico.
5. B7 recibe el analizador de paridad y los consumidores preparados para ejecutar el único cutover, retención y retiro del singleton.
6. MT-U12 recibe la frontera Electron explícita sin que B1 haya creado una autoridad paralela.

La implementación no debe declarar terminado B1 por haber creado tipos o una pantalla: el cierre requiere la certificación B1.9 y la evidencia de que ninguna pieza B1 adelanta el cutover ni contradice las autoridades aprobadas.
