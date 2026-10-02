# G-SAAS-02 / M2 / E2.2 — staging de superficies operativas Bodega

## Alcance

Esta evidencia reconcilia el estado remoto después de la implementación de
ADR-SAAS-054. Registra únicamente los preflight/deploy dirigidos y el estado
de validación funcional; no declara Gate F, rehearsal, certificación,
producción ni aceptación operativa como completados.

## Procedencia local y Git

- Implementación: `8e49dd1b1dce43783f2bf5787235995c7cd892ff`.
- PR técnico: `#415`.
- Merge en `main`: `8710b04400ed58973ccbc33b268f20dc0eeede3f`.
- Corrección UI del vendedor Bodega: PR `#416`, merge
  `e3b414dc61f111dbc585c8fa7e73f8fd303a165f`.
- CI post-merge de #415: `37066206636` PASS.
- CI post-merge de #416: `37072427708` PASS.

## Proyecto y superficie

- Proyecto: `micafe-pos-staging`.
- Región: `us-central1`.
- Runtime: Node.js 22 / Gen 2.
- Tráfico: 100 % en la revisión más reciente de cada Function.
- Producción: 0.

### `saas-operational-onboarding`

| Callable | Revisión | Hash | Cloud Build | Secret |
| --- | --- | --- | --- | --- |
| `crearIncorporacionDirecta` | `crearincorporaciondirecta-00001-jac` | `2e3f0fd8f8828409f1908f25b64b8dd452bce51c` | `779ac849-1e57-4e2b-ba27-30a2c20f03c1` | `OPERATIONAL_PIN_PEPPER` |

### `saas-bodega-operations`

Las seis Functions comparten hash `1cb4b5476b2edb5eb976f6bff0fa6b38c4b44d21`,
Cloud Build `94f34ec4-c3e1-467e-992a-138de5f684d5` y cero Secrets.

| Callable | Revisión |
| --- | --- |
| `consultarCatalogoPresentacionesVendedorV1` | `consultarcatalogopresentacionesvendedorv1-00001-yax` |
| `consultarClientesVendedorV1` | `consultarclientesvendedorv1-00001-peg` |
| `consultarMisVentasVendedorV1` | `consultarmisventasvendedorv1-00001-buk` |
| `actualizarArticuloInventarioV1` | `actualizararticuloinventariov1-00001-niy` |
| `abrirTurnoOperativoV1` | `abrirturnooperativov1-00001-noy` |
| `cerrarTurnoOperativoV1` | `cerrarturnooperativov1-00001-bef` |

## Reconciliación de `saas-bodega`

La callable de categorías de ADR-SAAS-052 también está activa en staging:

- revisión: `crearcategoriabodegav1-00001-zin`;
- hash: `41b7db7415558b023086b660d8a07f2681b8d94e`;
- Cloud Build: `d3e01185-c265-47a1-b70e-00033762ae57`;
- cero Secrets;
- estado `ACTIVE`.

El resto de la superficie `saas-bodega` quedó activo en el deploy de
2026-09-30 con hash `6626f37e101c206c5377eef232f71015e5c52459`, cero Secrets,
y revisiones `crearclientevendedorv1-00001-cad`,
`crearpresentacioncomercialv1-00001-nek`,
`actualizarpresentacioncomercialv1-00001-qir`,
`creararticuloinventariov1-00001-bix` y
`confirmarventabodega-00001-diw`.

## Validación funcional

La corrección de PR #416 permite que un vendedor Bodega entre al POS sin
consultar la callable legacy `obtenerEstadoOnboarding`, que no pertenece a la
superficie operativa desplegada. La entrada al POS y la carga del catálogo se
observaron en el preview actualizado.

La validación completa permanece **PENDIENTE**: la sesión administrativa
utilizada durante el ensayo correspondía a
`adr046-functional-staging-20260925`, no al fixture retenido
`E2_2-BODEGA-STAGING-FIXTURE`. Por tanto, no se declara evidencia válida de
venta, turno, inventario, ledger, aislamiento o auditoría para E2.2.

Durante ese ensayo incidental se crearon únicamente datos sintéticos en el
fixture ADR-046 (categoría, producto, presentación y cliente) y se abrió un
turno; no hubo venta ni acceso a producción. No existe un mecanismo canónico
seguro de cleanup destructivo disponible, por lo que no se ejecutó ningún
borrado manual. Este incidente queda separado del fixture Bodega y no se
considera evidencia de Gate F.

## Mutation audit

- Functions staging: 7 creadas/actualizadas por el deploy autorizado de
  ADR-SAAS-054; ninguna adicional durante la validación UI.
- Firestore/Auth del fixture correcto: 0 cambios durante el ensayo.
- Firestore incidental fuera de alcance: datos sintéticos y un turno en el
  fixture ADR-046, documentados arriba.
- Rules/IAM/Secrets/Storage/Hosting: 0 cambios intencionales.
- Producción: 0.
- Bootstrap adicional: 0.
- Activation adicional: 0.
- Fixture adicional: 0.

## Siguiente gate

Autenticar el Backoffice con autoridad de plataforma, seleccionar únicamente
`E2_2-BODEGA-STAGING-FIXTURE` y repetir Gate F completo: vendedor, catálogo,
cliente, apertura/cierre de turno, venta de contado y transferencia,
inventario, ledger, auditoría, idempotencia, negativos y aislamiento.
