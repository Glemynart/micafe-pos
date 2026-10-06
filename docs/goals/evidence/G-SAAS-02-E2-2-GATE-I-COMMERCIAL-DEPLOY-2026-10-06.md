# G-SAAS-02 / M2 / E2.2 — Deploy controlado de `saas-commercial` a staging — 2026-10-06

## Dictamen

`PASS` para el subgate técnico de publicación staging de ADR-SAAS-061.

Gate I permanece `EN EJECUCIÓN`. Esta evidencia no declara creada ni
persistida la oferta comercial, no crea/configura el tenant real y no cierra
E2.2.

## Identidad y validaciones previas

- PR #458, rama `codex/e2-2-server-resolved-offer`, HEAD
  `1d4d3333b5bdd9182f58b84c3cbee78accfb40a6`.
- Merge commit en `origin/main`:
  `fb9f7d079e1cbdf53050cc85958ee896c8d5c6b9`; árbol Git
  `e89554d7ab42e226432d2402fd96482e9ad89461`.
- El árbol del HEAD del PR y el árbol de `origin/main` coinciden.
- CI del PR: `Tipos y pruebas`, Vercel y Vercel Preview Comments en `PASS`.
- CI post-merge de `main`: run `37442386369`, `success`, para el merge
  `fb9f7d079e1cbdf53050cc85958ee896c8d5c6b9`.
- Node local `v22.23.2`, npm `10.9.8`.
- `npm --prefix functions-commercial run build`: `PASS`.
- `npm --prefix functions-commercial run test:discovery`: `1/1 PASS`.
- Manifiesto local SHA-256 de los 76 archivos de paquete/build:
  `8252cd86bac84abfd1f0f99a932f4c783c1f936646d23a7b3e3cfcd6e26d9ebd`.

## Alcance del deploy

Único comando ejecutado:

```text
firebase deploy --only functions:saas-commercial --project micafe-pos-staging
```

Proyecto confirmado mediante `.firebaserc`: `micafe-pos-staging`. El deploy
preparó únicamente el codebase `saas-commercial`, fuente
`functions-commercial`; no usó `--force`.

Resultado Firebase:

| Callable | Operación | Código Firebase | Runtime / región | Revisión | Tráfico |
| --- | --- | --- | --- | --- | --- |
| `consultarOfertaComercialTenantSaas` | Creada | `c9a4f86d04ac3754bfb76879f1639f6820485e9e` | Node.js 22 / `us-central1` | `consultarofertacomercialtenantsaas-00001-gug` | 100 % |
| `ejecutarComandoComercialSaas` | Actualizada | `c9a4f86d04ac3754bfb76879f1639f6820485e9e` | Node.js 22 / `us-central1` | `ejecutarcomandocomercialsaas-00004-luv` | 100 % |

Ambas revisiones están `READY`. La configuración conserva memoria de 256 MiB,
timeout de 60 s y concurrencia 80. `ejecutarComandoComercialSaas` conserva
`maxInstances=20`; la nueva callable no declara un límite personalizado. No
hay Secrets ni variables de entorno personalizadas: solo configuración
estándar inyectada por Firebase/Cloud Functions.

## Procedencia del artefacto

- Cloud Build `21c2f86c-8878-47ab-984e-4c6bafa5f7ab`: `SUCCESS`,
  `2026-10-06T09:45:38Z`–`09:46:21Z`.
- Digest de imagen observado en ambas revisiones:
  `sha256:92aec39ce684ae00329058cc449f90a3853824e3075bb6739d7ba37bb7258deb`.
- El source ZIP de cada callable pesa 135340 bytes. Ambos tienen SHA-256
  `500c551cd4d61c671d5d3b47da73ead43e8c5d78343b952a8f439f8c832c722c`.
- Generaciones GCS: `1791279938087216` para
  `consultarOfertaComercialTenantSaas` y `1791279989908651` para
  `ejecutarComandoComercialSaas`.
- `sourceProvenance` de Cloud Build está vacío; por ello se verificó el
  artefacto directamente: los 76 archivos extraídos de cada ZIP coinciden
  byte por byte con los 76 archivos del paquete/build local del árbol exacto
  de `origin/main` (`faltantes=0`, `sobrantes=0`, `diferencias=0`).

## Verificación y rollback

Las dos callables respondieron `401 UNAUTHENTICATED` / `AUTENTICACION_REQUERIDA`
ante una sonda sin Auth, como exige su guard server-side. La sonda no avanzó a
lectura/escritura de Firestore. No se ejecutaron comandos autenticados ni se
creó una oferta.

La revisión anterior de `ejecutarComandoComercialSaas`,
`ejecutarcomandocomercialsaas-00003-lib`, continúa `READY` y disponible como
destino verificable para devolver el 100 % del tráfico si hubiera que revertir
el cambio de la callable existente. No se ejecutó rollback. La nueva callable
no tenía revisión previa; una reversión completa de ese endpoint requeriría
retirarlo de forma dirigida en staging. No se hizo ninguna eliminación.

## Vercel y servicios auxiliares

El merge de PR #458 disparó automáticamente el despliegue Vercel
`dpl_ALuB2d3eK5q7rntpKgEQqQRjWkos`, target `production`, estado `READY`, ligado
al merge `fb9f7d0`. Solo recibió los alias automáticos de Vercel; el dominio
canónico `cafeatrato.vercel.app` siguió apuntando al despliegue anterior
`dpl_GoFEeU2pjnnbEgo5jR7F863swYY4`. No se modificaron alias, dominio ni se
promovió manualmente ningún deployment.

El CLI de Firebase anunció la comprobación de APIs y la solicitud de
identidades de servicio de Pub/Sub/Eventarc como parte de su flujo estándar.
No se hicieron cambios IAM manuales. La lectura de Cloud Audit Logs para esa
ventana devolvió únicamente comprobaciones `iam.serviceAccounts.actAs` sobre
la cuenta runtime existente; no devolvió eventos de cambio de política IAM,
habilitación de APIs ni `GenerateServiceIdentity`.

## Estado de Gate I y mutation audit

- La publicación técnica de `saas-commercial` en staging: `PASS`.
- La consulta y comandos de oferta requieren autenticación/facultad de
  plataforma; la oferta solo puede operar en `micafe-pos-staging`.
- Vigencia explícita para el borrador de oferta: `PENDIENTE` según la
  aprobación comercial de 2026-10-06.
- Oferta persistida: `NO`.
- Tenant real creado/configurado: `NO`.
- Bootstrap / Activation / catálogo / inventario: `0`.
- Firestore/Auth: sin escrituras; las únicas sondas devolvieron 401 antes de
  acceder a Firestore.
- Rules, Secrets, permisos IAM manuales: `0`.
- Firebase producción: `0`.
- Rollback de staging: `0`.
- E2.2: `EN EJECUCIÓN`.

El siguiente paso de Gate I requiere completar las precondiciones comerciales
y operativas documentadas antes de registrar la oferta o almacenar datos del
cliente real. Este deploy no las sustituye ni las autoriza por sí solo.
