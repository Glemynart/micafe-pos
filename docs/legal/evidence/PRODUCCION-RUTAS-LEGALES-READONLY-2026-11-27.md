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
