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
