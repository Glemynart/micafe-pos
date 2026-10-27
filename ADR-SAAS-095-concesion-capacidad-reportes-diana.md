# ADR-SAAS-095 — Concesión contractual de reportes operativos a Distribuidora Las Jiménez

## Estado

**PROPUESTO — 2026-10-27.** La decisión de negocio registrada en esta conversación limita la capacidad a Distribuidora Las Jiménez, sin cambiar el precio ni el plazo contractual. La arquitectura de concesión descrita aquí aún no está aprobada ni implementada.

- **Goal:** `G-SAAS-02 → M2 → E2.2`.
- **Relacionado:** ADR-SAAS-041, ADR-SAAS-042, ADR-SAAS-087; implementación de reportes en PR #676 y guía `docs/testing/G-SAAS-02-E2-2-financial-reports.md`.
- **Alcance:** habilitar el módulo de reportes operativos existente únicamente para el contrato vigente de `distribuidora-las-jimenez`.
- **Fuera de alcance:** cambiar el Plan publicado, precio, plazo o Trial; habilitar reportes para otros tenants; nuevos cálculos contables/fiscales; escrituras de datos de reportes; importación de catálogo; despliegue o cambio de configuración en producción.

## Contexto

PR #676 ya integra la vista Bodega de reportes para administración. La página `/admin/reportes` muestra “El módulo de reportes no está habilitado para este negocio” cuando `modulos.habilitados` no contiene `reports`. La consulta es de solo lectura, tenant-aware y reservada a una membresía administradora activa; el módulo no constituye contabilidad fiscal ni declaración DIAN.

El preflight read-only de producción del 2026-10-27 confirma que:

- `planes/mvp_comercial/versiones/2` está `PUBLICADA` y no incluye `reports` en sus capacidades.
- `suscripciones/distribuidora-las-jimenez` está en `trialing`, usa Plan `mvp_comercial` versión 2 y su snapshot contractual tampoco incluye `reports`.
- `configuraciones/distribuidora-las-jimenez` tiene habilitados `sell, inventory, purchases, shifts, waste, clientes, finanzas`; `reports` está ausente.

Por ello, la advertencia refleja el contrato y configuración actuales. La callable de configuración deriva módulos permitidos del Plan/snapshot y rechaza capacidades fuera de esa fuente. Añadir `reports` solo a la configuración, modificar la versión publicada o editar el snapshot contractual omitiría la autoridad vigente y dejaría el contrato incoherente.

La respuesta del responsable “Solo Diana, mismo precio y plazo” autoriza la intención comercial para esta única empresa, pero no define todavía la autoridad técnica persistente que debe representar una capacidad extra sobre un snapshot inmutable.

## Decisión propuesta

Adoptar una **concesión contractual adicional, append-only y limitada a reportes** para el contrato vigente de Distribuidora Las Jiménez:

1. Crear un registro bajo `suscripciones/{empresaId}/concesionesCapacidad/{concesionId}`, escrito exclusivamente por la autoridad comercial de plataforma. El registro vincula la concesión con el ID y revisión del contrato/suscripción, `planId`, `planVersion` y huella del snapshot al que se aplica.
2. La primera versión acepta exclusivamente:
   - `empresaId = distribuidora-las-jimenez`;
   - capacidad `reports`;
   - contrato actual anual `mvp_comercial` v2 de esa empresa.

   No ofrece una pantalla genérica ni modifica capacidades de otros tenants. Ampliar esta lista requiere una decisión posterior.
3. Autorizar la concesión mediante un comando de plataforma protegido por la facultad existente `COMERCIAL_GOBERNAR`, sin añadir permisos IAM ni una interfaz de autoservicio. El comando exige `expectedRevision`, `commandId`, `idempotencyKey`, motivo codificado y actor registrado. La transacción valida el contrato ligado, rechaza estados no operativos y deja recibo/auditoría append-only. Repetir exactamente el mismo comando es idempotente; reutilizar la clave con contenido distinto falla.
4. Resolver capacidades efectivas como la unión de las capacidades del snapshot vigente y las concesiones válidas vinculadas a ese mismo contrato. La concesión no edita el Plan publicado ni el snapshot original. Solo tiene efecto mientras siga vigente el contrato ligado (incluido el Trial y su continuación bajo el mismo contrato anual); termina al terminar o cancelarse ese contrato y no se transfiere automáticamente a una renovación nueva.
5. Una vez desplegada esa autoridad, un administrador del tenant activa `reports` en la configuración mediante el comando de configuración existente. El validador solo lo acepta tras comprobar la concesión efectiva.
6. El módulo conserva su consulta de solo lectura, control de membresía admin y aislamiento por tenant. No agrega permisos de escritura ni convierte las métricas en información fiscal.

Esta decisión requiere aceptar una nueva entidad/autoridad de contrato y una nueva ruta de resolución; por eso no debe implementarse dentro del PR de catálogo ni habilitarse mediante una edición manual de Firestore.

## Alternativas consideradas

### A. Concesión contractual adicional para Diana — recomendada

Respeta la solicitud “solo Diana” y deja sin cambios el precio, el plazo, el Trial, el Plan publicado y el snapshot contractual. Introduce una autoridad explícita, auditable, idempotente y revocable para capacidades adicionales.

**Costo/riesgo:** agrega una entidad contractual y exige integrar su resolución con la configuración de módulos; requiere pruebas de aislamiento, expiración y autorización. El primer corte será deliberadamente de un solo tenant y una sola capacidad.

### B. Publicar una nueva versión general de Plan con `reports`

Mantendría la inmutabilidad del Plan v2 y sería clara para contratos nuevos, pero habilitaría la capacidad en la oferta general y no modificaría el snapshot v2 de Diana. Migrar su contrato actual durante Trial no está permitido por el flujo actual y excedería “solo Diana”.

### C. Editar directamente configuración, Plan publicado o snapshot

Se descarta. La configuración está sujeta al contrato; editar el Plan publicado rompe la inmutabilidad y editar el snapshot reinterpreta un contrato ya iniciado. Una escritura manual también evitaría comando, idempotencia y auditoría.

### D. Mantenerlo deshabilitado hasta una renovación

Conserva el contrato sin nueva autoridad, pero no satisface el uso de reportes solicitado durante el contrato actual.

## Seguridad, compatibilidad y reversión

- La implementación debe verificar con Emulator que Rules niegan lectura y escritura de la subcolección desde clientes. La concesión solo se escribe mediante autoridad de plataforma; ninguna callable de tenant puede concederla.
- El comando exige el tenant exacto, capacidad permitida, revisión y huella del contrato; rechaza destinatario, plan, versión, estado o capacidad diferentes.
- Las concesiones son inmutables. La revocación, si se necesitara, se expresa mediante un comando compensatorio auditado; no se borra el registro.
- Antes de ejecutar el alta en producción, una consulta read-only debe confirmar de nuevo empresa, contrato, plan, snapshot y ausencia de concesión previa. Esa operación remota requerirá una autorización operativa específica posterior.
- Rollback: mientras el resolver nuevo sigue desplegado, desactivar `reports` mediante el comando oficial de configuración y comprobar que la pantalla queda oculta; después volver al código anterior. La concesión append-only permanece ligada al contrato y no crea datos de reportes. Su revocación, si se requiere, usa un comando compensatorio auditado. No se modifica ni borra el contrato base.
- Ningún cambio de este ADR autoriza por sí mismo desplegar, modificar configuración o escribir en Firebase.

## Criterios verificables antes de implementación y despliegue

1. El Plan `mvp_comercial` v2 y el snapshot original permanecen idénticos antes y después; precio, periodicidad, inicio y fin del Trial/contrato no cambian.
2. La concesión acepta solo `reports` y `distribuidora-las-jimenez`; cualquier otro tenant, capacidad, Plan, snapshot o estado se rechaza sin escritura.
3. Comandos duplicados no duplican concesión ni recibo; conflicto de idempotencia y revisión obsoleta se rechazan.
4. La resolución incluye `reports` solo mientras el contrato vinculado sea operativo; contratos ajenos, vencidos, suspendidos o sustituidos no lo heredan.
5. La callable de configuración permite activar `reports` tras la concesión y lo rechaza antes de ella; no cambia otras capacidades.
6. Rules niegan escritura/lectura directa de concesiones al tenant; reportes siguen restringidos a admin y consultan solo su empresa.
7. Pruebas de Functions cubren autorización, tenant cruzado, lista permitida, revisión, idempotencia, revocación, expiración y compatibilidad con relaciones contractuales existentes.
8. Emulator prueba Rules y el aislamiento cross-tenant. E2E comprueba mensaje deshabilitado antes, disponibilidad después de concesión + activación, consulta admin, y denegación a vendedor/otro tenant.
9. Un preflight productivo de solo lectura confirma el objetivo exacto antes de la autorización separada de la escritura. Después del despliegue, una verificación independiente confirma la versión de Functions, la concesión, la configuración y la carga del reporte.

## Aprobación requerida

El responsable debe aprobar o rechazar explícitamente la alternativa A como mecanismo arquitectónico. Hasta entonces, el estado del ADR permanece **PROPUESTO**, el código y la configuración remota no se modifican, y el módulo permanece deshabilitado.
