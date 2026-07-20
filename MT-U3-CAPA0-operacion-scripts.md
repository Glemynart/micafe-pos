# MT-U3 — Capa 0: operación de los scripts de backfill

> Documentación mínima para operar `migrate-mt-u3-operativo.ts` y
> `rollback-mt-u3-operativo.ts` (+ el rollback heredado de MT-U1). Diseño
> completo en `MT-U3-helper-tenant-diseno.md` §6. **Ninguno de estos scripts se
> ha ejecutado** — esta guía es para cuando se autorice su ejecución (Capa 5).

## Requisito común

Credenciales de Admin SDK, igual que el resto de `scripts/`:

```
FIREBASE_SERVICE_ACCOUNT=<json inline>            # o
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.local.json
```

en `.env.local`, o el archivo `./service-account.local.json` en la raíz.

## 1. Backfill — `migrate-mt-u3-operativo.ts`

```bash
npx tsx scripts/migrate-mt-u3-operativo.ts                    # dry-run (default)
npx tsx scripts/migrate-mt-u3-operativo.ts --solo=ventas       # dry-run de 1 colección (pruebas)
npx tsx scripts/migrate-mt-u3-operativo.ts --execute            # ejecución real
```

**Leer el reporte antes de `--execute`:**
- `examinados` = documentos totales de la colección (baseline).
- `tocados` = se estamparían/remaparían con `empresaId`.
- `saltados` = ya tienen el `empresaId` correcto (re-ejecución segura).
- `anomalías` = documentos con un `empresaId` que **no** es ni ausente ni el
  fundacional (ni `"default"` en el ledger). **Nunca se tocan.** Si aparece
  alguna, investigar manualmente antes de `--execute` — no es normal en el
  estado actual del proyecto (un solo tenant).
- Al final, un aviso de "inconsistencia de conteo" señalaría un bug de
  paginación, no un problema de datos — no debería aparecer nunca.

**Orden dentro del script:** procesa primero `movimientos_inventario` (resuelve
el `"default"` hardcodeado, D-U2-3), luego las colecciones de mayor volumen
(`ventas`, `transacciones_financieras`, `turnos`, `compras`), luego el resto.

**Reintentos:** si `--execute` falla a mitad de camino, simplemente
re-ejecutar. Es idempotente (los documentos ya estampados se saltan).

## 2. Rollback del backfill — `rollback-mt-u3-operativo.ts`

```bash
npx tsx scripts/rollback-mt-u3-operativo.ts             # dry-run (default)
npx tsx scripts/rollback-mt-u3-operativo.ts --execute    # ejecución real
```

**La frontera de seguridad no es la misma para todas las colecciones:**
- `movimientos_inventario`: seguro solo mientras la **Capa 2** (reescritura del
  ledger) no esté en producción.
- Las otras 24 colecciones: seguro solo mientras la **Capa 3** (estampado en
  servicios) no esté en producción.

Ver la limitación documentada en la cabecera del script: una vez la capa
correspondiente estampa `empresaId` de forma legítima, este rollback ya no
puede distinguir "lo escribió el backfill" de "lo escribió el ledger/un
servicio correcto" (ambos tienen el mismo valor, el único tenant existente).

## 3. Rollback de MT-U1 (empresa + membresías) — `rollback-mt-u1-fundacional.ts`

```bash
npx tsx scripts/rollback-mt-u1-fundacional.ts           # dry-run (default)
npx tsx scripts/rollback-mt-u1-fundacional.ts --execute  # ejecución real
```

**Orden obligatorio si se necesitan ambos rollbacks:**

```
1º rollback-mt-u3-operativo.ts   (quita empresaId de las 25 colecciones)
2º rollback-mt-u1-fundacional.ts  (borra membresias + empresas/{id})
```

Nunca al revés: el paso 1 necesita resolver la empresa fundacional para saber
qué revertir.

**Precondición dura verificada por el propio script:** aborta automáticamente
si algún usuario en Firebase Auth todavía tiene el custom claim
`empresaId` apuntando a esta empresa (acuñado por MT-U2). En el estado actual
del proyecto (claims ya acuñados en producción), **este script abortará
siempre** hasta que exista un reverso de esos claims — es la señal correcta
de que revertir MT-U1 hoy no es una operación aislada de MT-U2.

## Checklist antes de correr `--execute` de cualquiera de los tres

1. Dry-run revisado y aprobado por el responsable del proyecto.
2. Backup/point-in-time recovery de Firestore disponible.
3. Confirmar en qué entorno se está apuntando (`.env.local` / service account
   correctos) — **nunca** correr contra producción sin haber confirmado esto.
