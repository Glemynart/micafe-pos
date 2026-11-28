# Reconciliación de estado ADR-SAAS-106/107/108 — 2026-11-27

## Decisión técnica vigente

Por delegación expresa del responsable, se conserva ADR-SAAS-106, alternativa A:
aprobación de exportación por enlace de un solo uso, limitado y revocable, con
token opaco y aprobación versionada. La decisión habilita implementación y
pruebas sintéticas/Emulator/staging. No habilita un canal real, exportación de
datos reales, despliegue productivo ni cambios IAM.

No se selecciona todavía un proveedor externo. Sin evidencia de la cuenta
contratante, términos de tratamiento, región, subencargados, retención, control
de abuso y comprobante de entrega, un stub solo puede usarse para pruebas
sintéticas. El contacto representante tampoco está verificado. La exportación
real permanece fail-closed.

## Estado de ADR-SAAS-107 y ADR-SAAS-108

Las entradas históricas de esta matriz que los describen como `Propuesto` son
fotografías de cortes anteriores y quedaron supersedidas por sus decisiones
aceptadas el 2026-11-27. Ambos ADR habilitan implementación controlada con datos
sintéticos; ninguno habilita contacto real, aceptación contractual real,
publicación de documentos, exportación/supresión real o producción.

- ADR-SAAS-107 tiene lógica de dominio y persistencia versionada con pruebas de
  aislamiento, consumo único y TTL en Emulator. Aún no hay callable ni interfaz
  operativa para que Backoffice designe/verifique/revoque un contacto real; el
  adaptador de entrega solo usa stub en pruebas.
- ADR-SAAS-108 tiene snapshot tenant-específico versionado, validación
  fail-closed y huella ligada al recibo de aceptación. Los datos de proveedor,
  perfil, instrucciones y subencargados deben tener fuentes verificables; un
  campo faltante bloquea aceptación. Los documentos continúan en borrador.
- ADR-SAAS-106 tiene validadores y transacciones probados en unit tests y
  Emulator, pero sus puertos aún no están conectados a una callable de producto
  ni a una pantalla de aprobación. No se puede completar un recorrido real.

La evidencia de implementación controlada de los ADR 106 y 107/108 sigue siendo
válida para su alcance declarado. Los párrafos de esas evidencias que dicen que
107/108 estaban propuestos o que ese código aún no se había desplegado describen
el estado en la fecha de cada prueba; no describen la situación de este corte.

## Corte de CI y despliegue

- PR #706: abierto y en borrador; base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
- HEAD remoto del corte previo a esta reconciliación documental:
  `f736113d28eddcb774856845b4c258e526323093`, sobre
  `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`; se confirmó que contenía el
  `main` remoto en ese corte.
- CI de ese corte `f736113`: run
  [46050700139](https://github.com/Glemynart/micafe-pos/actions/runs/46050700139),
  `success`, duración `28m29s`, completado a las 19:05:02 UTC. `gh pr checks 706`
  confirmó el check verde y sin pendientes. El PR continúa en borrador y no hay
  revisión aprobatoria.
- Staging: Rules y las cuatro callables del codebase `saas-legal` se
  desplegaron; las revisiones están listas con 100 % de tráfico y usan la
  identidad runtime dedicada. App Hosting sirve el build
  `build-2026-11-27-003`, creado desde `5f66c146fa0339a16414fa59d6906b348699d97a`.
  Los commits documentales posteriores a `5f66c14` no se han desplegado como
  código.
- Smoke anónimo: las rutas públicas cargan y las cuatro callables rechazan
  solicitudes sin autenticación. Smoke autenticado con identidad sintética:
  `consultarEstadoLegalTenant` devolvió HTTP 200 para el tenant del token,
  Rules permitió la lectura del tenant propio (200) y denegó el tenant ajeno
  (403); un `empresaId` suministrado por cliente se rechazó (400
  `INVALID_ARGUMENT`). Una llamada de aceptación con datos sintéticos válidos
  fue rechazada `FAILED_PRECONDITION` porque el bundle sigue en borrador; no creó
  recibo. Se verificó la eliminación del usuario, membresía y dos documentos
  sintéticos. La observación visual adicional en Edge confirmó que una sesión
  autorizada carga `/backoffice/privacidad`; fue solo lectura, sin enviar el
  formulario ni consultar un caso. No prueba el flujo UI completo ni exportación;
  el detalle está en
  [smoke autenticado de staging](SMOKE-AUTENTICADO-STAGING-2026-11-27.md).
- Producción: sin cambios. Revalidación GET de las 19:16:58 UTC: `/terminos`
  sigue identificando Café Atrato, sin `BORRADOR`, y las otras tres rutas
  legales responden 404. Una expresión regular mal escapada en la consulta
  anterior generó un falso negativo; se reemplazó por lectura del título y
  cuerpo HTML. Conserva rutas legales incompletas y
  contenido heredado de Café Atrato; no se debe publicar el bundle v0.6 aún en
  borrador. Detalle en
  [revalidación de producción](PRODUCCION-RUTAS-LEGALES-READONLY-2026-11-27.md).
- IAM: consulta de solo lectura confirmó que las 117 Functions v2 de producción
  están activas y usan la cuenta Compute default, que conserva `roles/editor`.
  Las cuatro Functions legales de staging usan `saas-legal-runtime`; no se
  modificó IAM en producción. El agente de Firebase App Hosting aparece con
  `roles/firebaseapphosting.serviceAgent`; la búsqueda de auditoría acotada no
  encontró eventos `GenerateServiceIdentity`. La existencia del agente hoy no
  demuestra que la llamada de la incidencia concluyera ni resuelve el error de
  Cloud Run. Evidencia en
  [revisión IAM runtime](IAM-RUNTIME-PRODUCCION-READONLY-2026-11-27.md).
- Vercel: no hay previews activos en el listado actual; tres URLs históricas
  devuelven 404. Los cuatro deployments `Production/READY` y sus dos aliases
  presentan `Login – Vercel` a solicitudes anónimas. Vercel informa que
  `pos.dusema.com` no está configurado para su edge y conserva nameservers de
  Cloudflare. No se borraron Production ni se cambió el plan. El acceso anónimo
  de previews está cerrado para el estado observado; plan y expiración interna
  siguen sin certificación. Detalle en
  [revisión Vercel](VERCEL-ACCESO-READONLY-2026-11-27.md).

## Revisión normativa puntual

La redacción de retracto de los términos distingue correctamente: plazo de cinco
días hábiles para ejercerlo y devolución en hasta quince días calendario para
comercio electrónico una vez satisfechas las condiciones legales. La Ley 2439
de 2024 modificó el artículo 47 de la Ley 1480 con ese plazo específico; no se
identificó una corrección necesaria en ese párrafo. Esta verificación puntual no
es una aprobación jurídica integral de los documentos.

El RUT aportado por el prestador identifica al titular como persona natural o
sucesión ilíquida. El Decreto 90 de 2018 acota la obligación de inscripción en
el RNBD a sociedades y entidades sin ánimo de lucro con activos totales mayores
a 100.000 UVT y personas jurídicas públicas. Con la identidad mostrada en ese
RUT y sin evidencia de que el servicio se opere por otra persona jurídica, la
clasificación actual es **sin obligación de inscripción RNBD identificada**.
La imagen se cotejó visualmente, no ante DIAN; si existe otra entidad operadora
o cambia la estructura, debe reevaluarse. La exención de inscripción no elimina
los deberes de la Ley 1581 para tratar datos personales. Esta es una
clasificación documental basada en los datos aportados, no un dictamen jurídico.

La regla de cómputo acordada en ADR-SAAS-104 incluye los sábados no festivos.
La doctrina oficial consultada recoge que los sábados son, por regla general,
hábiles, con excepción cuando la autoridad competente los declara inhábiles.
Contarlos en el calendario interno de Dusema reduce el tiempo disponible para
responder y es la opción operativamente conservadora. Esta comprobación no
sustituye la revisión jurídica del calendario aplicado a cada caso.

## Gates que siguen abiertos

1. Revisión jurídica y factual del paquete; los cuatro documentos permanecen en
   `BORRADOR`/`PREPARACION`.
2. Callable/UI autorizadas para mantener la autoridad del representante y
   completar el flujo de aprobación de ADR 106, con proveedor real solo después
   de verificar sus condiciones.
3. Smoke server-side sintético de autenticación, rechazo de aceptación en
   borrador e aislamiento tenant, además de render autenticado read-only de la
   pantalla de reclamos, verificados en staging. Sigue sin ejecutarse el flujo
   completo de UI para reclamos/consultas ni aceptación exitosa.
4. Certificación controlada de exportación integral con instrucción verificable,
   incluidos archivos e históricos, y de supresión por categorías/respaldos. No
   se accedió a payloads reales ni se borró información.
5. Vercel: el listado actual no muestra previews activos y las muestras
   históricas revisadas devuelven 404; siguen sin verificarse el plan/retención
   interna y el ciclo de expiración de artefactos.
6. PR #706 tiene CI verde en `f736113`, pero sigue en borrador. La auditoría
   final continúa `NO APROBADO PARA MERGE` por documentos en borrador, flujo de
   contacto/canal no operativo, falta de certificación real de exportación y
   supresión, y riesgo IAM de producción.

**Auditoría de este corte: NO APROBADO PARA MERGE.** No hubo exportación,
aceptación o supresión real, ni despliegue productivo.

## Revalidación autenticada/IAM/producción — 2026-11-27 19:16 UTC

- La pantalla `/backoffice/privacidad` cargó en Edge contra staging con el badge
  `Operador autorizado`. Observación de solo lectura; no se accionó el formulario
  sintético visible ni se consultaron expedientes. No demuestra que el ciclo de
  tramitación funcione por UI.
- `gcloud functions list` confirmó las cuatro Functions legales en staging con
  runtime dedicado. La consulta de producción confirmó 117/117 Functions con la
  cuenta Compute default, vinculada a `roles/editor`. No se alteraron permisos.
- Las rutas legales productivas se revisaron de nuevo: `/terminos` sigue
  mostrando Café Atrato y las otras tres rutas legales continúan en 404.
- El CI del corte previo `f736113` terminó success en `46050700139` (28m29s); en
  ese corte, branch y base estaban sincronizados. El PR continúa en draft; este
  párrafo documenta evidencia actualizada y no cambia la auditoría
  `NO APROBADO PARA MERGE`.
- Evidencia IAM: [inventario runtime de Functions](IAM-RUNTIME-PRODUCCION-READONLY-2026-11-27.md).

## Fuentes oficiales revisadas

- [Ley 2439 de 2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116), modificación del artículo 47 de la Ley 1480.
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306), Estatuto del Consumidor.
- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981), consultas, reclamos y deberes de responsables/encargados.
- [Decreto 1074 de 2015](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm), reglamentación de protección de datos personales.
- [Decreto 90 de 2018](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=85039), ámbito de inscripción del RNBD y permanencia de los demás deberes de protección de datos.
- [Concepto 187391 de 2022 de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=195112), regla general sobre cómputo de sábados como hábiles salvo declaración de inhabilidad aplicable.
