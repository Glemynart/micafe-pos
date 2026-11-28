# E2E visual autenticado de privacidad — staging — 2026-11-27

## Resultado

**PASS técnico sintético, 2/2 pruebas**, ejecutado el `2026-11-27T23:32Z`
contra `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app` y las
Functions de `micafe-pos-staging/us-central1` mediante
`npm run e2e:privacy:staging`.

La configuración dedicada `playwright.privacy-staging.config.ts` falla antes
de iniciar Playwright si el proyecto o URL de Functions no coinciden exactamente
con staging. Solo selecciona `privacy-claims.spec.ts`; no usa el navegador
integrado ni una sesión real de Diana.

| Escenario | Resultado |
| --- | --- |
| Login sintético de operador con `PRIVACIDAD_RECLAMOS_TRAMITAR` | PASS |
| Render de Backoffice y acceso al formulario de reclamos | PASS |
| Rechazo al asociar ficha de cliente del tenant A con empresa B | PASS; no creó caso ni anotación |
| Registro de reclamo sintético válido en A y consulta de su detalle | PASS |
| Registro de constancia de respuesta y cierre | PASS; estado final `RESUELTO` visible |
| Comprobación de que B no recibió caso, anotación ni contador alterado | PASS |
| Operador sin la facultad: UI restringida y callable devuelve `403 PERMISSION_DENIED` | PASS |
| Limpieza posterior de empresas, clientes, casos, operadores y usuarios Auth | PASS; cada recurso se volvió a consultar y no existía |

Se usaron tenant, cliente, operador, fechas y referencias sintéticos. No se
consultaron expedientes reales, no se usó información personal, no se enviaron
correos, no se exportaron ni borraron datos reales y no se modificaron Rules,
IAM, Functions, App Hosting o recursos de producción.

## Evidencia visual y reproducibilidad

Playwright generó capturas del estado vacío, caso abierto y caso resuelto en
`artifacts/e2e/operator-portal-staging/privacy-claims/test-results/`. Esos
artefactos locales están ignorados por Git; muestran únicamente fixtures
sintéticos y no se adjuntan al PR.

Resultado Playwright: `2 passed (23.2s)`. El comando y configuración quedan en
el repositorio para repetición controlada; el próximo commit que los incorpore
requiere su propio CI. Esta ejecución no es evidencia de aceptación contractual,
cumplimiento jurídico, exportación/supresión de datos reales ni certificación
productiva.

## Rutas públicas revalidadas

| Entorno | `/terminos` | `/privacidad` | `/aviso-autorizacion` | `/anexo-tratamiento` |
| --- | --- | --- | --- | --- |
| Producción (`micafe-pos`) | HTTP 200, página heredada Café Atrato | HTTP 404 | HTTP 404 | HTTP 404 |
| Staging (`micafe-pos-staging`) | HTTP 200, Dusema POS, `BORRADOR` | HTTP 200, Dusema POS, `BORRADOR` | HTTP 200, Dusema POS, `BORRADOR` | HTTP 200, Dusema POS, `BORRADOR` |

Producción no se modificó. Los cuatro documentos permanecen en preparación y
no se habilita su aceptación contractual real.

## Assets de descarga y gate de publicación — 2026-11-28T00:10Z

GET read-only en staging a las cuatro fuentes estáticas del bundle devolvió
HTTP 200; cada respuesta conserva el marcador `BORRADOR`/`PREPARACION`:

| Asset | Staging |
| --- | ---: |
| `/legal/v0.6/terminos-servicio.md` | 200, borrador |
| `/legal/v0.6/politica-tratamiento.md` | 200, borrador |
| `/legal/v0.6/aviso-autorizacion.md` | 200, borrador |
| `/legal/v0.6/anexo-tratamiento.md` | 200, borrador |

La ruta productiva `/legal/v0.6/terminos-servicio.md` respondió 404 al mismo
corte; `/terminos` continúa siendo la página heredada de Café Atrato. Los
archivos están en `public/`, por lo que son descargas estáticas además de las
páginas que muestran el aviso de borrador. Si se publica el candidato antes de
la aprobación factual/jurídica, los cuatro textos quedan públicamente
descargables. No se desplegó producción. Mantener el corte sin publicar hasta
que los documentos sean aprobados.
