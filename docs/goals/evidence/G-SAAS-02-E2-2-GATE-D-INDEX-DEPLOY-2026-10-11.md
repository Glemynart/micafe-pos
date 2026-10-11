# G-SAAS-02 / M2 / E2.2 — Gate D deploy de índices Bodega (2026-10-11)

## Resultado

`INDEX_DEPLOY = PASS` para el delta exacto de cuatro índices compuestos de
compras y cuentas bancarias en el proyecto de staging `micafe-pos-staging`, base
`(default)`. La verificación final encontró 11 índices compuestos `READY` de
50 definidos en `firestore.indexes.json`, sin índices remotos adicionales; los
39 restantes no pertenecen al delta de esta corrección.

El despliegue se ejecutó después del preflight exacto, en el alcance de Gate D
de E2.2. La autorización condicional anterior de Rules no se amplió: no se
invocó ni modificó `firestore:rules`, Functions, IAM, Secrets, Auth, documentos,
fixture, tenant real ni producción.

## Índices creados

Cada fila fue verificada `READY` por `gcloud firestore indexes composite list`:

| Colección | Campos | Recurso remoto |
|---|---|---|
| `compras` | `espacioId ASC`, `fecha DESC` | `CICAgJiUsZIK` |
| `compras` | `empresaId ASC`, `fecha DESC` | `CICAgNi47oMJ` |
| `compras` | `empresaId ASC`, `espacioId ASC`, `fecha DESC` | `CICAgJjmnIgL` |
| `cuentas_bancarias` | `empresaId ASC`, `nombre ASC` | `CICAgJiUzYsK` |

Los cuatro recursos pertenecen a
`projects/micafe-pos-staging/databases/(default)/collectionGroups/.../indexes/...`.
El compare normalizado verificó `50` definiciones locales, `11` recursos
remotos, `11 READY`, `4/4` objetivos presentes y `0` extras. El preflight
inmediatamente anterior había confirmado `7 READY`, `4/4` ausentes y `0` extras.

## Verificación de superficie

La sesión Edge de `Administrador Bodega Demo` había cargado el panel del
preview #548; antes del deploy, `/admin/compras` mostró el shell con el área
principal en blanco. Después de que los índices quedaron `READY`, una recarga
encontró que la sesión había expirado y redirigió a `/admin/login`. No se
introdujeron credenciales ni se pudo completar todavía la verificación visual
autenticada. Tampoco se inició una compra ni se escribieron documentos.

Por ello, el resultado `PASS` cubre el deploy y estado de los índices, no el
Gate D completo. Falta reabrir `/admin/compras` con una sesión admin activa y
confirmar que renderiza sin `failed-precondition`, sin registrar compras.

## Mutación y rollback

- Proyecto/base afectados: `micafe-pos-staging` / `(default)`.
- Única mutación: creación add-only de esos cuatro índices compuestos.
- Ningún documento Firestore fue creado, actualizado o eliminado.
- Rollback técnico: borrar exclusivamente los cuatro recursos por su ID después
  de confirmar que ninguna consulta activa depende de ellos; no se ejecutó
  rollback ni se automatizó su eliminación.
