# G-SAAS-02 / M2 / E2.2 — Gate D preflight de índices Bodega (2026-10-11)

## Dictamen

`PREFLIGHT = READY FOR SEPARATE AUTHORIZATION`, no deploy. Se identificaron
cuatro índices compuestos presentes en `firestore.indexes.json` y ausentes en
`micafe-pos-staging`, necesarios para las consultas de compras y cuentas
bancarias observadas durante la validación del preview autenticado. La
autorización de staging vigente cubre `firestore:rules` condicionalmente, no
índices.

El manifiesto completo contiene 50 índices; el proyecto tiene 7 `READY` que
coinciden con el manifiesto, 43 ausentes y cero índices remotos adicionales.
`firebase deploy --only firestore:indexes` no es el alcance propuesto: podría
crear los 43 faltantes. Si se autoriza, el rollout debe crear exclusivamente
los cuatro definidos abajo y volver a enumerar el estado remoto.

## Identidad y evidencia

- Proyecto observado: `micafe-pos-staging`; base `(default)`.
- Candidato de código del preview PR #548: HEAD
  `c599263a24f989bb7641fb8ec925537f5292fed5`; su diff contra la base `main @
  71f1b0b1aaeb5a0b0018f40008526c617a737645` es documental. El Vercel check de
  ese HEAD terminó `PASS`.
- En Edge, la sesión de `Administrador Bodega Demo` abrió el panel del preview.
  La ruta `/admin/compras` quedó en spinner tras la lectura de suscripciones.
- Los logs de consola del navegador reportaron Firestore
  `failed-precondition: The query requires an index` para `compras` con
  `empresaId ASC, espacioId ASC, fecha DESC` y `cuentas_bancarias` con
  `empresaId ASC, nombre ASC`.
- `gcloud firestore indexes composite list --project=micafe-pos-staging
  --format=json` devolvió 7 índices, todos `READY`.
- El compare local/remote normaliza el `__name__` implícito de Firestore;
  resultado: 50 candidatos, 7 presentes, 43 ausentes, 0 extras.
- La ruta del commit del preview usa `resolverCallableCompra`: BODEGA_MVP1
  elige `registrarCompraBodegaV1`; otros verticales conservan
  `registrarCompraOperativaV1`. `purchases-module.tsx` delega la mutación al
  servicio y no contiene escrituras directas a `/compras`. Esto verifica el
  código del commit del preview; no equivale a una compra staging autenticada.

## Delta mínimo propuesto

Las cuatro definiciones ya existen en `firestore.indexes.json` y la
enumeración remota no contiene ninguna:

| Collection group | Query scope | Campos, en orden |
|---|---|---|
| `compras` | `COLLECTION` | `espacioId ASCENDING`, `fecha DESCENDING` |
| `compras` | `COLLECTION` | `empresaId ASCENDING`, `fecha DESCENDING` |
| `compras` | `COLLECTION` | `empresaId ASCENDING`, `espacioId ASCENDING`, `fecha DESCENDING` |
| `cuentas_bancarias` | `COLLECTION` | `empresaId ASCENDING`, `nombre ASCENDING` |

Relación con código:

- `lib/compras-service.ts` consulta compras por espacio y fecha.
- `app/(tenant)/admin/(authenticated)/compras/page.tsx` y el dashboard
  consultan compras por empresa y fecha.
- `lib/finanzas-service.ts` consulta cuentas bancarias por empresa y ordena por
  nombre.
- La consulta compuesta por empresa/espacio/fecha fue observada en el log del
  preview durante la carga de la superficie Bodega.
- El índice de cuentas bancarias fue observado en el log del preview.

## Comandos previstos si se autoriza

No ejecutados. Cada llamada crea un solo índice; no elimina ni modifica Rules,
Functions, IAM, Secrets, documentos, Auth, fixture, tenant ni producción:

```powershell
gcloud firestore indexes composite create --project=micafe-pos-staging --database='(default)' --collection-group=compras --query-scope=collection --field-config=field-path=espacioId,order=ascending --field-config=field-path=fecha,order=descending
gcloud firestore indexes composite create --project=micafe-pos-staging --database='(default)' --collection-group=compras --query-scope=collection --field-config=field-path=empresaId,order=ascending --field-config=field-path=fecha,order=descending
gcloud firestore indexes composite create --project=micafe-pos-staging --database='(default)' --collection-group=compras --query-scope=collection --field-config=field-path=empresaId,order=ascending --field-config=field-path=espacioId,order=ascending --field-config=field-path=fecha,order=descending
gcloud firestore indexes composite create --project=micafe-pos-staging --database='(default)' --collection-group=cuentas_bancarias --query-scope=collection --field-config=field-path=empresaId,order=ascending --field-config=field-path=nombre,order=ascending
```

## Límites y siguiente verificación

- No se ejecutaron las llamadas de creación; no se modificaron índices,
  datos, tráfico ni permisos. Rules se desplegó después mediante una acción
  separada y autorizada; su hash y verificación se registran en el Goal. No
  hubo cambios de Functions, Auth, IAM, Secrets ni producción.
- La consola bloqueó la carga de `/admin/compras`; una compra autenticada no se
  ejecutó. No registrar Gate D/F funcional como `PASS` por el enrutamiento de
  fuente ni por la CI de Emulator.
- Después de una autorización separada: crear solo estos cuatro índices,
  esperar hasta `READY`, repetir consultas del panel y la pantalla Compras,
  capturar errores nuevos y continuar el preflight/deploy aislado de Rules
  conforme a ADR-SAAS-072. No ejecutar compras ni escribir datos como parte de
  esa validación.
