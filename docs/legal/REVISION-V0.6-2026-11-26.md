# Revisión documental v0.6 — 2026-11-26

Estado: **BORRADOR PARA REVISIÓN; NO APROBADO PARA VIGENCIA O EXIGIBILIDAD**.
Goal/Milestone/Epic: `G-SAAS-02 → M2 → E2.2`. La decisión operativa de fecha y
plazos fue delegada expresamente por el prestador. Esta revisión técnica no es
un dictamen jurídico profesional ni certifica cumplimiento integral.

## Decisiones plasmadas

- Fecha objetivo de release: **2026-12-15 00:00, America/Bogota**. La fecha
  efectiva será la del release definitivo solo si los gates técnicos, operativos,
  contractuales y jurídicos cierran. Si no, se aplaza; no hay activación automática.
- Términos y anexo: aplican a un negocio solo tras la aceptación de la versión
  exacta por su administrador autorizado y el registro de servidor. No hay
  retroactividad ni cambio de precio, Trial, plazo comercial o acceso por publicar.
- Política: su publicación informa, pero no sustituye una autorización personal
  cuando sea necesaria. No se usa la aceptación SaaS para consentir por clientes,
  vendedores, proveedores u otros titulares del negocio.
- Salida: solicitud estándar dentro de 30 días calendario desde la terminación;
  alcance/método en 2 días hábiles y entrega ordinaria dentro de 10 días hábiles
  desde verificar identidad y facultad. La entrega estándar se propone sin costo;
  el trabajo extraordinario requiere cotización y autorización. Estos términos
  no se activan antes de certificar el exportador y publicar/aceptar el contrato.
- Datos operativos: retirar acceso ordinario al terminar y suprimir/anonimizar
  datos prescindibles de sistemas activos dentro de 60 días calendario, una vez
  verificadas la salida, instrucciones, dependencias e inexistencia de deber de
  conservación. Excepciones: retención legal documentada, controversia u orden,
  con alcance mínimo, acceso restringido y revisión.
- Soporte y expedientes ordinarios de privacidad: hasta 12 meses desde el cierre;
  evidencia de controversias, incidentes u obligaciones se conserva separada
  mientras subsista el fundamento y se revisa trimestralmente.
- No se extiende el término de diez años a todo el tenant: aplica a libros/papeles
  de comercio que efectivamente pertenezcan a esa categoría y al obligado
  correspondiente. Otros registros necesitan fundamento y plazo propios.
- Exportaciones temporales: cifradas y restringidas hasta confirmar entrega;
  objetivo de borrado dentro de 7 días calendario tras esa confirmación. El paso
  aún no está automatizado ni certificado.

## Contraste jurídico y factual

La regla de conservación debe seguir la finalidad y necesidad de cada categoría;
los plazos de 30/60 días y 12 meses son decisiones operativas del prestador para
el borrador, no plazos generales fijados por la Ley 1581. El plazo de diez años
se limita a libros y papeles de comercio que estén sujetos a esa obligación. La
revisión debe confirmar qué parte conserva cada documento, su fundamento y si
el negocio debe recibir una copia antes de la supresión.

La evidencia observada de proveedor es acotada: Firestore backups diarios con
retención de 35 días; soft delete de 7 días en buckets examinados; Cloud Logging
global `_Default` 30 días y `_Required` 400 días. No se probó la expiración real,
restauración con reaplicación de supresiones ni la lista íntegra de copias,
proveedores, cachés o canales. Por ello los 60 días cubren solo el objetivo de
sistemas activos y **no prometen purga global**. El exportador real no se ha
ejecutado (`productionExportCertified=false`) y no se ha hecho supresión real.

El documento de operación no configura TTL, jobs, un SLA ni cobertura 24/7. El
backoffice de reclamos sigue sin acreditar un smoke autenticado de extremo a
extremo ni prueba de recepción externa. La política no se publica como final
hasta cerrar esa capacidad y los proveedores efectivos.

## Pendientes antes del release definitivo

1. Revisar jurídicamente términos, política, aviso, anexo, aplicación de consumo
   electrónico y el alcance de obligaciones por cartera/suplantación.
2. Confirmar identidad contractual/dirección con documentos fuente; el RUT
   aportado fue cotejado visualmente, no validado independientemente ante DIAN.
3. Probar correo/canales externos del responsable ya designado, archivo
   restringido, notificaciones y recorrido autenticado de reclamo/anotación en
   staging. No hay suplente; se recomienda como control de continuidad, no se
   identifica como condición legal autónoma.
4. Cerrar inventario de proveedores, subencargados, regiones, cuentas y contratos
   de transmisión; resolver uso comercial residual de Vercel Hobby.
5. Certificar exportación representativa autorizada y supresión por categorías,
   incluyendo Auth, Storage, logs, copias temporales y procedimiento de restauración.
6. Asegurar que la aceptación use solamente textos publicados, hashes exactos y
   fecha efectiva, y que clientes existentes reciban la comunicación requerida.
7. Verificar la implementación de tareas manuales o automáticas para cumplir
   plazos antes de presentarlos como compromisos; no activar con gates abiertos.

## Fuentes oficiales de referencia

- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- [Decreto 1074 de 2015, protección de datos y conservación](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm).
- [Ley 962 de 2005, artículo 28](https://normativa.archivogeneral.gov.co/ley-962-de-2005/), para los libros y papeles de comercio del obligado cuando corresponda.
- [Ley 527 de 1999](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276), sobre mensajes de datos y contratación electrónica.
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306) y [Ley 2439 de 2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116), sujetas a la relación concreta de consumo.

Estas fuentes sustentan el marco general, no una conclusión automática para cada
función de Dusema. Los documentos se mantienen como borradores hasta que la
revisión jurídica y factual y los gates operativos estén completos.
