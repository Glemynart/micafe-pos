# G-SAAS-02 / M2 / E2.2 — staging de recuperación de credenciales

## Alcance

Esta evidencia registra únicamente el preflight y el deploy dirigido de
`saas-platform-credential-recovery` en `micafe-pos-staging`. No registra la
reemisión ni la activación del fixture; esas operaciones permanecen pendientes
del gate funcional y no se ejecutaron durante el deploy.

## Fuente y procedencia

- Rama de implementación: `codex/e2-2-implement-platform-recovery`.
- Commit de implementación: `163afec5058f86ef7ddb97f0b34976b0fadee408`.
- Commit integrado en `main`: `223ccce695a15fa44a220bcfe020f5f415778366`.
- Codebase: `saas-platform-credential-recovery`.
- Source: `functions-platform-credential-recovery`.
- Proyecto: `micafe-pos-staging`.
- Región: `us-central1`.
- Runtime: Node.js 22 / Gen 2.
- Firebase Functions hash: `32b5099d812dbbe1df67437a840000a082a7ec58`.
- Cloud Build: `0a806b51-9faa-4dc9-b702-cac3f0fe39af`.
- Imagen: `sha256:bf4889d3b41201e3834a946d60454f1444771d41811d8a3ddee87bd243efb53b`.
- Cuenta de servicio: `192423427245-compute@developer.gserviceaccount.com`.

## Preflight y deploy

El dry-run dirigido a `functions:saas-platform-credential-recovery` terminó
`Dry run complete!` y describió exclusivamente tres callables, todas en
`us-central1`, sin deletes, replacements, tráfico manual ni otros codebases.
El deploy dirigido posterior creó exactamente estas tres Functions:

| Callable | Revisión | Estado | Source ZIP generation |
| --- | --- | --- | --- |
| `restablecerCredencialAdministradorTenantSaas` | `restablecercredencialadministradortenantsaas-00001-heg` | `ACTIVE` | `1790961767018163` |
| `reemitirRestablecimientoCredencialAdministradorTenantSaas` | `reemitirrestablecimientocredencialadministradortenant-00001-jur` | `ACTIVE` | `1790961827608585` |
| `activarRestablecimientoCredencial` | `activarrestablecimientocredencial-00001-zod` | `ACTIVE` | `1790961827665810` |

Las tres tienen `allTrafficOnLatestRevision=true`, runtime `nodejs22`, región
`us-central1`, el mismo hash/build/imagen y únicamente el Secret existente
`OPERATIONAL_PIN_PEPPER`. No se creó ningún Secret nuevo. La política observada
mantiene únicamente el binding `roles/secretmanager.secretAccessor` para la
cuenta de servicio de ejecución.

## Fixture y límites

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` fue leído de
`micafe-pos-staging` y continúa en estado `trial`, con suscripción
`mvp_comercial` versión 2, una membresía administrativa activa y una
incorporación `ACTIVE`. No se ejecutó Bootstrap, Activation, reemisión,
activación de recuperación ni se creó otro fixture durante este gate.

El próximo paso es la validación funcional canónica desde el Backoffice de
staging. No se debe registrar ningún PIN, token o secreto en evidencia.

## Mutation audit

- Functions: 3 creadas en el codebase autorizado.
- Revisiones: 3 creadas, una por callable.
- Firestore/Auth/Rules/Storage/Hosting: 0 mutaciones intencionales.
- IAM: únicamente el binding de acceso del runtime al Secret existente.
- Secrets nuevos: 0.
- Tráfico manual: 0.
- Producción: 0.
- Bootstrap: 0.
- Activation: 0.
- Fixture adicional: 0.
