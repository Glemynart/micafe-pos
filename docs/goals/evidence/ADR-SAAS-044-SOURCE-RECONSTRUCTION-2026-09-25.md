# ADR-SAAS-044 — reconstrucción de fuente de `saas-bootstrap`

## Estado de procedencia

- **Historical provenance:** NOT RECOVERABLE.
- **Current reconstructed source:** RECOVERED FROM EXACT DEPLOYED ARTIFACT.

Esta nota no atribuye históricamente el despliegue al commit
`358824ca08c1d452b0800429b1482a2adf3eb2ab`. Ese commit fue únicamente el
HEAD de un worktree Preview cuyo contenido no versionado se comparó contra el
artefacto.

## Artefacto remoto recuperado

| Campo | Valor |
| --- | --- |
| Proyecto | `micafe-pos-staging` |
| Function | `solicitarBootstrapEmpresarialSaas` |
| Codebase remoto | `saas-bootstrap` |
| Revisión Cloud Run | `solicitarbootstrapempresarialsaas-00002-fig` |
| Build | `75506163-1c64-42d8-8c98-785659ea8598` |
| Bucket | `gcf-v2-sources-192423427245-us-central1` |
| Objeto | `solicitarBootstrapEmpresarialSaas/function-source.zip` |
| Generación | `1790018997887812` |
| SHA-256 local del ZIP | `7B5C08AA057AB03A0BDD6664E9EA55842BCE62AB823A5D0BED9A3E096DAA40C1` |
| Digest de imagen | `sha256:1a700d2eb9de1e55645ad517396fa000d2d6ac1857c4fd5f3f99fa963242d8ee` |

Cloud Build conservó el ZIP, pero no un repositorio, ref ni SHA Git. Por ello
la procedencia histórica del commit no puede recuperarse desde la metadata
remota.

## Base de la reconstrucción

El ZIP exacto contiene 85 archivos relevantes. Se comparó contra el candidato
no versionado del worktree Preview y los 85 de 85 archivos, incluidos package,
lockfile, entrypoint, pruebas, boundary y salida compilada, coincidieron por
SHA-256.

La fuente versionada actual reproduce el source del codebase y el cutover
estructural requerido por ADR-SAAS-044:

- `functions-bootstrap/` declara solo
  `solicitarBootstrapEmpresarialSaas`;
- `lib/bootstrap/shared.ts` conserva el único ejecutor canónico;
- `saas-auth` deja de exportar la callable de plataforma migrada y conserva
  `bootstrapEmpresarialCallable`;
- `firebase.json` declara `saas-bootstrap`.

Los directorios `lib/` y `node_modules/` de `functions-bootstrap` son
salida o dependencias generadas y permanecen excluidos conforme a
`functions-bootstrap/.gitignore`. No son fuente versionada.

## Límites

Esta regularización no hace deploy, no modifica staging ni producción y no
autoriza trabajo de ADR-SAAS-046.
