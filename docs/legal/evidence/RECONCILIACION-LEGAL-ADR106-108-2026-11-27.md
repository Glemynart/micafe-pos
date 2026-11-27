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
- HEAD remoto que revisa el CI actual: `79460c63442766e5b0117138b2fe4c835e67cc3b`.
- CI de ese SHA: run `46042405856`, en ejecución a las 17:39 UTC del
  2026-11-27. No se reutiliza como resultado un CI de un SHA anterior.
- Esta reconciliación y su enlace en la matriz se añadieron en un commit local
  posterior; aún no están en GitHub. Después del push se requiere CI del nuevo
  SHA antes de considerar el PR actualizado.
- Staging: Rules y las cuatro callables del codebase `saas-legal` se
  desplegaron; las revisiones están listas con 100 % de tráfico y usan la
  identidad runtime dedicada. App Hosting sirve el build
  `build-2026-11-27-003`, creado desde `5f66c146fa0339a16414fa59d6906b348699d97a`.
  Los cambios del commit `79460c6` son documentales; no se han desplegado como
  código.
- Smoke anónimo: las rutas públicas cargan y las cuatro callables rechazan
  solicitudes sin autenticación. Esto no prueba un flujo positivo autenticado.
- Producción: sin cambios en este corte. Conserva rutas legales incompletas y
  contenido heredado de Café Atrato; no se debe publicar el bundle v0.6 aún en
  borrador.
- Vercel: el enlace de preview que conserva el comentario automático del PR
  devolvió 404 y `vercel inspect` no encontró el deployment; los cuatro
  deployments `Production` del proyecto `cafeatrato` siguen `Ready`. El 404 del
  preview no elimina ni resuelve esos cuatro artefactos ni el uso/plan Hobby.

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
3. Smoke positivo autenticado y aislamiento en staging. No se pudo usar el
   control de Edge; ningún dato o credencial fue leído o introducido.
4. Certificación controlada de exportación integral con instrucción verificable,
   incluidos archivos e históricos, y de supresión por categorías/respaldos. No
   se accedió a payloads reales ni se borró información.
5. Resolver el uso residual de Vercel Hobby y los cuatro deployments protegidos
   de producción, sin inferir que SSO o detener futuros despliegues los elimina.
6. CI verde para el HEAD `79460c6`; después, una nueva auditoría del PR. No se
   declara `APROBADO PARA MERGE` hasta cerrar los gates requeridos.

**Auditoría de este corte: NO APROBADO PARA MERGE.** No hubo exportación,
aceptación o supresión real, ni despliegue productivo.

## Fuentes oficiales revisadas

- [Ley 2439 de 2024](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116), modificación del artículo 47 de la Ley 1480.
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306), Estatuto del Consumidor.
- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981), consultas, reclamos y deberes de responsables/encargados.
- [Decreto 1074 de 2015](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm), reglamentación de protección de datos personales.
- [Decreto 90 de 2018](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=85039), ámbito de inscripción del RNBD y permanencia de los demás deberes de protección de datos.
- [Concepto 187391 de 2022 de Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=195112), regla general sobre cómputo de sábados como hábiles salvo declaración de inhabilidad aplicable.
