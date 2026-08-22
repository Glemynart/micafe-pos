# ADR-SAAS-036 — Integridad de reservas públicas y pagos Wompi

## Estado

**Aceptado el 2026-08-22.**

La aprobación explícita autoriza la implementación y auditoría del corte
P1-09. No autoriza despliegue, configuración externa de Wompi/Vercel,
activación comercial ni escrituras en producción.

## Goal, Milestone y Epic

- **Goal:** `G-SAAS-02` — primer cliente en Trial 30 días.
- **Milestone / Epic:** `M3 / E3.2` — contención de riesgos P0/P1 conocidos.
- **Backlog:** `P1-09` — seguridad de reservas públicas/Wompi.
- **Autorización de planificación:** instrucción explícita del usuario del
  2026-08-22 para tratar P1-09 como un corte de seguridad independiente.
- **Límite:** no amplía Wompi a billing SaaS ni modifica reservas internas de
  `ADR-SAAS-033`.

`GOAL-MVP-COMERCIAL.md`, `MASTER-SECURITY-PLAN.md` y el backlog mantienen las
reservas públicas/Wompi fuera del alcance funcional normal de G-SAAS-02. Este
corte se justifica únicamente como contención de dos HIGH explotables en código
desplegable. La capacidad permanecerá deshabilitada hasta cumplir todos los
gates de activación de este ADR.

## 1. Evidencia y problema

Baseline Codex Security sobre el worktree limpio de
`origin/main @ 9cdb25f0ad52eb1e3b4a44c6f6e924403a43f3b9`:

- scan: `c2386f94-342c-4d13-83f8-93aa9e48f24c`;
- 2 HIGH: monto Wompi no vinculado y cuenta bancaria global;
- 1 MEDIUM P1-09: abuso del hold público;
- 1 MEDIUM de identidad, fuera de este corte.

El código actual:

1. calcula `35.000 COP/hora` en el navegador;
2. acepta y persiste `montoTotal` desde una petición anónima;
3. abre Wompi sin una firma de integridad generada por servidor;
4. considera que la firma del evento acredita también monto, moneda y
   referencia;
5. crea una venta y consume numeración directamente desde el webhook, por
   fuera de la frontera fiscal canónica;
6. incrementa `cuentas_bancarias/bancolombia` como singleton global;
7. permite cuerpos, strings, bloques, fechas y volumen de holds sin cotas
   suficientes.

La firma del evento autentica el mensaje según el contrato de Wompi, pero no
sustituye la autorización local del importe ni de los efectos. La documentación
vigente de Wompi define `reference`, `amount_in_cents`, `currency` y la firma de
integridad del checkout como datos relacionados, y advierte que las propiedades
firmadas del evento pueden variar:

- https://docs.wompi.co/docs/colombia/widget-checkout-web/
- https://docs.wompi.co/docs/colombia/eventos/
- https://docs.wompi.co/docs/colombia/transacciones/

## 2. Drivers

1. El navegador expresa intención; nunca decide precio, tenant, moneda, estado,
   referencia financiera ni efectos.
2. El precio debe ser tenant-aware, revisable y reproducible históricamente.
3. Un pago solo se aplica si coincide exactamente con una intención inmutable.
4. El tenant procede de autoridades servidor y se revalida en cada frontera.
5. La cuenta se resuelve conforme a ADR-SAAS-019; no se acepta un ID físico.
6. Venta, numeración, inventario y tesorería conservan ADR-SAAS-008/010/015.
7. El hold anónimo debe tener costo y volumen acotados antes de Admin SDK.
8. No se implementa un contador distribuido casero ni un rate limiter en memoria.
9. No hay dual-write, fallback al precio legacy ni activación implícita.
10. Toda recuperación posterior a un pago aprobado debe ser durable e idempotente.

## 3. Alternativas

### A. Validar mejor `montoTotal` pero conservarlo como autoridad cliente

**Rechazada.** Una cota numérica no demuestra qué debía cobrarse. La misma
debilidad reaparece al cambiar precio, sala o duración.

### B. Guardar la tarifa en cada `mesa`

**Rechazada.** `mesa` es layout/operación de salón, no autoridad de política
comercial versionada. Mezclar precio público con geometría y estado de mesa
dificulta revisión y snapshots.

### C. Tarifa tenant en `configuraciones/{empresaId}` e intención inmutable

**Seleccionada.** `configuraciones/{empresaId}` ya es la autoridad tenant-aware,
versionada y backend-only para políticas editables sin contadores. La intención
congela la tarifa efectiva y desacopla el checkout de cambios posteriores.

### D. Mantener la venta y numeración implementadas dentro del webhook

**Rechazada.** Duplica la autoridad de ADR-SAAS-008/010/015, no produce un
snapshot fiscal canónico y convierte un adaptador de proveedor en autoridad de
venta.

### E. Tratar el pago como anticipo no fiscal y facturar después

**No seleccionada.** Requiere aprobar un dominio de anticipos/pasivos,
compensación y aplicación posterior que el repositorio no posee. No se infiere
esa semántica de la implementación legacy.

### F. Pago aprobado como venta fiscal canónica y saga recuperable

**Seleccionada.** La integración reclama el pago de forma durable y delega la
venta a los servicios fiscales/operativos existentes. Las reservas públicas de
pago solo se habilitan para tenants con readiness fiscal completa. Reservas
internas DEMO de ADR-SAAS-033 no cambian.

### G. Rate limiter propio en memoria o Firestore

**Rechazada.** Memoria no coordina instancias. Firestore mantendría el costo y la
contención dentro de la superficie atacada y crearía una persistencia técnica
solo para reconstruir una capacidad disponible en la plataforma de hosting.

### H. Vercel WAF Rate Limiting antes del handler

**Seleccionada.** La aplicación ya se despliega en Vercel. El WAF aplica límites
distribuidos por ruta y claves de origen antes de ejecutar Next/Admin SDK. La
configuración y su precio requieren aprobación operacional independiente:

- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## 4. Decisión propuesta

### 4.1 Autoridad y versión de tarifa

Se extiende el contrato de `configuraciones/{empresaId}` con una sección
opcional y cerrada:

```ts
reservasPublicas?: {
  habilitadas: boolean
  moneda: 'COP'
  tarifaRevision: number
  salas: Record<mesaId, {
    precioBloqueCentavos: number
    productoId: string
    impuestoTipo: 'excluido' | 'inc_8' | 'iva_19'
    bloquesMinimos: number
    bloquesMaximos: number
  }>
}
```

- `precioBloqueCentavos` es entero positivo en centavos COP.
- `tarifaRevision` aumenta mediante el comando canónico de configuración cuando
  cambia una tarifa o su semántica fiscal.
- La configuración conserva además su `revision` general.
- No existe fallback a `PRECIO_POR_HORA`, a un precio del payload ni a `35.000`.
- Ausencia, ambigüedad, moneda distinta de COP, revisión inválida, sala sin
  tarifa o readiness fiscal incompleta deshabilitan el checkout sin escribir.
- La UI obtiene una cotización servidor y usa el monto recibido solo para
  mostrar y abrir el widget; nunca lo devuelve como autoridad.

La intención congela `configuracionRevision`, `tarifaRevision`, sala, bloques,
precio unitario, impuestos, subtotal, total en centavos y moneda. Un cambio de
tarifa no altera intenciones ni ventas previas.

### 4.2 Contrato mínimo del hold

El cliente puede enviar únicamente:

```ts
{
  slug,
  mesaId,
  fechaLocal,
  bloquesSolicitados,
  cliente: { nombre, email, telefono }
}
```

El servidor resuelve por `slug` exactamente una empresa operativa, exige que la
mesa pertenezca a esa empresa, deriva `espacioId`, zona horaria, inicio, fin,
estado, precio, impuestos, referencia, expiración y timestamps.

Límites iniciales propuestos:

- `Content-Type` exacto JSON y cuerpo máximo de 8 KiB, medido aunque falte o
  sea falso `Content-Length`;
- rechazo de campos desconocidos y estructuras adicionales;
- `slug` 1–80, `mesaId` 1–128, nombre 3–120, email 3–254 y teléfono 7–32;
- `fechaLocal` canónica `YYYY-MM-DD`, dentro de 180 días y no en el pasado;
- 1–8 bloques, strings `HH`, únicos, contiguos y dentro de la ventana
  configurada;
- duración e inicio/fin derivados en la zona horaria del tenant;
- payload vacío, arrays duplicados, números no finitos y rangos inconsistentes
  se rechazan antes de abrir una transacción.

Los límites son parte del contrato de seguridad, no valores controlables por el
visitante.

### 4.3 Reserva e intención de pago

La transacción de hold crea conjuntamente:

```text
reservas/{reservaId}
intenciones_pago_reserva/{wompiReference}
agendas/{mesaId}_{fechaLocal}
```

`intenciones_pago_reserva` es backend-only y contiene al menos:

- `empresaId`, `reservaId`, `mesaId`, `espacioId`;
- referencia Wompi aleatoria, única y no reutilizable;
- monto esperado entero en centavos y `COP`;
- snapshots de configuración, tarifa, línea e impuestos;
- estados `CREADA`, `PAGO_RECLAMADO`, `VENTA_PENDIENTE_EFECTOS`,
  `COMPLETADA`, `REQUIERE_REVISION`;
- expiración igual al hold;
- `wompiTransactionId`, huella del evento y referencias de venta/efectos cuando
  existan;
- timestamps de servidor y datos mínimos de auditoría, sin secretos ni datos
  de tarjeta.

La respuesta de servidor entrega `reference`, `currency`, `amountInCents`,
`expirationTime` y `signature.integrity`. La firma de integridad se genera en
servidor con un secreto separado de `WOMPI_EVENTS_SECRET`. El secreto nunca se
expone al navegador ni se persiste.

### 4.4 Validación del webhook

El adaptador Wompi acepta un cuerpo acotado y falla cerrado. Antes de cualquier
efecto exige:

1. evento `transaction.updated` y entorno esperado;
2. estructura y propiedades firmadas acotadas y válidas;
3. checksum del evento en tiempo constante, usando las propiedades dinámicas
   declaradas por Wompi;
4. `transaction.status === 'APPROVED'`;
5. `transaction.currency === 'COP'`;
6. `amount_in_cents` entero positivo e idéntico a la intención;
7. referencia idéntica y resolución directa de una única intención;
8. intención, reserva, mesa, agenda y tenant consistentes;
9. intención vigente o estado de recuperación explícito;
10. transaction ID único y replay de la misma huella idempotente.

Firma válida con monto, moneda, referencia, tenant o estado divergente no
confirma reserva, no crea venta y no toca tesorería. El incidente queda
registrado de forma mínima y backend-only como `REQUIERE_REVISION`; el endpoint
responde de manera que no produzca una tormenta de reintentos del proveedor.

### 4.5 Venta, fiscalidad y recuperación

El webhook deja de escribir directamente `ventas`, `numeraciones`,
`cuentas_bancarias` y `transacciones_financieras`.

Una vez reclamado el pago:

1. un orquestador server-side usa IDs deterministas derivados de la intención;
2. crea la venta mediante la autoridad fiscal de ADR-SAAS-008, usando el
   snapshot de tarifa y la readiness fiscal revalidada;
3. aplica Fase 2 mediante ADR-SAAS-010/015;
4. Fase 2 resuelve transferencia con
   `(empresaId, claveOperativa='bancolombia')` conforme a ADR-SAAS-019;
5. solo tras venta y efectos completos confirma reserva y agenda y lleva la
   intención a `COMPLETADA`.

La venta registra el vínculo `origenReserva`, `pagoReservaIntentId` y
`wompiTransactionId`. El movimiento financiero conserva
`cuentaDocumentoId` y `cuentaClaveSnapshot`; nunca usa un ID global.

Una caída después de reclamar el pago no pierde el hecho externo: la intención
durable permite al reconciliador servidor reanudar exactamente la misma saga.
Un fallo no recuperable queda en `REQUIERE_REVISION` para intervención y, si
corresponde, reembolso manual. Reembolso automático y anticipos permanecen
fuera de este ADR.

### 4.6 Rate limiting y activación

Se propone una regla Vercel WAF para:

```text
POST /api/reservas/hold
fixed window: 5 solicitudes / 10 minutos
keys: IP + JA4 cuando estén disponibles
action: 429
```

La cuota se prueba primero en modo log sobre Preview y se valida contra tráfico
legítimo antes de bloquear. Cambiarla requiere evidencia operacional; no es una
dimensión de plan SaaS ni MT-U10.

Código y configuración tenant permanecen fail-closed mientras no exista
evidencia de que la regla distribuida está aplicada. Este PR no publica ni
modifica una regla de producción. La activación posterior es un paso externo,
auditado y reversible.

## 5. Aislamiento multiempresa

```text
visitante anónimo
  -> slug resuelto por servidor
  -> empresa operativa única
  -> mesa.empresaId == empresa.id
  -> tarifa de configuraciones/{empresaId}
  -> reserva + intención con el mismo empresaId
  -> referencia Wompi opaca
  -> webhook revalida intención/reserva/mesa/agenda/empresa
  -> venta canónica del mismo tenant
  -> cuenta exacta por empresaId + claveOperativa
```

No se acepta `empresaId` del payload. Sustituir slug, mesa, reserva, referencia,
intención o cuenta produce rechazo sin efectos. Admin SDK vuelve a validar todos
los vínculos que Rules no pueden imponer sobre esta ruta pública.

## 6. Rules y persistencia

- `intenciones_pago_reserva` queda `allow read, write: if false` para clientes.
- No se relajan `reservas`, `agendas`, `ventas`, `numeraciones`, cuentas ni
  transacciones.
- La configuración continúa backend-only.
- No hay migración automática ni backfill productivo.
- Reservas legacy sin intención no pueden confirmarse por la ruta nueva.

## 7. Pruebas obligatorias

- monto enviado por cliente ignorado/rechazado;
- moneda, monto, referencia, transaction ID o tenant incorrectos: cero efectos;
- firma de checkout construida desde la intención y firma de evento válida;
- propiedades firmadas variables, ausentes, excesivas o inválidas;
- cuenta ausente, duplicada o de otro tenant;
- cuenta global no modificada para tenant no fundacional;
- identidad lógica y física registrada de forma consistente;
- replay idéntico y conflicto de segundo pago;
- caída y reanudación en cada estado de la saga;
- body > 8 KiB, campos extra, strings largos, payload vacío;
- bloques excesivos, duplicados, no contiguos o fuera de rango;
- fechas inválidas, pasadas o fuera del horizonte;
- solicitudes repetidas alcanzan 429 en Preview con la regla aprobada;
- Rules, Emulator, TypeScript, lint, Functions, build y E2E P1-09.

## 8. Despliegue, rollback y producción

El PR no toca producción. El despliegue futuro debe ordenar:

1. persistencia y servicios backend;
2. configuración/secreto de integridad por entorno;
3. WAF en log y prueba Preview;
4. WAF bloqueante verificado;
5. tarifa tenant explícita y readiness fiscal;
6. activación tenant;
7. smoke de pago controlado y reconciliación.

Rollback deshabilita la capacidad pública; no reabre el writer legacy ni elimina
intenciones, pagos, ventas o movimientos. Los hechos ya confirmados se conservan
y cualquier corrección es compensatoria.

## 9. Riesgos residuales

- Un pago externo puede aprobarse antes de que la saga local termine. La
  intención durable y el reconciliador reducen el riesgo, pero una falla fiscal
  no recuperable requiere intervención/reembolso manual.
- Rate limiting por IP/JA4 reduce abuso automatizado, no prueba identidad humana
  y puede afectar NAT compartido. Se requiere observación previa.
- La activación exige secretos y configuración externa que este PR no modifica.
- Este ADR no certifica obligaciones legales adicionales de Wompi, DIAN,
  retención, reembolsos o tratamiento contable de anticipos.

## 10. Fuera de alcance

- identidad, `usuarios`, FCM y Rules de perfiles;
- `/api/debug-tokens`;
- service accounts y rotación de credenciales;
- B3, eventos, notificaciones, offline o billing SaaS;
- pagos parciales, anticipos, devoluciones o reembolsos automáticos;
- activación comercial o escritura productiva.

## 11. Aprobación y límite operativo

La aprobación explícita del 2026-08-22 confirmó:

1. tarifa versionada dentro de configuración tenant;
2. paid reservations únicamente con readiness fiscal completa;
3. pago aprobado como venta fiscal mediante la saga canónica, no como anticipo;
4. intención y máquina de estados propuestas;
5. Vercel WAF como rate limiter distribuido y su cuota inicial;
6. capacidad deshabilitada hasta completar configuración externa y evidencia.

P1-09 queda `AUTORIZADO PARA IMPLEMENTACIÓN DE SEGURIDAD`. La capacidad sigue
deshabilitada hasta completar secretos, WAF, configuración tenant, pruebas en
Preview y evidencia de activación; esas acciones externas no forman parte de
esta autorización.
