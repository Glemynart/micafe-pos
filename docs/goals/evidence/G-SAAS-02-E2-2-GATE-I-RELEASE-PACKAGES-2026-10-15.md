# Gate I — Paquetes de release y matriz operativa

**Fecha:** 2026-10-15. **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
**Estado global:** `INCOMPLETE`. Este documento prepara operaciones
independientes; no es autorización de producción.

## Base comprobada

| Hecho | Evidencia | Estado |
|---|---|---|
| Fuente de release | `origin/main @ f25ef9b9743511bd5bdedeb24df90269213c99fb`; CI post-merge `38650796029` `success`. | `PASS` histórico; recalcular inmediatamente antes de cualquier release. |
| PR documental #599 | HEAD `53b767b`; CI `38657327856`, Vercel Preview y Preview Comments terminaron `PASS`. La rama no se integra mientras el responsable no resuelva el tratamiento de los metadatos históricos. | Checks `PASS`; merge/auditoría de privacidad `BLOCKED`. |
| Recovery | Restore aislado verificado, `RPO=8.307 h`, `RTO=0.220 h`, sin cutover de fuente. | `PASS`. |
| PITR | Deshabilitado conforme a ADR-SAAS-031. | Decisión aprobada; no es acción pendiente. |
| DIAN web y Trial | No hay autoridad web server-side para Factus; fecha de Diana registrada, sin tenant, usuario, credencial ni Trial. | DIAN `BLOCKED`; Trial `NOT EXECUTED`. |

## Paquetes independientes

### P-Rules — Reconciliación Firestore

| Campo | Preparación |
|---|---|
| SHA/fuente | `main @ f25ef9b`; Rules fuente SHA-256 `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`. |
| Estado remoto observado | Ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`; SHA remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; 14 divergencias efectivas. |
| Pruebas | `npm run test:rules`: 45/45 PASS en Emulator. Matriz de consumidores y compatibilidad documentada. |
| Impacto | Afecta 14 paths, incluida la protección de escrituras de compras y el writer DIAN cliente legado; no equivale a habilitar DIAN web. |
| Precondiciones | SHA/carpeta/proyecto literal revalidados; callable con guard publicada y verificada; control técnico de pausa aceptado e implementado **o** excepción manual explícita; ventana/operadores designados; tenants activos/trial reenumerados; autorización específica de Rules. |
| Procedimiento autorizado pendiente | Pausar compras, confirmar drenaje, comprobar delta/release activo, desplegar Rules como unidad, leer SHA remoto y observar errores sin generar compras productivas. |
| Aborto/recuperación | Mantener pausa ante hash distinto, 5xx o `permission-denied` inesperado. Aplicar forward-fix aprobado. No restaurar automáticamente Rules antiguas si reabren escrituras directas. |
| Estado | `BLOCKED`; deploy `NOT EXECUTED`. |

### P-Functions — `registrarCompraOperativaV1`

| Campo | Preparación |
|---|---|
| SHA/fuente | `main @ f25ef9b`; código fuente contiene `BODEGA_USE_CANONICAL` antes de efectos para operación nueva y replay. |
| Artefacto/pruebas | JavaScript compilado local `compra-core.js` SHA-256 `fdc5e205172eddf2eb03f585fdecdcf3550c270ad727c30c7c54f4fb1cbe701c`; `npm run build:functions` PASS; `npm run test:auth-foundation`: 436 PASS, 5 SKIP, 0 FAIL; pruebas de compra cubren operación nueva/replay. El hash Firebase no se equipara a ese SHA local. |
| Estado remoto observado | Gen2, Node.js 22, `us-central1`, hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard. |
| Precondiciones | Rebuild desde SHA congelado, test de compra/artefacto, preflight de codebase `saas-auth`, endpoint Wompi ausente revalidado, delta limitado, autorización específica de Function. |
| Procedimiento autorizado pendiente | Desde carpeta productiva aislada: deploy dirigido de la única callable; no sustituir por deploy global ni usar dry-run que altere APIs. Verificar región, runtime, hash/versión y rechazo Bodega en operación nueva/replay. |
| Recuperación | Antes de tenant Bodega real, revertir solo el cambio de código con preflight y mantener Rules cerradas; después de alta, forward-fix, sin reabrir callable legacy ni Rules inseguras. |
| Estado | `BLOCKED`; deploy `NOT EXECUTED`. |

### P-Vercel — publicación identificable

| Campo | Preparación |
|---|---|
| SHA objetivo | Recalcular desde `origin/main` tras cada merge; al corte de esta evidencia: `f25ef9b9743511bd5bdedeb24df90269213c99fb`. |
| Estado productivo observado | Deployment `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, `READY`, asociado a `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`; HTTP `200` confirma salud, no que sirva el SHA objetivo. |
| Precondiciones | SHA autorizado, CI post-merge de ese SHA, política Vercel, deployment anterior identificado, autorización específica de publicación. |
| Procedimiento autorizado pendiente | Publicar manualmente el SHA exacto; verificar deployment, alias, respuesta de salud y asociación SHA sin ejecutar transacciones. |
| Recuperación | Rollback identificado al deployment conocido, solo con autorización y verificación posterior de alias/SHA. |
| Estado | Acreditación objetivo `FAIL`; publicación `NOT EXECUTED`. |

### P-Smoke — lectura autenticada

| Campo | Preparación |
|---|---|
| Alcance permitido propuesto | Una lectura canaria permitida de configuración propia y una lectura cross-tenant denegada, sin compras, ventas, inventario, DIAN ni otra escritura. |
| Precondiciones | Identidad existente dedicada, tenant confirmado por propietario, rol/claims de lectura y autorización explícita de alcance/fecha. El nombre de un tenant no es evidencia de seguridad. |
| Verificación | Registrar resultado permitido/denegado, SHA/alias publicados y ausencia de escrituras. No consultar ni registrar credenciales. |
| Recuperación | Cerrar sesión/revocar acceso temporal conforme al mecanismo existente; detener ante acceso inesperado. |
| Estado | `BLOCKED`; smoke `NOT EXECUTED`. |

## Matriz operativa de release

| Etapa | Responsable | Ventana | Criterio de aborto | Autorización |
|---|---|---|---|---|
| Congelar/validar source y preflight | Operador de release, por designar | No acordada | SHA, proyecto, artefacto o delta distinto | Revisión operativa previa; no despliega. |
| Pausar/drenar compras | Control técnico aprobado y operador de cada tenant, ambos por designar | No acordada | Operación ambigua, control no disponible o escritor no cubierto | Arquitectura aceptada o excepción manual explícita. |
| Function dirigida | Operador de release, por designar | Misma ventana aprobada | Hash/ruta/runtime/delta inesperados | Autorización específica de Functions. |
| Publicación Vercel | Operador de release, por designar | Misma o ventana separada aprobada | SHA/alias/salud no esperados | Autorización específica de Vercel. |
| Rules | Operador de release y revisor read-only, por designar | Posterior a Function/cliente compatibles | Error 5xx, permiso inesperado o Rules SHA distinto | Autorización específica de Rules. |
| Smoke de lectura | Identidad y propietario del tenant, por designar | Tras releases autorizados | Escritura, acceso cruzado permitido o identidad/rol no coincidente | Autorización específica de smoke. |
| Reanudación | Propietario/administrador, por designar | Tras verificaciones | Cualquier criterio de aborto abierto | Autorización operativa explícita. |

Ninguna fila confirma ventana, responsable, tenant, identidad o permiso. El
corte manual sigue siendo una alternativa no aprobada, con los riesgos
documentados en ADR-SAAS-081. No se hicieron despliegues, escrituras de
producción, smoke ni provisión del Trial.
