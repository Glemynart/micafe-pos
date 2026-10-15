# ADR-SAAS-082 — Aislamiento de la consulta Dusema del codebase `saas-auth`

## Estado

**Aceptado — Opción 1; aprobación explícita recibida el 2026-10-15.**

- **Fecha de propuesta:** 2026-10-15.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial`.
- **Decisor:** responsable del proyecto.
- **Revisión:** 2026-10-15.
- **Límite de autorización:** se autoriza la implementación en código, pruebas y PR. No se autoriza desplegar el nuevo codebase en staging o producción, modificar Rules, aprovisionar los Secrets Dusema, ejecutar el corte de compras, crear/modificar tenants, cambiar permisos de operadores ni desplegar `saas-auth`.
- **Relacionados:** ADR-SAAS-041 (aislamiento de binding Dusema, propuesto), ADR-SAAS-043 (frontera comercial aceptada), ADR-SAAS-049, ADR-SAAS-071, ADR-SAAS-075 y ADR-SAAS-081.

## Contexto y evidencia

El backoffice SaaS es una interfaz compartida de la plataforma. El detalle de una empresa muestra una tarjeta de metadatos Dusema de solo lectura, protegida por `DUSEMA_TENANT_CONSULTAR`; el POS y su administración siguen bajo la autenticación operativa del tenant. Esta ADR no propone crear otro portal ni duplicar esa UI.

En el código actual, `registrarCompraOperativaV1` y `transicionarPausaComprasSaas` se exportan desde `functions/src/index.ts`, que pertenece al codebase `saas-auth`. Ninguna de sus implementaciones importa el cliente S2S Dusema. Sin embargo, el mismo entrypoint exporta `consultarTenantDusemaSaas`; su módulo importa el cliente Dusema y declara seis Secrets: `DUSEMA_ADMIN_BASE_URL`, `DUSEMA_S2S_ISSUER`, `DUSEMA_S2S_AUDIENCE`, `DUSEMA_S2S_KID`, `DUSEMA_S2S_PRIVATE_KEY` y `DUSEMA_S2S_ENVIRONMENT`. Firebase CLI descubre el manifiesto completo del codebase antes de aplicar `--only` y valida sus parámetros. Por eso un deploy dirigido a una función de compras puede detenerse por Secrets Dusema ausentes aunque la función objetivo no los lea en runtime.

La ruta canónica Bodega `registrarCompraBodegaV1` ya pertenece a `saas-bodega-operations`, sin Secrets Dusema. La callable legacy genérica debe conservar compatibilidad para otros verticales y rechazar Bodega mediante `BODEGA_USE_CANONICAL`; el control de corte aceptado por ADR-SAAS-081 permanece una callable de plataforma. No corresponde mover una segunda implementación de compras a otro codebase.

En la consulta remota de solo lectura del 2026-10-15, producción tenía `registrarCompraOperativaV1` activa en `saas-auth` con hash `9282ced0…` y `registrarCompraBodegaV1` activa en `saas-bodega-operations` con hash `fa7f47c2…`; `transicionarPausaComprasSaas` y `consultarTenantDusemaSaas` no aparecían en producción. En staging, el control de pausa sí aparecía activo en `saas-auth`, mientras `consultarTenantDusemaSaas` no aparecía. Esta observación no sustituye el preflight inmediatamente anterior a un release.

ADR-SAAS-043 ya acepta aislar una callable comercial del discovery de `saas-auth`, pero declara explícitamente que no amplía ni sustituye la decisión Dusema de ADR-SAAS-041, que continúa propuesta y limitada al binding de staging. La existencia de `saas-dusema-binding` no aprueba trasladar allí la consulta administrativa.

## Impulsores

- Mantener un único backoffice SaaS compartido para los operadores de Café Atrato y Dusema.
- Evitar que el release de compras/corte dependa de los seis Secrets exclusivos de la integración Dusema.
- Conservar identidad, contrato, autorización, aislamiento por tenant, auditoría y comportamiento de la consulta Dusema.
- No eliminar la integración, inventar Secrets, ampliar permisos ni modificar datos de tenants.
- Mantener los límites de codebase y de despliegue aprobados para Bodega.

## Opciones consideradas

### Opción 1 — Aislar la callable de consulta Dusema en un codebase propio

Crear un codebase dedicado `saas-dusema-platform` que descubra únicamente `consultarTenantDusemaSaas` y su cierre de dependencias revisado. Mantener su identificador callable, región, contrato, capacidad `DUSEMA_TENANT_CONSULTAR`, resolución del binding y auditoría. La consulta sí consume los cinco Secrets S2S y el parámetro de entorno; los seis se declaran solo en este codebase y no en `saas-auth`. La UI continúa invocando la misma callable desde el backoffice compartido.

**Ventajas:** desacopla el discovery de compras de los Secrets Dusema; conserva el portal, la autorización y el contrato; permite desplegar Dusema de manera independiente.

**Costes:** añade una frontera de Functions y exige extraer el cierre de la consulta sin importar `functions/src/index.ts` ni el módulo agregado `platform/callables.ts`; requiere pruebas de discovery y compatibilidad. El codebase Dusema seguirá necesitando sus propios Secrets para desplegar esa integración.

### Opción 2 — Mantener Dusema dentro de `saas-auth` y aprovisionar los seis Secrets

**Ventaja:** evita mover módulos o cambiar el manifiesto.

**Costes:** conserva el acoplamiento de despliegue y exige Secrets Dusema para desplegar superficies ajenas. No es una solución aceptable para desbloquear compras y no se autoriza por esta ADR.

### Opción 3 — Retirar o diferir la exportación Dusema

**Ventaja:** elimina esa dependencia de discovery sin una nueva frontera.

**Costes:** deja la tarjeta del backoffice sin su callable y posterga una parte de la integración compartida. No cumple el objetivo de conservar Dusema.

### Opción 4 — Crear otra frontera de compras Bodega

**Ventaja:** podría reducir el alcance de un despliegue futuro si contuviera únicamente operaciones Bodega.

**Costes:** es redundante para `registrarCompraBodegaV1`, que ya está en `saas-bodega-operations`; no elimina por sí sola el legacy guard aceptado ni el control de pausa de plataforma, y podría romper contratos de otros verticales. No se recomienda.

## Decisión propuesta

**Decisión aceptada:** adoptar la Opción 1, conforme a la aprobación explícita del responsable del proyecto del 2026-10-15.

La extracción debe preservar una sola implementación de cada regla. El nuevo entrypoint no importará el entrypoint ni el módulo agregado de `saas-auth`; reutilizará directamente los módulos canónicos mínimos de autorización, binding, auditoría, validación y cliente S2S. El nuevo manifiesto contiene exactamente esta callable y sus seis parámetros que consume. `saas-auth` no descubre la callable ni ninguno de esos parámetros. No se aprovisiona ningún secreto como parte del cambio.

## Impacto esperado

- **Operadores SaaS:** siguen usando el mismo backoffice y la misma tarjeta; no se crea otra consola.
- **Tenants existentes:** sin cambios de esquema, lifecycle, datos o ventas. La consulta conserva la asociación empresa–tenant validada en servidor.
- **Autorización:** no cambia `DUSEMA_TENANT_CONSULTAR`, la autoridad de plataforma, la validación del binding ni los controles multi-tenant. Las pruebas deben demostrarlo.
- **Compras Bodega:** permanecen en `saas-bodega-operations`; la legacy genérica conserva los demás verticales y su guard Bodega; el control de pausa mantiene su autoridad de plataforma.
- **Despliegue:** `saas-auth` deja de descubrir la consulta y sus seis Secrets; `saas-dusema-platform` los declara solo para su función. Esto elimina esta dependencia concreta, pero no sustituye el preflight de otros parámetros/Secrets de `saas-auth`.
- **Compatibilidad:** se preservan nombre callable, región y contrato request/response para el cliente del backoffice.
- **Rollback:** antes de desplegar, revertir el cambio de código/manifiesto. La consulta no estaba desplegada en producción ni staging en la lectura indicada, por lo que no hay endpoint existente que migrar. Si se despliega posteriormente, recuperar la revisión conocida del codebase Dusema; no borrar funciones o Secrets como rollback.

## Validaciones obligatorias antes de aceptar la implementación

1. Build independiente de `saas-auth` y del nuevo codebase.
2. Discovery de `saas-auth` sin `consultarTenantDusemaSaas` ni Secrets Dusema en su manifiesto; conservar el legacy guard y el control de pausa.
3. Discovery de `saas-dusema-platform` con exactamente la callable Dusema y solo los seis Secrets/parámetros que la consulta consume; cero exports o parámetros ajenos. Discovery de `saas-auth` sin la callable ni parámetros `DUSEMA_*`.
4. Pruebas de contrato, facultad del operador, asociación de tenant, aislamiento cross-tenant, auditoría, errores S2S y compatibilidad del cliente compartido.
5. Pruebas de regresión de `registrarCompraOperativaV1` para Bodega y otros verticales, y discovery secret-free de `saas-bodega-operations`.
6. Revisión de colisiones de nombre callable entre codebases, hashes/artefactos y plan de rollback.

Estas validaciones no autorizan deploy, cambios de IAM/Secrets, smoke productivo ni escrituras de tenants. Cada operación de producción conserva su autorización independiente.

## Registro de aceptación

El responsable del proyecto aprobó explícitamente la Opción 1 el 2026-10-15 y autorizó implementar el límite de codebase y abrir un PR aislado. Esta aceptación no modifica las restricciones de despliegue ni de datos indicadas arriba.

## Referencias

- `firebase.json` — manifiestos de `saas-auth`, `saas-dusema-binding` y `saas-bodega-operations`.
- `functions/src/index.ts`, `functions/src/platform/callables.ts` y `functions/src/platform/dusema-s2s-client.ts` — exports e imports actuales.
- ADR-SAAS-043 — patrón aceptado de aislamiento de discovery y límite respecto a Dusema.
- ADR-SAAS-049, ADR-SAAS-071 y ADR-SAAS-075 — aislamiento y autoridad de compras Bodega.
- ADR-SAAS-081 — autoridad server-side de pausa de compras.
- ADR-SAAS-041 (`aislamiento-codebase-deploy-dusema-staging`) — propuesto, solo binding Dusema de staging.
