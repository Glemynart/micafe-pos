# Revalidación de rutas legales de producción — 2026-11-27

Consulta GET de solo lectura ejecutada el 2026-11-27 a las 18:26 UTC. No hubo
autenticación, escrituras, aceptación de documentos ni cambios de despliegue.

| URL | HTTP | Observación del contenido |
| --- | ---: | --- |
| `https://pos.dusema.com/terminos` | 200 | Contiene Café Atrato; no muestra `BORRADOR` |
| `https://pos.dusema.com/privacidad` | 404 | Ruta no publicada |
| `https://pos.dusema.com/aviso-autorizacion` | 404 | Ruta no publicada |
| `https://pos.dusema.com/anexo-tratamiento` | 404 | Ruta no publicada |
| `https://micafe-pos--micafe-pos.us-central1.hosted.app/terminos` | 200 | Contiene Café Atrato; no muestra `BORRADOR` |

La presencia simultánea de Dusema POS en `/terminos` no elimina el contenido
heredado de Café Atrato. Producción no está lista para publicar el bundle legal
del PR #706 mientras los textos sigan en borrador y las rutas no estén
reconciliadas.

## Revalidación

Segunda consulta GET de solo lectura: `2026-11-27T19:16:58.869Z`.

| URL | HTTP | Observación del contenido |
| --- | ---: | --- |
| `https://pos.dusema.com/terminos` | 200 | `<title>` y cuerpo identifican Café Atrato; no contiene `BORRADOR` |
| `https://pos.dusema.com/privacidad` | 404 | Ruta no publicada |
| `https://pos.dusema.com/aviso-autorizacion` | 404 | Ruta no publicada |
| `https://pos.dusema.com/anexo-tratamiento` | 404 | Ruta no publicada |
| `https://micafe-pos--micafe-pos.us-central1.hosted.app/terminos` | 200 | `<title>` y cuerpo identifican Café Atrato; no contiene `BORRADOR` |

La comprobación de texto inspeccionó el `<title>` y el cuerpo de la respuesta
HTML. Una prueba anterior con una expresión regular mal escapada produjo un
falso negativo y queda reemplazada por esta lectura directa. No hubo cambios de
producción.

## Revalidación de producción y staging — 2026-11-27T21:21:30Z

Se repitieron consultas GET públicas y se inspeccionaron títulos y texto visible
después de retirar scripts/estilos del HTML. No hubo autenticación, escrituras,
aceptaciones ni cambios de despliegue.

| URL | HTTP | Observación del contenido |
| --- | ---: | --- |
| `https://pos.dusema.com/terminos` | 200 | `<title>`: `Términos y Privacidad - Café Atrato`; sin marca `BORRADOR` |
| `https://pos.dusema.com/privacidad` | 404 | Ruta no publicada |
| `https://pos.dusema.com/aviso-autorizacion` | 404 | Ruta no publicada |
| `https://pos.dusema.com/anexo-tratamiento` | 404 | Ruta no publicada |
| Cuatro rutas correspondientes en `micafe-pos--micafe-pos-staging` | 200 | `<title>` identifica Dusema POS y cada documento muestra `BORRADOR` |

El resultado confirma que la ruta productiva no sirve el paquete legal del
candidato. No se debe interpretar el HTTP 200 de `/terminos` como publicación
válida: su título sigue perteneciendo a Café Atrato y faltan las demás rutas.

## Revalidación de solo lectura — 2026-11-27T21:45:50Z

Se consultaron las cuatro rutas legales de producción y staging con GET, sin
autenticación ni escrituras. Se inspeccionó el título HTML y la presencia del
marcador de borrador.

| Entorno | Ruta | HTTP | Resultado observado |
| --- | --- | ---: | --- |
| Producción | `/terminos` | 200 | `<title>`: `Términos y Privacidad - Café Atrato`; sin `BORRADOR` |
| Producción | `/privacidad` | 404 | No publicada |
| Producción | `/aviso-autorizacion` | 404 | No publicada |
| Producción | `/anexo-tratamiento` | 404 | No publicada |
| Staging | `/terminos` | 200 | Dusema POS; HTML contiene `BORRADOR` |
| Staging | `/privacidad` | 200 | Dusema POS; HTML contiene `BORRADOR` |
| Staging | `/aviso-autorizacion` | 200 | Dusema POS; HTML contiene `BORRADOR` |
| Staging | `/anexo-tratamiento` | 200 | Dusema POS; HTML contiene `BORRADOR` |

La lectura fue únicamente HTTP pública; no acredita el recorrido de aceptación
autenticado ni la versión de código desplegada en staging. Producción permanece
sin cambios.

## Causa técnica de las rutas — 2026-11-27T22:19Z

La versión productiva observada por el colector de release es
`build-2026-11-24-002`, construida desde `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
La inspección de ese árbol confirmó que `app/terminos/page.tsx` todavía contiene
el documento anterior de Café Atrato y que las páginas de `/privacidad`,
`/aviso-autorizacion` y `/anexo-tratamiento` no existen en ese `main`. En el
candidato #706, `/terminos` ya usa el componente de documentos Dusema y se
añaden las otras tres páginas. El backend de staging desplegado desde
`5f66c146` sirve las cuatro rutas como Dusema POS, marcadas `BORRADOR`.

Esto atribuye el resultado productivo a que el corte de #706 no está desplegado,
no a una ruta faltante en el candidato. La restricción de release sigue vigente:
no se publica en producción mientras los documentos no tengan aprobación
jurídica y factual. La prueba de staging no habilita aceptación real ni cambia
producción.
