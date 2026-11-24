# Revisión normativa y operativa — corte 2026-11-23

Estado: **NO LISTO PARA EXIGIR ACEPTACIÓN EN PRODUCCIÓN**.
Alcance: borradores 0.2, código de `main@ce70af6` y fuentes oficiales accesibles
durante esta revisión. No equivale a dictamen jurídico ni a una búsqueda exhaustiva
de toda la legislación o de decisiones no indexadas a noviembre de 2026.

## Resultado

Los datos de identificación ya están completos según declaración del prestador.
Los textos mejoran la separación contrato/autorización y responsable/encargado.
Todavía faltan decisiones y evidencias operativas para publicarlos como finales.
Un checkbox por sí solo no acredita cumplimiento de protección de datos.

Actualización del mismo corte: se verificaron metadatos remotos del backup diario
de 35 días y regiones de recursos, y se concretaron las alternativas en
[operación y conservación](OPERACION-Y-CONSERVACION.md). No se ejecutó restore ni
se probó exportación completa. La presencia de Analytics y caché persistente
se confirma en código, sin acreditar recepción de eventos o borrado al logout.

La comprobación posterior del equipo Vercel confirmó `hobby`; el DPA público
Pro/Enterprise no acredita cobertura de esa cuenta. Véase
[expediente de proveedores](PROVEEDORES-EVIDENCIA-2026-11.md). Se identificó
también que los ciclos internos Google impiden extender el plazo del schedule
FireStore a una promesa global de eliminación física. ADR-SAAS-100 propone la
entrega completa por tenant, todavía pendiente de aprobación e implementación.

El [cierre de comprobaciones](CIERRE-COMPROBACIONES-2026-11.md) registra los
límites finales: supresión integral y exportador siguen sin implementación
verificada; no son comprobaciones pendientes que se resuelvan con otra auditoría.

| Requisito | Resultado y acción necesaria |
|---|---|
| Identificar al prestador | Incluido nombre, NIT, dirección, correo y teléfono. RUT no verificado. |
| Términos accesibles y conservables | `/terminos` actual sigue referido a coworking y reservas. Sustituirlo con versión final descargable y archivo histórico. |
| Oferta y condiciones particulares | ADR-SAAS-028/029 conservan snapshots. Aceptación legal no puede modificar precio, Trial, vigencia ni capacidades. |
| Prueba de aceptación | No encontré un registro legal versionado en las superficies de login/contrato inspeccionadas. Propuesta en ADR-SAAS-099. |
| Autorización de datos | Debe informarse antes de recoger datos y obtenerse cuando proceda; contrato empresarial no autoriza por todos los titulares. |
| Consultas/reclamos | Plazos y trámite incluidos. Falta establecer registro, responsable de seguimiento y anotación de reclamo en datos afectados. |
| Conservación | Falta matriz con plazos justificados por categoría y respaldo. No inventar diez años para toda la información. |
| Proveedores y circulación internacional | Falta inventario efectivo y comprobar acuerdos con proveedores. Tener Firebase no prueba por sí solo un contrato de transmisión suficiente. |
| Incidentes | Hace falta procedimiento practicable, evidencia de detección, evaluación y canal SIC aplicable. No esperar a estar obligado al RNBD. |
| RNBD | El prestador declarado es persona natural. La lista de obligados publicada por SIC no lo incluye por ese solo carácter; subsisten las demás obligaciones de datos. Reevaluar si cambia el sujeto. |
| Consumo electrónico | Aplicabilidad por relación concreta. Añadida Ley 2439/2024, información previa, aceptación y retracto cuando proceda; cerrar reclamaciones y constancia de contratación en el flujo. |
| Comunicaciones | No incluir publicidad en aceptación obligatoria. Revisar Ley 2300/2023 si se habilita cobranza/contacto comercial y el régimen aplica. |
| Fiscalidad | Recibo interno no es factura DIAN. Revisar por separado deberes tributarios del prestador; estos textos no los satisfacen. |
| Sesión, PWA y almacenamiento | Código confirma recordatorio opcional del código en admin y sesión Firebase. Inventariar persistencia y permisos antes de describirlos como definitivos. |

## Fuentes y vigencia observada

- [Ley 1581, texto en AGN](https://normativa.archivogeneral.gov.co/ley-estatutaria-1581-de-2012/): autorización, derechos y procedimiento de consultas/reclamos.
- [Decreto 1074, protección de datos](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm) y [transmisiones](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm). Parte de las aperturas directas devolvieron 403; se contrastaron los extractos oficiales indexados con las fuentes SIC.
- [Ley 1480 consolidada](https://jurinfo.jep.gov.co/Normograma/compilacion/docs/ley_1480_2011.htm), artículos 47–50 y 58: incluye notas de Ley 2439/2024. No usar versiones anteriores para plazos de devolución. Deben respetarse también las notas de vigencia/jurisprudencia del texto consolidado.
- [Ley 2439/2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116): modifica comercio electrónico en relaciones de consumo. Apertura directa intermitente (502), contrastada con texto consolidado JEP.
- [SIC: obligados al RNBD](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd).
- [SIC: reporte de incidentes](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cumplimiento-de-la-obligacion-del-reporte-de-incidentes-de-seguridad): describe el plazo de quince días hábiles en el supuesto allí señalado; el procedimiento debe verificar el hito de cómputo y canal vigente.
- [Ley 2300/2023](https://jurinfo.jep.gov.co/Normograma/Compilacion/docs/ley_2300_2023.htm): canales y límites de contacto cuando aplica. No habilita por sí sola notificaciones o publicidad.
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

## Decisión solicitada

Aprobar o ajustar ADR-SAAS-099 antes de implementar autoridad, persistencia y
enforcement. En paralelo pueden cerrarse proveedores, conservación y términos de
soporte/salida. La revisión jurídica no reemplaza esos datos operativos faltantes.
