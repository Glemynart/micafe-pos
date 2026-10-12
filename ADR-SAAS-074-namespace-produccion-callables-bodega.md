# ADR-SAAS-074 — Namespaces de callables Bodega en producción

## Estado

**PROPUESTO — pendiente de aprobación explícita.**

- **Fecha de propuesta:** 2026-10-12.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial`.
- **Decisor:** responsable del producto. **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-049, ADR-SAAS-054, ADR-SAAS-071 y ADR-SAAS-072.
- **Límite:** esta propuesta no autoriza cambios de código, cliente, deploy,
  Rules, IAM, Secrets, Functions, datos ni producción.

## Contexto y problema

La frontera Bodega ya está certificada en staging, pero producción sigue
sirviendo 80 Functions del codebase `saas-auth`. La revalidación read-only de
`main @ 380928b` encontró cuatro IDs de Function ya activos en
`micafe-pos/us-central1` que también exportan los codebases Bodega: tres de
`saas-bodega-operations` y uno de `saas-bodega`. Los cuatro remotos están
etiquetados `saas-auth`.

Firebase exige nombres de Functions únicos, sin distinguir mayúsculas, dentro
del mismo proyecto y región; `codebase` organiza el despliegue pero no forma
parte del nombre remoto. Por tanto, publicar sin cambios los codebases Bodega
en el proyecto productivo puede intentar reasignar o reemplazar IDs que hoy
pertenecen a `saas-auth`. Eso contradice el límite vigente de preservar ese
codebase y no permite demostrar un corte seguro. [Firebase: regiones y
nombres](https://firebase.google.com/docs/functions/locations), [Firebase:
organizar Functions en codebases](https://firebase.google.com/docs/functions/organize-functions?gen=2nd).

| Codebase Bodega | ID exportado | Function activa en producción | Codebase remoto |
|---|---|---|---|
| `saas-bodega` | `crearArticuloInventarioV1` | `crearArticuloInventarioV1` (`us-central1`) | `saas-auth` |
| `saas-bodega-operations` | `abrirTurnoOperativoV1` | `abrirTurnoOperativoV1` (`us-central1`) | `saas-auth` |
| `saas-bodega-operations` | `actualizarArticuloInventarioV1` | `actualizarArticuloInventarioV1` (`us-central1`) | `saas-auth` |
| `saas-bodega-operations` | `cerrarTurnoOperativoV1` | `cerrarTurnoOperativoV1` (`us-central1`) | `saas-auth` |

La evidencia y comandos read-only están en
[`Gate I — revalidación de producción en 380928b`](docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-PRODUCTION-READONLY-REVALIDATION-380928-2026-10-12.md).

## Impulsores de decisión

- Evitar reemplazar o eliminar Functions legacy usadas por otros verticales.
- Publicar Bodega en producción sin ampliar `saas-auth` ni duplicar nombres.
- Mantener `us-central1`, los contratos de dominio, autoridad, idempotencia,
  inventario, turnos y auditoría aprobados.
- Hacer explícitos los cambios de cliente y repetir las certificaciones
  afectadas antes de Gate I.

## Opciones consideradas

### Opción 1 — IDs públicos únicos para los endpoints Bodega en conflicto (recomendada)

Renombrar solo los cuatro endpoints exportados por los codebases Bodega; sus
wrappers continúan llamando las mismas operaciones de dominio. Mantener intactos
los endpoints y el comportamiento de `saas-auth`.

IDs propuestos para la implementación:

| ID actual Bodega | ID Bodega propuesto | Codebase |
|---|---|---|
| `crearArticuloInventarioV1` | `crearArticuloInventarioBodegaV1` | `saas-bodega` |
| `abrirTurnoOperativoV1` | `abrirTurnoBodegaV1` | `saas-bodega-operations` |
| `actualizarArticuloInventarioV1` | `actualizarArticuloInventarioBodegaV1` | `saas-bodega-operations` |
| `cerrarTurnoOperativoV1` | `cerrarTurnoBodegaV1` | `saas-bodega-operations` |

**Ventajas:** evita las colisiones sin tocar Functions legacy, deja una
propiedad de endpoints inequívoca y conserva la región aceptada.

**Costes:** cambia los IDs públicos Bodega; requiere adaptar el dispatcher
tenant-aware del cliente, compatibilidad de reintentos y discovery/tests de
ambos codebases. Deben repetirse Gate C/D/F/G/H en staging antes de producción.

### Opción 2 — Reasignar los cuatro IDs existentes desde `saas-auth`

Retirar o cambiar los exports coincidentes de `saas-auth` y transferir esos IDs
a los codebases Bodega.

**Ventajas:** conserva los IDs que el cliente ya conoce.

**Costes:** cambia el comportamiento/topología de `saas-auth`; exige inventariar
y migrar todo consumidor de otros verticales, planear un deploy del codebase
compartido y establecer rollback. Contradice las restricciones actuales de
ADR-SAAS-071/072 y no está autorizado por ellas.

### Opción 3 — Desplegar Bodega en otra región

Mantener los IDs, pero publicar las Functions Bodega en una región distinta a
`us-central1`, con el cliente configurado para esa región.

**Ventajas:** los nombres pueden coexistir entre regiones según Firebase.

**Costes:** supersede la región aceptada para Bodega, cambia el cliente y la
topología operativa, y exige volver a certificar rutas, latencia, logging,
monitorización y rollback para esa región.

## Decisión propuesta

Se recomienda la **Opción 1**. Solo cambian los IDs Firebase de los cuatro
wrappers Bodega que colisionan; el wrapper mantiene la misma llamada al núcleo
transaccional existente, sin alterar nombres de comandos internos, receipts,
reglas de autoridad, señales, ledger, auditoría ni semántica de reintento. Los
otros endpoints Bodega sin colisión y todos los verticales no Bodega conservan
sus IDs.

El cliente Bodega seleccionará los nuevos endpoints mediante una ruta
tenant-aware. Las pantallas compartidas y `saas-auth` deben conservar los IDs
actuales para los demás verticales. La implementación debe demostrar el
comportamiento de una sesión/callable antigua y una nueva, y documentar el
orden compatible de despliegue y rollback en Gate C antes de cualquier deploy.

## Consecuencias y límites

- La aceptación de este ADR no autoriza implementación ni despliegue.
- La aceptación no cierra el riesgo separado de `registrarCompraOperativaV1`:
  su ruta legacy sigue activa en producción y ADR-SAAS-072 exige demostrar que
  no puede procesar compras Bodega o aprobar una decisión que resuelva esa
  autoridad antes del corte de Rules.
- No se modifica ni se despliega `saas-auth` por esta decisión.
- Gate I permanece bloqueado hasta que estén resueltas las colisiones, la
  identidad del artefacto Vercel, la divergencia de Rules, el smoke sintético,
  el restore independiente y las demás condiciones de release.
- El tenant real, oferta/Trial y catálogo permanecen sin crear en producción.

## Migración, validación y rollback propuestos

Tras aprobación explícita, una PR de implementación debe:

1. cambiar los cuatro exports Bodega y actualizar el dispatcher compatible;
2. conservar los IDs canónicos internos de comando e idempotencia;
3. añadir tests de discovery que fallen ante cualquier ID repetido entre
   `saas-auth`, `saas-bodega` y `saas-bodega-operations`;
4. probar aislamiento, permisos, reintento/replay y operaciones afectadas en
   Emulator;
5. pasar TypeScript, build web y Functions, y las suites Bodega de venta,
   inventario, turnos y compras;
6. ejecutar Gate C con el artifact, IDs, código fuente, revisiones y delta
   exactos por proyecto; luego solicitar el Gate D de staging según el proceso
   vigente;
7. repetir F/G/H en staging y actualizar la matriz de certificación antes de
   reabrir Gate I.

Rollback de código: volver al dispatcher/cliente previamente certificado y
republicar la revisión Bodega compatible mediante un Gate C/D aprobado. No se
revierten ventas, inventario, ledger, turnos ni auditoría con un rollback de
código. La ruta concreta de rollback debe validarse con versiones reales antes
de un deploy; no se presume que exista una revisión productiva Bodega previa.

## Decisión solicitada

El responsable indicó el 2026-10-12 que se propongan nombres Bodega únicos.
Esto define la recomendación del ADR, pero **no constituye aceptación** de la
Opción 1 ni autorización de implementación. Aceptar o rechazar explícitamente
la Opción 1 antes de implementar. Si se elige otra opción, actualizar el plan y
los ADR que queden supersedidos antes de modificar código.
