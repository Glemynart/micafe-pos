# ADR-SAAS-076 — Namespace completo de callables Bodega

## Estado

**ACEPTADO — Opción 1, 2026-10-12.**

- **Fecha de propuesta y aceptación:** 2026-10-12.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial`.
- **Decisor:** responsable del producto. **Recomendación técnica:** Lead Engineer.
- **Supersede:** ADR-SAAS-074 únicamente en el inventario de IDs afectados y su alcance de migración. Conserva la decisión de no cambiar `saas-auth` y renombrar los exports Bodega.
- **Evidencia de aceptación:** [aceptación de ampliación ADR-SAAS-076](docs/goals/evidence/G-SAAS-02-E2-2-ADR-SAAS-076-ACCEPTANCE-2026-10-12.md).
- **Límite:** autoriza preparar la PR de implementación de código/cliente. No autoriza deploy, Rules, IAM, Secrets, cambios de Functions remotas, datos, tenant real ni producción.

## Contexto y problema

ADR-SAAS-074 aceptó renombrar cuatro IDs Bodega que la revalidación read-only de producción había observado activos en `saas-auth` dentro de `micafe-pos/us-central1`. Antes de implementar, la prueba de discovery propuesta inspeccionó los manifiestos de los tres codebases que pueden publicarse en esa región: `saas-auth`, `saas-bodega` y `saas-bodega-operations`.

La prueba falló con **11 IDs duplicados en los manifiestos fuente**: los cuatro ya observados activos en producción y siete adicionales. La evidencia de producción solo confirma cuatro Functions activas; la duplicación de los otros siete en fuente no demuestra que estén desplegados actualmente. Sin embargo, dejar esos siete exports con nombres repetidos permitiría que una publicación futura de Bodega colisionara con la Function del otro codebase.

Firebase no incluye `codebase` en la identidad remota de una Function. La unicidad se evalúa por proyecto, región e ID, sin distinguir mayúsculas. Por ello, el límite verificable para publicar los codebases es que el conjunto completo de sus manifiestos no contenga IDs repetidos.

## Impulsores de decisión

- Evitar reemplazar o eliminar Functions legacy que sirven otros verticales.
- Hacer publicables los manifiestos completos de Bodega sin colisiones latentes.
- Conservar región, contratos de dominio, autoridad, idempotencia y efectos transaccionales existentes.
- Adaptar las rutas de cliente de Bodega manteniendo los IDs legacy para `GENERAL` y otros verticales.
- Mantener el trabajo en staging/código local hasta completar gates y obtener autorización operativa de deploy.

## Opciones consideradas

### Opción 1 — Renombrar los once exports Bodega duplicados (aceptada)

Asignar un ID Bodega inequívoco a cada uno de los 11 endpoints; preservar los exports de `saas-auth` y sus consumidores.

**Ventajas:** los tres codebases quedan libres de IDs repetidos en todos sus exports actuales; la CI puede prevenir futuras colisiones; `saas-auth` conserva nombres y comportamiento.

**Costes:** amplía el alcance de implementación y pruebas respecto de ADR-SAAS-074; los clientes Bodega deben usar los 11 nuevos IDs antes del deploy correspondiente.

### Opción 2 — Renombrar solo los cuatro IDs activos observados

Mantener los otros siete nombres repetidos porque no se observaron activos en la lectura de producción.

**Ventajas:** menor cambio inmediato.

**Costes:** la discovery de los codebases seguiría detectando colisiones; no se podría afirmar unicidad para un despliegue completo ni evitar un conflicto futuro. Rechazada.

### Opción 3 — Cambiar `saas-auth` o desplegar en otra región

Transferir los nombres desde `saas-auth` o trasladar los exports Bodega fuera de `us-central1`.

**Ventajas:** se podrían conservar algunos IDs actuales de Bodega.

**Costes:** cambia la frontera compartida o la topología aceptada, amplía compatibilidad/rollback y no forma parte de la autorización. Rechazada.

## Decisión

Se acepta la **Opción 1**. Los siguientes nombres se asignan a los exports Bodega:

| ID Bodega anterior | ID Bodega nuevo | Codebase Bodega | Evidencia del ID anterior |
|---|---|---|---|
| `crearClienteVendedorV1` | `crearClienteVendedorBodegaV1` | `saas-bodega` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `crearPresentacionComercialV1` | `crearPresentacionComercialBodegaV1` | `saas-bodega` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `actualizarPresentacionComercialV1` | `actualizarPresentacionComercialBodegaV1` | `saas-bodega` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `crearArticuloInventarioV1` | `crearArticuloInventarioBodegaV1` | `saas-bodega` | Function activa de `saas-auth` observada en producción |
| `confirmarVentaBodegaV1` | `confirmarVentaVendedorBodegaV1` | `saas-bodega` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `consultarCatalogoPresentacionesVendedorV1` | `consultarCatalogoPresentacionesVendedorBodegaV1` | `saas-bodega-operations` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `consultarClientesVendedorV1` | `consultarClientesVendedorBodegaV1` | `saas-bodega-operations` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `consultarMisVentasVendedorV1` | `consultarMisVentasVendedorBodegaV1` | `saas-bodega-operations` | Duplicado en manifiestos fuente; estado activo en producción no confirmado |
| `actualizarArticuloInventarioV1` | `actualizarArticuloInventarioBodegaV1` | `saas-bodega-operations` | Function activa de `saas-auth` observada en producción |
| `abrirTurnoOperativoV1` | `abrirTurnoBodegaV1` | `saas-bodega-operations` | Function activa de `saas-auth` observada en producción |
| `cerrarTurnoOperativoV1` | `cerrarTurnoBodegaV1` | `saas-bodega-operations` | Function activa de `saas-auth` observada en producción |

Los wrappers continúan delegando a las mismas operaciones de dominio. No cambian nombres de comandos internos, recibos, reglas de autoridad, inventario, turnos, ledger, auditoría ni semántica de reintento. El cliente Bodega resuelve estos IDs por `BODEGA_MVP1`; para `GENERAL` y un vertical no resuelto mantiene los IDs existentes. Los exports y el comportamiento de `saas-auth` permanecen intactos.

## Consecuencias y límites

- ADR-SAAS-074 documenta la decisión inicial para cuatro conflictos activos; este ADR amplía de forma aceptada el inventario de implementación a los once conflictos de manifiesto.
- El alcance requiere discovery conjunto de los tres codebases y pruebas de enrutamiento cliente para los once nombres.
- Cambiar el código local no modifica Functions ya desplegadas. El orden de publicación compatible, rollback y gates deben quedar validados por Gate C antes de cualquier deploy.
- Se repetirán los gates C/D/F/G/H afectados antes de reabrir Gate I.
- La aceptación no autoriza un deploy, escrituras remotas ni creación del tenant real.

## Validación de implementación

1. Hacer fallar discovery si se repite un ID normalizado por minúsculas y región entre `saas-auth`, `saas-bodega` y `saas-bodega-operations`.
2. Verificar que los once IDs legacy continúen presentes en `saas-auth`.
3. Verificar que `BODEGA_MVP1` resuelva a los once IDs nuevos y los demás verticales conserven los nombres legacy.
4. Pasar TypeScript, build y suites relevantes de cliente y de ambos codebases Bodega.
5. Documentar compatibilidad/rollback en Gate C y detenerse si el preflight encuentra cualquier delta fuera del alcance autorizado.

## Referencias

- [ADR-SAAS-074 — namespace de cuatro callables inicialmente observadas](ADR-SAAS-074-namespace-produccion-callables-bodega.md).
- [Revalidación read-only de Gate I en producción](docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-PRODUCTION-READONLY-REVALIDATION-380928-2026-10-12.md).
- [Firebase: ubicaciones de Cloud Functions](https://firebase.google.com/docs/functions/locations).
- [Firebase: organizar Functions en codebases](https://firebase.google.com/docs/functions/organize-functions?gen=2nd).
