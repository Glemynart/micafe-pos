# G-SAAS-02 / M2 / E2.2 — Gate C: inventario read-only tras integrar el namespace (2026-10-12)

## Dictamen

`NAMESPACE_PREFLIGHT = INCOMPLETO`. PR #574 está integrado en `main` en
`aa0791e9b35948b50579e85a1faa9c072cdbd54c`, y su CI post-merge, run
`38301080437`, terminó `success`. La fuente ya usa los once IDs propios de
Bodega definidos por ADR-SAAS-076, pero el inventario de staging conserva
activos los once IDs anteriores y no muestra ninguno de los nuevos. Esta
lectura no establece el delta exacto de despliegue, el rollback ni el plan de
compatibilidad. No es un `PASS` de Gate C ni autoriza Gate D.

## Alcance e identidad

- Proyecto consultado: `micafe-pos-staging`.
- Consulta: `firebase functions:list --project micafe-pos-staging --json --non-interactive`.
- Firebase CLI local: `15.33.0`.
- Resultado: 44 Functions remotas; 17 etiquetadas `saas-bodega` y 7
  `saas-bodega-operations`; las once IDs anteriores consultadas están
  `ACTIVE`, `us-central1`, `nodejs22`.
- La consulta fue solo lectura. No se ejecutó `firebase deploy`,
  `firebase deploy --dry-run`, ni se modificaron Rules, IAM, Secrets, Functions,
  datos o tenants.

## IDs observados

| Codebase | ID anterior | Estado remoto | ID nuevo ADR-076 | Estado remoto |
|---|---|---|---|---|
| `saas-bodega` | `crearClienteVendedorV1` | `ACTIVE` | `crearClienteVendedorBodegaV1` | ausente |
| `saas-bodega` | `crearPresentacionComercialV1` | `ACTIVE` | `crearPresentacionComercialBodegaV1` | ausente |
| `saas-bodega` | `actualizarPresentacionComercialV1` | `ACTIVE` | `actualizarPresentacionComercialBodegaV1` | ausente |
| `saas-bodega` | `crearArticuloInventarioV1` | `ACTIVE` | `crearArticuloInventarioBodegaV1` | ausente |
| `saas-bodega` | `confirmarVentaBodegaV1` | `ACTIVE` | `confirmarVentaVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `consultarCatalogoPresentacionesVendedorV1` | `ACTIVE` | `consultarCatalogoPresentacionesVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `consultarClientesVendedorV1` | `ACTIVE` | `consultarClientesVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `consultarMisVentasVendedorV1` | `ACTIVE` | `consultarMisVentasVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `actualizarArticuloInventarioV1` | `ACTIVE` | `actualizarArticuloInventarioBodegaV1` | ausente |
| `saas-bodega-operations` | `abrirTurnoOperativoV1` | `ACTIVE` | `abrirTurnoBodegaV1` | ausente |
| `saas-bodega-operations` | `cerrarTurnoOperativoV1` | `ACTIVE` | `cerrarTurnoBodegaV1` | ausente |

## Consecuencia para los gates

- El preflight Gate C del 11-oct corresponde al namespace anterior y no se
  reutiliza como evidencia del candidato actual.
- Gate D para los nombres ADR-076 sigue `PENDING`; no se desplegó nada.
- Gate F/G/H quedan pendientes de repetición una vez que el candidato compatible
  esté desplegado en staging y exista autorización operativa específica.
- Para completar Gate C faltan el artefacto reproducible del candidato, el
  inventario/delta exactos con cero cambios fuera del alcance, estrategia de
  coexistencia y rollback. Si Firebase propone cambios inesperados, el preflight
  debe detenerse.
- Producción y tenant real permanecen sin cambios. ADR-SAAS-076 excluye
  explícitamente cualquier deploy o escritura remota.
