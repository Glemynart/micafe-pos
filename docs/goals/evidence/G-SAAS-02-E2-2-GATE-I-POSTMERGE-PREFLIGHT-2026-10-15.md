# G-SAAS-02 / M2 / E2.2 — Cierre post-merge #603 y preflight de release

**Corte de evidencia:** 2026-10-15T07:20Z
**Dictamen:** Gate I `BLOCKED` / `INCOMPLETE`; entrega a Diana `PARTIALLY DELIVERED`.
**Alcance:** comprobación read-only de `origin/main`, CI, PR relacionados y estado productivo previamente consultado. No se desplegó, no se escribió en producción, no se ejecutó smoke y no se creó ni activó tenant o Trial.

## Integración y CI

| Control | Resultado | Evidencia |
|---|---|---|
| `origin/main` | `PASS` | SHA completo `3a45986282c93edc8e37539a87c25124de9bd74c`, confirmado tras `git fetch origin main`. |
| PR #603 | `PASS` | `MERGED`; HEAD `81ca2ed3f248906bfba1eab39858ae02197026b1`; merge SHA `3a45986282c93edc8e37539a87c25124de9bd74c`, `2026-10-15T06:55:24Z`. |
| CI post-merge | `PASS` | Run `38695374422`, `completed/success`, HEAD igual a `origin/main`; job obligatorio `Tipos y pruebas` completado sin pasos fallidos. |
| PR #599 | `BLOCKED` | Continúa `OPEN`. En la consulta, `Tipos y pruebas`, Vercel y Preview Comments estaban `pass`; la decisión del responsable sobre los metadatos históricos sigue pendiente. No se integró ni reescribió su historia. |
| PR #602 | `NOT EXECUTED` para este release | Continúa `OPEN`; sus checks consultados estaban `pass`. Es la optimización independiente de source maps; no se modificó, integró ni desplegó como parte de esta ruta. |

## Revalidación productiva y límites

Las lecturas de Functions, Firestore Rules, Vercel y del collector se realizaron contra los proyectos de producción/staging indicados, sin mutaciones. La observación detallada de superficies productivas fue a las 2026-10-15T07:06Z; no se reutiliza como autorización para mutar.

| Superficie | Resultado comprobable | Estado y límite |
|---|---|---|
| Functions producción | 104/104 activas, runtime Node.js 22. `registrarCompraOperativaV1` sigue en `saas-auth`, región `us-central1`, hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`. `transicionarPausaComprasSaas` no aparece en producción. `registrarCompraBodegaV1` sigue con hash `fa7f47c21b994a5ebccefded6e548e0f6b193c79`. | `BLOCKED`: hashes no corresponden a la fuente objetivo vigente; no hubo deploy. CI del SHA integrado pasó build y suites aplicables, pero no se declara que un artefacto productivo se haya publicado. |
| Discovery / secretos | La fuente de `main` incluye las dos callables de release en `saas-auth`; la consulta Dusema ya pertenece a `saas-dusema-platform`. La etapa de CI de discovery `saas-auth` sin Secrets Dusema pasó. | `PASS` para discovery probado por CI; no demuestra publicación productiva ni autoriza provisionar Secrets. |
| Codebase Bodega | Producción reporta 16 Functions en `saas-bodega` (hash `f41aa6…`) y 7 en `saas-bodega-operations` (hash `fa7f47…`). La fuente vigente exporta `notificarSolicitudVentaBodegaPendienteV1`, que no está en el inventario productivo leído; el staging incluye nombres heredados y no se toma como inventario de producción. | `BLOCKED` para deploy de codebase completo hasta revisar el diff de recursos exacto y el efecto del trigger retry-enabled. No desplegar por sustitución del deploy dirigido de compras. |
| Guard de compra | La fuente vigente rechaza Bodega en la compra legacy con `BODEGA_USE_CANONICAL`; las operaciones de compra consultan transaccionalmente el control antes de materializar efectos y fallan cerradas si el control no permite la operación. CI Functions aplicable terminó dentro del run post-merge exitoso. | `PASS` de implementación/pruebas en el SHA integrado; `BLOCKED` de producción porque la función remota conserva el hash anterior. |
| Firestore Rules | Release activo `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`; SHA normalizado remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. Fuente de Rules de `origin/main` `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`. La comparación directa contiene 14 divergencias efectivas de permisos; se contaron 15 bloques textuales distintos, uno semánticamente equivalente. | `BLOCKED`: mismatch confirmado. La publicación es global, no limitada al tenant de Diana. El ruleset objetivo exige control de compra activo y válido; tenant set y estado de controles no están verificados. No se desplegó. |
| Operador y control por tenant | El Backoffice de producción aún sirve el SHA Vercel antiguo; la facultad `RELEASE_COMPRAS_GOBERNAR` está en código integrado pero no se obtuvo evidencia de su asignación a la identidad operadora. El cliente no puede leer `/controles_release_compras` por Rules y la aplicación no expone una consulta read-only canónica de esos controles. | `BLOCKED`: falta que otro operador con `OPERADORES_GOBERNAR` asigne la facultad por el flujo canónico tras contar con la interfaz/endpoint compatible; falta una lectura autorizada del estado de controles y de los tenants incluidos. No se usó autoasignación ni lectura directa alternativa. |
| Vercel | Producción `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, estado `READY`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, alias `cafeatrato-glemynarts-projects.vercel.app`; el candidato `3a45986282c93edc8e37539a87c25124de9bd74c` no está servido. | `BLOCKED`: falta publicar y verificar el candidato. El CLI no proporcionó una medición de Deployment Storage; la cifra anterior del equipo no es una lectura fresca ni filtrada por proyecto, así que la capacidad actual es `UNKNOWN`. No se borraron deployments, aliases ni se cambió el plan. |
| Smoke | No se ejecutó. | `NOT EXECUTED`: identidad productiva existente, tenant, rol, claims y alcance exacto de lecturas no están expresamente identificados y autorizados. |
| Recovery / PITR | Restore aislado previamente verificado `PASS`; PITR deshabilitado es decisión aprobada y no cambió. | `PASS` / decisión preservada; no se repitió restore ni se activó PITR. |
| DIAN web | No hay autoridad server-side web acreditada para Factus. Se conserva la decisión de Trial no fiscal para Diana. | `BLOCKED` para certificación DIAN; no impide por sí sola el Trial no fiscal, pero no cierra Gate I. |
| Tenant / Trial de Diana | Fecha objetivo `2026-10-15` registrada a partir de la confirmación del administrador de que Diana se la comunicó directamente. No hubo Bootstrap en este trabajo. El tenant no fue reconsultado en esta pasada; catálogo/stock no se importaron. | `NOT EXECUTED`; no afirmar que el tenant no exista ni que Diana pueda ingresar. Antes de Bootstrap se requiere releer existencia, plan y precondiciones, y usar datos aprobados; la transcripción del catálogo no está aprobada para importación. |

## Decisiones y siguiente paso

El release no es seguro para ejecutar todavía. La secuencia aprobada de Functions → inicialización/pausa de controles → Rules → Vercel → smoke permanece condicionada; no comenzar una etapa si la anterior falla.

Acciones humanas concretas pendientes:

1. Un operador distinto con la facultad canónica `OPERADORES_GOBERNAR` debe asignar `RELEASE_COMPRAS_GOBERNAR` al operador de release por el Backoffice compatible y confirmar la asignación sin compartir credenciales.
2. El responsable técnico debe habilitar u ofrecer el mecanismo canónico, autenticado y de solo lectura para verificar el conjunto de tenants y los documentos de control. Las Rules actuales deniegan la lectura del cliente; no sustituirlo con acceso directo a Firestore.
3. El operador de release y la ventana fueron designados anteriormente por el administrador, pero deben verificarse en el contexto activo junto con la precondición de control de compras; no se infiere que una designación equivalga a una facultad ya asignada.
4. Un usuario con acceso a Vercel debe aportar la lectura actual de Usage filtrada al proyecto Café Atrato, porque la consulta CLI disponible no devolvió Deployment Storage medido.
5. Para smoke, el responsable debe autorizar una identidad existente, tenant, rol/claims y las rutas de lectura exactas. No usar identidad personal ni tenant por nombre supuesto.

No se necesita volver a solicitar autorización para lecturas/pruebas rutinarias. Las autorizaciones de despliegue de Functions, Rules, Vercel y smoke siguen siendo independientes. No se creó tenant, usuario o credencial; no hubo escrituras productivas. Gate I y E2.2 siguen incompletos.

## Addendum — capacidad Vercel y release habilitador

**Fecha de la evidencia aportada:** 2026-10-15, hora no verificable en la captura recibida.

El responsable aportó una captura autenticada de **Usage** del equipo
`glemynarts-projects`, filtrada al proyecto `cafeatrato`, que muestra
Deployment Storage de `9,95 GB` sobre un límite de `10 GB`. La gráfica de cola o
tiempo de build no se usa como evidencia de almacenamiento. La captura no fue
adjuntada como archivo a este repositorio, por lo que no se reproduce ni se
infieren metadatos adicionales.

El margen aritmético de `0,05 GB` es **extremadamente limitado** y no demuestra
que Vercel acepte ni complete un deployment: el CLI disponible no expone bytes
por deployment ni una reserva/preflight de capacidad, y no se inició un deploy
de prueba. Por tanto, la capacidad permanece `UNKNOWN`; no se borraron recursos,
no se cambió el plan y no se publicó nada.

La CI post-merge de PR #604, run `38701038601`, terminó `success` para
`main @ cd9d625d079aa0f0c99688e91f353dc8f3218b1f`. Cuando una persona con
autoridad Vercel confirme capacidad efectiva para publicar, el release
habilitador queda limitado a la callable
`saas-auth:cambiarFacultadesOperadorSaas` y al Backoffice de ese SHA. No incluye
Rules, controles de compra, otras Functions Bodega, secretos Dusema, Bootstrap,
tenant ni Trial. Antes de solicitar el cambio de facultad deben comprobarse los
dos recursos remotos publicados.

**Criterio de entrada del release habilitador:** solo puede iniciarse cuando
exista (a) confirmación verificable de capacidad efectiva para completar un
deployment adicional de `cafeatrato`, o (b) autorización explícita del
responsable de Vercel para asumir el riesgo de capacidad con el margen actual.
La lectura `9,95 GB / 10 GB` por sí sola no satisface ninguno de los dos
criterios.
