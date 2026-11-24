# Operación, proveedores y conservación — propuesta concreta

Fecha: 2026-11-23. Estado: **PROPUESTO PARA APROBACIÓN; NO ACTIVADO**.
Complementa los borradores y ADR-SAAS-099; no crea obligaciones aceptadas ni
ejecuta borrado, exportación, migración o cambios de proveedor.

La [comprobación posterior](CIERRE-COMPROBACIONES-2026-11.md) confirmó Gmail
personal, términos online Google, soft delete de siete días en Storage y logs
globales de 30/400 días. Los plazos propuestos de esta matriz no son políticas
efectivas de esos servicios; los logs obligatorios se tratan por separado.

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
  Functions en `US-CENTRAL1`. No se listaron objetos ni se leyeron archivos del
  cliente. La retención del backup Firestore no cubre automáticamente Storage.

Comprobación de código, no de telemetría ni de configuración de cuentas:

- `lib/firebase.ts`: caché persistente Firestore con múltiples pestañas.
- `app/layout.tsx`: incluye `@vercel/analytics` cuando `NODE_ENV=production`.
  No se confirmó que el endpoint reciba datos desde el dominio productivo.
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

## 2. Inventario de proveedores

| Proveedor/servicio | Tratamiento identificado | Evidencia y pendiente |
|---|---|---|
| Google / Firebase / Google Cloud | Autenticación, base de datos, ejecución, hosting, archivos, logs y notificaciones según funciones habilitadas | Servicios en código; regiones anteriores confirmadas para recursos indicados. Vincular cuenta/contrato aplicable, versiones de términos y subencargados. No atribuir residencia Brasil a Auth, FCM o soporte sin evidencia específica. |
| Vercel | Builds/previews y componente Analytics | Configuración del repositorio y componente raíz confirmados; plan y alcance efectivo del DPA/Analytics pendientes. Previews deben usar datos sintéticos y no copiar credenciales o datos del tenant. |
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

**Recomendación:** no añadir integraciones. Para el primer corte legal,
retirar Analytics no esencial o acreditar su tratamiento concreto antes de
publicar una política que lo describa. Cualquiera de esas acciones requiere su
corte técnico; este documento no modifica el componente.

## 3. Matriz de conservación propuesta

Los plazos de esta tabla son **propuestas operativas**, salvo la obligación legal
expresamente indicada. No se han configurado TTL ni tareas de eliminación.

| Categoría | Plazo y punto de partida propuestos | Disposición y límite |
|---|---|---|
| Datos operativos del negocio | Durante el contrato; ventana de salida de 30 días calendario tras terminación efectiva | Permitir solicitar entrega; no confundir suspensión temporal por impago con terminación. Borrar o anonimizar de sistemas activos en hasta 60 días calendario desde terminación, tras verificar entrega/instrucciones y ausencia de deber de conservación. |
| Usuarios y membresías exclusivos del tenant terminado | Acceso según contrato; eliminación de datos no necesarios dentro del mismo plazo de 60 días | Verificar dependencias y otros tenants antes de borrar identidad Auth; no borrar UID compartido, credenciales de otro negocio ni evidencia sujeta a conservación. |
| Registros técnicos de seguridad ordinarios | 90 días calendario desde el evento | Plazo recomendado pendiente de contrastar con logging efectivo. Segregar evidencia de incidente o litigio bajo retención justificada y revisión periódica. |
| Soporte ordinario | 12 meses desde cierre del caso | Eliminar adjuntos innecesarios antes y anonimizar métricas. Si el caso es reclamación/contrato/incidente, clasificar su evidencia por fundamento, sin conservar toda la bandeja por defecto. |
| Libros y papeles de comercio del propio prestador | Diez años desde último asiento, documento o comprobante, cuando corresponda a esa categoría | Art. 28 Ley 962/2005. Determinar documentos concretos con revisión contable/jurídica. No aplicar automáticamente a todo el tenant ni a toda telemetría. |
| Aceptaciones y autorizaciones | Mientras sustenten la relación/finalidad y durante el plazo legal justificado para acreditar obligaciones o atender reclamaciones | Clasificar si son papeles de comercio sujetos a diez años; si no, fijar el fundamento y plazo específico antes de crear evidencia. Retener solo documento/versiones y datos probatorios necesarios. No suplir esta decisión con retención infinita. |
| Recordatorio de código en dispositivo | Hasta que el usuario lo desactive, borre almacenamiento o se aplique la política de dispositivo | Es opcional y solo guarda el código. Advertir uso de dispositivos compartidos. No prometer limpieza remota de todos los navegadores. |
| Caché Firestore, PWA y sesión en dispositivo | Ligada al ciclo de uso y cierre seguro de sesión | Pendiente probar limpieza/aislamiento efectivo. No afirmar que logout elimina IndexedDB: no se encontró una limpieza explícita en las superficies inspeccionadas. |
| Backups Firestore | 35 días desde cada snapshot, según schedule comprobado | Un dato suprimido del sistema activo puede persistir en snapshots previos hasta su expiración. Si la supresión activa ocurre como máximo el día 60, el último snapshot que lo incluya podría vencer hasta el día 95; límite derivado condicionado a ejecución real y ausencia de copias adicionales. |
| Archivos Storage, exportaciones y otras copias | Sujetos a matriz específica de objeto/copia | No heredan 35 días de Firestore. Inventariar versiones, soft delete, exportaciones y destinos antes de prometer un máximo global. |

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

## 4. Soporte, privacidad y reclamaciones

Propuesta comercial: atención ordinaria lunes a viernes, 08:00–17:00, hora de
Colombia, excepto festivos. Objetivo inicial de respuesta de soporte: dos días
hábiles. No es compromiso de resolución ni servicio 24/7. No reduce términos
legales, cuya recepción y cómputo se registran por separado aunque lleguen fuera
del horario comercial.

Canales propuestos: correo y teléfono ya declarados; responsable: Sebastián
Agudelo Muñoz. No afirmar disponibilidad o recepción comprobadas. El teléfono
no se anuncia como WhatsApp hasta confirmar que ese canal se ofrece.

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

## 5. Salida y entrega de datos

Propuesta: solicitud de entrega dentro de 30 días calendario desde terminación;
respuesta con alcance y método en dos días hábiles y entrega ordinaria dentro de
diez días hábiles desde verificar identidad/representación. Las obligaciones
legales de acceso gratuito de titulares se atienden por su régimen propio.

Recomendación de precio: incluir una entrega estándar por terminación sin cargo
adicional; trabajos extraordinarios requieren presupuesto y autorización aparte.
Son condiciones propuestas, no acuerdos ya aceptados.

Formato propuesto: CSV/JSON con IDs, referencias, moneda y fechas UTC, más archivos
propios autorizados y manifiesto de alcance, conteos y hashes. Verificar ausencia
de información de otros tenants y excluir secretos, hashes de PIN, tokens,
credenciales e información de plataforma ajena a la entrega. Entregar por canal
autenticado y restringido; evitar adjuntar dumps completos a Gmail.

**Limitación actual:** el CSV de reportes es parcial. No se verificó un exportador
integral tenant-aware listo para usar; un export Firestore de toda la base puede
incluir otros clientes y no se entrega al negocio. La entrega propuesta necesita
una herramienta o procedimiento autorizado y validado antes de prometer esos
plazos. No desarrollar un exportador dentro del PR de aceptación sin admitir
expresamente esa dependencia en el Goal y su diseño.

Preparación técnica: [ADR-SAAS-100](../../ADR-SAAS-100-exportacion-salida-tenant.md),
en Propuesto, define adaptadores para crédito/FIFO/subcolecciones, snapshot de
lectura y exclusión de secretos. Todavía no implementa ni ejecuta el exportador.

La ventana de salida no obliga a mantener ventas o escrituras después del fin
contractual. Solicitud tardía, obligación de conservación o disputa requieren
revisión del caso y derechos aplicables; no autoriza una eliminación precipitada.

## 6. Decisiones y comprobaciones restantes

- Aprobar o ajustar plazos y condiciones propuestos de soporte/salida/conservación.
- Fijar fundamento y plazo de evidencia legal no cubierta por papeles de comercio.
- Acreditar términos aplicables de Google, Vercel y correo sin compartir secretos.
- Verificar registro restringido de casos, recepción del canal, manejo de adjuntos
  y proceso de supresión; escoger archivo/procedimiento con control de acceso.
- Validar exportación completa, ciclo de Storage y caché local. No prometerlos como
  implementados por estar escritos en una política.
- Mantener ADR-SAAS-099 en Propuesto hasta cerrar su aprobación. Su preparación
  puede continuar, pero no activar exigibilidad frente a Diana con estos pendientes.

## Fuentes

- [Ley 962/2005, artículo 28](https://normativa.archivogeneral.gov.co/ley-962-de-2005/).
- [SIC: temporalidad](https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Concepto_13-183213.pdf).
- [SIC: reclamo directo](https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor/derechos-y-deberes/fallas-en-un-producto).
- [SIC: incidentes](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad).

Los plazos recomendados de 30/60/90 días, 12 meses y soporte/salida no provienen
de una obligación general de SaaS: son decisiones comerciales/operativas pendientes.
