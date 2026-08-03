# ADR-SAAS-019 — Resolución tenant-aware de cuentas financieras

## Estado

**Aceptado**

**Fecha de aceptación:** 2026-08-03

Este ADR documenta la decisión necesaria antes de implementar `P0-05 / E2.2`.
No autoriza código, cambios de Rules, migraciones, despliegues ni escrituras en
producción.

## Goal, Milestone y Epic

- **Goal:** `G-MVP-01` — MVP comercial de Café Atrato
- **Milestone:** `M2` — Núcleo transaccional íntegro
- **Epic:** `E2.2` — Compatibilidad financiera
- **Backlog:** `P0-05`
- **Trabajo paralelo:** puede ejecutarse con Emulator mientras `M1/E1.2`
  espera datos fiscales reales.

## 1. Contexto y problema

El modelo financiero ya define que una cuenta tiene dos identidades distintas:

- `cuentaDocumentoId`: identidad física e inmutable del documento de
  `cuentas_bancarias`;
- `claveOperativa`: identidad lógica estable dentro del tenant.

La empresa fundacional conserva IDs históricos como `caja-principal` y
`caja-fuerte`. Los tenants creados por Bootstrap reciben IDs físicos derivados
de `empresaId`, por ejemplo `identificadorInterno(empresaId,
"cuenta:caja-principal")`. La misma clave lógica debe funcionar en ambos casos
sin copiar, renombrar ni migrar cuentas.

La implementación actual es inconsistente:

- `aplicarEfectosVentaOperativaV1` ya usa `resolverCuentaOperativa`;
- `cerrarTurnoOperativoV1` ya usa `cuentaReservada`;
- `registrarMovimientoFinancieroV1`, `registrarEgresoOperativoV1` y
  `trasladarEntreCuentasV1` todavía reciben un ID físico desde el payload;
- `guardarEgreso` envía literalmente `caja-principal`;
- algunas rutas cliente históricas conservan IDs físicos aunque sus escrituras
  ya no sean la autoridad vigente.

En un tenant no fundacional, esta divergencia puede producir errores de cuenta,
mantener una dependencia accidental de IDs históricos y permitir que el payload
del cliente elija el documento físico que se usa en una operación financiera.
También contradice el diseño R1-B, que permanece marcado como diseño
propuesto y exige que la Callable derive la cuenta a partir de la clave lógica,
del tenant autenticado y de la identidad canónica de la Empresa.

## 2. Drivers de la decisión

1. La autoridad de cuenta, tenant, saldo y efecto financiero debe permanecer en
   Functions/Admin SDK.
2. El cliente puede seleccionar una cuenta visible, pero no puede convertir su
   ID físico en autoridad financiera.
3. Deben preservarse los IDs históricos y los snapshots de movimientos ya
   confirmados.
4. No se debe crear una segunda cuenta, renombrar una cuenta existente ni hacer
   dual-write.
5. La resolución debe ocurrir dentro de la misma transacción que valida fondos,
   escribe el ledger y actualiza el saldo.
6. La solución debe funcionar para la Empresa fundacional y para cualquier
   tenant nuevo.
7. No se deben modificar Firestore Rules, Bootstrap ni la autoridad de ventas
   server-side.
8. El cambio debe poder validarse íntegramente con Emulator, sin datos de
   Café Atrato y sin escrituras productivas.

## 3. Alternativas consideradas

### A. Mantener IDs físicos y añadir aliases por tenant

**Rechazada.** Obliga a conservar una tabla de aliases o a replicar nombres
legacy. Mantiene el ID físico en el payload como parte de la autoridad,
complica el aislamiento y permite que nuevos consumidores vuelvan a depender de
IDs globales.

### B. Migrar o renombrar todas las cuentas existentes

**Rechazada.** Rompe referencias históricas de movimientos, snapshots y
reconciliaciones; requiere escrituras productivas, preflight de datos y un
rollback de alta complejidad. Además contradice la decisión R1-B de preservar
la identidad física ya existente.

### C. Resolver la clave lógica en el servidor y conservar la identidad física

**Recomendada.** El comando recibe una clave lógica. La Callable obtiene el
`empresaId` del contexto autenticado, lee `empresas/{empresaId}` dentro de la
transacción y deriva el único ID físico válido:

- Empresa fundacional: la clave reservada se resuelve al ID legacy homónimo;
- tenant no fundacional: la clave reservada se resuelve al ID derivado del
  tenant;
- cuenta no reservada: se busca exactamente una cuenta con el par
  `(empresaId, claveOperativa)`.

Después se verifica que el documento resuelto tenga el mismo `id`,
`empresaId`, `claveOperativa` y un saldo válido. El ledger conserva el
`cuentaDocumentoId` y `cuentaClaveSnapshot` resultantes; ninguna operación
reescribe la identidad histórica.

## 4. Decisión propuesta

Se adopta la alternativa C.

Las operaciones financieras nuevas utilizarán claves lógicas en sus contratos:

```ts
// Movimiento o egreso
payload: {
  cuentaClaveOperativa: "caja-principal",
  monto,
  tipo,
  categoria,
  turnoId,
}

// Traslado
payload: {
  cuentaOrigenClaveOperativa: "caja-principal",
  cuentaDestinoClaveOperativa: "caja-fuerte",
  monto,
  turnoId,
}
```

La función resolverá la cuenta física dentro de la transacción. Los IDs
físicos no serán aceptados como sustituto silencioso de la clave lógica.

### Compatibilidad de callable

El PR de implementación deberá conservar una transición explícita y auditable
para evitar que un cliente antiguo opere con una identidad física:

1. publicar el contrato lógico en las callables consumidoras;
2. migrar los clientes vigentes para enviar claves lógicas;
3. rechazar de forma determinista un payload que solo contenga `cuentaId`, con
   un error de contrato (`CUENTA_CLAVE_REQUERIDA`), sin escribir nada;
4. retirar la ruta de compatibilidad física únicamente cuando no existan
   consumidores del contrato antiguo.

No se acepta un fallback que convierta un ID físico enviado por el cliente en
una cuenta lógica ni un alias global que oculte la divergencia.

## 5. Invariantes

- `empresaId` siempre procede de la sesión/contexto server-side.
- Una clave lógica debe resolver exactamente a una cuenta del tenant.
- Las `claveOperativa` reservadas forman parte del contrato canónico del dominio; una cuenta definida por un tenant no puede reutilizarlas ni sobrescribirlas.
- La resolución nunca depende del nombre visible de la cuenta; se basa únicamente en `empresaId` y `claveOperativa`.
- Una cuenta resuelta debe pertenecer al tenant y coincidir con su identidad
  física canónica.
- Una cuenta reservada nunca se resuelve por búsqueda global de su ID legacy.
- Un ID físico de otro tenant, una cuenta duplicada o una cuenta ausente abortan
  la transacción con `CUENTA_INVALIDA`.
- El ledger, los saldos, los egresos y los traslados conservan idempotencia,
  auditoría y atomicidad existentes.
- Los movimientos históricos no se reescriben y conservan sus snapshots.
- No se crean cuentas desde el cliente ni desde este PR.
- No se modifican Rules, Bootstrap, planes, suscripciones ni fiscalidad.

## 6. Alcance del PR derivado

### Incluido

- extraer o reutilizar un resolvedor único de cuentas operativas;
- adaptar los comandos de movimiento, egreso y traslado al contrato lógico;
- adaptar sus consumidores cliente activos;
- eliminar la dependencia activa de `caja-principal`/`bancolombia` como IDs
  físicos;
- probar la Empresa fundacional y al menos dos tenants no fundacionales;
- probar cuenta ausente, cuenta duplicada, ID físico ajeno, replay e
  idempotencia;
- demostrar que el ledger registra la identidad física resuelta sin cambiar
  documentos preexistentes.

### Fuera de alcance

- cobros, crédito, anulaciones o devoluciones como rediseño funcional;
- certificación integral de turnos (`P0-06`);
- creación o migración de cuentas en producción;
- cambios en Firestore Rules o Bootstrap;
- cambios en `cuentas_cobro`;
- notificaciones FCM;
- datos fiscales o escrituras sobre Café Atrato.

## 7. Validación y evidencia requerida

- pruebas unitarias del resolvedor para fundacional, tenant nuevo y cuentas no
  reservadas;
- pruebas de callables con transacción y replay;
- prueba de aislamiento entre dos tenants con claves lógicas iguales;
- rechazo de payload físico sin escritura parcial;
- comprobación de snapshots históricos intactos;
- `npx tsc --noEmit`, `npm run build`, `npm run build:functions`;
- suite financiera afectada y `npm run test:rules:raw` para demostrar que no se
  relajaron Rules;
- E2E local de movimiento y traslado con un tenant no fundacional.

## 8. Rollback

El rollback del PR es revertir el contrato lógico y el resolvedor en código;
no requiere revertir datos porque el PR no migra ni reescribe cuentas o
movimientos. Cualquier dato nuevo creado por pruebas vive únicamente en el
Emulator. Si un contrato antiguo es detectado después del despliegue, la
Callable debe rechazarlo sin mutación y registrar el error técnico, no volver a
usar un ID histórico como fallback.

## 9. Consecuencias

### Positivas

- Un mismo contrato funciona para la Empresa fundacional y para cualquier
  tenant nuevo.
- Los IDs históricos continúan siendo válidos como evidencia persistida.
- La autoridad de resolución queda en el servidor y es verificable dentro de la
  transacción.
- Se reduce el riesgo de que nuevas superficies reintroduzcan dependencias
  mono-tenant.

### Negativas

- Cambia el contrato de los comandos financieros y requiere coordinar Functions
  y clientes.
- Durante la transición, clientes antiguos deben recibir un error explícito o
  actualizarse conjuntamente.
- Las cuentas no reservadas requieren `claveOperativa` única e inmutable y una
  consulta tenant-aware con su índice correspondiente si Firestore lo exige.

## 10. Relación con decisiones existentes

- Complementa ADR-SAAS-001 (aislamiento por Empresa).
- Mantiene la autoridad definida por ADR-SAAS-015 para operaciones críticas de
  ventas.
- Implementa la identidad de cuenta descrita en R1-B, sin tratar su diseño
  propuesto como autorización implícita para código.
- No modifica ADR-SAAS-016 sobre ventas DEMO ni ADR-SAAS-018 sobre eventos
  operativos confiables.

## 11. Decisión

La alternativa C y las invariantes descritas quedan aceptadas. La
implementación queda limitada al PR P0-05 y a los límites declarados en este
documento.
