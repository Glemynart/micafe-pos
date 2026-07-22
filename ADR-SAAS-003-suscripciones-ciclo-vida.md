# ADR-SAAS-003 — Suscripciones y ciclo de vida de la empresa

## Estado

Aceptado. Deriva del documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
(§10 y §11). ADR-SAAS-009 supersede únicamente la política abierta de `Suspendida`
y el uso de claims como enforcement suficiente; la separación entre empresa y
suscripción definida aquí permanece vigente.

## Contexto

Convertir el producto en SaaS comercial requiere modelar la relación económica con
cada empresa (suscripción) y el ciclo de vida de sus datos y su acceso. Estos dos
aspectos están relacionados pero **no son lo mismo**: el cobro describe la relación
comercial; el ciclo de vida describe qué ocurre con los datos y el acceso. La
monetización concreta (qué se cobra) es una decisión de producto que aún no debe
congelarse.

## Problema

Sin un modelo explícito, el sistema no sabe qué hacer cuando una empresa está en
prueba, deja de pagar, se cancela o debe archivarse/eliminarse. Además, congelar
prematuramente un modelo de cobro (por usuarios, sucursales, ventas, almacenamiento…)
limitaría el producto. Se necesita dejar la **arquitectura preparada** sin decidir la
dimensión de monetización ni integrar pasarelas.

## Decisión

### Estados de empresa (ciclo de vida de datos y acceso)

`Trial → Activa → Suspendida → Cancelada → Archivada → Eliminada`, con reactivaciones
desde `Suspendida`/`Cancelada` (dentro de gracia) y desde `Archivada` bajo intervención
del plano de plataforma.

Comportamiento esperado por estado (resumen; la matriz completa vive en el documento
maestro §10.2):

- **Trial** — acceso completo con límite temporal; datos vivos; convertible a Activa.
- **Activa** — operación normal.
- **Suspendida** — acceso bloqueado o solo-lectura (política de producto pendiente,
  §16 del maestro); datos intactos; reversible.
- **Cancelada** — operación detenida; solo gestión mínima (export); datos conservados
  durante periodo de gracia; reversible dentro de la gracia.
- **Archivada** — sin acceso interactivo; datos en frío; recursos activos liberados
  (índices, suscripciones realtime); reversible con intervención.
- **Eliminada** — purga definitiva tras retención legal; irreversible; solo la ejecuta
  el plano de plataforma, nunca el tenant.

**Invariante:** ningún estado borra datos salvo `Eliminada`. Los demás cambian el
**acceso** y el **consumo de recursos**, no la existencia de los datos.

### Estados de suscripción (relación comercial)

`trialing → active → past_due → suspended → canceled`, más cambio de plan
(`active ⇄ active`). Estos estados pueden **disparar** transiciones del ciclo de vida
de la empresa, pero **no lo sustituyen**: la empresa es la autoridad sobre su ciclo de
datos; la suscripción describe el cobro.

### Comportamiento esperado del sistema

- El estado de suscripción se refleja en `suscripciones/{empresaId}` (1:1 con empresa)
  y se proyecta al claim del token para permitir enforcement por rules (ADR-SAAS-001).
- El enforcement de límites, cuando existan, se aplica en **tres puntos** (defensa en
  profundidad): UI (ocultar), servicio (rechazar), rules (denegar la escritura que
  exceda). Si el plan no define una dimensión, no hay enforcement para ella.
- La renovación y el cobro se dirigen por **webhook** de una pasarela futura, tras un
  **puerto abstracto** (`PaymentProvider`) para no acoplarse a ningún proveedor. El
  webhook solo transiciona el estado de la suscripción, de forma **idempotente** (mismo
  patrón ya probado con Wompi en reservas).

### Responsabilidades futuras de billing (sin congelar monetización)

- **Planes** (`planes/{planId}`, globales) describen la oferta mediante un **mapa
  abierto de dimensiones** (`capacidades`/`limites`) extensible. V1 puede tener **cero
  límites forzados**.
- **Ninguna dimensión de cobro se congela** en este ADR: usuarios, sucursales, ventas
  y almacenamiento se mencionan solo como ejemplos de forma, no como decisión. Añadir o
  retirar una dimensión no cambia la arquitectura.
- **Medición de consumo** (`consumo/{empresaId}_{periodo}`) queda disponible como
  **capacidad** para una futura facturación por uso o detección de abuso; tenerla no
  implica adoptar cobro por uso.
- **No se integra pasarela de pago** en el alcance de este ADR.

## Consecuencias

- El sistema tiene una máquina de estados clara para acceso y datos, y otra para el
  cobro, sin confundirlas.
- Se puede lanzar comercialmente con planes sin límites y endurecer después sin
  reescribir la arquitectura.
- La eliminación de datos queda acotada a un único estado terminal, respetando la
  retención legal (fiscal/contable) y dejando solo el registro mínimo de
  auditoría/facturación que la ley exija.
- Persiste una decisión de producto pendiente: comportamiento exacto de `Suspendida`
  (solo-lectura vs bloqueo total) y la dimensión de monetización.

## Alternativas consideradas

- **Una sola máquina de estados (mezclar billing y ciclo de datos).** Rechazada:
  acopla el cobro con la retención de datos y produce estados ambiguos (p. ej. una
  empresa "cancelada" que aún debe conservar sus ventas por ley).
- **Congelar ya un modelo de cobro (por usuario/sucursal/venta).** Rechazada: limita el
  producto y contradice el requisito de mantener la monetización flexible.
- **Integrar una pasarela concreta ahora.** Rechazada: se prefiere el puerto abstracto
  `PaymentProvider` para no acoplarse.

## Relación con otros ADR

- **ADR-SAAS-001** provee claims y rules para el enforcement de estados y límites.
- **ADR-SAAS-004** define la entidad `Empresa` sobre la que operan estos estados y la
  separación de planos que autoriza quién puede archivar/eliminar.
- **ADR-SAAS-002** provee la identidad usada para el acceso según estado.
- **ADR-SAAS-009** fija la política de suspensión y el enforcement canónico del
  lifecycle, supersediendo parcialmente los puntos indicados en el estado de este ADR.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§10, §11).
