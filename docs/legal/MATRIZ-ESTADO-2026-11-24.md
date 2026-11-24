# Matriz de ejecución legal — 24 de noviembre de 2026

Alcance: G-SAAS-02 / M2 / E2.2, rama `codex/e2-2-legal-acceptance`,
PR #706, candidato `3140e92472a5bcdeb499bf38ba51b8c682b67217`.
La matriz registra observaciones y no constituye dictamen ni aprobación jurídica.

| Requisito | Estado y evidencia | Riesgo | Acción y criterio de cierre |
|---|---|---|---|
| Cuatro documentos | Versiones 0.2 en `docs/legal` y `public/legal/v0.2`, catálogo con hashes y estado BORRADOR | Prometer capacidades inexistentes o condiciones sin verificar | Contrastar cada afirmación, preparar versión revisable y obtener aprobación aplicable antes de EXIGIBLE |
| Aceptación | `functions/src/legal/handler.ts` exige administrador, relación contractual y bundle publicado; CI del candidato en verde | No existe versión definitiva activa; historial y bloqueo de acceso no están demostrados en producción | Ensayar lectura, aceptación, reaceptación, historial y controles en staging; no registrar aceptación de clientes de prueba como real |
| Consultas y reclamos | `privacy-claims.ts` y Backoffice cubren reclamos de clientes; ensayo autenticado sintético de staging documentado en PR | La cobertura de consultas y otros tipos de registros no está demostrada | Inventariar alcance, completar o documentar procedimiento operativo verificable y probar plazos y aislamiento |
| Correo | Autoenvío y respuesta en la misma cuenta observados el 24 de noviembre | No demuestra entrega desde remitente externo | Prueba externa autorizada de ida y vuelta con contenido sintético y evidencia mínima |
| Exportación | Adaptadores cerrados, aislamiento y export sintético en Emulator, CI verde | Metadatos de raíces no prueban campos, referencias, archivos ni lectura histórica en Cloud | Ensayo autorizado y restringido sobre datos reales pertinentes; validar integridad y entrega sin exponer datos de terceros |
| Conservación y supresión | `retention-plan.mjs` es PREVIEW_ONLY; borrado limitado a fixtures Emulator | No hay ejecución real certificada; respaldos tienen ciclos propios | Implementar procedimiento controlado y verificable por categorías; probar solo con fixtures o autorización específica |
| Reglas, autenticación y aislamiento | Suites de Rules y pruebas legales pasan en CI; Rules y dos callables previas se desplegaron según evidencia del PR | El backend de reclamos de staging no acredita el estado equivalente en producción | Comparar inventario, código y permisos; pruebas negativas y smoke autenticado sin tocar datos reales |
| Proveedores y Vercel | Firebase/App Hosting identificados; Vercel Hobby y previews previos documentados en `OPERACION-Y-CONSERVACION.md` | No se comprobó contenido o eliminación de previews históricos; no asumir DPA | Inventariar configuración y exposición actuales y aplicar medidas proporcionadas autorizadas |
| Release | PR #706 draft; `main` aa1c4fe, HEAD 3140e92; CI 45489048596 exitosa | Merge activa App Hosting; frontend y funciones de reclamos pueden divergir | Verificar compatibilidad, auditoría, checks y secuencia; integrar y comprobar rollout solo tras resolver gates |
| Vigencia y aprobación | Bundle `PREPARACION`; no se acepta como contrato vigente | Publicación prematura o confusión entre contrato y consentimiento | Aprobación humana que corresponda, versión inmutable, fechas y recorrido verificable sin aceptar por terceros |

## Prioridades

1. Comprobar las superficies y entornos actuales y cerrar brechas de aislamiento y
   completitud de exportación con pruebas reproducibles.
2. Completar consultas, historial/versionamiento y procedimientos dentro de las
   decisiones arquitectónicas aprobadas; identificar cualquier nueva frontera.
3. Contrastar textos y proveedores contra hechos y fuentes vigentes; mantener los
   documentos como borrador hasta que estén listos y aprobados.
4. Preparar ensayo de salida, seguridad, despliegue coordinado y recuperación;
   después ejecutar los cortes autorizados y verificar resultados.
