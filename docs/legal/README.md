# Dusema POS — borradores legales

Estado: **BORRADOR PARA REVISIÓN; NO PUBLICADO NI EXIGIBLE COMO NUEVA VERSIÓN**.
Preparación: 2026-11-23. Versión de trabajo: `0.1`.

Revisión normativa del mismo día: términos y política avanzan a `0.2`.
Véanse [hallazgos y fuentes](REVISION-2026-11.md) y
[ADR-SAAS-099 propuesto](../../ADR-SAAS-099-aceptacion-legal-versionada.md).
La revisión no cierra los pendientes ni convierte el texto en exigible.

La [propuesta operativa concreta](OPERACION-Y-CONSERVACION.md) incorpora
metadatos remotos de backups/regiones, proveedores identificados y opciones de
conservación, soporte y salida. Distingue hechos comprobados de condiciones por
aprobar y de mecanismos todavía no implementados.

La [comprobación de proveedores](PROVEEDORES-EVIDENCIA-2026-11.md) confirmó Vercel
Hobby y sus límites; la exportación se diseña en
[ADR-SAAS-100 Propuesto](../../ADR-SAAS-100-exportacion-salida-tenant.md).
Ninguno de esos resultados acredita firma de contratos o entrega de datos reales.

Trazabilidad: `G-SAAS-02 → M2 → E2.2`, preparación documental del onboarding
comercial autorizada por el responsable en este chat. Base técnica:
`ce70af69754d98d5d61311dd2673423a9d471eef`.

## Documentos

- [Términos del servicio](terminos-servicio.md).
- [Política de tratamiento](politica-tratamiento.md).
- [Aviso y autorización](aviso-autorizacion.md).
- [Anexo de tratamiento por cuenta del negocio](anexo-tratamiento.md).

Estos borradores usan los datos suministrados por el prestador. No acreditan
verificación del RUT, registro de marca ni constitución de una sociedad.
«Dusema POS» identifica el servicio; el prestador indicado es una persona natural.

## Revisión necesaria antes de publicar

1. Validar jurídicamente las cláusulas y los datos de identificación del prestador.
2. Definir tiempos reales de atención, disponibilidad y recuperación. No ofrecer
   un SLA, respaldo periódico o restauración garantizada sin evidencia operativa.
3. Aprobar matriz de conservación por categoría, obligaciones legales, plazo de
   entrega/exportación al terminar y tratamiento de copias de seguridad. La
   ausencia de borrado automático actual no justifica conservación indefinida.
4. Inventariar proveedores, destinatarios, países/regiones efectivos y contratos
   de transmisión. Google/Firebase/GCP aparece en la arquitectura; deben
   verificarse también hosting, correo y cualquier otro proveedor efectivo.
5. Revisar obligaciones tributarias del prestador y aplicabilidad de normas de
   consumo según la relación concreta; no presumir que todo contrato empresarial
   queda excluido ni prometer facturación DIAN no habilitada.
6. Evaluar si corresponde inscripción en RNBD según sujeto obligado y régimen
   vigente; no afirmar que todo SaaS debe inscribirse.
7. Designar formalmente al prestador como encargado de atender privacidad y
   comprobar que el correo y teléfono publicados reciben solicitudes.
8. Determinar fecha de vigencia y aprobar una versión final. Las fechas de estos
   borradores no constituyen fecha de aceptación de los clientes existentes.

Avance: backup diario Firestore de 35 días y snapshots recientes `READY`
comprobados solo por metadatos; soporte temporal de diagnóstico y CSV parcial
comprobados en código. Pendientes materiales: acuerdos efectivos con proveedores,
exportación completa de tenant, supresión/ciclo de archivos y limpieza de caché.
La aprobación condicionada del responsable no se registra como aceptación de
ADR-SAAS-099 mientras estas condiciones sigan sin resolverse.

## Siguiente corte técnico propuesto

Reemplazar el contenido histórico de `/terminos` solo cuando los textos estén
aprobados. Publicar documentos accesibles antes de aceptar y permitir descargar
la versión exacta. El representante del negocio acepta el contrato; la
autorización personal corresponde al titular o a quien esté legitimado. Un
administrador no puede autorizar indiscriminadamente por todos sus clientes.

Diseñar mediante ADR **Propuesto** la autoridad y persistencia de la aceptación:
identidad autenticada, tenant, capacidad de representación declarada, documento,
versión y huella del contenido, fecha de servidor y evidencia de la acción
afirmativa. Conservar versiones históricas y separar aceptación contractual,
autorización personal y publicidad opcional. No guardar PIN, contraseña o tokens.
La necesidad y conservación de IP u otros metadatos requieren justificación.

Probar autorización, aislamiento, idempotencia, versiones, rechazo de aceptación
por terceros y compatibilidad con contratos existentes. No alterar snapshots,
precio, Trial, pagos o plazo como efecto de aceptar los documentos. Definir el
tratamiento de clientes existentes y del rechazo antes de imponer un bloqueo.

Este corte solo incorpora borradores Markdown. No implementa aceptación, no
publica páginas, no registra consentimientos y no modifica contratos existentes.
Rollback documental: revertir exclusivamente el commit que agrega estos archivos.

## Fuentes oficiales consultadas

- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981): derechos, autorización, deberes y atención de solicitudes.
- [Decreto 1074 de 2015, protección de datos](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm): política, aviso y autorización.
- [Decreto 1074, transmisión](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm): relación responsable/encargado.
- [Ley 527 de 1999](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276): mensajes de datos y contratación electrónica.
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306): aplicación condicionada a la relación de consumo.

Las fuentes orientan la revisión; los borradores no constituyen certificación de
cumplimiento. Validación de este corte: consistencia, enlaces locales y
`git diff --check`; no requiere builds ni pruebas de aplicación.
