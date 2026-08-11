# B3-027 — Operador productivo para cierre controlado de Eventos legacy

Este documento describe la herramienta operativa separada definida por
`ADR-SAAS-027`. No es una callable, no forma parte del POS y no amplía el
allowlist de `ADR-SAAS-026`.

## Propósito y límites

La herramienta permite preparar y, únicamente después de una autorización
operativa independiente, ejecutar el cierre exacto de los cuatro targets
confirmados en el manifiesto externo de B3-B:

- un documento de `eventos` legacy sin `empresaId`;
- tres objetos Storage legacy de Eventos sin referencias.

Los identificadores, snapshots, fingerprints, manifiesto, recovery y journal
productivos no se versionan en este repositorio. No se seleccionan recursos por
prefijo, fecha, nombre, slug, dominio, tenant, similitud ni inferencia.

La herramienta no modifica Rules, Bootstrap, callables, dominio, reservas,
landing, marketing, productos ni datos fiscales. El ejecutor de
`ADR-SAAS-026` permanece Emulator-only y no se sustituye ni se modifica.

## Controles obligatorios

El operador está fijado al proyecto `micafe-pos` y al bucket
`micafe-pos.firebasestorage.app`; no acepta parámetros para seleccionar otros.
Antes de eliminar, exige:

1. manifiesto externo válido con exactamente un Evento y tres assets;
2. coincidencia de snapshot completo, fingerprints, referencias y ausencia de
   `empresaId`;
3. preflight con `safeToExecute` y recovery completo fuera del worktree;
4. verificación de hashes del recovery;
5. rutas absolutas fuera del worktree para plan, recovery, journal y evidencia;
6. ADC externo o workload identity autorizada; nunca credenciales inline,
   OAuth interactivo persistido ni service accounts almacenadas en Git;
7. sesión interactiva con stdin/stdout TTY;
8. confirmación exacta con proyecto, bucket, cuatro targets y
   `manifestSha256`;
9. rechazo explícito cuando `CI=true`, `CI=1` o `GITHUB_ACTIONS=true`.

La operación productiva no se ejecuta desde GitHub Actions ni desde las suites
automatizadas. La suite de pruebas conserva `productionWrites: false`.

## Seguridad contra drift e idempotencia

Cada target se vuelve a leer inmediatamente antes de la operación. El Evento
usa su snapshot y `lastUpdateTime` como precondición de Firestore. Cada asset
usa su fingerprint y `generation` como precondición de Storage, y se vuelve a
comprobar que no tenga referencias. Un drift, una ausencia inesperada, una
referencia nueva o un error parcial marca el target como `ABORTADO` y detiene
los siguientes.

El journal externo registra por target uno de estos estados:

- `PREPARADO`;
- `ELIMINADO`;
- `IDEMPOTENTE_NOOP`;
- `ABORTADO`.

Los reintentos no repiten targets ya confirmados. El bundle de recovery se
verifica antes de la primera eliminación y no puede restaurar sobre una
identidad ocupada.

## Ejecución

La herramienta requiere un manifiesto y artefactos externos. El formato de
confirmación se obtiene sin imprimir secretos mediante el hash del manifiesto:

```powershell
$confirmation = "CONFIRM B3-027 PRODUCTION project=micafe-pos bucket=micafe-pos.firebasestorage.app targets=4 manifestSha256=<HASH_DEL_MANIFIESTO>"

npx tsx scripts/b3/eventos-legacy-production-closure.ts `
  --execute `
  --manifest "C:\ruta-externa\b3-027\manifest.json" `
  --out "C:\ruta-externa\b3-027\plan.json" `
  --journal "C:\ruta-externa\b3-027\journal.json" `
  --recovery "C:\ruta-externa\b3-027\recovery.json" `
  --confirm-production $confirmation
```

Este comando es únicamente el procedimiento documentado. No se ejecuta como
parte del PR, de CI, de la certificación Emulator ni de esta entrega.

## Validación automatizada

```powershell
npm run test:b3-eventos-production-closure
npm run test:b3-eventos-closure
```

Las pruebas cubren el proyecto y bucket fijos, generation obligatoria,
confirmación interactiva, bloqueo de CI, artefactos externos, idempotencia,
persistencia del journal y abortado ante drift. No inicializan Firebase Admin,
no usan credenciales y no realizan escrituras.

## Autorización posterior

La aceptación de `ADR-SAAS-027` y la integración de esta herramienta no
autorizan la limpieza productiva. Antes de una primera ejecución real se debe
regenerar el dry-run read-only con el manifiesto externo congelado, revisar el
plan, el hash, las cuatro targets, el recovery y el journal, y recibir una
autorización separada que identifique explícitamente proyecto, bucket, cantidad
y `manifestSha256`.
