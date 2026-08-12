# ADR-SAAS-026 — Cierre controlado y recuperable de Eventos legacy

- **Estado:** Aceptado
- **Fecha:** 2026-08-08
- **Decision makers:** Lead Engineer; propietario del Goal
- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial
- **Milestone:** `M4` — Certificación comercial
- **Epic:** `E4.2` — Release readiness
- **Relacionados:** `ADR-SAAS-024`, `ADR-SAAS-025`, `B3-A`, `B3-B`

> Este ADR no autoriza escrituras en producción. Define el contrato técnico
> para preparar y validar un cierre selectivo de legacy; la ejecución
> productiva requerirá una autorización explícita posterior.

> **Estado actual post-MVP (2026-08-11):** el mecanismo fue implementado y
> certificado por PR #226. La ejecución productiva autorizada se realizó después
> mediante ADR-SAAS-027, PR #235 y PR #236, eliminando exactamente un Evento y
> tres assets del allowlist. No debe repetirse el operador ni inferirse ningún
> target adicional. La prohibición de escritura del texto original describe el
> alcance de aceptación de este ADR y queda como evidencia **HISTÓRICA**.

## 1. Contexto y problema

`ADR-SAAS-025` contempla que el modelo global legacy pueda retirarse después de
una transición explícita. B3-A ya inventarió el proyecto y encontró un único
documento de Evento sin `empresaId` y tres objetos Storage de Eventos no
referenciados. El propietario del Goal confirmó que esos elementos son datos
de prueba sin valor comercial y que no deben atribuirse a ningún tenant.

El B3-B vigente solo implementa backfill de `empresaId` en Emulator y prohíbe
eliminar o archivar legacy. Por ello no existe todavía un contrato para
retirar exactamente esos datos, verificar que no hayan cambiado y recuperar el
estado anterior si una operación parcial falla.

## 2. Decisión propuesta

Se añadirá una operación separada de **cierre selectivo de legacy** dentro del
trabajo B3-B, con estas propiedades:

1. El conjunto objetivo proviene de un manifiesto de cierre explícito y
   congelado, no de heurísticas ni de una consulta de limpieza genérica.
2. El manifiesto identifica cada Evento por `eventoId`, el hash completo de su
   snapshot esperado, la razón de retiro y la evidencia de que es un dato de
   prueba sin valor comercial.
3. Cada asset se identifica por `bucket` y `path` exactos, con fingerprint de
   Storage esperado. Solo se aceptan objetos de raíces legacy de Eventos.
4. El dry-run vuelve a leer Firestore y Storage y solo propone eliminar un
   objetivo si coincide con el manifiesto, sigue sin `empresaId`, no es un
   Evento canónico, y el asset sigue sin referencias explícitas en los
   Eventos leídos.
5. Un objetivo fuera del allowlist, un snapshot cambiado, una referencia nueva,
   un path canónico, un bucket distinto o cualquier ambigüedad aborta el plan
   completo sin borrar nada.
6. La ejecución futura será explícita, separada del dry-run y estará protegida
   por una confirmación inequívoca de producción. Esta autorización no se
   incluirá en el repositorio ni se inferirá de una variable de entorno común.
7. El proceso será idempotente por objetivo. Cada operación tendrá un estado
   auditable (`PREPARADO`, `ELIMINADO`, `IDEMPOTENTE_NOOP`, `OMITIDO` o
   `ABORTADO`) y no tratará una ausencia inesperada como autorización para
   continuar.

El alcance concreto de esta decisión queda limitado a un Evento legacy de
prueba y los tres objetos Storage no referenciados confirmados por el
propietario del Goal. No se permite ampliar el conjunto por conteo, prefijo,
fecha, nombre, URL, tenant único o similitud de contenido.

## 3. Garantías de seguridad y aislamiento

- Nunca se elimina un Evento que tenga `empresaId`.
- Nunca se elimina un Evento tenant-aware nuevo.
- Nunca se elimina un asset referenciado por ningún Evento leído en el
  preflight final.
- Nunca se toca reservas, landing, marketing, productos u otra colección o
  raíz de Storage.
- No se modifica ningún documento; el cierre solo elimina los targets exactos
  confirmados en el manifiesto.
- No se modifican Firestore Rules, Storage Rules, Bootstrap ni autoridades de
  dominio.
- La visibilidad pública, el nombre de Café Atrato y cualquier slug no son
  fuentes de autorización.

## 4. Dry-run y evidencia

El dry-run debe generar un plan reproducible que incluya:

- hash del manifiesto y del reporte B3-A de origen;
- proyecto, bucket y modo de ejecución;
- lista exacta de Eventos y assets candidatos;
- snapshot hash, fingerprint Storage y referencias observadas;
- motivo y evidencia de retiro por objetivo;
- objetivos omitidos y razón de cada omisión;
- `productionWrites: false`;
- hash de la evidencia final.

El resultado debe declarar explícitamente que serían eliminados exactamente un
documento y tres objetos, sin incluir ningún objetivo adicional. El dry-run no
descarga, borra, mueve ni reescribe datos productivos.

## 5. Recovery y rollback

Antes de una ejecución futura, el proceso deberá crear un bundle de recovery
fuera de Firestore y Storage productivos que contenga:

- el documento Firestore completo y su metadata;
- bytes de cada asset, su metadata y fingerprint;
- el manifiesto, el hash del plan y el journal de operaciones.

La eliminación no se considerará preparada para producción si el bundle no se
puede verificar antes de iniciar. La ejecución será por objetivo y reanudable;
un fallo parcial detendrá los siguientes objetivos y conservará el journal.

La recuperación solo podrá restaurar un objetivo cuando la ruta/documento
estén ausentes. Si existe un documento o asset diferente en la misma
identidad, la recuperación abortará por conflicto y no sobrescribirá datos.
La restauración no reabrirá lecturas globales ni creará un Evento
tenant-aware.

## 6. Alternativas

### A. Conservar los datos legacy en cuarentena

Es la alternativa más conservadora, pero mantiene basura de prueba fuera del
modelo canónico y no completa el cierre operativo solicitado.

### B. Limpieza genérica por prefijo o antigüedad

Se rechaza porque podría eliminar eventos o assets legítimos y no demuestra
propiedad, referencia ni valor comercial.

### C. Cierre selectivo con allowlist, preflight y recovery — recomendada

Permite retirar únicamente los datos confirmados, mantiene el aislamiento
tenant-aware y ofrece evidencia y recuperación sin introducir una autoridad de
producto nueva.

## 7. Consecuencias

Positivas:

- el legacy de prueba puede retirarse sin atribuirlo artificialmente a Café
  Atrato;
- el cierre es auditable, repetible y limitado a objetivos explícitos;
- los nuevos Eventos y assets tenant-aware quedan fuera del alcance;
- el mismo mecanismo puede reutilizarse para futuros cierres aprobados sin
  convertirse en una limpieza automática.

Costes y riesgos:

- Firestore y Storage no ofrecen una transacción común; el journal y el bundle
  de recovery son obligatorios para cubrir fallos parciales;
- la ejecución futura requiere custodiar localmente el bundle de recovery;
- cualquier divergencia entre el dry-run y la ejecución obliga a abortar.

## 8. Alcance y fuera de alcance

Incluye preparación de manifiesto, dry-run, validaciones Emulator, evidencia y
recovery. No incluye todavía ninguna escritura productiva.

Queda fuera:

- backfill o atribución de otros Eventos;
- eliminación de cualquier Evento canónico o asset referenciado;
- limpieza masiva o por heurística;
- migración de Storage, reservas, landing, marketing o dominios;
- cambios de Rules, UI de producto, fiscalidad o datos del cliente;
- ejecución productiva sin una autorización posterior explícita.

## 9. Criterios de aceptación del ADR

- el plan solo admite los targets explícitos y confirmados;
- el dry-run aborta ante snapshot, fingerprint, referencia, bucket o path
  divergente;
- el dry-run demuestra `productionWrites: false`;
- Emulator prueba eliminación, replay idempotente, omisión de objetivos
  canónicos/referenciados, aborto por drift y recovery sin sobrescritura;
- la documentación conserva la separación entre B3-A, backfill B3-B y cierre
  destructivo controlado;
- ninguna ejecución productiva forma parte de este PR.

## 10. Estado

Este ADR queda **ACEPTADO** por autorización explícita del Goal. Su mecanismo
de preparación, dry-run, recovery, journal e idempotencia quedó integrado y
certificado; el cierre productivo posterior fue ejecutado bajo ADR-SAAS-027.
No existen escrituras o eliminaciones adicionales autorizadas por este ADR.
