# Revisión paralela — política y aviso de privacidad

**Corte:** 2026-11-25
**Rama revisada:** `codex/e2-2-legal-acceptance`
**HEAD revisado:** `22314854be5c4471dc713f452f1e18045cf764dc`
**Alcance:** contraste documental de `docs/legal/politica-tratamiento.md` y `docs/legal/aviso-autorizacion.md` con el flujo de aceptación y formularios visibles en el código y con normas/fuentes oficiales colombianas. Este memo no es dictamen jurídico, no cambia los documentos versionados ni sus hashes, no altera `BORRADOR`/`PREPARACIÓN` y no acredita funcionamiento en producción.

## Resultado

Los borradores distinguen correctamente el contrato SaaS de la autorización personal y separan, en principio, los datos propios de Dusema de los datos del negocio cliente. Esa separación coincide con el modelo del POS y debe conservarse.

No están listos para publicación. El artículo 2.2.2.25.3.1 del Decreto 1074 exige que la política identifique responsable y contacto, tratamiento/finalidades que no queden en el aviso, derechos, persona o área y procedimiento, fecha de vigencia y período de vigencia de las bases. En el borrador, la identidad/calidad fiscal, persona/área, canales probados, alcance real de finalidades, fecha de entrada en vigor y períodos de las bases siguen expresamente pendientes. La Ley 1581 y el Decreto 1377 también exigen autorización previa e informada como regla general, salvo excepciones legales concretas; una lectura del documento, el login del administrador o la aceptación del contrato no demuestran por sí solos la autorización de cada titular.

## Flujo observado y correspondencia documental

| Flujo o formulario | Evidencia en código | Correspondencia y límite |
|---|---|---|
| Inicio de sesión de admin tenant | `app/(tenant)/admin/login/page.tsx:84-88` presenta enlaces a términos, política, anexo y aviso antes de los campos de acceso. | Da acceso a información de Dusema. No es una manifestación de autorización ni acredita que un representante legal haya sido verificado. Los textos v0.2 continúan borradores. |
| Inicio de sesión POS vendedor | `components/pos/login-screen.tsx:62-64` enlaza política y aviso antes del código/PIN. | Es una vía de acceso al aviso de Dusema. No entrega por sí sola el aviso del negocio del tenant al vendedor ni registra autorización de este para las finalidades que el tenant determine. |
| Inicio de sesión Backoffice | `app/backoffice/login/page.tsx:56-58` enlaza política y aviso antes de correo/contraseña. | Es el flujo con datos propios de las cuentas de plataforma. No se encontró una aceptación/autorización de tratamiento separada en esta pantalla. Falta un proceso verificable para poner el aviso y la autorización aplicable a disposición antes de crear o activar esas cuentas. |
| Aceptación contractual de admin tenant | `components/legal/admin-legal-documents.tsx:181-185`; `functions/src/legal/handler.ts:301-346`. Solicita aceptación de Términos/Anexo y declaración de facultad; servidor exige membresía admin. | Es correcto que no marque política/aviso como consentimiento personal. El recibo registra una declaración de representación, no verifica exteriormente la facultad. La función rechaza el bundle mientras está en `PREPARACION` y los documentos estén `BORRADOR`. |
| Alta de usuarios del tenant | `app/(tenant)/admin/(authenticated)/usuarios/page.tsx:39,56-63,292-302`; crea nombre y rol; el sistema administra credenciales/código. | El tenant decide registrar datos de su personal; el tenant debe comunicar su política/aviso y obtener autorización cuando aplique. El formulario no presenta una constancia para el empleado. El enlace de login no prueba que la persona cuyos datos cargó el administrador recibió el aviso. |
| Directorio de clientes | `components/pos/clientes-module.tsx:45,283-302`; nombre obligatorio, cédula/NIT y teléfono opcionales; registros asociados a ventas/cartera. | El formulario no enlaza el aviso del tenant ni registra autorización. El negocio puede hacerlo por papel, oralmente o por otro medio legal que deje evidencia consultable; el POS no demuestra hoy ese paso. No debe afirmarse que el enlace de Dusema sustituye la política del negocio. |
| Directorio de proveedores | `components/pos/proveedores-module.tsx:21,187`; nombre, NIT, teléfono, correo y dirección son campos editables. | Puede contener datos de contacto de una persona natural. La política debe indicar que el tenant determina finalidad y aviso para esos contactos; verificar qué campos son efectivamente enviados/obligatorios y no describir solo datos corporativos. |
| Recordar código de acceso | `lib/auth/admin-username-storage.ts` y `lib/auth/operator-code-storage.ts`; las pantallas guardan solo el código en `localStorage`, nunca el PIN. El valor no tiene vencimiento automático y los controles parten marcados. | La política menciona almacenamiento local de forma general, pero no indica qué identificador se conserva ni su duración. Corregir el texto o cambiar el valor inicial del control a desmarcado antes de publicar; preferencia de privacidad recomendada: desmarcado por defecto. No describirlo como cookie si el inventario confirma que se usa `localStorage`. |
| Notificaciones | `lib/fcm-token-helper.ts` obtiene token solo con soporte, permiso `Notification` concedido y service worker; `lib/notificaciones-push.ts` lo usa para entrega. | La política debe nombrar token de push/identificador de dispositivo y finalidad de avisos operativos cuando se habilite. El permiso del navegador se limita a notificaciones del dispositivo; no acredita aceptación de publicidad ni una autorización general de tratamiento. El retiro del token al cerrar sesión es best-effort, por lo que no prometer borrado inmediato. |

### Discrepancia principal de captura

El POS captura datos de clientes y proveedores por cuenta del negocio, pero esas pantallas no presentan el aviso del propio negocio ni guardan evidencia de autorización. Esto no obliga automáticamente a implementar una casilla dentro del POS: el Decreto 1377 permite obtener la autorización por escrito, oralmente o por conducta inequívoca consultable, y la regulación no prescribe un único componente de interfaz. Sí requiere que el negocio responsable informe al titular antes o a más tardar al recolectar, obtenga autorización si no aplica excepción y conserve su prueba. Mientras el producto no apoye ese registro, el DPA y la capacitación deben decir expresamente que se gestiona fuera del POS y no presentar el sistema como evidencia de dicha autorización.

El negocio debe tratar por separado su propia base de clientes/proveedores y los datos laborales de sus operadores. La casilla del contrato SaaS no autoriza datos de esos titulares. Dusema, a su vez, debe identificar qué datos procesa como responsable propio para cuenta de Backoffice, seguridad y contratación, y cuáles procesa por instrucciones del tenant.

## Correcciones textuales recomendadas — sin aplicar en documentos con hash

### 1. Política, sección 2.1: reemplazar categorías genéricas por el inventario comprobado

El cuadro actual («Identificación y contacto de contratantes», «Usuarios autorizados y registros técnicos», «Datos de soporte», «Información comercial del servicio») es un buen esquema, pero aún no representa suficientemente los datos observados. Después de verificar los campos y logs activos por entorno, separar al menos:

- **Cuenta y acceso de plataforma:** correo de acceso, UID/identificadores de Auth, datos de rol/facultades, registros de acceso y seguridad que efectivamente se conserven.
- **Acceso del tenant:** nombre/rol/código de operador y referencias de autenticación; identificar si el correo generado para Auth es un identificador interno o un dato de contacto real.
- **Identificador guardado en el dispositivo:** código de usuario en `localStorage`, solo cuando la opción está activada; permanece hasta que el usuario la desactive/borre almacenamiento del navegador, según la implementación observada.
- **Notificaciones:** token FCM y estado de permiso, cuando el titular activa notificaciones; finalidades operativas concretas y condiciones de retiro/limpieza best-effort.
- **Soporte, contratación y facturación:** campos realmente usados y evidencia estrictamente necesaria; no incluir datos de titulares del negocio como si Dusema determinara su finalidad.

No enumerar logs, datos de pago o campos de soporte como si estuvieran guardados si el inventario técnico de producción no confirma su persistencia. Anotar las finalidades, operaciones y tiempo de conservación por categoría, no con una finalidad abierta como «administración propia».

### 2. Política, sección 2.2: concretar datos y operaciones por cuenta del negocio

Sustituir «los datos personales incluidos por el negocio ... y sus operaciones» por una descripción que refleje el catálogo y el POS:

> «Según módulos habilitados, el negocio puede registrar nombre, documento y teléfono de clientes; nombre, NIT, teléfono, correo y dirección de proveedores; nombre y rol de sus operadores; y referencias de pedidos, ventas, compras, pagos, cartera, abonos e inventario asociadas a esas personas. El negocio define la finalidad de cada dato y debe limitar su captura a lo necesario. En particular, documento y teléfono de clientes son opcionales en el formulario actual; su uso debe justificarse para identificar al cliente, atender pedidos y administrar el saldo/abonos cuando el negocio otorgue plazo. No se usan esos datos para publicidad de Dusema.»

Este texto debe ajustarse si se confirma otro campo, módulo habilitado, subcolección o uso. Para clientes y contactos capturados por el tenant, indicar que el tenant pone su aviso/política a disposición antes o a más tardar en la recolección. El enlace `/privacidad` es la política de Dusema, no la política particular de cada negocio.

### 3. Política, sección 3 y aviso, sección «Autorización»: explicar la regla y sus excepciones

La frase de la política «Cuando la ley exija autorización» y el encabezado del aviso «solo si es legalmente necesaria» pueden leerse como si la autorización fuera excepcional. Propuesta de reemplazo:

> «Como regla general, antes o a más tardar al recolectar datos personales, el responsable obtiene autorización previa, expresa e informada por un medio que permita consultarla posteriormente. Solo puede tratar sin autorización en los supuestos taxativos aplicables del artículo 10 de la Ley 1581 de 2012; cuando invoque uno, debe identificar y documentar el fundamento para ese tratamiento. Al solicitar autorización, informa claramente datos, finalidades específicas, derechos y datos de contacto del responsable; las preguntas sobre datos sensibles o de niñas, niños y adolescentes son facultativas y se informan como tales. El responsable conserva prueba.»

Agregar una línea expresa: «El silencio, una casilla premarcada, la sola navegación o que un administrador cargue los datos de otra persona no demuestran por sí solos autorización de ese titular». Si se decide usar formulario electrónico, que empiece desmarcado, muestre los fines concretos y el texto/versión, y guarde evidencia consultable de actor, fecha, finalidad y documento. La ley permite otros medios; la casilla no es mandato legal universal.

### 4. Aviso, título y alcance: no presentarlo como si ya recogiera autorización

El título «Aviso de privacidad y autorización» y la nota «no registra consentimientos» conviven con una sección de diseño futuro. Para el documento público, renombrar a **«Aviso de privacidad de Dusema POS»** y reservar «autorización» para un formulario/registro concreto por titular y finalidad. Mantener la explicación de que el negocio es responsable por los datos que introduce. Hasta que haya un proceso real para sus clientes/empleados, agregar:

> «Dusema POS no registra en esta pantalla la autorización de los clientes ni del personal del negocio. El administrador debe entregarles el aviso y la política de su negocio y obtener/conservar la autorización cuando aplique, usando el proceso propio del negocio. La aceptación del contrato SaaS no cumple ese paso.»

Esta indicación describe el estado actual; retirarla solo después de implementar y probar un flujo o evidencia equivalente.

### 5. Menores y sensibles: precisar la capacidad actual

La política afirma que el servicio no los solicita como requisito ordinario, pero el formulario de cliente no captura edad ni bloquea registrar personas menores; solo captura nombre/documento/teléfono. Cambiar por una descripción factual:

> «Los formularios actuales no incluyen campos específicos de edad o datos sensibles. El registro de clientes no valida edad; por ello no podemos afirmar que el negocio nunca cargue datos de una persona menor. El negocio no debe cargar datos de menores o sensibles en este módulo hasta que exista una evaluación, finalidad, aviso, autorización y salvaguardas adecuadas al caso.»

La instrucción de operación para Bodega debe ser acordada por el responsable del negocio; no inventar una validación de edad que el código no hace.

### 6. Política, secciones 4 y 6: no dejar mínimos obligatorios en estado «propuesto»

Antes de publicar, reemplazar «propuesta», «pendiente» y «debe probarse» por datos confirmados de: identidad/naturaleza del responsable; persona o área formalmente designada; canales que reciben y dan respuesta; procedimientos operativos; fecha de entrada en vigor; período de vigencia de cada base/categoría; y tabla de conservación con supresión, bloqueo legal y expiración residual. No copiar automáticamente plazos de 30/60/12 meses de la hoja operativa: son propuestas y la eliminación real no está certificada. Los períodos deben coincidir con jobs, respaldos, logs, Auth, Storage y contratos de proveedores, o describir claramente los límites cuando no sea posible una purga simultánea.

## Datos/decisiones no disponibles que impiden cerrar el texto

1. **Identidad del responsable:** falta cotejar el RUT y establecer si el prestador opera como persona natural o mediante persona jurídica; esto define la identificación legal que aparecerá en política/aviso y el análisis de RNBD.
2. **Persona/área y canales:** la persona propuesta no está formalmente designada; el correo/teléfono/dirección constan declarados pero falta comprobar recepción, atención, escalamiento y archivo restringido.
3. **Flujos de recolección:** falta una matriz completa por formulario y entorno de campos, finalidad, obligatoriedad, fuente, roles, proveedor receptor, evidencia y tiempo de conservación. No afirmar que los borradores ya agotan los datos transmitidos por integraciones condicionales o logs.
4. **Autorización Dusema:** no se encontró evidencia de un proceso de captura/archivo de autorización personal para las cuentas directas de operador de plataforma. Determinar si el proceso será externo (con evidencia) o se añadirá al alta de operador antes de que Dusema trate esos datos para finalidades propias que requieran autorización.
5. **Autorización del tenant:** no se encontró aviso ni constancia en los formularios de clientes/proveedores/usuarios del tenant. Decidir si el cliente lo gestiona externamente y queda obligado a conservar prueba, o si se aprueba un cambio funcional/ADR para que POS presente y registre avisos/autorizaciones. Ninguna alternativa permite inferir autorización por la aceptación del contrato SaaS.
6. **Identificadores del dispositivo:** recordar usuario/código queda activado por defecto y persiste en almacenamiento local sin expiración temporal. Recomiendo valor inicial desmarcado; si se conserva activado por defecto, el aviso debe explicarlo claramente y el usuario debe poder desactivarlo y borrar el valor.
7. **Menores:** no hay edad/validación en el directorio de clientes. Debe definirse si el negocio prohíbe registrar menores, si el producto los excluye o si existe un proceso diferenciado antes de afirmar que no se tratan esos datos.

## Fuentes primarias consultadas

- [Ley 1581 de 2012, Gestor Normativo de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981): arts. 4 (finalidad/libertad), 9 (autorización), 10 (excepciones), 12 (información previa y prueba) y 15–18 (derechos/deberes).
- [Decreto 1377 de 2013, Gestor Normativo de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646): arts. 4–7 (necesidad, autorización previa, prueba y forma de obtenerla; silencio no equivale), 13 (contenido mínimo de política), 14–16 (aviso, contenido y conservación de modelo) y 17–18 (medios de difusión y acceso a procedimientos). Se revisó su texto oficial vigente al corte; el Decreto 1074 recoge estas reglas.
- [Decreto 1074 de 2015, texto oficial de Función Pública](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608): arts. 2.2.2.25.3.1 (contenido de política), 2.2.2.25.4.4 (persona o área), 2.2.2.25.5.1–.2 (transmisión/contrato con encargado).
- [SIC, concepto «Políticas de tratamiento de datos personales»](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/politicas-de-tratamiento-de-datos-personales): políticas en medio físico/electrónico y disponibles al titular; aviso informa existencia, acceso y finalidad; la SIC no expide certificación de cumplimiento de la política.
- [SIC, material sobre autorización](https://sedeelectronica.sic.gov.co/sites/default/files/publicaciones/Concepto_Tratamiento.pdf): autorización previa, expresa e informada; debe permitir consulta posterior e informar finalidad específica.

## Conclusión del memo

La estructura del texto 0.2 puede conservarse, con los ajustes anteriores. No recomiendo marcarlo como vigente ni convertir el aviso en un consentimiento general. La publicación depende de hechos verificables y decisiones de operación que hoy faltan. La revisión no certifica cumplimiento integral, validez de representación empresarial, aptitud contractual de proveedores ni operación de los canales.
