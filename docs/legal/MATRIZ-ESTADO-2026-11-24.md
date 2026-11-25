# Matriz de ejecución legal — 24 de noviembre de 2026

Alcance: G-SAAS-02 / M2 / E2.2, rama `codex/e2-2-legal-acceptance`,
PR #706, candidato `3140e92472a5bcdeb499bf38ba51b8c682b67217`.
La matriz registra observaciones y no constituye dictamen ni aprobación jurídica.

La [Ley 527 de 1999, artículos 5 a 8](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276)
reconoce los mensajes de datos y establece condiciones para identificar al
iniciador, reflejar su aprobación y preservar integridad. Los hashes y la sesión
aportan evidencia técnica; no prueban por sí solos representación legal, control
exclusivo de credenciales ni equivalencia automática con firma digital certificada.

| Requisito | Estado y evidencia | Riesgo | Acción y criterio de cierre |
|---|---|---|---|
| Cuatro documentos | Versiones 0.2 en `docs/legal` y `public/legal/v0.2`, catálogo con hashes y estado BORRADOR | Prometer capacidades inexistentes o condiciones sin verificar | Contrastar cada afirmación, preparar versión revisable y obtener aprobación aplicable antes de EXIGIBLE |
| Aceptación | `functions/src/legal/handler.ts` exige administrador, relación contractual y bundle publicado. La rama agrega historial paginado por tenant, con validación de recibos y visualización administrativa; el cursor por ID se probó con 52 recibos sintéticos en Firestore Emulator | No existe versión definitiva activa; historial y bloqueo de acceso no están demostrados en producción | Ensayar lectura, aceptación, reaceptación, historial y controles en staging; no registrar aceptación de clientes de prueba como real |
| Consultas y reclamos | `privacy-claims.ts` y Backoffice cubren reclamos de clientes; ensayo autenticado sintético de staging documentado en PR. ADR-SAAS-103 añade consulta separada, recepción pendiente, facultad específica, interfaz y ensayo en Emulator | Aún no está desplegado ni ensayado en staging; la reasignación de consultas necesita procedimiento externo. Otros dominios no están cubiertos por ADR-SAAS-102 | Verificar gobierno de facultades, ejecutar recorrido sintético de interfaz en staging y comprobar otros tipos de registros antes de ampliar cobertura |
| Correo | Autoenvío y respuesta en la misma cuenta observados el 24 de noviembre. Posteriormente Gmail mostró almacenamiento agotado (166,15 GB de 15 GB) y aviso de interrupción de envíos y recepción desde el 24 de diciembre de 2026 | No demuestra entrega desde remitente externo; el canal puede dejar de operar según el aviso | Resolver la cuota por un mecanismo autorizado y verificarla; prueba externa autorizada de ida y vuelta con contenido sintético y evidencia mínima. No borrar datos ni contratar un plan sin decisión específica |
| Exportación | Adaptadores cerrados, aislamiento y export sintético en Emulator, CI verde | Metadatos de raíces no prueban campos, referencias, archivos ni lectura histórica en Cloud | Ensayo autorizado y restringido sobre datos reales pertinentes; validar integridad y entrega sin exponer datos de terceros |
| Conservación y supresión | `retention-plan.mjs` es PREVIEW_ONLY; borrado limitado a fixtures Emulator | No hay ejecución real certificada; respaldos tienen ciclos propios | Implementar procedimiento controlado y verificable por categorías; probar solo con fixtures o autorización específica |
| Reglas, autenticación y aislamiento | Suites de Rules y pruebas legales pasan en CI. Inventario gcloud 2026-11-24: en producción `consultarEstadoLegalTenant` y `aceptarDocumentosLegalesTenant` están ACTIVE, GEN_2; en staging también está ACTIVE `tramitarReclamoPrivacidadSaas` | La callable de reclamos no aparece en el inventario productivo; las funciones de aceptación productivas anteceden al último commit de la rama. ACTIVE no acredita su SHA ni disponibilidad funcional | Comparar código, permisos, Rules y revisión; desplegar dependencias en el orden autorizado y ejecutar pruebas negativas y smoke autenticado sin tocar datos reales |
| Dependencias | `npm audit --omit=dev` del codebase legal: cero avisos. En la aplicación raíz se actualizó `fast-xml-parser` de 5.11.2 a 5.12.1 y pasó la prueba de su lector; el nuevo lockfile informa cuatro moderados y ningún bajo, alto o crítico | `glob`, `google-gax`, `minimatch` y `rimraf` presentan avisos moderados según la auditoría. El reporte no demuestra explotabilidad de cada ruta ni cubre otros codebases | Revisar las rutas y actualizaciones compatibles restantes y verificar CI del candidato exacto; no declarar ausencia global de vulnerabilidades |
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
