# ADR-SAAS-016 — Ventas de demostración no fiscales durante Trial

## Estado

Aceptado por aprobación explícita del usuario el 2026-08-03.

## Fecha

2026-08-03

## Goal, Milestone y Epic

- **Goal:** G-MVP-01 — MVP comercial de Café Atrato
- **Milestone:** M1 — Tenant y fiscalidad listos para operar
- **Epic:** E1.2 — Readiness fiscal
- **PR previsto:** P0-02 — readiness fiscal y operación Trial sin configuración fiscal definitiva

Este ADR no adelanta P0-04 ni Milestones posteriores. Define únicamente la
capacidad necesaria para que un tenant en Trial pueda evaluar el POS mientras
su configuración fiscal permanece pendiente.

---

## 1. Contexto y problema

El Trial debe permitir que cualquier tenant evalúe el funcionamiento real del
POS antes de disponer de resolución POS o de factura electrónica. Café Atrato
se encuentra precisamente en ese escenario: el propietario todavía no tiene
datos fiscales aprobados y no deben inventarse valores para desbloquear la
operación.

La arquitectura vigente trata la venta como una operación fiscal seguida de
efectos operativos:

1. `confirmarVentaFiscalCallable` valida configuración B1, asignación B2,
   resolución y numeración; consume un consecutivo y persiste
   `snapshotFiscal`.
2. `aplicarEfectosVentaOperativaV1` aplica los efectos operativos server-side
   con idempotencia, auditoría y transacción.

Por tanto, una venta de demostración no puede ser una venta fiscal incompleta,
ni puede pasar por la ruta fiscal con una resolución, NIT o snapshot ficticios.
Debe existir como una variante explícita del dominio de ventas, con una
autoridad server-side que impida que el cliente elija o altere sus propiedades.

Además, `OnboardingGate` actualmente bloquea el POS cuando la readiness fiscal
no está completa y el wizard solicita datos que el tenant todavía no posee. Se
necesita permitir “configurar ahora” o “configurar más tarde” sin convertir la
segunda opción en una configuración fiscal falsa.

## 2. Drivers de decisión

- Permitir ventas de evaluación durante un Trial vigente.
- No consumir numeración ni generar documentos fiscales oficiales.
- No generar factura POS, factura electrónica, CUFE ni snapshot fiscal
  definitivo.
- No producir efectos tributarios.
- Mantener la autoridad del servidor sobre tenant, Trial, permisos, modo de
  venta, importes y estado.
- Mantener idempotencia, auditoría, transacciones y aislamiento por tenant.
- Reutilizar la infraestructura server-authoritative existente, incluida
  `aplicarEfectosVentaOperativaV1` cuando el alcance operativo aprobado lo
  requiera.
- No modificar Firestore Rules para abrir escrituras críticas al cliente.
- No crear cuentas, numeraciones, configuraciones fiscales ni resoluciones
  ficticias desde el cliente.
- Permitir el mismo diseño para cualquier tenant en Trial, sin lógica especial
  para Café Atrato.
- No adelantar módulos, turnos, facturación electrónica ni trabajo de
  Milestones posteriores.

## 3. ¿Es una nueva variante o una nueva responsabilidad?

Sí. Es una nueva variante del flujo de venta y una nueva responsabilidad del
dominio porque cambia invariantes fundamentales de la venta fiscal:

- una venta puede confirmarse sin autoridad de numeración;
- la identificación comercial no puede confundirse con un documento fiscal;
- los consumidores y reportes deben distinguir ventas DEMO de ventas fiscales;
- el backend debe impedir que una venta DEMO se convierta en fiscal por una
  mutación cliente o por un reintento;
- la elegibilidad depende simultáneamente de lifecycle Trial y readiness
  fiscal.

Esta decisión no puede introducirse como una condición en la UI ni como una
excepción local dentro de la callable fiscal.

## 4. Alternativas consideradas

### Alternativa A — Completar datos fiscales ficticios y utilizar el flujo actual

**Rechazada.** Inventaría identidad, resolución o numeración; consumiría
consecutivos y podría producir documentos o snapshots con significado fiscal
incorrecto. También contradice `ADR-SAAS-004` y `ADR-SAAS-008`.

### Alternativa B — Bypassear readiness dentro de `confirmarVentaFiscalCallable`

**Rechazada.** Mezclaría dos semánticas incompatibles en la misma operación,
haría opcionales invariantes fiscales y aumentaría el riesgo de que una venta
de prueba genere consecuencias oficiales.

### Alternativa C — Permitir entrar al POS pero rechazar siempre el cobro

**Rechazada.** Resuelve la navegación, pero no satisface el objetivo del Trial:
evaluar una venta real de demostración.

### Alternativa D — Crear una colección completamente separada de ventas de
demostración

**No seleccionada para la propuesta inicial.** Aísla fuertemente los datos
fiscales, pero duplica el agregado de venta, el cálculo de totales, la
idempotencia, la auditoría, la consulta del POS y la integración con efectos
operativos. Su costo de mantener dos modelos de venta para el MVP es mayor que
el de un agregado único con un discriminador obligatorio y validado por
servidor.

### Alternativa E — Un agregado de venta común con modo explícito y comando
server-authoritative separado

**Recomendada.** Conserva la reutilización del POS y de los mecanismos de
auditoría/idempotencia, pero hace que la distinción fiscal/no fiscal sea
explícita, consultable y verificable. La ruta DEMO no reutiliza la callable
fiscal; comparte únicamente primitivas seguras y el ejecutor operativo que
corresponda.

## 5. Decisión propuesta

Se incorporará un modo de venta explícito y persistido:

```ts
modoOperacion: "FISCAL" | "DEMO"
```

La venta DEMO se creará exclusivamente mediante una callable nueva o un
comando backend equivalente, por ejemplo `crearVentaDemostracionV1`. El nombre
definitivo del comando se fijará durante el PR de implementación sin alterar
la decisión arquitectónica.

El servidor derivará y revalidará en cada comando:

- tenant y membresía del actor;
- estado empresarial compatible;
- Trial vigente y no expirado;
- readiness fiscal incompleta para mantener la separación de rutas;
- capacidad `sell` y rol autorizado;
- productos, cantidades, precios, descuentos y total desde las fuentes
  canónicas permitidas;
- turno/espacio aplicable, cuando la operación vigente lo exija.

El cliente no podrá enviar `modoOperacion` como autoridad ni convertir una
venta fiscal en DEMO. La callable DEMO rechazará una solicitud cuando el Trial
haya expirado, el tenant ya no sea elegible o la membresía no tenga permisos.

### 5.1 Invariantes no fiscales

Una venta DEMO:

- no solicita ni consume numeración B2;
- no crea consecutivo fiscal, prefijo fiscal ni resolución;
- no crea factura POS ni factura electrónica;
- no calcula ni persiste CUFE;
- no crea `snapshotFiscal` definitivo;
- no se publica en proyecciones de documentos fiscales;
- no genera efectos tributarios;
- queda identificada de manera visible como `DEMO` o “venta de demostración”;
- nunca puede convertirse posteriormente en una venta `FISCAL`, ni por retry,
  edición cliente, cambio de configuración fiscal, proceso de migración o
  cualquier otro comando posterior;
- permanece excluida de toda proyección, índice, documento o reporte fiscal.

El servidor podrá conservar un snapshot comercial de los artículos, cantidades,
precios y totales para reproducibilidad, auditoría y soporte. Ese snapshot no
será un snapshot fiscal ni contendrá campos presentados como autoridad fiscal.
Las ventas DEMO podrán aparecer en reportes operativos cuando corresponda,
siempre que conserven su identificación DEMO y no se mezclen con métricas o
proyecciones fiscales.

### 5.2 Efectos operativos

La propuesta distingue efectos operativos de efectos tributarios. Para que la
prueba represente el funcionamiento real del POS, la venta DEMO podrá aplicar
los efectos operativos ordinarios de inventario y, cuando el tenant tenga las
cuentas operativas necesarias, tesorería. Estos efectos deben seguir siendo
server-authoritative, idempotentes, auditados y transaccionales, y deberán
quedar marcados como derivados de una venta DEMO.

La implementación no creará cuentas automáticamente ni modificará el modelo
de cuentas de P0-05. Si un efecto operativo requiere una precondición que el
tenant no tiene, el servidor devolverá un error explícito y no aplicará una
operación parcial. La decisión no autoriza nuevas cuentas, nuevos estados
contables ni bypasses de Rules.

La reutilización de `aplicarEfectosVentaOperativaV1` será mediante una extensión
de su contrato o un ejecutor interno común, manteniendo su frontera de autoridad
del servidor. No se utilizará la callable fiscal para fabricar una Fase 1.

### 5.3 Entrada al POS y configuración posterior

Cuando la empresa sea Trial y la readiness fiscal esté incompleta, el gate
permitirá el acceso al POS en modo de demostración y mostrará el estado
“Configuración fiscal pendiente”. El administrador podrá elegir:

- **Configurar ahora:** iniciar el flujo B1/B2 únicamente con datos reales y
  aprobados.
- **Configurar más tarde:** continuar con ventas DEMO, sin escribir datos
  fiscales y sin crear una nueva autoridad persistida.

“Más tarde” será una decisión de navegación/UX; la elegibilidad real seguirá
derivándose de los documentos canónicos de empresa, suscripción, membresía y
readiness. No se añadirá un estado persistido para ocultar la falta de datos.

Cuando la empresa deje de ser Trial o deje de cumplir las condiciones de
acceso, la callable DEMO rechazará nuevas ventas aunque una sesión antigua
conserve la pantalla abierta.

### 5.4 Auditoría, idempotencia y transacción

La operación DEMO conservará las garantías de `ADR-SAAS-015` y del ejecutor
operativo vigente:

- `commandId`, `idempotencyKey`, `correlationId` y `causationId` deterministas;
- reintentos que devuelven el recibo previo sin duplicar efectos;
- auditoría del actor, tenant, modo DEMO, causa y resultado;
- una transacción server-side para la venta y los efectos operativos incluidos;
- aislamiento tenant y validación de membresía dentro de la autoridad backend;
- ausencia de mutaciones críticas directas desde el cliente.

## 6. Alcance del PR derivado

### Incluido

- Contrato de dominio explícito para distinguir ventas `FISCAL` y `DEMO`.
- Callable/comando server-authoritative para crear y confirmar una venta DEMO.
- Gate de Trial que permita “configurar más tarde” sin falsificar datos.
- Separación verificable entre campos/proyecciones fiscales y DEMO.
- Integración con el ejecutor server-side de efectos operativos, sin crear una
  autoridad paralela.
- Pruebas de tenant, Trial vigente/expirado, readiness, permisos,
  idempotencia, transacción, ausencia de numeración, ausencia de campos
  fiscales y ausencia de efectos tributarios.
- Prueba local reproducible con Emulator Suite y evidencia de auditoría.

### Fuera de alcance

- Datos fiscales reales de Café Atrato o de cualquier cliente.
- Publicar planes, crear suscripciones o realizar escrituras en producción.
- Inventar NIT, resolución, numeración, CUFE o documentos fiscales.
- Facturación electrónica, integración DIAN o generación de documentos oficiales.
- Cambiar Firestore Rules para permitir escrituras críticas desde el cliente.
- Crear cuentas automáticamente o rediseñar P0-05.
- Convertir o migrar ventas históricas.
- Reembolso, purga masiva o conversión de ventas DEMO a fiscales.
- Nuevos módulos, turnos u otros Milestones posteriores.

## 7. Consecuencias y riesgos

### Consecuencias positivas

- El Trial puede demostrar el POS sin exigir datos fiscales inexistentes.
- La ausencia de efectos fiscales queda modelada y comprobable, no implícita
  en la UI.
- El diseño es reutilizable para otros tenants y no contiene reglas para Café
  Atrato.
- Las Rules y la autoridad server-side se conservan.
- Las ventas DEMO pueden auditarse y separarse de reportes oficiales.

### Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Un consumidor interpreta una venta DEMO como fiscal | Discriminador obligatorio, validación backend y pruebas de proyecciones/reportes. |
| Un retry duplica inventario o tesorería | Envelope determinista, recibo idempotente y transacción server-side. |
| El cliente fuerza el modo FISCAL o DEMO | El modo y la elegibilidad se derivan/revalidan en backend. |
| El Trial expira con una pantalla abierta | Revalidación canónica en cada callable; no confiar en claims antiguos. |
| Falta una cuenta operativa para efectos de caja | Error explícito y operación atómica; nunca crear cuentas desde el cliente. |
| Datos DEMO contaminan reportes oficiales | Filtros/proyecciones explícitos y pruebas de exclusión fiscal. |
| Un proceso posterior intenta convertir una venta DEMO | Invariante persistente de irreversibilidad, comandos separados y pruebas de rechazo. |
| Se amplía inadvertidamente el alcance de P0-05 | No se cambia el modelo contable; solo se reutiliza la autoridad existente. |

## 8. Rollback

La capacidad se desplegará de forma aditiva. La callable DEMO puede
deshabilitarse para nuevas operaciones sin modificar ventas fiscales existentes.
El gate puede volver a exigir readiness para iniciar nuevas operaciones, pero
no se borrarán automáticamente ventas DEMO ni se intentará convertirlas en
documentos fiscales. Cualquier política de limpieza o reversión operativa
requiere una decisión posterior y un PR propio.

## 9. Criterios de aceptación arquitectónica

1. Una empresa Trial sin readiness fiscal puede entrar al POS y ejecutar una
   venta DEMO con datos comerciales reales del catálogo.
2. La misma operación es rechazada fuera del Trial o sin membresía/capacidad
   válida.
3. La operación no consume numeración ni crea consecutivo, resolución,
   `snapshotFiscal`, CUFE, factura POS o factura electrónica.
4. La venta queda identificada como DEMO en almacenamiento, recibo, auditoría
   y superficies de consulta relevantes.
5. Un retry no duplica venta, inventario, tesorería, auditoría ni recibos.
6. Un fallo de cualquier precondición no deja efectos parciales.
7. El cliente no escribe directamente estados críticos ni puede elegir una
   autoridad fiscal.
8. Firestore Rules no se relajan ni se modifican para abrir esta ruta.
9. “Configurar más tarde” no escribe datos fiscales ni crea una autoridad
   persistida ficticia.
10. Una venta DEMO no puede transformarse en `FISCAL` mediante ningún comando,
    retry, migración o cambio posterior de configuración.
11. Las ventas DEMO quedan fuera de proyecciones y reportes fiscales, pero
    pueden aparecer identificadas en reportes operativos autorizados.
12. La prueba local reproduce el flujo y genera evidencia de ausencia de
    efectos fiscales.

## 10. Relación con otros ADR

- **ADR-SAAS-003:** Trial como acceso completo temporal y convertible.
- **ADR-SAAS-004:** separación entre tenant y configuración fiscal; no inferir ni
  falsificar datos.
- **ADR-SAAS-008:** numeración como autoridad fiscal; la venta DEMO no la usa.
- **ADR-SAAS-009:** enforcement canónico de lifecycle y membresía.
- **ADR-SAAS-010:** máquina de estados y separación entre fase fiscal y efectos
  operativos; este ADR añade una variante no fiscal explícita.
- **ADR-SAAS-015:** autoridad server-side para efectos operativos, idempotencia,
  auditoría y transacciones.
- **Goal:** `docs/goals/GOAL-MVP-COMERCIAL.md`, M1/E1.2/P0-02.

## 11. Aprobación

El usuario aprobó explícitamente esta decisión arquitectónica el 2026-08-03.
La implementación puede comenzar únicamente manteniendo el alcance, los
invariantes y las exclusiones definidos en este documento.
