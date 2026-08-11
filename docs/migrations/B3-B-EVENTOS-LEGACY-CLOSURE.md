# B3-B — Cierre controlado de Eventos legacy

Este documento describe el mecanismo separado de cierre definido por
ADR-SAAS-026. No es un backfill, no atribuye datos a un tenant y no autoriza
escrituras productivas.

## Alcance

El mecanismo admite únicamente el allowlist congelado de ADR-SAAS-026:

- exactamente un documento de `eventos` sin `empresaId`;
- exactamente tres objetos Storage bajo una raíz legacy de Eventos;
- ningún evento tenant-aware, asset referenciado u otra ruta.

El manifiesto debe contener los hashes completos del snapshot del documento,
los fingerprints de Storage, la justificación y la evidencia de retiro. No se
aceptan selección por prefijo, antigüedad, nombre, slug, dominio o similitud.

## Modos

`--dry-run` es el único modo que puede apuntar a un proyecto configurado para
la revisión read-only. Relee Firestore y Storage, verifica drift, referencias,
rutas y allowlist, y genera el plan, journal, bundle de recovery y sus hashes.
El resultado debe declarar `productionWrites: false`.

`--execute` está limitado por diseño a Firestore y Storage Emulator, y exige un
proyecto `demo-b3-eventos-closure-*`, ambos hosts de emulador y un bundle de
recovery verificable. No existe un modo de eliminación productiva en este PR.

Ejemplo de dry-run read-only:

```powershell
npx tsx scripts/b3/eventos-legacy-closure.ts `
  --dry-run `
  --manifest .\manifests\b3-eventos-closure.json `
  --out .\artifacts\b3-eventos-closure\closure-plan.json `
  --journal .\artifacts\b3-eventos-closure\journal.json `
  --recovery .\artifacts\b3-eventos-closure\recovery-bundle.json
```

Los targets productivos no se versionan en este repositorio. El manifiesto se
prepara fuera del árbol de código a partir del informe B3-A revisado y solo se
usa cuando el proyecto y el bucket configurados coinciden.

## Recovery y journal

Antes de cualquier ejecución Emulator se captura el documento completo y los
bytes/metadata de los tres assets. El bundle se verifica por hash y no puede
restaurar sobre una identidad ocupada. El journal asigna un `operationId` por
plan y un identificador por objetivo; los reintentos son no-op para objetivos
ya eliminados y se detienen ante ausencia inesperada o error parcial.

## Validación

```powershell
npm run test:b3-eventos-closure
```

La suite cubre allowlist exacto, exclusión de canónicos, drift de snapshot,
referencias nuevas, idempotencia del journal, verificación de recovery y
recuperación sin sobrescritura.
