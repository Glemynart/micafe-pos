# ADR-SAAS-028 — Contrato comercial anual y snapshot contractual de MT-U9

## Estado

**Aceptado técnicamente.** La autorización autónoma del Product Owner registrada
en el contrato de ejecución del 2026-08-12 habilita este diseño para MT-U9.
La implementación sigue limitada a las decisiones de producto aprobadas y a
los gates de validación, Rules, CI y merge protegido.

- **Goal:** `G-SAAS-01` — Plataforma SaaS comercial operable
- **Milestone:** `MT-U9` — Contrato y operación comercial inicial
- **Epic:** `E9.1` — Contrato comercial y snapshot
- **Decisión de producto:** `G-SAAS-01-PRODUCT-DECISION-RESOLUTION.md`
- **Oferta anual:** `1.800.000 COP / año` (`ANUAL`)
- **ADRs preservados:** `ADR-SAAS-003`, `ADR-SAAS-009`, `ADR-SAAS-011`, `ADR-SAAS-012`

## Contexto

`origin/main` ya contiene la autoridad server-side de Planes, Suscripciones,
operadores y auditoría, pero el contrato actual solo guarda `planId` y
`planVersion` en la Suscripción. El Plan `mvp_comercial` materializado es
mensual y la Suscripción puede cambiar de referencia sin conservar una copia
comercial autosuficiente. Ese modelo no demuestra el contrato anual aprobado ni
protege la evidencia histórica frente a cambios posteriores del catálogo.

La decisión de producto también exige Trial de 30 días sin gracia, confirmación
manual de pago anual, reactivación calculada server-side y cancelación al final
del periodo. Estas reglas deben ser compatibles con la separación entre
`Empresa.estado` y `Suscripcion.estado` de ADR-SAAS-003/009.

## Decisión propuesta

### 1. Versiones del Plan

- Se conserva sin mutación la versión mensual histórica de
  `mvp_comercial`.
- La oferta aprobada se materializa como una nueva versión del mismo Plan con
  `periodicidad: ANUAL`, sin crear una Sede técnica ni activar límites
  cuantitativos.
- La nueva versión debe contener precio y moneda como datos obligatorios del
  catálogo: `precio.importe: 1800000` y `precio.moneda: "COP"`. La confirmación
  de pago no recibe ni puede sustituir estos valores.
- La lista de capacidades debe coincidir exactamente con el catálogo aprobado:
  `sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`, `waste`,
  `shifts`, `cuentas_cobro`.
- `limites` permanece vacío en MT-U9. Una Sede conceptual se representa dentro
  del contrato comercial como descriptor, no como documento, claim, espacio,
  cuota o permiso operativo.

### 2. Snapshot contractual

Toda Suscripción creada o activada bajo el contrato MT-U9 debe guardar un
`snapshotContrato` completo e inmutable. El snapshot incluye, como mínimo:

```text
{
  schemaVersion,
  planId,
  planVersion,
  codigoPlan,
  periodicidad: "ANUAL",
  precio: { importe, moneda },
  capacidades,
  limites: {},
  sedeConceptual: { cantidad: 1 },
  fiscalidad: null | descriptor aprobado,
  vigencia: { inicio, fin }
}
```

La Suscripción puede conservar campos de consulta derivados, pero ninguna
operación posterior puede reescribir el snapshot. En la primera materialización
del contrato, `vigencia` representa el intervalo contractual que originó la
Suscripción: el intervalo de Trial para una Suscripción `trialing` y el periodo
pagado para una Suscripción creada directamente `active`. La confirmación de
pago escribe el periodo vigente en los campos de lifecycle y conserva intacto
el snapshot de la oferta/Trial; cada recibo anual queda como evidencia append-
only enlazada al comando. Un cambio de Plan crea una nueva relación contractual
según las reglas aprobadas; no muta la evidencia de una relación ya confirmada.
Las Suscripciones históricas de la versión mensual no se migran
automáticamente ni se rellenan por inferencia.

### 3. Trial

- El Trial nuevo usa exactamente 30 días calculados con reloj server-side; el
  bootstrap de MT-U9 no admite otro valor.
- Las fechas contractuales usan intervalo semiabierto `[inicio, fin)`: la fecha
  `fin` ya no es un día de acceso. Al alcanzar `fin` sin pago confirmado, el
  backend suspende de forma idempotente la Suscripción y solicita la transición
  de la Empresa a `suspendida` mediante el servicio canónico de lifecycle.
- No se crea ni se evalúa `past_due`/`graceFin` para el contrato anual de MT-U9.
- La comprobación de vencimiento debe existir tanto en un proceso programado
  como en los comandos protegidos que encuentren un Trial vencido, para evitar
  depender de la puntualidad del job sin abrir una vía de acceso.

### 4. Pago manual y reactivación

Se añadirá un comando de plataforma específico para confirmar un pago anual
manual. El comando debe:

- exigir la facultad `COMERCIAL_GOBERNAR` y revalidar el operador en backend;
- recibir solo evidencia mínima de confirmación, nunca datos sensibles de pago;
- resolver el snapshot y el estado actual desde Firestore, no desde el payload;
- calcular `periodoInicio` y `periodoFin` con reloj server-side y la
  periodicidad anual del snapshot;
- actualizar Suscripción, Empresa cuando corresponda, recibo/idempotencia y
  auditoría en el contrato existente, sin escribir rutas paralelas;
- ser idempotente y rechazar conflictos de revisión o de evidencia.

La confirmación manual no es una integración de pagos. El precio, moneda y
referencia externa deben coincidir con el snapshot, pero la evidencia no
autoriza por sí misma una mutación tenant ni sustituye `Empresa.estado`.

### 5. Cancelación y conservación

La cancelación durante una vigencia pagada solo registra una fecha de
finalización contractual y conserva el acceso hasta ella. Al alcanzar la fecha,
el servicio autorizado cierra el periodo y aplica únicamente las transiciones
comerciales/lifecycle definidas; no archiva ni elimina datos automáticamente.
Exportación, archivado y eliminación quedan fuera de MT-U9 y requieren políticas
y autorizaciones posteriores.

### 6. Compatibilidad histórica

El esquema admite leer Suscripciones históricas mensuales sin reescribirlas.
Las nuevas reglas ANUAL se aplican por versión/contrato, de modo que la
introducción del snapshot no inventa precio, moneda o fechas para registros
anteriores. Cualquier migración de históricos necesitaría un ADR y una decisión
explícita separada.

## Alternativas consideradas

1. **Mutar la Suscripción para apuntar al Plan vigente.** Rechazada: destruye la
   evidencia contractual histórica.
2. **Crear un documento global de contratos separado y dejar la Suscripción
   mutable.** Rechazada: duplica la autoridad y permite divergencia entre la
   relación comercial y su evidencia.
3. **Usar solo claims o la UI para Trial/pago.** Rechazada: no protege sesiones
   antiguas ni comandos server-side.
4. **Mantener gracia `past_due` para ANUAL.** Rechazada por la decisión de
   producto; el periodo sin pago termina en suspensión.
5. **Archivar/eliminar automáticamente al cancelar o vencer.** Rechazada: está
   explícitamente fuera de MT-U9.

## Consecuencias

Positivas:

- la oferta anual es versionada sin alterar la mensual histórica;
- cada contrato nuevo puede auditarse sin consultar el catálogo vigente;
- Trial, pago manual, reactivación y cancelación conservan autoridad server-side;
- no se crea una Sede técnica ni se anticipan límites o billing automático.

Costes y gates:

- se requiere ampliar el modelo de Plan/Suscripción y sus pruebas;
- se requiere un comando y un proceso de vencimiento idempotentes;
- la implementación debe actualizar Panel, queries, auditoría, Rules y
  compatibilidad sin mutar históricos.

## Rollback

Antes de publicar la versión ANUAL se valida el contrato en Emulator y se
conserva la versión mensual. Si el nuevo código falla, se deshabilita la
selección de la versión ANUAL y se mantienen lectores compatibles con los
documentos históricos; no se revierte ni se edita un snapshot ya confirmado.
Después de activar Rules o comandos nuevos, el rollback solo puede usar una
versión server-side compatible, nunca reabrir escrituras directas del cliente.

## Criterios de aceptación del ADR

- precio `1800000` y moneda `COP` son obligatorios en la versión ANUAL;
- el snapshot contiene todos los campos aprobados y se rechaza cualquier
  actualización posterior;
- la versión mensual histórica permanece intacta y no se migra automáticamente;
- Trial de 30 días usa reloj server-side, intervalo `[inicio, fin)`, suspensión
  idempotente y cero gracia para ANUAL;
- pago manual exige operador autorizado, evidencia mínima y periodo calculado
  server-side;
- cancelación conserva acceso hasta el fin contractual y no archiva/elimina;
- no se introducen Wompi billing, Sede técnica, MT-U10, MT-U11, cuotas,
  overages, referidos, offline ni notificaciones.

## Gate

ADR aceptado. Autoriza implementar el siguiente paso mínimo aprobado: contrato
anual, snapshot, Trial fijo de 30 días, confirmación manual, vencimiento,
cancelación de fin de periodo y sus validaciones. No autoriza ningún elemento
del apartado fuera de alcance.
