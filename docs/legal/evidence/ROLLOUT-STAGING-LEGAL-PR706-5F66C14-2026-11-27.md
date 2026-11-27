# Rollout controlado de PR #706 en staging — 2026-11-27

**Entorno:** `micafe-pos-staging` únicamente. **Producción no se modificó.**

## Candidato y CI

- PR #706: abierto/en borrador; `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
- SHA desplegado: `5f66c146fa0339a16414fa59d6906b348699d97a`.
- CI [run 46036507027](https://github.com/Glemynart/micafe-pos/actions/runs/46036507027): `success`; check `Tipos y pruebas` completó en 27m45s.

## Orden y resultado del despliegue

1. `firebase deploy --only firestore:rules --project micafe-pos-staging` terminó `Deploy complete`. El archivo local desplegado tiene SHA-256 `7312dc4634a4950506ba21a950f28007e96848b6c0b3133a787c4c2b1575f08c`. La consulta REST de lectura del release devolvió HTTP 403, por lo que no se pudo volver a obtener independientemente el contenido activo; queda como evidencia la salida exitosa del CLI y las pruebas Rules del candidato (52/52).
2. `firebase deploy --only functions:saas-legal --project micafe-pos-staging` terminó `Deploy complete`; solo se seleccionó ese codebase. Las cuatro funciones están `ACTIVE`, `READY`, con la nueva revisión al 100 % y usando `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`:

   | Callable | Revisión activa |
   |---|---|
   | `aceptarDocumentosLegalesTenant` | `aceptardocumentoslegalestenant-00007-riy` |
   | `consultarEstadoLegalTenant` | `consultarestadolegaltenant-00007-jin` |
   | `tramitarConsultaPrivacidadSaas` | `tramitarconsultaprivacidadsaas-00007-wel` |
   | `tramitarReclamoPrivacidadSaas` | `tramitarreclamoprivacidadsaas-00007-nij` |

   La identidad conserva un único binding de proyecto al rol personalizado `saasLegalRuntime`, cuyos permisos están limitados a Firestore y lectura de Auth. El CLI anunció aseguramiento de APIs y generación/verificación de identidades de Pub/Sub/Eventarc. La búsqueda de Admin Activity no devolvió eventos `GenerateServiceIdentity`; esto no prueba que la operación no haya tenido efecto. Los bindings observados de los service agents permanecen presentes. No se hizo cambio IAM manual.
3. `firebase apphosting:rollouts:create micafe-pos --git-commit 5f66c146fa0339a16414fa59d6906b348699d97a --project micafe-pos-staging` creó `build-2026-11-27-003`. El build está `READY`, el rollout `SUCCEEDED`, y Cloud Run asigna 100 % del tráfico a `micafe-pos-build-2026-11-27-003`. El recurso Build confirma el commit exacto. Los rollouts automáticos siguen desactivados; este fue manual.

## Verificación HTTP y límites

- Las rutas `/terminos`, `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` responden HTTP 200 en staging.
- Los cuatro archivos estáticos `public/legal/v0.6/*.md` responden HTTP 200 y sus bytes coinciden con los SHA-256 del bundle `dusema-pos-2026-11-v0.6`: términos `0f6509480588051f312b37e1bf352ff7c70721857f19ccd56b02640d53ffe059`; política `d48202440860a96cd6ae3428aee0272209fbfbd485cba92f8cc35e0a25f1e0ee`; aviso `42e9338cae72059cad52aeb8c96e0e4946c0fadfd56dedfffa443bd50a7ea8dd`; anexo `e8a9f52ade5ea2785bac7f2c79976b1d7d57ad73710d1b752ae5ed9a8cf87b6e`. Todos se identifican como borradores; no se activó aceptación real.
- POST sin autenticación a las cuatro callables respondió HTTP 401. No se creó aceptación, reclamo, consulta, autorización de exportación ni expediente. No se leyeron o exportaron datos de tenants.
- No se completó smoke autenticado positivo: Computer Use no pudo determinar con suficiente confianza la URL actual de Edge y terminó antes de interactuar. No se ingresaron credenciales ni se usó una sesión.
- Producción permanece en el build App Hosting `micafe-pos-build-2026-11-24-002`; `/terminos` todavía muestra Café Atrato y las otras tres rutas legales responden 404. No hubo deploy ni cambio de producción.

## Estado de release

Este rollout demuestra publicación técnica del candidato en **staging**, no aprobación legal, activación contractual, smoke autenticado ni certificación de exportación/supresión. Siguen pendientes la revisión jurídica y factual de los cuatro documentos, el canal y contacto verificados, smoke autenticado/aislamiento con tenant sintético, exportación integral real bajo instrucción comprobable y certificación real de conservación/supresión. Auditoría del PR: `NO APROBADO PARA MERGE`.
