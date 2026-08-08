# B3-B — Backfill idempotente de Eventos legacy

## Propósito

B3-B aplica únicamente mapeos explícitos que B3-A clasificó como
`LEGACY_MAPEO_VALIDO`. El cambio de cada documento es mínimo: añade
`empresaId` y conserva todos los demás campos del documento. No se crean
documentos nuevos, no se borran documentos y no se reescriben URLs o assets.

La implementación de este PR solo permite `--execute` contra Firestore
Emulator. No realiza escrituras productivas; cualquier ejecución productiva
requiere una autorización y un procedimiento operativo separado.

## Precondiciones

- manifiesto JSON `schemaVersion: 1` con `eventoId`, `empresaId` y `evidencia`;
- destino existente en `empresas`;
- revisión humana de la evidencia y del reporte B3-A;
- entorno Emulator para ejecutar el backfill en este PR.

Los eventos sin mapeo, con destino inexistente, con evidencia inválida o con
conflictos permanecen sin `empresaId` y siguen fuera de la superficie canónica.

## Uso

```powershell
# Inspección sin escrituras
npx tsx scripts/b3/eventos-legacy-backfill.ts `
  --dry-run `
  --mapping .\mapping-b3.json `
  --out .\artifacts\b3-eventos\backfill-dry-run.json

# Aplicación únicamente en Firestore Emulator
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085"
npx tsx scripts/b3/eventos-legacy-backfill.ts `
  --execute `
  --mapping .\mapping-b3.json `
  --out .\artifacts\b3-eventos\backfill-execute.json
```

El comando exige exactamente uno de `--dry-run` o `--execute`, exige el
manifiesto y rechaza `--execute` si `FIRESTORE_EMULATOR_HOST` no está definido
o el proyecto no tiene prefijo `demo-b3-eventos-`.

## Garantías

- Cada evento se relee en una transacción antes de actualizarse.
- Si ya tiene el mismo `empresaId`, el replay es un `IDEMPOTENTE_NOOP`.
- Si pertenece a otro tenant, se registra `CONFLICTO_CONCURRENCIA` y nunca se
  sobrescribe.
- La transacción actualiza exclusivamente `empresaId`.
- Se calcula un hash del snapshot excluyendo únicamente `empresaId` antes y
  después de la operación para demostrar que el contenido histórico no cambió.
- La evidencia es local, incluye hash SHA-256, conserva el inventario completo
  de B3-A y declara `productionWrites: false`.

## Evidencia y CI

`npm run e2e:b3-eventos-backfill` crea fixtures en Emulator y ejecuta:

1. dry-run con un candidato válido y casos no clasificables;
2. ejecución del candidato válido;
3. replay de la misma ejecución, que debe producir un no-op idempotente;
4. verificación del tenant asignado, preservación del snapshot y permanencia
   de los legacy no clasificables.

La CI publica `backfill-dry-run.json`, `backfill-execute.json`,
`backfill-replay.json`, hashes, metadatos y `backfill-verification.json`.

## Fuera de alcance

- escrituras en producción;
- backfill de eventos sin evidencia suficiente;
- heurísticas por título, slug, dominio, URL o tenant único;
- eliminación o archivado de documentos legacy;
- migración de Storage, reservas, marketing o dominios personalizados;
- retiro definitivo del modelo legacy.

El retiro y cualquier operación productiva posterior requieren un corte
separado, revisión de los mapeos reales y autorización explícita.
