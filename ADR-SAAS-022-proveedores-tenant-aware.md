# ADR-SAAS-022 — Proveedores tenant-aware para el MVP comercial

## Estado

**Aceptado**

**Fecha:** 2026-08-04
**Decision makers:** Lead Engineer; propietario del Goal
**Fecha de aceptación:** 2026-08-04

Este ADR autoriza el PR de implementación derivado dentro del alcance
declarado. No autoriza migraciones, despliegues ni escrituras en producción.
Los cambios de Firestore Rules solo podrán incluirse en el PR de
implementación si son estrictamente necesarios para el aislamiento definido y
quedan cubiertos por sus pruebas.

## Goal, Milestone y Epic

- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial reusable.
- **Milestone:** `M2` — Núcleo transaccional íntegro.
- **Epic:** `E2.5` — Compras e inventario operativos.
- **Siguiente trabajo relacionado:** `P1-03` — certificación reusable de compras, proveedores y costos.
- **Dependencias:** `P0-12` y `P1-01`, ambos integrados en `main`.

## 1. Contexto y problema

El MVP comercial incluye el módulo operativo de Proveedores. Sin embargo, el
repositorio no contiene hoy un catálogo de proveedores reusable para el SaaS:

- `registrarCompraOperativaV1` recibe actualmente el proveedor como texto y
  conserva un snapshot dentro de la compra.
- El componente `components/pos/proveedores.tsx` depende de
  `window.api.proveedores`, una implementación histórica de Electron/SQLite;
  no está conectado al flujo PWA multi-tenant.
- No existe un servicio PWA ni una colección Firestore `proveedores` con
  aislamiento por `empresaId`.
- La compra ya tiene una autoridad server-side y snapshots históricos. Esos
  snapshots no pueden depender de que el proveedor siga activo o de que su
  información cambie posteriormente.
- `ADR-SAAS-021` excluyó expresamente crear Proveedores como agregado de
  dominio. Esa exclusión fue correcta para el corte de `P0-12`, pero deja
  ambiguo el alcance de `P1-03` si “proveedores” significa el módulo reusable
  del MVP y no solamente el texto almacenado en una compra.

Sin esta decisión, hay dos riesgos opuestos: declarar certificado un módulo
que solo funciona en Electron, o crear una colección y una identidad de
proveedor sin definir sus límites de tenant, autoridad y compatibilidad con
los snapshots de compras.

## 2. Drivers de la decisión

1. Proveedores debe ser una capacidad genérica del SaaS, no una adaptación de
   Café Atrato.
2. Ningún proveedor de un tenant puede ser visible, modificable ni resoluble
   desde otro tenant.
3. La compra debe seguir siendo gobernada exclusivamente por
   `registrarCompraOperativaV1`.
4. Cambiar o desactivar un proveedor no puede alterar compras históricas ni
   sus efectos de inventario o finanzas.
5. La solución debe permitir operar sin NIT, DIAN, crédito o cartera.
6. Debe poder probarse completamente en Emulator, sin producción ni datos del
   cliente.
7. No se debe crear una migración automática desde SQLite/Electron ni un
   dual-write entre el catálogo histórico y el SaaS.
8. El alcance debe seguir siendo el mínimo que acerque el producto al MVP
   comercial.

## 3. Alternativas consideradas

### A. Mantener únicamente el proveedor como texto en la compra

**Ventajas:** no cambia el modelo persistente ni requiere Rules nuevas; es
compatible con `registrarCompraOperativaV1` y permite certificar la operación
de compra con snapshots.

**Desventajas:** no entrega un módulo reusable de Proveedores; no evita
duplicados de nombres, no permite administrar proveedores antes de comprar y
mantiene la dependencia conceptual de un campo libre.

**Resultado:** suficiente para certificar solo compras, pero insuficiente si
Proveedores permanece dentro del MVP comercial. Se conserva como compatibilidad
para compras históricas y para el caso de operación sin catálogo, no como la
estrategia final del módulo.

### B. Catálogo tenant-scoped mínimo, integrado con la compra

Cada tenant dispone de un catálogo de proveedores con identidad estable. La
intención de una compra puede incluir `proveedorId`; el servidor valida que el
documento pertenece a la empresa de la sesión y materializa en la compra un
snapshot completo de los datos comerciales usados en ese momento.

**Ventajas:** reutilizable para cualquier tenant, separa identidad viva de
evidencia histórica, permite desactivar sin borrar historia y mantiene la
autoridad de compra en el backend.

**Desventajas:** requiere definir persistencia, reglas de aislamiento, UI PWA,
servicio de catálogo y pruebas adicionales. Las compras existentes no deben
ser migradas para introducir artificialmente un `proveedorId`.

**Resultado:** recomendada.

### C. Agregado server-authoritative completo con crédito, cartera y
unicidad fiscal

Además del catálogo, introduciría comandos específicos, estados de crédito,
condiciones de pago, validación de NIT y proyecciones de cuentas por pagar.

**Ventajas:** podría soportar una solución empresarial más amplia.

**Desventajas:** amplía el dominio, agrega decisiones de fiscalidad y cartera,
crea dependencias con funcionalidades fuera del MVP y no es necesaria para
registrar compras operativas.

**Resultado:** rechazada para este Goal; queda fuera de alcance.

## 4. Decisión propuesta

Adoptar la alternativa B: un catálogo mínimo de proveedores aislado por
tenant, integrado de forma no destructiva con `registrarCompraOperativaV1`.

La aceptación de este ADR autorizaría únicamente la implementación de un PR
derivado. No modifica retroactivamente `P0-12`, no reabre la autoridad cliente
y no autoriza producción.

### 4.1 Modelo mínimo

El futuro documento tenant-scoped `proveedores/{proveedorId}` tendrá como
mínimo:

```ts
{
  empresaId,
  nombre,
  nit?: string,
  telefono?: string,
  correo?: string,
  direccion?: string,
  estado: "ACTIVO" | "INACTIVO",
  creadoEn,
  actualizadoEn
}
```

Los campos de contacto son datos comerciales opcionales. `nit`, cuando exista,
se trata como dato de referencia y no como validación DIAN ni como autoridad
fiscal. No se introduce una regla de unicidad obligatoria basada en NIT en este
corte.

La identidad del proveedor dentro del SaaS es `proveedorId` junto con
`empresaId`; nunca el nombre visible. El nombre puede cambiar sin cambiar la
identidad histórica del documento. El estado persistido será el enum
`ACTIVO`/`INACTIVO`, evitando que una futura ampliación tenga que reinterpretar
un booleano.

### 4.2 Autoridad y acceso

- Las operaciones de crear, editar y desactivar deben quedar limitadas al
  rol administrativo definido por la matriz de permisos existente.
- El alcance de lectura y escritura debe estar condicionado al tenant de la
  sesión; ningún `empresaId` enviado por el cliente será autoridad.
- La implementación deberá elegir, y documentar en su PR, si el CRUD de
  metadatos usa Rules tenant-aware o comandos backend. Esa elección no puede
  convertir al catálogo en autoridad de compra ni eludir la matriz de
  permisos. Si introduce una nueva frontera de autoridad, deberá presentar un
  ADR derivado antes de codificar.
- La desactivación será lógica y cambiará `estado` a `INACTIVO`.
- Un proveedor solo podrá desactivarse si no existen operaciones abiertas que
  dependan de él. En el alcance actual, las compras confirmadas son hechos
  históricos cerrados y no bloquean la desactivación; crédito, cuentas por
  pagar y otros estados abiertos de ERP están fuera del MVP.
- Las compras históricas nunca impedirán la desactivación y nunca se
  modificarán como consecuencia de ella.

### 4.3 Integración con la compra

`registrarCompraOperativaV1` seguirá siendo la única autoridad sobre compra,
inventario y efecto financiero.

Para nuevas compras soportadas por el catálogo:

1. el cliente envía la intención con `proveedorId` y, solo si el contrato lo
   requiere para compatibilidad, el texto visible;
2. el servidor resuelve el proveedor dentro de `empresaId` y valida que esté
   activo;
3. el servidor copia al documento de compra el snapshot comercial del
   proveedor usado en la confirmación;
4. la compra, inventario, costo, efecto financiero, auditoría e idempotencia
   conservan la transacción definida en `ADR-SAAS-021`.

El texto libre se conserva para compras históricas y para compatibilidad
controlada mientras se completa el corte del catálogo. No se debe ejecutar una
migración automática ni asignar IDs ficticios a compras existentes. El PR de
implementación deberá precisar el criterio de retiro del fallback antes de
convertirlo en obligatorio.

### 4.4 Snapshots y costo

- Una compra conserva proveedor, artículos, cantidades, costos y unidades como
  evidencia histórica independiente del catálogo actual.
- Editar o desactivar un proveedor nunca actualiza compras previas.
- El costo derivado del artículo solo se modifica dentro de la transacción que
  confirma la compra, conforme a `ADR-SAAS-021`; una falla de compra no puede
  dejar un costo actualizado.
- Este ADR no autoriza ni resuelve la política de edición manual del campo
  `costo` del catálogo. Si esa política contradice la invariante de costo
  derivado, deberá abrirse un ADR separado antes de modificarla.

## 5. Invariantes

- Todo proveedor persistido pertenece a exactamente un `empresaId`.
- Una lectura, creación, edición o desactivación no puede cruzar tenants.
- La resolución de un proveedor usa `empresaId + proveedorId`, nunca solo el
  nombre visible.
- El proveedor de la compra se resuelve y valida en servidor.
- Los snapshots de la compra no son referencias vivas al catálogo.
- Cambiar el nombre o contacto de un proveedor no modifica compras históricas.
- Desactivar un proveedor no borra ni altera compras históricas.
- Un proveedor solo puede pasar de `ACTIVO` a `INACTIVO` cuando no existen
  operaciones abiertas que dependan de él; las compras históricas no cuentan
  como operaciones abiertas.
- El CRUD de proveedores no produce efectos de inventario, finanzas o
  fiscalidad.
- `registrarCompraOperativaV1` sigue siendo la única autoridad para confirmar
  compra, inventario, costo y efecto financiero.
- Los reintentos de compra conservan la idempotencia, auditoría y atomicidad
  de `ADR-SAAS-021`.
- No se crean datos ficticios, migraciones automáticas, dual-write ni
  escrituras en producción.

## 6. Alcance del PR derivado, si se acepta

### Incluido

- contrato mínimo y persistencia tenant-aware del catálogo;
- servicio y UI PWA para listar, crear, editar y desactivar proveedores;
- integración de `proveedorId` con `registrarCompraOperativaV1`;
- snapshots de proveedor en compras nuevas;
- pruebas de Rules o callable, permisos, aislamiento entre dos tenants,
  desactivación y preservación histórica;
- compatibilidad explícita con compras históricas y el fallback aprobado;
- evidencia Emulator y validación de CI.

### Fuera de alcance

- crédito, cuentas por pagar, financiación, cuotas, intereses o cobranza;
- pagos parciales o estados de cuenta;
- validación DIAN, factura electrónica o efectos fiscales;
- unicidad fiscal obligatoria por NIT;
- importación o migración desde SQLite/Electron;
- modificación de compras históricas;
- anulación o reversión de compras;
- cambios en Bootstrap, planes, suscripciones o datos de Café Atrato;
- impresión, hardware, reservas, notificaciones y funcionalidades posteriores;
- escrituras en producción.

## 7. Compatibilidad, migración y rollback

- Las compras existentes conservan su estructura y snapshots actuales.
- No habrá dual-write entre Electron/SQLite y Firestore.
- La activación del catálogo debe poder revertirse dejando disponible la
  captura compatible de proveedor sin alterar compras ya confirmadas, siempre
  que el contrato de compra mantenga esa compatibilidad.
- Un proveedor `INACTIVO` no se elimina ni cambia como efecto colateral de una
  compra; la reactivación, si se expone, será una operación administrativa
  explícita.
- El rollback de la UI no restaura una autoridad cliente sobre inventario,
  costos o finanzas; la confirmación sigue pasando por la callable.

## 8. Validación requerida después de la aceptación

- `npx tsc --noEmit`;
- `npm run build`;
- `npm run build:functions`;
- suites de Rules y autenticación aplicables;
- Emulator con al menos dos tenants y proveedores homónimos;
- rechazo de lecturas y escrituras cruzadas entre tenants;
- permisos de administración y rechazo de roles no autorizados;
- compra con proveedor activo y snapshot completo;
- rechazo de proveedor inexistente, ajeno o desactivado;
- cambio posterior del proveedor sin mutar la compra histórica;
- replay y conflicto de idempotencia de la compra;
- fallo de la transacción sin cambios parciales de inventario, costo o finanzas;
- evidencia de que no se escribe en producción.

## 9. Consecuencias

### Positivas

- Proveedores se convierte en una capacidad reusable para múltiples tenants.
- La identidad viva del proveedor queda separada de la evidencia histórica de
  compras.
- El catálogo no introduce crédito, fiscalidad ni cartera empresarial.
- La autoridad financiera y de inventario de `ADR-SAAS-021` permanece intacta.

### Negativas

- El alcance de `P1-03` debe dividirse entre catálogo y certificación de
  compras/costos si el equipo quiere entregas más pequeñas.
- Se requiere una nueva superficie de aislamiento y pruebas.
- El componente Electron existente no puede reutilizarse como servicio PWA sin
  adaptar su persistencia y contrato.

## 10. Decisión registrada

La alternativa B y sus límites quedan aceptados:

1. catálogo mínimo tenant-aware de proveedores;
2. identidad por `empresaId + proveedorId`;
3. snapshots inmutables en la compra;
4. integración exclusiva mediante `registrarCompraOperativaV1`;
5. compatibilidad controlada con compras históricas y proveedor textual;
6. estado persistido como enum `ACTIVO`/`INACTIVO`;
7. desactivación condicionada a la ausencia de operaciones abiertas, sin que
   compras históricas bloqueen o sean modificadas;
8. exclusión de crédito, cartera, fiscalidad, migraciones y producción.
