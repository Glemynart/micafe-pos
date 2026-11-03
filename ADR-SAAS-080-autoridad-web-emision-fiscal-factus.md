# ADR-SAAS-080 — Autoridad web para emisión fiscal Factus

**Estado:** Propuesto — no autoriza implementación, despliegue ni cambios de Rules.
**Fecha:** 2026-10-14
**Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial`.
**Decisores:** propietario del producto y responsable técnico.
**Relacionado:** ADR-SAAS-008, ADR-SAAS-079, R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md.

## Contexto

La inspección de `components/pos/historial.tsx` encontró cuatro invocaciones de
`window.api.factus` para emisión individual, lote y notas, seguidas de una
escritura de `ventas/{id}.dian` desde cliente mediante
`guardarMetadatosDian()`. Esta secuencia puede dejar una factura emitida en
Factus sin sus metadatos persistidos en Firestore si falla la escritura cliente.

El propietario confirmó que el producto objetivo es web y no se usará Electron.
En el repositorio inspeccionado no se encontró un proveedor HTTP Factus en
`app/api` ni una callable de Functions que emita facturas o notas. Por tanto,
`window.api.factus` es una referencia de interfaz heredada, no evidencia de una
operación web disponible ni de un punto de backend existente que pueda
protegerse. Tampoco se localizó en este repositorio la implementación del
adaptador Factus que construye la petición y procesa su respuesta.

ADR-SAAS-008 exige que la autoridad fiscal y la asignación de numeración estén
en backend privilegiado. ADR-SAAS-079 acepta conservar la lógica actual y
bloquear temporalmente las acciones DIAN en la interfaz solo para
`Cafe Atrato` (`1ae0rD9H8t3ZFSBKrrHR`) y `Prueba` (`Prueba`). Esa decisión no
crea una política global, no habilita Rules ni despliegues y no acredita que
otros tenants puedan emitir desde web. La decisión comercial previa permite
que Diana inicie su Trial sin facturación electrónica; esa excepción comercial
es independiente de este diseño general.

No se conocen aún el contrato real del adaptador Factus, el soporte del
proveedor para idempotencia/consulta por referencia, ni la fuente canónica de
sus credenciales. No se inventarán contratos, secretos ni comportamiento del
proveedor. El diseño de implementación requiere recuperar y probar esa
semántica antes de sustituir las cuatro invocaciones existentes.

## Impulsores de decisión

- La autenticación, empresa activa, membresía y permiso se verifican en el
  servidor; `empresaId`, venta, importes, impuestos y numeración enviados por el
  cliente no son autoridad.
- Factus no se invoca para los dos IDs pausados, y la pausa no se amplía a
  tenants presentes o futuros por una condición global.
- Una emisión externa no se confirma al usuario hasta persistir su resultado
  fiscal junto con su recibo durable y auditoría.
- Un timeout o pérdida de respuesta no puede provocar una segunda factura por
  reintento ciego.
- Venta DEMO, inventario, caja, compras y demás operaciones no fiscales siguen
  disponibles y conservan sus autoridades actuales.
- La migración no elimina ni reimplementa por inferencia la lógica de Factus;
  primero debe ubicarse y probarse el adaptador existente o su contrato real.
- El cambio debe ser desplegable, observable y reversible sin reabrir
  escrituras fiscales cliente ni alterar empresas no autorizadas.

## Opciones consideradas

### Opción 1 — Callable de Firebase como autoridad fiscal web (recomendada)

La web envía una intención acotada a una Callable Gen 2. El servidor autentica
al actor, resuelve tenant/membresía/permiso, vuelve a leer la venta y su
snapshot fiscal, valida readiness y estado, coordina la emisión Factus y
persiste la respuesta con recibo y auditoría. La Callable no aceptaría datos
fiscales calculados por el navegador.

**Ventajas:** coincide con el backend fiscal ya presente (`functions/src/fiscal`)
y con ADR-SAAS-008; mantiene cerca de Firestore la autoridad de tenant y los
recibos; permite exigir identidad Firebase en la frontera; y evita exponer
credenciales Factus en el bundle web.

**Costos/riesgos:** la llamada externa y Firestore no comparten transacción;
requiere un protocolo durable de idempotencia y conciliación para resultados
ambiguos. El codebase/región de Functions debe fijarse en el PR de
implementación tras un preflight dirigido, sin sustituirlo por un deploy del
codebase completo.

### Opción 2 — Ruta API de Next.js en Vercel con Firebase Admin

Una ruta de servidor verifica el token Firebase, consulta membresía/tenant,
llama a Factus y escribe Firestore con Admin SDK.

**Ventajas:** encaja con la aplicación web y permite un contrato HTTP explícito;
puede desplegarse junto con un SHA identificable de Vercel.

**Costos/riesgos:** duplica en Vercel la frontera de autoridad ya establecida
en Functions, distribuye secretos e identidad de servicio en otro runtime y
crea una segunda política de despliegue/rollback para operaciones fiscales.
También mantiene la misma ventana de inconsistencia entre Factus y Firestore;
no la resuelve por sí sola.

### Opción 3 — Servicio fiscal independiente

Un servicio dedicado expone emisión DIAN y mantiene credenciales, orquestación
y conciliación aparte.

**Ventajas:** aislamiento operativo y ciclo de despliegue propio para el
proveedor fiscal.

**Costos/riesgos:** agrega infraestructura, observabilidad, secretos, permisos,
operación y una frontera de datos distribuida sin evidencia de carga o
necesidad de escala que lo justifique para el primer Trial. No elimina la
necesidad de idempotencia y conciliación.

### Opción 4 — Invocación desde navegador / `window.api`

La interfaz invoca directamente un SDK o API Factus, y después intenta guardar
los metadatos.

**Rechazo:** no existe proveedor web acreditado en el repo; las credenciales y
la autoridad serían cliente; y la secuencia actual permite emisión externa
antes de persistir el resultado. No satisface ADR-SAAS-008 ni el requisito de
consistencia.

## Evaluación comparativa

Estimación arquitectónica provisional de 1 (bajo) a 5 (alto), basada en la
estructura encontrada; no es benchmark de latencia/costo ni sustituye la
validación del contrato Factus. Pesos: autoridad y ajuste a ADR (30%),
aislamiento tenant (25%), consistencia/recuperación (20%), operabilidad del
equipo actual (15%) y continuidad de migración (10%).

| Opción | Autoridad | Tenant | Consistencia | Operación | Migración | Total ponderado |
|---|---:|---:|---:|---:|---:|---:|
| Callable Firebase | 5 | 5 | 4 | 4 | 3 | 4.45/5 |
| API route Next.js | 3 | 4 | 3 | 3 | 3 | 3.25/5 |
| Servicio independiente | 4 | 4 | 4 | 1 | 1 | 3.25/5 |
| Navegador / `window.api` | 1 | 1 | 1 | 4 | 2 | 1.55/5 |

Los puntos de consistencia no son 5 para ninguna opción: Factus y Firestore no
participan de una transacción distribuida. Para la callable, la puntuación
asume recibo durable, idempotencia y conciliación; su viabilidad depende de
confirmar que Factus permite idempotencia por referencia o consultar el
resultado por una referencia estable. Sin una de esas capacidades no se puede
garantizar que una respuesta perdida no cree duplicados; la política de
resultado ambiguo debe aprobarse antes de implementar.

## Decisión propuesta

Se propone la **Opción 1: Callable de Firebase como autoridad fiscal web**,
alineada con ADR-SAAS-008 y evitando una nueva autoridad en Vercel. No se
implementa con este ADR. Su aceptación debe condicionarse a identificar el
adaptador/contrato Factus que se conservará y demostrar una estrategia del
proveedor para idempotencia o consulta de resultados ambiguos.

El endpoint, provisionalmente llamado `emitirDocumentoDianV1`, recibirá solo
una intención: venta/documento objetivo, tipo de documento y clave de comando
idempotente; para notas, referencia al documento de origen y motivo conforme
al contrato fiscal vigente. El nombre y esquema definitivos quedan para el
contrato de implementación. El servidor resolverá el tenant desde identidad y
membresía autoritativas; una `empresaId` enviada por navegador, si se conserva
por compatibilidad, será solo una aserción que debe coincidir, nunca la fuente
de autoridad. El servidor releerá venta, snapshot, estado, numeración y
readiness según ADR-SAAS-008 y las reglas actuales.

Antes de llamar al proveedor, el servidor registrará de forma durable la
intención, actor, tenant, clave idempotente y estado. No se ejecutará una
llamada HTTP externa dentro de una transacción Firestore. Una respuesta
confirmada se persistirá en una transacción que vincule el recibo fiscal con
`ventas/{id}.dian` y la auditoría. La UI solo mostrará emisión exitosa cuando
esa persistencia termine.

Si el servidor pierde la respuesta de Factus o falla al persistirla, conservará
el comando en estado recuperable `RESULTADO_PENDIENTE`/equivalente, no repetirá
la solicitud a ciegas y consultará Factus por la referencia/idempotency key.
Si el proveedor no permite consulta ni idempotencia, el comando quedará
bloqueado para conciliación operativa manual antes de cualquier reintento. No
se borrará una factura externa ni se simulará una compensación fiscal.

El control `DIAN_TEMPORARILY_UNAVAILABLE` seguirá limitado exactamente a los
dos IDs de ADR-SAAS-079, verificado en servidor antes de Factus. Una empresa
distinta no quedará bloqueada por esa allowlist; su emisión solo estará
disponible cuando complete readiness y la Callable aprobada esté desplegada.
Esta propuesta no convierte la ausencia actual del proveedor web en una
política de interrupción global ni cambia la decisión de onboarding de Diana
sin facturación electrónica.

La Callable será la única escritora de los metadatos DIAN al completar el
corte. `guardarMetadatosDian()` cliente no se retirará antes de una migración
compatible y verificable, pero tampoco se reabrirán sus permisos en Rules. El
corte de Rules se realizará en release separado después de verificar todas
las dependencias legacy; ninguna aprobación de este ADR autoriza ese deploy.

## Contrato de autoridad y aislamiento propuesto

- Exigir Firebase Auth y resolver la membresía vigente en servidor en cada
  operación, incluso en replay; validar estado del tenant, rol/capacidad y
  pertenencia de la venta al mismo `empresaId`.
- Ignorar importes, impuestos, numeración, CUFE y respuesta de Factus
  suministrados por cliente. Leer la venta y snapshot canónico del servidor.
- Rechazar tenant inactivo, membresía revocada, venta ajena, payload inválido,
  tipo de documento no permitido, readiness incompleto o clave idempotente
  reutilizada con huella distinta; emitir errores estables sin filtrar secretos.
- Guardar auditoría con actor, tenant, comando, tipo, estados, referencias
  afectadas y causación; no registrar credenciales, tokens, payloads sensibles
  ni respuestas completas con datos personales.
- En lotes, definir resultado por venta/comando. El batch no se presentará
  como atómico con Factus: conservar éxito, rechazo y resultado ambiguo por
  elemento y permitir conciliación sin duplicar los éxitos ya emitidos.

## Pruebas y criterios para el PR de implementación

1. Callable directa sin identidad, token inválido, tenant no resuelto,
   membresía revocada, rol insuficiente, tenant ajeno y venta de otro tenant:
   rechazo sin invocar Factus ni modificar venta, numeración, recibo o auditoría
   fiscal parcial.
2. `Cafe Atrato` y `Prueba`: cada tipo de acción aceptado se rechaza en servidor
   antes de invocar Factus; repetición/replay mantiene el mismo rechazo.
3. Empresa fuera de la allowlist: el guard temporal no la bloquea
   globalmente; los controles normales de readiness y permisos siguen vigentes.
4. Idempotencia, comandos concurrentes, mismo comando/mismo payload,
   mismo comando/payload distinto, timeout antes y después de aceptar Factus,
   respuesta recibida con fallo Firestore, recuperación/consulta al proveedor y
   reintento tras conciliación.
5. La respuesta persistida (CUFE, número, prefijo, QR/PDF y fecha según el
   contrato existente) queda ligada a una sola venta/tenant; el frontend no
   informa éxito antes de confirmarse la persistencia.
6. Regresión DEMO/no fiscal de ventas, inventario y caja; Bodega compras y
   turnos continúan sin cambio; Rules Emulator y aislamiento multi-tenant.
7. Contrato de compatibilidad para factura individual, batch, nota crédito,
   nota débito, errores y reimpresión; pruebas con adaptador mock y entorno
   sandbox de Factus, sin credenciales productivas.

La implementación requerirá auditar/mutation-test del diff, CI del PR,
preflight del recurso y código exactos, publicación staging y smoke autenticado
de staging. Producción mantiene autorizaciones independientes para Functions,
Rules, Vercel e identidad de smoke.

## Migración y rollback propuestos

1. Recuperar y documentar la implementación/contrato Factus existente y probar
   compatibilidad; no borrar ni reescribir sus transformaciones por inferencia.
2. Implementar la Callable y su recibo durable bajo ADR aceptado; probar en
   Emulator y sandbox con tenant sintético, sin cambios de Rules.
3. Publicar cliente web compatible solo después de confirmar que la Callable
   está disponible en el proyecto/entorno objetivo; conservar las acciones
   bloqueadas para los dos IDs autorizados.
4. Observar intentos, conciliaciones y errores; ejecutar el corte a escritura
   servidor y solo después preparar un PR separado para Rules, con matriz,
   pruebas y aprobación productiva específicas.
5. Rollback de aplicación: volver a la UI estable compatible y deshabilitar la
   emisión nueva según estado del release; conservar recibos y respuestas
   fiscales. No repetir operaciones ambiguas, borrar documentos emitidos ni
   restaurar Rules que reabran escritura cliente. Para tenants del allowlist,
   mantener la pausa de ADR-SAAS-079 hasta una reactivación aprobada y verificada.

## Consecuencias

### Positivas

- La web no dependerá de un objeto Electron inexistente ni expondrá la autoridad
  fiscal al navegador.
- Identidad, tenant, venta y persistencia se validan dentro de una frontera
  server-side coherente con ADR-SAAS-008.
- Los resultados ambiguos quedan explícitos y recuperables; los reintentos no
  se vuelven a emitir sin conciliación.
- La pausa temporal de ADR-SAAS-079 mantiene su alcance acotado y reversible.

### Negativas / costos

- El backend fiscal requiere nueva orquestación, almacenamiento durable,
  recuperación y observabilidad; la atomicidad absoluta entre Factus y
  Firestore no existe.
- La ausencia del adaptador/contrato en el repositorio impide comenzar una
  migración fiel hasta obtener su fuente o documentación y probarla.
- Las rutas y despliegues existentes de Functions/Vercel necesitan preflights
  independientes; este ADR no los simplifica ni autoriza.

### Neutrales

- Emisión fiscal y cierre de venta DEMO/no fiscal permanecen capacidades
  separadas; habilitar una no modifica la otra.
- La reimpresión sigue leyendo el snapshot fiscal persistido y no invoca Factus.

## Preguntas abiertas antes de aceptar

- ¿Dónde está el adaptador/contrato Factus que actualmente se pretende
  conservar para la web y qué versión exacta de API utiliza?
- ¿Factus acepta una clave idempotente de negocio y permite consultar una
  emisión por referencia tras timeout? ¿Cuál es la garantía documentada?
- ¿Qué roles actuales pueden emitir/crear notas, y qué permisos deben
  conservarse en web?
- ¿El endpoint debe quedar en el codebase fiscal `saas-auth` existente o en
  otro codebase? Confirmar el target exacto con manifiesto, build y preflight;
  esta propuesta no cambia `firebase.json`.
- ¿Cuál es el procedimiento manual autorizado para conciliar `RESULTADO
  PENDIENTE` si Factus no ofrece consulta idempotente?

## Límites de autorización

Este ADR está **Propuesto**. No autoriza implementar, cambiar Rules, crear
Secrets/IAM, modificar datos, desplegar Functions/Vercel, ejecutar smoke
productivo, iniciar Trial ni ampliar la pausa a empresas futuras. La
aceptación operativa de indisponibilidad de ADR-SAAS-079 permanece distinta de
cualquier autorización técnica o despliegue.

## Referencias

- [`components/pos/historial.tsx`](components/pos/historial.tsx) — llamadas UI y persistencia posterior.
- [`lib/ventas-service.ts`](lib/ventas-service.ts) — `guardarMetadatosDian()` cliente.
- [`functions/src/fiscal/callables.ts`](functions/src/fiscal/callables.ts) — superficie fiscal Callable existente.
- [`ADR-SAAS-008-autoridad-numeracion-fiscal.md`](ADR-SAAS-008-autoridad-numeracion-fiscal.md) — autoridad privilegiada, asignación y snapshot fiscal.
- [`ADR-SAAS-079-indisponibilidad-temporal-dian-gate-i.md`](ADR-SAAS-079-indisponibilidad-temporal-dian-gate-i.md) — pausa limitada a dos empresas.
- [`R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`](R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md) — frontera de operaciones críticas.
- [`Evidencia post-merge de PR #595`](docs/goals/evidence/G-SAAS-02-E2-2-PR595-POSTMERGE-CLOSEOUT-2026-10-14.md) — evidencia web-only y bloqueos actuales.
