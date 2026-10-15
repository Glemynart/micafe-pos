# G-SAAS-02 / M2 / E2.2 — Preflight del primer backend App Hosting productivo

**Fecha:** 2026-10-15 (lecturas remotas de solo lectura).
**Candidato:** `origin/main @ bdcf384c2c22248b002d2e4d32defee7f97cb686`.
**Estado:** `PREPARADO`; ninguna operación de producción fue ejecutada por este preflight.

## Comprobaciones actuales

| Frente | Evidencia comprobada | Estado |
|---|---|---|
| PR #609 | Head `19016469…`; checks en `SUCCESS`; auditoría `APROBADO PARA MERGE`; merge `bdcf384…`. | `VERIFICADO` |
| CI de `main` | Run `38762635830` para `bdcf384…` terminó `completed/success` en la relectura posterior. | `VERIFICADO`; el SHA sigue siendo candidato técnico, no autorización de mutación. |
| Código web | Desde el build staging `a460f4d…` hasta `bdcf384…` sólo cambiaron documentos; no cambió aplicación ni dependencias. La evidencia de Next `16.4.1` sigue aplicando. | `VERIFICADO` |
| App Hosting | `firebase apphosting:backends:list --project micafe-pos --json` devolvió `[]`. No existe backend, URL, build, rollout, tráfico ni identidad runtime productivos. | `PREPARADO`; creación y primer rollout requieren autorización separada. |
| Proyecto y APIs | `micafe-pos` está `ACTIVE`. App Hosting, Cloud Build, Artifact Registry, Cloud Run, Firestore, Firebase Rules y FCM están habilitadas. | `VERIFICADO` |
| Variables | El SDK web requiere seis `NEXT_PUBLIC_FIREBASE_*` y `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION=us-central1`. Measurement ID no se consume. VAPID y reservas/Wompi son condicionales, no prerrequisitos Bodega mientras sigan deshabilitados. No existe aún configuración productiva App Hosting que acreditar. | `PREPARADO`; cargar sólo valores del web app productivo, sin reutilizar staging ni registrar valores. |
| Identidad e IAM | `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com` no existe aún. Staging demostró: `computeRunner`, Firestore condicionado a `(default)` con `datastore.databases.get` y `datastore.entities.{get,list,create,update}`, y FCM `cloudmessaging.messages.create`. | `AUTORIZACIÓN PENDIENTE`; aplicar primero permisos sustitutos, probar rutas y sólo después retirar roles amplios si existen. No usar JSON de cuenta de servicio. |
| Functions | Producción tiene `registrarCompraOperativaV1` y `cambiarFacultadesOperadorSaas` activas, Node 22, hash `9282ced0…`; `transicionarPausaComprasSaas` no aparece. El candidato conserva ambos endpoints y discovery sin secretos Dusema. | `PREPARADO`; falta deploy dirigido de las dos callables, hashes posteriores y recuperación segura. |
| Firestore Rules | Release en `d5e205db-0ab4-4db1-b5ec-1534bee39d35`; SHA remoto `c3d98b…a92f3`, frente a `b8fb7d…17fdf` en candidato. | `AUTORIZACIÓN PENDIENTE`; falta matriz semántica vigente, tenants explícitos, pausa efectiva y ventana/operadores. |

## Secuencia preparada, no ejecutada

1. Confirmar CI `success` del SHA vigente y releer SHA, Functions, ruleset y backend justo antes de mutar.
2. Con autorización de Functions, desplegar sólo `saas-auth:registrarCompraOperativaV1` y `saas-auth:transicionarPausaComprasSaas`; comprobar estado, región, codebase y hash.
3. Con operador canónico facultado y tenants explícitos, inicializar y pausar controles; confirmar rechazo seguro antes de Rules.
4. Con autorización de Rules, desplegar ruleset completo; verificar hash y denegación de escrituras directas. Ante fallo, conservar pausa y hacer forward-fix; no restaurar Rules inseguras automáticamente.
5. Con autorización App Hosting, crear backend `us-central1` con URL inicial `hosted.app`, raíz `/`, Node 24, fuente/SHA explícitos y rollouts automáticos desactivados. Configurar identidad y variables antes del primer rollout; no migrar DNS.
6. Verificar build, rollout, tráfico, URL, SHA servido, logs y smoke autorizado. Reanudar compras sólo con la atestación de ADR-SAAS-081.

## Recuperación y bloqueos

El primer backend no tendrá versión App Hosting previa. Ante fallo: no promover tráfico, conservar pausa si ya fue activada, preservar logs y aplicar forward-fix validado. No volver a Next `16.4.0`/`15.2.9`, no usar Vercel como rollback y no restaurar Rules que reabran escrituras directas.

Bloqueos: autorizaciones separadas para Functions/controles/Rules/App Hosting/smoke, facultad canónica del operador, tenants exactos y ventana/responsables. Tenant, administradora, Trial, catálogo y stock de Diana no se ejecutaron.

## Matriz de autorización ejecutable

| Paquete | Actor requerido | Operación exacta | Prerrequisitos | Evidencia posterior | Recuperación |
|---|---|---|---|---|---|
| Functions | Operador Firebase autorizado para deploy dirigido, no una identidad inferida. | Publicar únicamente `saas-auth:registrarCompraOperativaV1` y `saas-auth:transicionarPausaComprasSaas` desde `bdcf384…`. | CI `38762635830` PASS; build/CI del SHA; revisión de manifest sin secretos Dusema; proyecto y región correctos. | Estado `ACTIVE`, `us-central1`, codebase `saas-auth`, hash remoto nuevo y callable de pausa presente. | Detener el corte; conservar Rules actuales hasta forward-fix. No desplegar el codebase completo ni una versión antigua. |
| Controles de compra | Operador autenticado con la facultad canónica de release; autoría/alcance verificados por Backoffice, no escritura directa. | Inicializar y pasar a `PAUSADA` sólo los controles de tenants autorizados. | Functions anteriores verificadas; facultad efectiva; lista exacta de tenants; ventana y responsables aprobados. | Relectura canónica muestra cada control, revisión y estado; compra nueva rechazada de forma segura. | Mantener `PAUSADA` ante duda; reanudar sólo con la atestación de ADR-SAAS-081. |
| Firestore Rules | Operador autorizado para ruleset productivo. | Desplegar el ruleset completo de `firestore.rules` del mismo SHA. | Pausa efectiva; matriz semántica de los 14 paths funcionales y control explícito revisada; Function guard publicada. | Release/ruleset y SHA remoto coinciden; escrituras directas de compra denegadas. | Forward-fix con pausa conservada; prohibido rollback automático a Rules que permitan bypass. |
| App Hosting | Operador App Hosting autorizado. | Crear/configurar el primer backend `micafe-pos` en `us-central1`, luego rollout explícito al SHA aprobado. | Identidad runtime creada y permisos mínimos comprobados; variables productivas verificadas; backend ID/URI `hosted.app`, raíz `/`, Node 24 y política de rollout confirmados. | Build/rollout/tráfico/URI/SHA/logs acreditados remotamente. | No promover tráfico si falla; conservar evidencia y aplicar forward-fix. No hay versión App Hosting previa. |
| Smoke | Identidad QA existente y autorizada para tenant/rol/lecturas definidos. | Lectura autenticada propia y negativa cross-tenant cuando aplique, sin escritura. | Hosting, Functions y Rules efectivos; tenant, claims y alcance aprobados. | HTTP/rutas/denegaciones y sesión registrados sin datos sensibles. | Detener el smoke; no cambiar permisos ni usar credenciales improvisadas. |
