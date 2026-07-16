# ADR-SAAS-004 — Modelo empresarial: empresa, espacio, configuración y fiscalidad

## Estado

Aceptado. Deriva del documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
(§4, §5, §8, §9). Extiende `ADR-TRIB-001` (modelo tributario V1) en lo referente a
numeración fiscal.

## Contexto

El POS actual asume una sola empresa: la configuración es un singleton global
(`configuracion/general`) que además mezcla el contador fiscal (`consecutivo_actual`)
con parámetros estáticos y una única resolución DIAN. La entidad `Espacio` ya existe y
funciona como "venue". Para el SaaS se necesita definir con precisión qué es una
empresa, qué es un espacio, dónde vive la configuración, cómo se modela la fiscalidad
con múltiples resoluciones, y qué datos pertenecen a cada plano.

## Problema

Sin un modelo empresarial explícito no queda claro qué pertenece a la plataforma, a la
empresa o al espacio; la configuración global no puede servir a N empresas; y asumir un
único consecutivo por empresa sería un defecto fiscal, porque una empresa puede tener
varias resoluciones DIAN simultáneas (por establecimiento, punto de venta, o POS vs.
factura electrónica), cada una con su propio rango y consecutivo.

## Decisión

### Entidades

- **Empresa (Tenant)** — unidad de aislamiento. Propietaria de todos los datos
  operativos vía `empresaId` (ADR-SAAS-001). Campos: `id`, `nombre`, `estado` (ciclo de
  vida, ADR-SAAS-003), `paisFiscal`, `ownerUid`, `creadaEn`.
- **Espacio/Sucursal** — la entidad `Espacio` existente, ahora con `empresaId`.
  Representa el establecimiento/sucursal dentro de la empresa. Conserva su jerarquía
  actual `Espacio → Categoría / Mesa / Producto`.
- **Membresia** — puente `Usuario × Empresa` con `(rol, permisos)` (ADR-SAAS-002).

### Configuración

- La configuración pasa de singleton global a **colección dedicada por empresa**:
  `configuraciones/{empresaId}` (un documento por empresa).
- **El contador fiscal sale de la configuración**: los consecutivos viven en
  `numeraciones/` (ver abajo), nunca en el documento de configuración.
- La configuración se lee al iniciar sesión y se **snapshotea** en la venta/ticket; no
  se consulta en caliente para hechos históricos (consistente con `ADR-TRIB-001` y
  `ADR-MOD-001`).
- Contiene: datos fiscales de identidad (régimen, NIT, rótulo), moneda e impuestos
  parametrizables, branding/mensaje de ticket, preferencias de impresión, KDS, POS
  (`modulos_habilitados` deja de ser global) y preferencias generales.

### Resoluciones y numeración fiscal

- La **numeración fiscal es una entidad de primera clase**:
  `numeraciones/{empresaId}_{numeracionId}`, no un campo de configuración.
- Cada numeración tiene, conceptualmente: `empresaId`, `sucursalId?`, `tipo`
  (`pos | electronica | contingencia`), `prefijo`, `resolucionDian`, `rangoInicio`,
  `rangoFin`, `vigenciaDesde`, `vigenciaHasta`, `consecutivoActual` (contador propio e
  independiente) y `activa`.
- Una empresa tiene **N numeraciones**; el consecutivo es **por numeración, nunca por
  empresa**. Al cobrar, la venta selecciona la numeración aplicable por
  `(sucursal, tipo)` y el incremento es **atómico por documento de numeración** (aísla
  la contención entre sucursales/resoluciones).
- El número final, prefijo y resolución se **congelan en la venta** (snapshot); la
  reimpresión no vuelve a consultar la numeración.

### Pertenencia de datos y aislamiento (qué pertenece a cada plano)

- **Plataforma (global, sin `empresaId`):** `planes`, `saas_operadores`,
  `saas_auditoria`, y la identidad global `usuarios`. Solo accesible con claim de
  operador de plataforma; nunca vía membresía de restaurante.
- **Empresa (con `empresaId`):** `empresas`, `membresias`, `suscripciones`,
  `invitaciones`, `configuraciones`, `numeraciones`, y todas las colecciones operativas
  del POS (ventas, pedidos, reservas, inventario, etc.). Aisladas por ADR-SAAS-001.
- **Espacio (subconjunto dentro de la empresa):** los datos ligados a `espacioId`
  (categorías, mesas, productos, y numeraciones a nivel sucursal) pertenecen a la
  empresa pero se particionan además por espacio. El espacio **no** es una frontera de
  seguridad independiente: la frontera de aislamiento es la empresa; el espacio es una
  partición interna.

## Consecuencias

- La configuración global desaparece; cada empresa tiene la suya, aislada.
- Se elimina la contención actual del contador (hoy cada venta escribe el mismo
  documento que la configuración), al mover los consecutivos a `numeraciones/` con
  incremento por documento.
- El modelo soporta empresas con varias sucursales y varias resoluciones DIAN
  simultáneas sin defecto fiscal.
- Queda inequívoco qué pertenece a plataforma, empresa y espacio, y qué es y qué no es
  frontera de seguridad.
- Externalizar moneda/impuestos habilita expansión multi-país sin bloquear Colombia.

## Alternativas consideradas

- **Mantener `configuracion/general` global.** Rechazada: un solo documento no puede
  servir a N empresas sin fugas ni contención.
- **Embeber la configuración dentro de `empresas/{empresaId}`.** Rechazada: infla el
  documento del tenant (que se lee para resolver acceso) y mezcla identidad con
  preferencias.
- **Dejar el contador dentro del documento de configuración.** Rechazada: genera
  contención (cada venta lo escribe) y no soporta múltiples resoluciones.
- **Un único consecutivo por empresa.** Rechazada: defecto fiscal frente a empresas con
  varias resoluciones DIAN.
- **Tratar el espacio como frontera de seguridad.** Rechazada: la frontera es la
  empresa; el espacio es partición interna. Elevarlo complicaría claims y rules sin
  beneficio de aislamiento.

## Relación con otros ADR

- **ADR-SAAS-001** define el aislamiento por `empresaId` que este ADR asume para todas
  las colecciones de empresa.
- **ADR-SAAS-002** define `Membresia` y la identidad que da acceso a la empresa.
- **ADR-SAAS-003** define el ciclo de vida de la `Empresa` y su suscripción.
- **ADR-TRIB-001** (modelo tributario V1) es extendido por la sección de numeración
  fiscal: se conserva su filosofía de snapshot tributario por línea y se añade la
  numeración por empresa/sucursal/resolución.
- **ADR-MOD-001** comparte la filosofía de snapshot que aquí se aplica a configuración y
  numeración.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§4, §5, §8, §9).
