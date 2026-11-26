# Revisión normativa y operativa — corte 2026-11-25

Estado: **NO LISTO PARA EXIGIR ACEPTACIÓN EN PRODUCCIÓN**.
Alcance: borradores 0.2, implementación propuesta en PR #706 sobre
`main@aa1c4fe` y fuentes oficiales accesibles durante esta revisión. No equivale
a dictamen jurídico ni a una búsqueda exhaustiva
de toda la legislación o de decisiones no indexadas a noviembre de 2026.

## Resultado

Los datos de identificación ya están completos según declaración del prestador.
Los textos mejoran la separación contrato/autorización y responsable/encargado.
Todavía faltan decisiones y evidencias operativas para publicarlos como finales.
Un checkbox por sí solo no acredita cumplimiento de protección de datos.

Actualización del mismo corte: se verificaron metadatos remotos del backup diario
de 35 días y regiones de recursos, y se concretaron las alternativas en
[operación y conservación](OPERACION-Y-CONSERVACION.md). No se ejecutó restore ni
se probó exportación completa. PR #704 retiró Analytics y deshabilitó despliegues
Git automáticos de Vercel en todas las ramas. La caché persistente continúa en
código. La revisión autenticada del 2026-11-24 encontró que el preview más
reciente de #706 usa un commit anterior al actual y que el alias `.vercel.app`
observado requiere SSO; no revisó el contenido ni eliminó previews históricos.

La comprobación posterior del equipo Vercel confirmó `hobby`; el DPA público
Pro/Enterprise no acredita cobertura de esa cuenta. Véase
[expediente de proveedores](PROVEEDORES-EVIDENCIA-2026-11.md). Se identificó
también que los ciclos internos Google impiden extender el plazo del schedule
Firestore a una promesa global de eliminación física. ADR-SAAS-100 fue aceptado
para implementar y probar de forma controlada la entrega completa por tenant;
la exportación integral todavía no está certificada ni habilitada para datos reales.

El [cierre de comprobaciones](CIERRE-COMPROBACIONES-2026-11.md) registra el estado
real: hay herramientas locales de exportación y supresión con datos sintéticos,
pero ninguna está certificada para producción. El exportador no ha leído datos
reales; la supresión no se ha ejecutado contra datos reales ni cubre Auth,
Storage o la eliminación física de respaldos.

| Requisito | Resultado y acción necesaria |
|---|---|
| Identificar al prestador | Incluye nombre, NIT, dirección, correo y teléfono declarados. El extracto del RUT que el prestador suministró el 2026-11-26 se cotejó con los campos de identificación de los borradores; no se hizo consulta independiente a DIAN. El borrador identifica la dirección como judicial. |
| Términos accesibles y conservables | En `main`, `/terminos` sigue referido a coworking y reservas. PR #706 lo reemplaza por borradores versionados y descargables; la versión final y su publicación siguen pendientes. |
| Oferta y condiciones particulares | ADR-SAAS-028/029 conservan snapshots. Aceptación legal no puede modificar precio, Trial, vigencia ni capacidades. |
| Prueba de aceptación | PR #706 implementa el registro de ADR-SAAS-099 y presenta la versión exacta de los documentos junto con el snapshot comercial. El recibo vincula relación, actor, bundle, versiones, condiciones comerciales y huella; consulta y reintento verifican su integridad. El 2026-11-24 se desplegaron las dos callables y Rules en staging y producción; Rules coincide con el candidato y ambas callables responden `UNAUTHENTICATED` sin credenciales. El PR sigue abierto en draft y App Hosting no recibió el candidato. No se ejecutó smoke autenticado ni se registraron aceptaciones durante el corte. |
| Autorización de datos | Debe informarse antes de recoger datos y obtenerse cuando proceda; contrato empresarial no autoriza por todos los titulares. |
| Consultas/reclamos | Sebastián Agudelo Muñoz está designado por el prestador como contacto operativo principal de privacidad. No hay suplente; es un riesgo de continuidad, no un requisito legal autónomo identificado. En staging, el runtime `6f218eb` está en 100 % y un smoke autenticado creó y leyó una recepción sintética incompleta (`RECIBIDO`, vencimiento 2026-12-02); no probó identidad, anotación, aislamiento negativo ni cierre con el runtime actual. Existe un caso sintético histórico cerrado, pero corresponde al despliegue anterior `0248b1fe`. Los canales externos no están verificados independientemente. |
| Conservación | Falta matriz con plazos justificados por categoría y respaldo. No inventar diez años para toda la información. |
| Proveedores y circulación internacional | PR #704 retiró Analytics y detuvo nuevos despliegues Git de Vercel. En la revisión del 2026-11-26 se retiraron 106 previews y el alias público Café Atrato; cuatro deployments `Production` siguen en Vercel detrás de SSO, con plan Hobby y aptitud contractual residual sin resolver. También faltan acuerdos Google/correo/GitHub y ubicaciones efectivas. La inspección de código del 2026-11-25 identificó además Wompi, Make.com, Google Maps/Fonts y el envío del CUFE a la consulta DIAN en superficies heredadas/condicionales; no se confirmó su activación en runtime ni su pertenencia al servicio Dusema contratado. El inventario debe conciliarlos antes de publicar. Tener Firebase no prueba por sí solo un contrato de transmisión suficiente. |
| Incidentes | Hace falta procedimiento practicable, evidencia de detección, evaluación y canal SIC aplicable. No esperar a estar obligado al RNBD. |
| RNBD | El RUT suministrado confirma persona natural. La regla vigente de la SIC incluye sociedades y entidades sin ánimo de lucro con activos totales iguales o superiores a 100.000 UVT, y personas jurídicas públicas; no incluye a personas naturales por ese solo carácter. Con la información disponible no se atribuye al prestador una obligación de inscripción por ser persona natural; las demás obligaciones de protección de datos subsisten. |
| Consumo electrónico | Aplicabilidad por relación concreta. Añadida Ley 2439/2024, información previa, aceptación y retracto cuando proceda; cerrar reclamaciones y constancia de contratación en el flujo. |
| Comunicaciones | No incluir publicidad en aceptación obligatoria. Revisar Ley 2300/2023 si se habilita cobranza/contacto comercial y el régimen aplica. |
| Suplantación en obligaciones de crédito | La regla general de vigencia de la Ley Estatutaria 2573/2026 comenzó el 19-11-2026, seis meses después de su promulgación el 19-05-2026; los parágrafos 1 y 2 del artículo 5 rigen desde la promulgación. La SFC expidió la Carta Circular 77 el 18-11-2026 con un protocolo dirigido a entidades bajo su vigilancia; no se extiende automáticamente a Dusema ni a todos los comercios. En su Boletín Jurídico 124, la SFC indica que la expresión “demás establecimientos comerciales con esta competencia” carece de definición en la ley y que trasladó a la SIC la pregunta de alcance. Para los artículos 7 y 8 identifica como elemento relevante si la entidad es fuente de información respecto de la obligación discutida. En la inspección del código no se encontró integración de Dusema con operadores de información ni flujo específico de suplantación; tampoco se acreditó que Dusema o sus clientes actúen como fuente respecto de esas obligaciones. Una búsqueda de fuentes SIC oficiales al 25-11 no localizó un protocolo general, pero no prueba que no exista. No concluir que Dusema o todos sus clientes estén dentro o fuera del ámbito. Antes de declarar listos los flujos de crédito y privacidad, obtener análisis jurídico por rol y definir si algún negocio requiere un procedimiento distinto al trámite de consultas/reclamos de la Ley 1581. |
| Fiscalidad | Recibo interno no es factura DIAN. Revisar por separado deberes tributarios del prestador; estos textos no los satisfacen. |
| Sesión, PWA y almacenamiento | Código confirma recordatorio opcional del código en admin y sesión Firebase. Inventariar persistencia y permisos antes de describirlos como definitivos. |

## Implementación técnica aprobada

El responsable aceptó ADR-SAAS-099 el 2026-11-23 para implementar los documentos
públicos versionados y el registro server-side de aceptación contractual del
representante administrador. El 2026-11-24 se desplegaron las dos callables del
codebase `saas-legal` y las Rules en staging y producción desde el candidato
`81ba393f2f85956934b484f0ae9b32923b10e0aa`. El bundle sigue en `PREPARACION`:
los textos continúan siendo borradores, no se aceptan y no se bloquean accesos.
El PR permanece abierto en draft, por lo que App Hosting no ha recibido este
candidato. No se hizo smoke autenticado ni se registraron aceptaciones. La
aceptación contractual tampoco representa autorización personal de clientes,
empleados u otros titulares. Los pendientes de la tabla siguen abiertos antes de
declarar los documentos vigentes o exigirlos.

## Fuentes y vigencia observada

- [Ley 1581, texto en AGN](https://normativa.archivogeneral.gov.co/ley-estatutaria-1581-de-2012/): autorización, derechos y procedimiento de consultas/reclamos.
- [Ley 4 de 1913, artículos 59–62](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=8426) y [Concepto 148831 de 2025 — Función Pública](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=261616): soporte general para cómputo de términos en días y tratamiento ordinario del sábado como hábil salvo regla general aplicable en contrario. El concepto de Función Pública trata un caso de empleo público y no es decisión de la SIC sobre la Ley 1581.
- [Corte Suprema de Justicia, sentencia de 28 de marzo de 1984](https://cortesuprema.gov.co/corte/wp-content/uploads/2022/07/SC-28-03-1984.pdf): interpreta que el artículo 62 regula plazos legales también en relaciones entre particulares. La referencia de sábado incluida en conceptos administrativos no se toma como resolución concluyente de la vacancia operativa de Dusema.
- [Decreto 1074, protección de datos](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm) y [transmisiones](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm). Parte de las aperturas directas devolvieron 403; se contrastaron los extractos oficiales indexados con las fuentes SIC.
- [Ley 1480 consolidada](https://jurinfo.jep.gov.co/Normograma/compilacion/docs/ley_1480_2011.htm), artículos 47–50 y 58: incluye notas de Ley 2439/2024. No usar versiones anteriores para plazos de devolución. Deben respetarse también las notas de vigencia/jurisprudencia del texto consolidado.
- [Ley 2439/2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116): modifica comercio electrónico en relaciones de consumo. Apertura directa intermitente (502), contrastada con texto consolidado JEP.
- [SIC: obligados al RNBD](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd).
- [Resolución SIC 56579 de 2025, art. 12](https://sedeelectronica.sic.gov.co/sites/default/files/normativa/Resoluci%C3%B3n%20No.%2056579-2025.pdf): texto vigente del numeral 2.2 del Título V de la Circular Única; contempla sociedades y ESAL con activos totales iguales o superiores a 100.000 UVT y personas jurídicas públicas.
- [SIC: reporte de incidentes](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad): describe el plazo de quince días hábiles en el supuesto allí señalado; el procedimiento debe verificar el hito de cómputo y canal vigente.
- [Ley 2300/2023](https://jurinfo.jep.gov.co/Normograma/Compilacion/docs/ley_2300_2023.htm): canales y límites de contacto cuando aplica. No habilita por sí sola notificaciones o publicidad.
- [Ley Estatutaria 2573/2026](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_2573_2026.htm): vigencia general desde el 19-11-2026, con los parágrafos 1 y 2 del artículo 5 vigentes desde promulgación. La [Carta Circular 77 de la SFC](https://www.superfinanciera.gov.co/publicaciones/10115975/cartas-circulares-2026/) (18-11-2026) informa el protocolo destinado a entidades vigiladas por esa Superintendencia. El [Boletín Jurídico 124 de la SFC](https://www.superfinanciera.gov.co/publicaciones/10116313/boletin-juridico-no-124/) confirma que la expresión “demás establecimientos comerciales con esta competencia” no está definida y que trasladó preguntas de alcance a la SIC; el criterio de fuente de información citado trata los artículos 7 y 8 en el contexto analizado por la SFC. Una búsqueda oficial de la SIC al 25-11 no localizó un protocolo general; el resultado no demuestra su inexistencia.
- [Circular SIC 002/2025](https://sedeelectronica.sic.gov.co/sites/default/files/normativa/CE%20002-2025%20-%20Circular%20Transferencia%20de%20Tecnologi%CC%81a.pdf): revisar aplicabilidad al proceso concreto de transferencia de tecnología, sin confundirlo con cualquier transmisión de datos.
- [Circular SIC 002/2026](https://jurinfo.jep.gov.co/Normograma/compilacion/docs/circular_superindustria_0002_2026.htm): trata fines políticos/electorales; no se usa como obligación específica de este POS.
- [Cámara: proyecto de protección de datos](https://www.camara.gov.co/proteccion-de-datos-personales/): la fuente lo presenta como proyecto. No se ha acreditado sanción de una reforma que sustituya la Ley 1581 en este corte; no tratar el proyecto como ley vigente.

## Evidencia de código y límites

- `app/(tenant)/admin/login/page.tsx`: autentica por código/PIN y redirige a admin;
  no valida representación legal. El rol `marketing` también puede alcanzar el
  panel, por lo que entrar a admin no basta para aceptar por el negocio.
- `app/(tenant)/admin/(authenticated)/layout.tsx`: `AdminGuard` y
  `CommercialProfileGate`; no existe aquí un gate legal versionado.
- `components/tenant/tenant-access-guard.tsx`: verifica contexto/configuración;
  no constituye evidencia de aceptación.
- `functions/src/platform/commercial-callable.ts`: autoridad de operador SaaS;
  no reutilizarla como permiso del cliente para aceptar su propio contrato.
- `firestore.rules`: relaciones contractuales sin acceso directo de cliente.
  Evitar introducir escrituras legales desde navegador.

Se consultó Context7 para el modelo callable de Firebase y el bypass de Rules
del Admin SDK. La autorización tenant debe comprobarse explícitamente en servidor.

## Estado tras la aprobación del diseño

ADR-SAAS-099 fue aceptado para implementar autoridad y persistencia de la
aceptación contractual. Los proveedores, conservación y términos de soporte/salida
siguen pendientes antes de publicar textos finales o activar enforcement. La
revisión jurídica no reemplaza esos datos operativos faltantes.

## Revisión documental y decisión de vigencia — 2026-11-25

En la rama de PR #706 se revisaron los cuatro documentos 0.2 y sus copias
públicas. Los pares internos/públicos tienen bytes idénticos y el catálogo
legal se sincronizó con sus hashes SHA-256 normalizados. Se mantuvieron
`BORRADOR` y `PREPARACION`; no se habilitaron aceptaciones. Los logins de admin
tenant, Backoffice y POS muestran enlaces a privacidad/aviso antes de pedir
credenciales; solo el admin tenant ve además los documentos contractuales. Los
enlaces no registran autorización ni consentimiento.

Decisión del revisor técnico: **NO APROBADO PARA VIGENCIA O EXIGIBILIDAD** con
la evidencia actual. Siguen pendientes el cotejo de identificación/dirección y
calidad fiscal con el RUT; designar formalmente a la persona o área de privacidad
y probar canales y archivo restringido; determinar proveedores, cuentas,
subencargados, flujos y ubicaciones que realmente operan; cerrar finalidades,
instrucciones y bases jurídicas por tratamiento; probar un smoke autenticado;
y certificar exportación y supresión reales. Los plazos de retención/salida son
propuestas no aprobadas, no hay limpieza automática certificada, y el alcance de
las Leyes 1266/2573 para cartera/suplantación requiere determinarse por actividad.
La revisión es técnica/documental, no dictamen jurídico ni certificación
integral.

## Auditoría de autoridad y captura de datos — HEAD 22314854 — 2026-11-25

La revisión estática del candidato no encontró un bypass obvio de autorización
ni de aislamiento en las funciones legales examinadas. La callable de aceptación
revalida membresía `admin` y registra la declaración afirmativa de facultad; no
verifica por una fuente externa la representación legal. Esto sigue el diseño
aceptado en ADR-SAAS-099. El recibo acredita una declaración del administrador,
no una verificación independiente de representación. No se debe describirlo ni
publicarlo como tal.

El formulario POS de clientes recoge nombre, documento y teléfono sin mostrar
un aviso al titular ni registrar una autorización por persona. El aviso 0.2
asigna correctamente al negocio cliente la responsabilidad de informar y obtener
autorización cuando corresponda, y aclara que la aceptación del contrato SaaS no
cubre a terceros. No se observó el proceso externo que usaría cada negocio; por
tanto, no se certifica que el registro de clientes esté precedido por aviso o
autorización válida. Antes de habilitar este flujo como legalmente verificado se
debe comprobar ese procedimiento con el negocio o aprobar un diseño separado
para informar y registrar autorizaciones dentro del POS. No se infiere una
infracción automática ni se guarda una autorización genérica en nombre del
titular.

El smoke autenticado positivo de staging y la recepción de correo desde una
cuenta externa no se verificaron en esta auditoría. El gate de aceptación sigue
en `PREPARACION`, por lo que el candidato no registra aceptaciones.

## Revisión de imágenes de eventos públicas — 2026-11-26

La ruta de administración sube imágenes a
`tenants/{empresaId}/eventos/{eventoId}/{archivo}`. `storage.rules` permite
lectura anónima para ese prefijo, y la página pública usa la URL descargable.
El formulario decía solo que el archivo se almacenaba dentro del tenant, sin
explicar su visibilidad. Además, `eliminarEvento` borra el documento Firestore,
pero no el objeto Storage; una persona que conserve la URL puede seguir
consultándolo. No se inspeccionaron objetos reales ni se cambió Storage Rules.

La interfaz ahora advierte sobre la publicación pública y la persistencia del
archivo después de borrar el evento. La política y el anexo de trabajo 0.5
describen el comportamiento; 0.4 permanece inmutable. Sigue pendiente un flujo
controlado para retirar assets de forma verificable, con tratamiento de fallos
entre Firestore y Storage. No se declara que la eliminación completa esté
implementada.

La [SIC explica](https://sedeelectronica.sic.gov.co/noticias/sic-expide-guia-para-el-correcto-tratamiento-de-las-fotografias-como-datos-personales)
que una fotografía es dato personal cuando permite identificar a una o varias
personas naturales. Esta referencia fundamenta el aviso preventivo, no determina
la base jurídica de cada publicación.
