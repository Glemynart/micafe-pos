# B3-A — Inventario dry-run de Eventos legacy

## Propósito

B3-A prepara la transición de documentos `eventos/{eventoId}` sin `empresaId`.
El comando inspecciona Firestore, valida un manifiesto de atribución explícita
y genera evidencia. No modifica Firestore y no tiene modo de ejecución.

## Contrato del manifiesto

El archivo JSON usa `schemaVersion: 1` y solo admite atribuciones por
identificador:

```json
{
  "schemaVersion": 1,
  "mapeos": [
    {
      "eventoId": "evento-legacy",
      "empresaId": "tenant-verificado",
      "evidencia": "referencia a la fuente autorizada"
    }
  ]
}
```

No se aceptan inferencias basadas en título, nombre comercial, slug, dominio,
URL o existencia de un único tenant.

## Uso

```powershell
npx tsx scripts/b3/eventos-legacy-dry-run.ts `
  --dry-run `
  --mapping .\mapping-b3.json `
  --out .\artifacts\b3-eventos\legacy-inventory.json
```

El comando produce el reporte JSON y su hash SHA-256 local. El reporte indica
documentos canónicos, documentos legacy sin mapeo, mapeos válidos, inválidos,
conflictivos, empresas destino inexistentes y entradas del manifiesto que no
corresponden a ningún evento.

`--execute` está prohibido por diseño. B3-A no realiza backfill, no borra
documentos, no reescribe URLs y no escribe en producción.

## Evidencia

La suite `npm run e2e:b3-eventos` ejecuta el inventario contra Firestore
Emulator con fixtures de documentos canónicos, legacy, destino inexistente y
manifiesto no encontrado. Publica `legacy-inventory.json`, su hash, el
manifiesto de prueba y metadatos con `productionWrites: false`.

El siguiente trabajo, B3-B, requiere revisar el manifiesto real y autorizar
explícitamente cualquier backfill productivo. Los documentos no clasificables
deben permanecer fuera de la superficie canónica.
