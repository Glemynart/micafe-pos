# B3-A — Inventario dry-run de Eventos legacy

## Propósito

B3-A prepara la transición de documentos `eventos/{eventoId}` sin `empresaId` y
de los assets que sus documentos referencian. El comando inspecciona Firestore
y, si se configura un bucket, Storage; valida un manifiesto de atribución
explícita y genera evidencia. No modifica Firestore, Storage ni las URLs, y no
tiene modo de ejecución.

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
  --bucket micafe-pos.firebasestorage.app `
  --out .\artifacts\b3-eventos\legacy-inventory.json
```

El comando produce el reporte JSON y su hash SHA-256 local. El reporte indica
documentos canónicos, documentos legacy sin mapeo, mapeos válidos, inválidos,
conflictivos, empresas destino inexistentes y entradas del manifiesto que no
corresponden a ningún evento. También incluye referencias de `imagenUrl` sin
conservar tokens de descarga, rutas Storage legacy/canónicas, referencias
ausentes o externas, assets compartidos y objetos de Eventos no referenciados.

El inventario de Storage se limita a raíces relacionadas con Eventos:
`eventos/...`, `public/eventos/...` y
`tenants/{empresaId}/eventos/{eventoId}/...`. Los objetos de otras superficies
no se mezclan en el informe. Para habilitarlo se puede usar `--bucket` o
`FIREBASE_STORAGE_BUCKET` / `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

`--execute` está prohibido por diseño. B3-A no realiza backfill, no borra
documentos u objetos, no reescribe URLs y no escribe en producción. Las URLs
que contienen tokens se representan mediante un hash y nunca se imprimen
completas en la evidencia.

La lectura puede autenticarse con una cuenta de servicio (`FIREBASE_SERVICE_ACCOUNT`
o `FIREBASE_SERVICE_ACCOUNT_PATH`) o con Application Default Credentials mediante
`GOOGLE_APPLICATION_CREDENTIALS`. Esto permite usar una credencial `authorized_user`
emitida por Firebase CLI para el inventario read-only; B3-A nunca usa esa
credencial para escribir.

## Evidencia

La suite `npm run e2e:b3-eventos` ejecuta el inventario contra Firestore y
Storage Emulator con fixtures de documentos canónicos, legacy, destino
inexistente, referencias Storage compartidas y un objeto huérfano. Publica
`legacy-inventory.json`, su hash, el manifiesto de prueba y metadatos con
`productionWrites: false`; además verifica que los documentos legacy y los
objetos de Storage permanecen intactos después del dry-run.

El siguiente trabajo, B3-B, requiere revisar el manifiesto real y autorizar
explícitamente cualquier backfill productivo. Los documentos no clasificables
deben permanecer fuera de la superficie canónica.
