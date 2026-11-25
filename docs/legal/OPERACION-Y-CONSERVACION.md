# Operación, proveedores y conservación — propuesta concreta

Fecha: 2026-11-25. Estado: **BORRADOR OPERATIVO; NO APROBADO NI ACTIVADO**.
Complementa los borradores y ADR-SAAS-099; no crea obligaciones aceptadas ni
ejecuta borrado, exportación, migración o cambios de proveedor.

La [comprobación posterior](CIERRE-COMPROBACIONES-2026-11.md) registró Gmail
personal, términos online Google, soft delete de siete días en los buckets
examinados y sinks globales de Cloud Logging con retenciones de 30/400 días. Los
plazos de la matriz son propuestas, no políticas aceptadas ni tareas configuradas.
La evidencia es de recursos concretos; no acredita una retención uniforme para
todos los servicios, proyectos, cuentas, clientes o ubicaciones.

## 1. Evidencia comprobada

Consulta remota exclusivamente de metadatos en `micafe-pos`, el 2026-11-23:

- Firestore `(default)` en `southamerica-east1` (Brasil); PITR deshabilitado.
- Schedule diario `fa16b7c4-ecb8-418f-bf3a-815da592fabc` con retención
  `3024000s`, equivalentes a 35 días. Coincide con ADR-SAAS-031.
- Dos backups recientes en `READY`: snapshots de 2026-11-23 13:37:49Z y
  2026-11-22 13:33:18Z; vencen respectivamente 2026-12-28 y 2026-12-27.
- Servicio Cloud Run `micafe-pos`, gestionado por Firebase App Hosting, en
  `us-central1` (EE. UU.); última revisión Ready observada
  `micafe-pos-build-2026-11-03-001`. Esta consulta no certifica SHA ni tráfico.
- Bucket `micafe-pos.firebasestorage.app` y dos buckets de fuentes/uploads de
  Functions en `US-CENTRAL1`; el soft delete observado permite recuperación por
  siete días después del borrado lógico. No se listaron objetos ni se leyeron
  archivos del cliente, y no se hizo un borrado de prueba que certifique su
  expiración. La retención del backup Firestore no cubre automáticamente Storage.
- Cloud Logging global observado: `_Default` retiene 30 días y `_Required` 400
  días. Son configuraciones de los sinks examinados, no un plazo pactado de
  conservación de todos los logs ni una demostración de que no existan otros
  buckets, vistas o copias. El contenido y la clasificación de cada registro
  requieren inventario adicional.

Comprobación de código, no de telemetría ni de configuración de cuentas:

- `lib/firebase.ts`: caché persistente Firestore con múltiples pestañas.
- `app/layout.tsx` en `main@aa1c4fe`: PR #704 retiró `@vercel/analytics` del
  layout productivo. No se certifica la recepción histórica de eventos.
- `functions/src/email-invitation-delivery.ts`: puerto de entrega pendiente;
  no integra un proveedor real de invitaciones en esa implementación.
- `lib/bodega/financial-report.ts`: CSV de ventas operativas; no es una
  exportación completa de tenant ni un respaldo restaurable.
- `app/(tenant)/admin/(authenticated)/soporte-saas/page.tsx`: el admin puede
  autorizar, rechazar y revocar diagnóstico temporal de solo lectura. Ese flujo
  no es una mesa de ayuda general ni un gestor de reclamaciones legales.

No se observaron valores de secretos ni datos comerciales. No se consultó la
bandeja de correo. La existencia de un SDK o una región no acredita aceptación
del contrato del proveedor, todos sus subencargados o la ubicación de cada dato.
El conjunto de metadatos es parcial: se observó Firestore en `southamerica-east1`
(Brasil), Cloud Run y buckets indicados en `us-central1`/`US-CENTRAL1` (EE. UU.).
No acredita por sí solo la ubicación de Auth, FCM, soporte, telemetría, réplicas,
subencargados ni transferencias de cada dato personal.

## 2. Roles y solicitudes sobre datos

El negocio tenant decide finalidades y medios esenciales de los datos que usa
para su propia operación; en esos tratamientos es responsable. Dusema actúa como
encargado si trata esos datos bajo instrucciones verificadas. Dusema será
responsable independiente de los datos cuyo propósito determine para su propia
contratación, facturación, seguridad o administración. La asignación se hace por
actividad y debe constar en el inventario; una solicitud dirigida a Dusema no
convierte al administrador del tenant en representante automático del titular.

Cada parte debe designar la persona o área que recibe y tramita derechos de los
titulares. Para datos de un tenant, la recepción por Dusema se registra desde la
fecha original, se comunica al negocio y se presta asistencia sin trasladar ni
reiniciar términos legales. No se entrega información al negocio ni se modifica
o suprime el registro sin verificar legitimación e instrucción, salvo deber legal
propio u orden competente. El flujo de Backoffice no envía el correo externo y
no sustituye un procedimiento operativo completo.

Las funciones de cartera registran cuentas por cobrar entre negocios; no
acreditan por sí solas autorización para reportar datos a operadores de
información o para perfilar riesgo. La Ley 2573 de 2026, junto con las Leyes
1266 de 2008 y 1581 de 2012, debe revisarse antes de tramitar una oposición al
cobro que alegue suplantación o de habilitar cualquier reporte. La definición de
los «establecimientos comerciales con esta competencia» requiere evaluación
jurídica para el negocio y la operación concretos; no se presume cobertura ni
exclusión.

## 3. Inventario de proveedores

| Proveedor/servicio | Tratamiento identificado | Evidencia y pendiente |
|---|---|---|
| Google / Firebase / Google Cloud | Autenticación, base de datos, ejecución, hosting, archivos, logs y notificaciones según funciones habilitadas | Servicios en código; regiones anteriores confirmadas para recursos indicados. Vincular cuenta/contrato aplicable, versiones de términos y subencargados. No atribuir residencia Brasil a Auth, FCM o soporte sin evidencia específica. |
| Vercel | Builds/previews históricos | PR #704 retiró Analytics y configuró `git.deploymentEnabled=false` para todas las ramas. Revisión del 2026-11-24: los 100 despliegues más recientes listados no contienen preview del head actual; el más reciente de #706 es del commit anterior `ff422718a852ca9344569b6882496cbf7860cb69`. El proyecto exige SSO para todos salvo dominios personalizados; el alias `.vercel.app` observado está protegido. No se revisó el contenido ni se borraron previews históricos. El plan Hobby continúa sin cobertura DPA Pro/Enterprise acreditada y su compatibilidad comercial sigue pendiente. |
| Google / correo Gmail indicado por el prestador | Consultas, soporte y reclamaciones que se envíen a `segucor0526@gmail.com` | Correo declarado por el titular. No se ha verificado recepción, administración, MFA, retención ni si existe contrato empresarial. No equiparar automáticamente Gmail personal con Workspace contratado. |
| GitHub | Código, CI, PR y evidencias de desarrollo | Repositorio y CI existentes. Evitar datos personales de clientes, secretos y dumps en logs/artefactos. No es el respaldo de la base operativa. Revisar contrato y retención efectiva de artefactos. |

No se agrega Cloudflare, una pasarela o un SMTP como proveedor efectivo por
aparecer en una CSP o una consulta DNS inconclusa. Facturación electrónica,
pagos o integraciones futuras requieren su revisión al habilitarse.

Instrumentos públicos identificados, cuya existencia no prueba aceptación por
la cuenta ni suficiencia para cada tratamiento:

- [Términos Firebase](https://firebase.google.com/terms),
  [tratamiento y seguridad](https://firebase.google.com/terms/data-processing-terms),
  [subencargados](https://firebase.google.com/terms/subprocessors).
- [DPA Vercel](https://vercel.com/legal/dpa): comprobar alcance por plan y contrato;
  no trasladar condiciones de Enterprise/Pro a otra cuenta sin confirmación.
- [Privacidad de Analytics](https://vercel.com/docs/analytics/privacy-policy):
  revisar campos/eventos, URL y exclusión de identificadores sensibles.

Actualización verificada: el equipo Vercel consultado está en plan Hobby. No
atribuirle cobertura del DPA Pro/Enterprise ni asumir aptitud para uso comercial.
Véase [evidencia contractual](PROVEEDORES-EVIDENCIA-2026-11.md).

**Estado:** PR #704 retiró Analytics del código y detuvo nuevos despliegues Git
automáticos en Vercel. La política final debe describir con precisión los
despliegues históricos que permanezcan accesibles. No reactivar Analytics ni
despliegues comerciales Vercel sin revisar previamente el plan y el instrumento
contractual aplicable.

El Decreto 1074 exige que el contrato de transmisión defina el alcance, las
actividades del encargado y sus obligaciones, incluida la seguridad y la
confidencialidad. El inventario anterior no equivale a ese contrato ni acredita
que un DPA público cubra esta cuenta o este plan. Antes de habilitar un proveedor
con datos personales se debe confirmar el producto y cuenta, la relación de rol,
el acuerdo aplicable, la lista y localización de subencargados y el mecanismo de
notificación/cambio. La transferencia a otro responsable se evalúa separada de
la transmisión a un encargado. La Circular SIC 002 de 2025 trata casos de
transferencia de tecnología con datos personales o tecnologías para tratarlos;
no se usa aquí como regla general para toda operación SaaS.

## 4. Matriz de conservación propuesta

Los plazos de esta tabla son **propuestas operativas**, salvo la obligación legal
expresamente indicada. No se han configurado TTL ni tareas de eliminación.

| Categoría | Plazo y punto de partida propuestos | Disposición y límite |
|---|---|---|
| Datos operativos del negocio | Durante el contrato; ventana de salida de 30 días calendario tras terminación efectiva | Permitir solicitar entrega; no confundir suspensión temporal por impago con terminación. Borrar o anonimizar de sistemas activos en hasta 60 días calendario desde terminación, tras verificar entrega/instrucciones y ausencia de deber de conservación. |
| Usuarios y membresías exclusivos del tenant terminado | Acceso según contrato; eliminación de datos no necesarios dentro del mismo plazo de 60 días | Verificar dependencias y otros tenants antes de borrar identidad Auth; no borrar UID compartido, credenciales de otro negocio ni evidencia sujeta a conservación. |
| Logs de Cloud Logging observados | `_Default`: 30 días; `_Required`: 400 días | Configuración observada para sinks globales concretos, no política uniforme ni plazo aprobado. Falta inventariar contenido, sinks/buckets adicionales, posibles retenciones propias y acceso. No prometer 90 días ni supresión anterior a la expiración efectiva del proveedor. |
| Soporte ordinario | 12 meses desde cierre del caso | Eliminar adjuntos innecesarios antes y anonimizar métricas. Si el caso es reclamación/contrato/incidente, clasificar su evidencia por fundamento, sin conservar toda la bandeja por defecto. |
| Libros y papeles de comercio del propio prestador | Diez años desde último asiento, documento o comprobante, cuando corresponda a esa categoría | Art. 28 Ley 962/2005. Determinar documentos concretos con revisión contable/jurídica. No aplicar automáticamente a todo el tenant ni a toda telemetría. |
| Aceptaciones y autorizaciones | Mientras sustenten la relación/finalidad y durante el plazo legal justificado para acreditar obligaciones o atender reclamaciones | Clasificar si son papeles de comercio sujetos a diez años; si no, fijar el fundamento y plazo específico antes de crear evidencia. Retener solo documento/versiones y datos probatorios necesarios. No suplir esta decisión con retención infinita. |
| Recordatorio de código en dispositivo | Hasta que el usuario lo desactive, borre almacenamiento o se aplique la política de dispositivo | Es opcional y solo guarda el código. Advertir uso de dispositivos compartidos. No prometer limpieza remota de todos los navegadores. |
| Caché Firestore, PWA y sesión en dispositivo | Ligada al ciclo de uso y cierre seguro de sesión | Pendiente probar limpieza/aislamiento efectivo. No afirmar que logout elimina IndexedDB: no se encontró una limpieza explícita en las superficies inspeccionadas. |
| Backups Firestore | 35 días desde cada snapshot, según el schedule observado | PITR estaba deshabilitado y había snapshots `READY`; no se ejecutó restauración. Un dato eliminado de sistemas activos puede seguir en snapshots existentes hasta su expiración. El cálculo condicional de hasta 95 días (60 días objetivo + 35 de backup) no incluye copias adicionales y no es una garantía global. |
| Objetos de los buckets Storage examinados | Soft delete observado: recuperación durante 7 días desde el borrado lógico | Es una configuración observada; no se certificó expiración de un objeto de prueba ni todos los buckets/versiones/copias. No equivale a un máximo de borrado físico en todo Google Cloud. |
| Exportaciones y otras copias | Sin ciclo completo acreditado | No están inventariados todos los destinos, archivos temporales, copias de proveedor o cachés. No prometer un máximo global antes de cerrar el inventario y ensayar los ciclos. |

La supresión en producción no se ha ejecutado ni certificado. La herramienta de
supresión se ensayó solo con datos sintéticos en Firestore Emulator; no elimina
datos reales de Firestore, Firebase Auth, Storage, logs, dispositivos, respaldos
ni subencargados. La exportación integral tampoco está certificada: no se leyeron
payloads reales y no se realizó una entrega. `productionExportCertified=false`.
Un estado de tenant eliminado o un borrado de la base activa no demuestra por sí
solo supresión de toda copia.

Toda excepción por obligación legal o litigio debe identificar categoría,
fundamento, alcance mínimo, responsable y próxima revisión. No seguir usando esos
datos en operación ordinaria o publicidad. La restauración debe reaplicar el
registro de supresiones y restricciones antes de devolver acceso; restaurar un
backup no autoriza resucitar tratamientos ya terminados.

**Límite de la propuesta de 95 días:** no es plazo de eliminación física total.
Los términos públicos Google contemplan otros ciclos de eliminación interna en
sus respectivos supuestos, incluidos máximos de hasta 180 días; su cómputo y
aplicabilidad dependen del contrato/operación. No publicar un máximo global de
35/95 días para todos los sistemas. Antes de fijarlo deben distinguirse datos
activos, snapshots controlados, copias de servicio y excepciones legales.

## 5. Soporte, privacidad y reclamaciones

Propuesta comercial aún no aprobada: atención lunes a viernes, 08:00–17:00, hora
de Colombia, excepto festivos. Objetivo inicial de respuesta de soporte: dos días
hábiles. No es compromiso vigente de resolución ni servicio 24/7. No reduce
términos legales, cuya recepción y cómputo se registran desde la fecha real de
entrada, aunque llegue fuera del horario propuesto.

Canales declarados: correo `segucor0526@gmail.com` y teléfono `3103337837`;
pertenecen a la persona natural identificada como prestador. No se ha comprobado
recepción, seguridad de la cuenta, archivo restringido ni disponibilidad del
canal. No anunciar el teléfono como WhatsApp. Antes de activar el trámite hay
que designar formalmente la persona o área responsable de privacidad y validar
un medio de recepción y conservación con acceso restringido.

Procedimiento ejecutable manualmente sin crear una nueva base de clientes:

1. Recibir y asignar consecutivo; registrar recepción, remitente mínimo, tenant
   si corresponde, tipo de petición y canal de respuesta en un registro de acceso
   restringido. No usar Issues/PR públicos como expediente legal.
2. Clasificar soporte, consulta de datos, reclamo de datos, reclamo de consumo,
   incidente o solicitud de salida. Aplicar plazo legal de cada tipo; una consulta
   de datos no tiene el mismo plazo que una falla técnica.
3. Verificar identidad/representación de manera proporcional; nunca pedir PIN ni
   aceptar captura de credenciales como verificación.
4. Consultas de datos: diez días hábiles y extensión motivada de hasta cinco.
   Reclamos de datos: quince días hábiles y extensión motivada de hasta ocho,
   con los demás pasos de la política. Reclamo directo de consumo: quince días
   hábiles cuando ese régimen aplica.
5. Si Dusema es encargado, remitir al responsable y asistir sin entregar datos de
   terceros. Mantener fecha, remisión y evidencia del trámite. La anotación de
   reclamo debe llegar al registro afectado por mecanismo autorizado; anotarla
   solo en correo no acredita ese paso.
6. Responder por el canal adecuado y conservar evidencia de entrega y cierre.
   Revisar vencimientos cada día hábil. Registrar causa y comunicación de las
   extensiones dentro de sus límites.

Incidentes: contener y preservar evidencia mínima; registrar detección y cuándo
se informó al encargado de atenderlos; evaluar afectados y obligaciones de
reporte. El plazo de reporte SIC aplicable no se sustituye por el objetivo de
respuesta comercial. Comunicar al cliente oportunamente sin revelar secretos.

## 6. Salida y entrega de datos

Propuesta: solicitud de entrega dentro de 30 días calendario desde terminación;
respuesta con alcance y método en dos días hábiles y entrega ordinaria dentro de
diez días hábiles desde verificar identidad/representación. Las obligaciones
legales de acceso gratuito de titulares se atienden por su régimen propio.

La propuesta de precio es incluir una entrega estándar por terminación sin cargo
adicional; trabajos extraordinarios requerirían presupuesto y autorización. Ni
el precio ni el alcance/plazo están aceptados como compromiso comercial vigente.

Formato propuesto: CSV/JSON con IDs, referencias, moneda y fechas UTC, más archivos
propios autorizados y manifiesto de alcance, conteos y hashes. Verificar ausencia
de información de otros tenants y excluir secretos, hashes de PIN, tokens,
credenciales e información de plataforma ajena a la entrega. Entregar por canal
autenticado y restringido; evitar adjuntar dumps completos a Gmail.

**Limitación actual:** el CSV de reportes es parcial. El exportador local de
ADR-SAAS-100 tiene lectura acotada por tenant, allowlists versionadas, cifrado y
pruebas con datos sintéticos; clasifica las 48 raíces observadas. No se leyeron
payloads reales ni se realizó una entrega. `productionExportCertified=false`:
faltan verificar esquemas históricos, referencias, subcolecciones y consistencia
de `readTime` con evidencia representativa antes de usarlo con datos reales. Un
export Firestore de toda la base puede incluir otros clientes y no se entrega al
negocio.

Preparación técnica: [ADR-SAAS-100](../../ADR-SAAS-100-exportacion-salida-tenant.md)
está aceptado para implementación y pruebas controladas. El ejecutor local de
supresión solo admite fixtures sintéticos en Firestore Emulator; no borra datos
productivos, Auth ni Storage, ni demuestra eliminación física de respaldos.
Ninguna de estas herramientas está certificada para una salida real.

La ventana de salida no obliga a mantener ventas o escrituras después del fin
contractual. Solicitud tardía, obligación de conservación o disputa requieren
revisión del caso y derechos aplicables; no autoriza una eliminación precipitada.

## 7. Decisiones y comprobaciones restantes

- Aprobar o ajustar plazos y condiciones propuestos de soporte/salida/conservación.
- Fijar fundamento y plazo de evidencia legal no cubierta por papeles de comercio.
- Acreditar términos aplicables de Google, Vercel y correo sin compartir secretos.
- Designar y verificar responsables/personas o áreas de privacidad de Dusema y
  de cada negocio; cerrar contacto y registro de acceso restringido.
- Determinar si la operación de cartera del tenant cae bajo Ley 1266 de 2008 o
  Ley 2573 de 2026 antes de habilitar procesos de reporte o atención de
  suplantación; el repositorio no resuelve el alcance para establecimientos
  comerciales con esta competencia.
- Conciliar flujos activos con cada proveedor, país/región, subencargado,
  instrumento y categorías de datos; no habilitar integraciones sin clasificar.
- Verificar registro restringido de casos, recepción del canal, manejo de adjuntos
  y proceso de supresión; escoger archivo/procedimiento con control de acceso.
- Validar con fixtures y casos autorizados la exportación completa, supresión,
  ciclo Storage, backups, logs y caché local. No prometerlos como implementados
  por estar escritos en una política.
- ADR-SAAS-099 está aceptado para implementar aceptación legal versionada; esa
  aprobación no finaliza los textos ni activa exigibilidad frente a Diana.

## Fuentes

- [Ley 962/2005, artículo 28](https://normativa.archivogeneral.gov.co/ley-962-de-2005/).
- [SIC: temporalidad](https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Concepto_13-183213.pdf).
- [SIC: reclamo directo](https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor/derechos-y-deberes/fallas-en-un-producto).
- [SIC: incidentes](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad).
- [Ley 1581 de 2012, arts. 14, 15, 17 y 18](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Decreto 1074 de 2015, arts. 2.2.2.25.4.4 y 2.2.2.25.5.1–.2](https://cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf).
- [SIC, concepto sobre Firebase y transmisión por cuenta del responsable](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/uso-de-firebase-en-almacenamiento-de-datos-y-cumplimiento-normativo-en-colombia).
- [SIC, alcance de la Circular 002 de 2025](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/alcance-de-la-circular-002-de-2025-sobre-transferencias-internacionales-de-datos).
- [Ley 2573 de 2026](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_2573_2026.htm).

Los plazos recomendados de 30/60/90 días, 12 meses y soporte/salida no provienen
de una obligación general de SaaS: son decisiones comerciales/operativas pendientes.
