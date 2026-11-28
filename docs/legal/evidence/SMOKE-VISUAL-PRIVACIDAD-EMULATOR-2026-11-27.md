# Smoke visual de privacidad en Emulator — 2026-11-27

## Alcance ejecutado

- Entorno aislado `demo-operator-portal`; solo Auth Emulator, Firestore Emulator y los codebases `saas-platform-context` y `saas-legal`.
- Playwright abrió el Backoffice, autenticó identidades sintéticas y recorrió `/backoffice/privacidad`.
- El flujo registró un reclamo sintético, comprobó el rechazo de tenant cruzado, añadió constancia de respuesta, cerró el caso, lo consultó como resuelto y verificó que el tenant ajeno no recibió anotaciones.
- Un operador sintético sin facultad no obtuvo el formulario y su llamada directa fue rechazada con `403 PERMISSION_DENIED`.
- Resultado: **2 pruebas aprobadas de 2**, 20 segundos. `npx tsc --noEmit` y ESLint focalizado sobre la configuración y el spec también pasaron.
- Capturas sintéticas locales: `artifacts/e2e/operator-portal/privacy-smoke-20261127/test-results/` (`privacy-claims-empty-state.png`, `privacy-claims-open-synthetic.png`, `privacy-claims-resolved-synthetic.png`). Son artefactos locales ignorados por Git; no incluyen registros de clientes reales.

## Limitaciones

- Este resultado es un smoke de Emulator, no una prueba en staging ni producción.
- No acepta documentos, consulta tenants reales, genera exportaciones reales ni ejecuta supresión.
- La ejecución local inicial del runner general se detuvo porque intenta descubrir los 21 codebases de Functions, incluidos codebases no requeridos para este flujo. El smoke focalizado evitó esa dependencia y ejecutó las dos Functions necesarias; el runner general no se modificó.
- El PR remoto verificado antes de añadir este spec era `fff33b9a51d3d28ab16361a9ec692061311e85bc`, con CI `46057771415` exitoso. Esta prueba local aún debe viajar en un commit del PR para obtener CI sobre el nuevo HEAD.
