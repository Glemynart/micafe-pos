# Respaldos Firestore de producción — lectura de solo consulta

**Observado:** 2026-11-27 22:18 UTC
**Proyecto:** `micafe-pos`
**Alcance:** metadatos de la base predeterminada, programación y snapshots visibles. No se leyeron documentos de clientes ni se inició una restauración, exportación, eliminación o cambio de configuración.

## Resultado

- Firestore Standard está en `southamerica-east1`.
- Point-in-time recovery está desactivado; la retención de versiones indicada por la base es de 3.600 segundos (1 hora).
- Hay una programación diaria de copias con retención configurada en `3024000s` (35 días).
- Se observaron **35 de 35 copias en estado `READY`**. La más antigua cubre `2026-10-24T09:42:31Z` y vence `2026-11-28T09:42:31Z`; la más reciente cubre `2026-11-27T14:08:10Z` y vence `2027-01-01T14:08:10Z`. Todas las copias enumeradas indican 35 días entre snapshot y vencimiento.
- La protección contra borrado de la base aparece desactivada. No se cambió ese estado.

Consultas de solo lectura ejecutadas con Firebase CLI: `firestore:databases:get '(default)'`, `firestore:backups:schedules:list` y `firestore:backups:list --location southamerica-east1`. Los identificadores de copias se omiten de esta evidencia porque no son necesarios para demostrar cantidad, estado y vencimiento.

## Alcance y efecto sobre la supresión

Una copia es un snapshot consistente de la base y se conserva hasta que venza su retención o se elimine expresamente; eliminar datos de la base viva no hace desaparecer automáticamente una copia ya creada. Por ello, un proceso de supresión no puede prometer desaparición inmediata de snapshots previos. Para un dato incluido en la copia más reciente observada, la fecha de expiración visible es el 1 de enero de 2027; una supresión futura debe calcularse contra las copias que efectivamente lo contengan y sus vencimientos. No se examinó su contenido para evitar extraer datos reales.

Esta consulta acredita existencia y metadatos, no una restauración ensayada ni capacidad de borrar selectivamente un tenant de una copia. Tampoco cubre Firebase Authentication, Cloud Storage, logs u otros sistemas. La política de expiración de copias de Firestore no equivale a un ciclo completo de retención/supresión del servicio.

La documentación oficial de Firestore explica que los backups son copias consistentes de la base, que pueden tener retención configurable y que permanecen hasta su vencimiento o eliminación: [Back up and restore data](https://firebase.google.com/docs/firestore/backups).

**Conclusión:** hay cobertura de snapshots diarios de Firestore con retención de 35 días, pero **no está certificada la restauración integral ni la supresión integral real**. No se alteró producción.
