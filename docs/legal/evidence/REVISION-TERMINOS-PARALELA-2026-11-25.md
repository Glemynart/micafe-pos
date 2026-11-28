# Revisión paralela de términos del servicio — 2026-11-25

**Estado:** memo interno; no sustituye asesoría jurídica, no aprueba la versión
0.2 y no autoriza publicación, aceptación ni cambio de estado.

## Alcance comprobado

Revisé `docs/legal/terminos-servicio.md`, la copia pública
`public/legal/v0.2/terminos-servicio.md`, su catálogo y huella, la ruta
`/terminos`, el componente de aceptación del administrador, la superficie de
PR #706 y las notas de revisión vigentes en el branch. El árbol local muestra
que la copia canónica y la pública tienen contenido idéntico normalizado a LF;
la huella normalizada `d1af0b746a61e93bfaae505eced6359d4f807d9f62f952dce8b94e4918feca7c`
coincide con el catálogo y el historial de versión. La diferencia de SHA al
calcular bytes Windows con CRLF no representa una divergencia del documento: las
pruebas de catálogo normalizan CRLF antes de verificar la huella.

El PR #706 sigue en borrador. El bundle está en `PREPARACION` y los documentos
se muestran como borradores no exigibles. No se afirma aquí que el texto esté
vigente ni que la aceptación de la rama esté desplegada o probada en producción.

## Hallazgos concretos

### 1. Condiciones que están bien delimitadas en el borrador

- La Ley 1480/2011 se aplica cuando exista una relación de consumo; el texto no
  asume que cualquier cliente empresarial sea o no sea consumidor solo por su
  forma jurídica. El Estatuto define consumidor según el destino final y la
  relación de la necesidad empresarial con la actividad económica. La
  clasificación concreta de cada contrato sigue siendo factual.
- La descripción del retracto recoge el plazo de cinco días hábiles para
  servicios cuando proceda y la excepción si la prestación comenzó con acuerdo
  del consumidor. No inventa que crear una cuenta equivalga a ese acuerdo.
- El reintegro de hasta quince días calendario está limitado al comercio
  electrónico y a las condiciones del artículo 47, conforme a la modificación
  de Ley 2439/2024. El texto no afirma que exista reembolso automatizado.
- Reversión de pago se separa del retracto y se condiciona a sus presupuestos.
- No se excluyen de forma general reembolsos, responsabilidad por dolo/culpa
  grave ni derechos irrenunciables. La renovación, suspensión, soporte medible y
  salida se mantienen condicionados a que se definan antes de ofrecerlos.

No propongo corregir estos pasajes por el cotejo actual.

### 2. Reclamos: requisito condicional y capacidad no acreditada

La sección 9 dice que se pueden presentar solicitudes/reclamaciones al correo
de contacto y que, cuando aplique consumo, el canal electrónico debe conservar
fecha, seguimiento y respuesta. El borrador y las notas internas indican que
`segucor0526@gmail.com` no fue probado como buzón operativo. Además, en una
relación de consumo celebrada por comercio electrónico, el literal g) del
artículo 50 de la Ley 1480 exige un mecanismo en el mismo medio de comercio
electrónico para radicar PQR, con fecha/hora y seguimiento. La SIC ha aclarado
en decisiones que una opción de contacto simple o un registro exclusivamente
interno no satisface por sí solo ese requisito.

**Acción antes de activar/publicar:** determinar si la oferta/contratación de
Dusema constituye comercio electrónico en una relación de consumo; si sí,
probar un mecanismo accesible en ese medio con acuse, fecha/hora y consulta de
estado. El trámite `/backoffice/privacidad` de #706 es para derechos de datos
personales; no se debe presentar como un canal de PQR de consumo. Si el email
queda como canal de solicitudes no sujetas al artículo 50(g), verificar recepción,
archivo, responsable de seguimiento y entrega de constancia antes de publicarlo.

El artículo 58(5)(c), cuando aplica al requisito de reclamación directa previo a
la acción de protección al consumidor, prevé respuesta dentro de quince días
hábiles. La sección 9 actualmente remite al “término legal correspondiente” sin
nombrar ese plazo. No es una afirmación falsa; se recomienda explicitar el plazo
condicionado para reducir ambigüedad, tras confirmar que la redacción cubre solo
el procedimiento aplicable y no confunde reclamaciones de consumo con
consultas/reclamos de hábeas data, cuyo cómputo está en Ley 1581.

### 3. Oferta, impuestos y constancia

Las secciones 2 y 4 dicen que la oferta aceptada debe identificar precio,
moneda, impuestos, plazo y demás condiciones, y que antes de contratar se debe
informar el precio total y las condiciones; esta formulación debe tratarse como
requisito para la contratación, no como capacidad ya demostrada. La pantalla de
aceptación de #706 declara que el snapshot actual no indica si el precio incluye
IVA u otros cargos y que debe confirmarse antes de publicar condiciones
exigibles. Por ello, no es posible afirmar que el proceso electrónico vigente
garantice hoy la información tributaria completa. La oferta particular debe
registrar explícitamente tratamiento de IVA/impuestos y cargos (o indicar que
no aplican), y exponerlo antes de obtener aceptación.

En contratación de consumo electrónica, también deben verificarse las
obligaciones de información precontractual y mecanismos de corrección/acuse
aplicables antes de decir que el flujo cumple el texto de la sección 4. La
aceptación server-side de #706 registra un snapshot y las huellas documentales,
pero no verifica externamente poder de representación; registra una declaración
expresa del administrador. El texto debe seguir describiendo ese hecho como
declaración, no como validación independiente de facultades.

### 4. Afirmaciones sujetas a soporte operativo

| Texto o promesa | Estado de evidencia | Qué cerrar antes de poner la v0.2 como vigente |
|---|---|---|
| Contacto y recepción de solicitudes por email/teléfono (§1 y §9) | Datos declarados; recepción, monitoreo y archivo restringido no probados | Ensayo sintético de entrada, asignación de responsable/suplente, constancia y seguimiento. |
| Precio total, impuestos y cargos (§2/§4) | El snapshot de aceptación advierte que no refleja inclusión de IVA/cargos | Formalizar en cada oferta y mostrar antes de aceptar. |
| Reclamaciones con fecha, seguimiento y respuesta (§9) | Código #706 tramita privacidad; no se acreditó PQR de consumo ni smoke autenticado | Confirmar alcance de e-commerce/consumo; construir/probar canal requerido cuando aplique. |
| Incidentes y continuidad (§7) | Redacción genérica “conforme al contrato y la ley”; no hay SLA definido | Mantenerla como regla general o fijar compromisos solo cuando tengan dueño, plazo y procedimiento verificables. |
| Salida/retención (§8) | El propio texto remite a acuerdo de salida y matriz pendientes | No prometer plazo/costo/exportación/supresión hasta ensayo y aprobación operativa. |
| Suspensión (§3) | El borrador dice que causales, duración, aviso y restablecimiento deben fijarse en particular | La oferta/contrato concreto debe cubrirlos antes de aplicarlos. |

## Distinción obligación vs. recomendación

- **Obligación legal condicional:** información de oferta y precio total, retracto
  y reintegro donde procedan; enlace visible a SIC; mecanismo de PQR en el mismo
  medio con fecha/hora y seguimiento cuando se da una relación de consumo por
  comercio electrónico; respuesta de reclamación directa dentro de 15 días
  hábiles en el supuesto de art. 58(5); y canales probables de hábeas data con
  prueba de recepción. La aplicabilidad depende de la relación y la operación.
- **Buena práctica/decisión de producto aún no obligatoria por el texto actual:**
  un SLA de soporte, plazo comercial concreto de exportación, ventana de
  transición, formato CSV/JSON, retiro de acceso en cierto número de días y
  matriz de backups. No presentarlos como derechos ya ofrecidos mientras sigan
  como propuesta interna.
- **No se verificó:** situación tributaria del prestador, inclusión de IVA en
  cada plan, representación externa, funcionamiento del buzón, clasificación de
  consumidores por cliente o si el circuito contractual actual constituye
  “comercio electrónico” en cada caso.

## Recomendación documental

No cambiar la etiqueta `BORRADOR/PREPARACION`. Antes de publicar la v0.2, cerrar
la clasificación B2B/consumo por oferta y los puntos de la tabla. En la sección
9, precisar el alcance condicional del correo y del canal PQR; si se mantiene
“las partes pueden presentar … al correo”, probar ese canal y no sugerir que
satisface por sí solo el canal de comercio electrónico exigido cuando aplique.
Después de cualquier edición, regenerar la copia pública y el catálogo/hash en
el mismo cambio versionado; nunca editar solo uno de esos artefactos.

## Fuentes primarias consultadas

- [Ley 1480 de 2011 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306), arts. 46, 47, 50(g), 51 y 58(5).
- [Ley 2439 de 2024 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116), art. 3 (reforma del reintegro por retracto en comercio electrónico).
- [SIC, Resolución 65387 de 2024](https://sedeelectronica.sic.gov.co/sites/default/files/publicaciones/2024065387RE0000000001%20-%20British%20American%20Tobacco.pdf), análisis de canal PQR, constancia/fecha y seguimiento bajo art. 50 de Ley 1480.
- [SIC, sanciones sobre PQR y comercio electrónico](https://sedeelectronica.sic.gov.co/comunicado/la-superintendencia-de-industria-y-comercio-sanciono-diez-empresas-proveedoras-de-bienes-y-servicios-que-promocionaron-sus-productos-por), obligación de registro con fecha/hora, seguimiento, información y enlace SIC.
- [Ley 1581 de 2012 — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981), arts. 14–15, para distinguir los tiempos de consultas/reclamos de datos personales.
