# Dusema POS — borradores legales

Estado: **BORRADOR PARA REVISIÓN; NO PUBLICADO NI EXIGIBLE COMO NUEVA VERSIÓN**.
Preparación: 2026-11-23. Versión de trabajo: `0.2`.

Revisión normativa del mismo día: términos y política avanzan a `0.2`.
Véanse [hallazgos y fuentes](REVISION-2026-11.md) y
[ADR-SAAS-099 aceptado para implementación](../../ADR-SAAS-099-aceptacion-legal-versionada.md).
La revisión no cierra los pendientes ni convierte el texto en exigible.

La [propuesta operativa concreta](OPERACION-Y-CONSERVACION.md) incorpora
metadatos remotos de backups/regiones, proveedores identificados y opciones de
conservación, soporte y salida. Distingue hechos comprobados de condiciones por
aprobar y de mecanismos todavía no implementados.

La [comprobación de proveedores](PROVEEDORES-EVIDENCIA-2026-11.md) confirmó Vercel
Hobby y sus límites; la exportación se diseña en
[ADR-SAAS-100 aceptado para implementación controlada](../../ADR-SAAS-100-exportacion-salida-tenant.md).
Ninguno de esos resultados acredita firma de contratos o entrega de datos reales.

El [cierre de comprobaciones accesibles](CIERRE-COMPROBACIONES-2026-11.md)
incorpora las respuestas del prestador, ciclos reales de Storage/logs, ausencia
de TTL y metadatos de 48 colecciones raíz. Identifica las capacidades todavía
no implementadas que impiden declarar exigibilidad o cumplimiento completo.

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
ADR-SAAS-099 está aceptado para implementar la aceptación versionada; estos
pendientes siguen impidiendo publicar los textos como finales o exigirlos.

## Corte técnico de aceptación versionada

La ruta histórica `/terminos` se reemplazó en la rama con una vista del borrador,
claramente marcada como no vigente. La versión final se mostrará solo después de
su aprobación. Publicar documentos accesibles antes de aceptar y permitir descargar
la versión exacta. El representante del negocio acepta el contrato; la
autorización personal corresponde al titular o a quien esté legitimado. Un
administrador no puede autorizar indiscriminadamente por todos sus clientes.

ADR-SAAS-099 aceptado define la autoridad y persistencia: identidad autenticada,
tenant, facultad declarada de representación, documentos/versiones/huellas,
fecha de servidor y evidencia de acción afirmativa. La implementación separa
aceptación contractual de autorizaciones personales. No guarda PIN, contraseñas,
tokens ni IP/UA. Las pruebas cubren autorización, aislamiento, idempotencia,
huellas y Rules. No cambia snapshots, precio, Trial, pagos ni plazo.

El corte técnico en curso prepara vistas y descargas versionadas de estos
borradores y un registro autenticado de aceptación. El catálogo legal permanece
en `PREPARACION`: no se ofrece una aceptación contractual de textos sin aprobación
final, ni se bloquean clientes existentes. No se registran consentimientos
personales desde la aceptación del contrato empresarial. Las dos callables, las
Rules y el codebase dedicado requieren desplegarse en un corte posterior; no hay
escrituras ni aceptación de clientes en producción. Las condiciones para tratar
clientes existentes y exigir una versión siguen pendientes de decisión y release.

## Fuentes oficiales consultadas

- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981): derechos, autorización, deberes y atención de solicitudes.
- [Decreto 1074 de 2015, protección de datos](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm): política, aviso y autorización.
- [Decreto 1074, transmisión](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm): relación responsable/encargado.
- [Ley 527 de 1999](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276): mensajes de datos y contratación electrónica.
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306): aplicación condicionada a la relación de consumo.

Las fuentes orientan la revisión; los borradores no constituyen certificación de
cumplimiento. La rama añade validaciones automatizadas de hashes, Functions y
Rules; el estado de ejecución de esas validaciones se reporta en el PR. Ningún
resultado técnico por sí solo certifica cumplimiento jurídico.
