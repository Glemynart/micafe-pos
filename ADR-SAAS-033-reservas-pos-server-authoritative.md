# ADR-SAAS-033 — Reservas internas del POS bajo autoridad de servidor

## Estado

**Aceptado.** Esta decisión queda autorizada por la continuidad autónoma de
G-SAAS-02 para cerrar una mutación crítica observada en el POS del primer
cliente. El alcance es únicamente la operación interna de reservas y agenda;
no adopta Wompi SaaS ni amplía el alcance de reservas públicas.

- **Goal:** `G-SAAS-02`
- **Milestone / Epic:** `M3 / E3.1-E3.2`
- **Tenant de referencia:** Café Atrato (`1ae0rD9H8t3ZFSBKrrHR`)
- **Relacionado con:** `ADR-SAAS-023`, `ADR-SAAS-030`, `ADR-SAAS-032`

## Contexto

La auditoría del código vigente encontró que la creación pública de reservas,
la disponibilidad y el hold ya pasan por rutas server-side, pero el POS
autenticado todavía podía escribir directamente `reservas` y `agendas` al
cancelar o completar una reserva. La carrera existente también podía crear la
venta antes de serializar el cambio de la reserva.

Esto deja fuera de la frontera server-authoritative una capacidad incluida en
el Plan del tenant y permite que el navegador proponga estado, agenda o datos
de cobro. Las Rules actuales permiten esas mutaciones autenticadas, por lo que
endurecer únicamente las Rules rompería el flujo sin resolver la autoridad de
negocio.

## Decisión

1. `cancelarReservaOperativaV1` será la única autoridad para cancelar una
   reserva interna y liberar los bloques que pertenezcan a ella.
2. `completarReservaOperativaV1` será la única autoridad para completar una
   reserva interna y confirmar sus bloques.
3. El cliente enviará únicamente la intención (`reservaId`, turno y medio de
   pago). El servidor resolverá tenant, actor, rol, reserva, importe, sala,
   bloques, estado y agenda.
4. Una reserva pendiente se cobra como venta DEMO durante el Trial. El
   servidor crea una venta determinista `reserva_{reservaId}` y ejecuta la
   saga existente de venta y efectos operativos. El cobro y el completado son
   reintentables; un lock de operación evita que una cancelación compita con
   una venta en curso.
5. La finalización de una reserva ya pagada no crea otra venta: valida el
   estado de pago y solo materializa el estado de reserva y la agenda.
6. Las Rules dejan `reservas` y `agendas` en lectura para clientes autorizados,
   pero niegan create/update/delete del cliente. Las rutas públicas y el
   webhook continúan usando Admin SDK en backend.
7. Todas las operaciones usan envelope, huella, auditoría e idempotencia. No
   se reescriben reservas históricas ni se cambia el modelo de reservas
   públicas.

## Alternativas

### A. Endurecer únicamente las Rules

Rechazada. No crea una autoridad de negocio, no resuelve el cobro pendiente y
dejaría el cliente sin una ruta funcional para completar o cancelar.

### B. Mantener escrituras desde el cliente con validaciones adicionales

Rechazada. El navegador seguiría siendo autoridad para estado, agenda y
coordinación de venta, conservando carreras y spoofing de campos.

### C. Functions con saga idempotente — elegida

Mantiene el flujo POS, concentra las decisiones críticas en el servidor,
permite reintentos después de una caída entre cobro y completado y conserva
aislamiento tenant-aware. La operación de cobro DEMO se limita al Trial; una
integración fiscal específica no se inventa ni se habilita por este ADR.

## Persistencia y rollback

La operación en curso se registra en una colección técnica interna con la
clave tenant-aware de la reserva, su comando y estado. La venta DEMO usa un
ID determinista. Si una ejecución falla después de crear la venta, el mismo
comando puede reintentarse y continúa desde la venta idempotente hasta el
completado. Si el PR debe revertirse, se revierte el código y se conserva la
información histórica; no se borran reservas, ventas, agenda ni ledger.

No se ejecutan escrituras productivas como parte de la implementación ni del
merge de este ADR. El deploy y la verificación productiva se documentan en el
release de G-SAAS-02.

## Fuera de alcance

- reservas públicas, disponibilidad pública y cancelación pública;
- Wompi SaaS o cambios al webhook de pagos;
- MT-U10, MT-U11, sedes, notificaciones, offline, overages o billing SaaS;
- fiscalidad real o emisión DIAN para el cobro interno de reservas;
- backfill o reescritura de documentos históricos.

## Criterios de aceptación

- el navegador no puede escribir directamente `reservas` ni `agendas`;
- cancelar y completar usan Functions, tenant y autoridad revalidados en la
  transacción;
- el cobro DEMO pendiente es determinista, idempotente y recuperable;
- el completado ya pagado no duplica ventas;
- Rules, Functions, cliente y documentación quedan alineados;
- la auditoría limitada del PR concluye `APROBADO PARA MERGE` y CI queda verde.
