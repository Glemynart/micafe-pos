# ADR-SAAS-069 — Sincronización viva de disponibilidad y solicitudes Bodega

## Estado

**PROPUESTO — pendiente de aprobación explícita del responsable.**

- **Fecha de propuesta:** 2026-10-10.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor:** responsable del proyecto. **Recomendación técnica:** Lead Engineer.
- **Relacionado:** ADR-SAAS-049, ADR-SAAS-062, ADR-SAAS-064 y ADR-SAAS-065.
- **Límite:** esta propuesta no cambia Rules, Functions, datos, tráfico ni la
  aplicación. No habilita listeners ni autoriza deploy a staging o producción.

## Contexto

El responsable pidió que el vendedor pueda ver cambios de disponibilidad y
estado de sus solicitudes sin refrescar manualmente, y que administración vea
las solicitudes nuevas sin pulsar “Actualizar”. La petición se registró como
precondición de Gate I en el preflight reconciliado de E2.2.

La implementación integrada hoy separa las lecturas por rol:

- El POS obtiene catálogo y disponibilidad mediante
  `consultarCatalogoPresentacionesVendedorV1`. La callable exige tenant y
  autorización, calcula disponibilidad desde stock físico menos stock
  reservado, y devuelve una proyección sin costo interno. El POS carga esa
  proyección al iniciar; no mantiene una suscripción de catálogo.
- El vendedor consulta sus solicitudes mediante una callable que restringe la
  consulta a `solicitanteUid`. La vista abierta vuelve a consultar cada 15 s.
- Backoffice consulta la bandeja de solicitudes mediante una callable que
  limita el resultado al tenant y al rol administrador. La pantalla consulta
  al entrar, después de aprobar/rechazar y por acción manual; no está
  suscrita a cambios de la bandeja.
- Administración sí usa snapshots tenant-aware para productos,
  presentaciones, clientes y ventas. Las Firestore Rules impiden que un
  vendedor lea directamente `productos` o `presentaciones_producto`; sus
  respuestas contienen campos internos que la proyección callable omite.
- La confirmación de venta revalida autorización, aprobación y stock en la
  transacción server-authoritative. Una proyección visual nunca puede reservar
  ni garantizar inventario.

Referencias de implementación observada: `components/bodega/bodega-admin.tsx`,
`components/bodega/bodega-vendedor-app.tsx`, `lib/bodega/admin-service.ts`,
`lib/bodega/solicitudes-service.ts`, `functions/src/bodega-vendedor/presentaciones.ts`,
`functions/src/bodega-vendedor/solicitudes-venta.ts` y `firestore.rules`.

## Invariantes y restricciones

- Firestore canónico y las callables server-authoritative siguen siendo la
  fuente de verdad de catálogo, solicitudes, stock, aprobación y venta.
- No se concede al vendedor lectura directa de documentos base de producto,
  presentaciones, solicitudes ajenas, costos ni ledger.
- Los clientes no escriben señales, stock, aprobaciones ni estados de
  solicitudes.
- Toda confirmación de venta vuelve a validar stock y permisos en el servidor,
  incluso si la pantalla acaba de recibir una actualización.
- El comportamiento debe cubrir cambios entre dispositivos y perfiles de
  navegador; un `BroadcastChannel` local no cumple el requisito.
- La bandeja protegida y el botón manual de actualización permanecen como
  recuperación si la conexión en vivo no está disponible.

## Opciones

### Opción 1 — Mantener polling de callables

Hacer que cada vista consulte las callables periódicamente mientras esté visible
y refresque al recuperar foco/conectividad. No agrega Rules ni documentos.

- **A favor:** mínimo cambio; reutiliza proyecciones autorizadas y es simple de
  desplegar o revertir.
- **En contra:** tiene latencia acotada por el intervalo, genera lecturas aun
  cuando nada cambia y no es una suscripción en tiempo real. No satisface una
  garantía de convergencia impulsada por cambios.

### Opción 2 — Suscribir clientes a los documentos de negocio

Usar `onSnapshot` sobre productos, presentaciones y solicitudes, agregando Rules
para permitir que los vendedores los consulten.

- **A favor:** actualización directa de Firestore con menos polling.
- **En contra:** Firestore no redacta campos por documento; habilitar la lectura
  de productos/presentaciones podría exponer costos u otros datos internos. Las
  solicitudes también requieren una nueva frontera de autorización y DTO. Se
  acopla la UI al modelo persistido y amplía el acceso a datos de negocio.

**No recomendada:** contradice el aislamiento actual y la proyección sanitizada
de ADR-SAAS-049/062 salvo que se replantee la frontera de lectura.

### Opción 3 — Señales de cambio tenant-aware y relectura por callable

Crear señales no sensibles de invalidación separadas por canal (disponibilidad,
bandeja administrativa y solicitudes propias del vendedor). Cada transacción
canónica que cambie la vista incrementa la señal correspondiente. El POS y
Backoffice escuchan únicamente la señal autorizada y, al cambiar, vuelven a
consultar la callable existente para recibir el DTO autorizado de estado actual.
La señal no contiene productos, importes, clientes, aprobaciones ni datos del
ledger. Al volver de desconexión se hace una lectura completa por callable.

- **A favor:** propagación push de cambios entre dispositivos sin exponer los
  documentos de negocio; se reutiliza la autorización y sanitización existentes;
  no crea una autoridad paralela de inventario.
- **En contra:** agrega persistencia mínima, Rules de solo lectura y escrituras
  atómicas adicionales en cada ruta canónica que afecte esos canales. Deben
  cubrirse ventas, ajustes/otros movimientos de stock, reservas y liberaciones,
  cambios del catálogo y todas las transiciones de solicitud. Una señal compartida
  puede ser un punto de contención y exige pruebas de concurrencia y rollback.

### Opción 4 — FCM como único mecanismo de invalidación

Enviar mensajes de datos a cada navegador y refrescar las callables al recibirlos.

- **A favor:** reutiliza el canal de notificaciones ya desplegado.
- **En contra:** depende de token y permiso del navegador y no garantiza entrega;
  el estado visible puede quedar obsoleto sin una lectura de recuperación. No es
  suficiente como fuente única para mantener inventario visible actualizado.

## Recomendación propuesta

Se recomienda la **Opción 3**. Es la única opción evaluada que cumple la
expectativa de actualización impulsada por cambios entre dispositivos sin abrir
lectura directa de documentos con datos sensibles ni duplicar la autoridad de
las callables. FCM seguirá dedicado a los avisos del sistema operativo; no será
la única señal de consistencia de la interfaz.

Objetivo de verificación propuesto para staging: vistas conectadas convergen
automáticamente después del commit de la operación canónica, sin depender del
botón “Actualizar”; al desconectarse muestran estado no confirmado/obsoleto y,
al reconectar, hacen una relectura completa. El responsable debe aprobar el
objetivo de latencia observable antes de fijar un umbral de aceptación; esta
propuesta no inventa un SLA de producción.

## Consecuencias si se aprueba la Opción 3

- Antes de implementar se enumerarán todas las transacciones canónicas que
  mutan cada canal y se probará que cada una actualiza señal y dato de negocio
  atómicamente. Las rutas legacy o directas que no puedan garantizarlo deberán
  bloquear la certificación hasta corregirse o excluirse mediante una decisión
  explícita.
- Las Rules permitirán lectura únicamente a miembros Bodega vigentes y
  autorizados del `empresaId` correspondiente; el vendedor solo leerá el canal
  de catálogo y sus propias solicitudes; administración leerá la bandeja
  administrativa. Toda escritura desde SDK cliente se deniega.
- El cliente agrupará cambios consecutivos antes de reconsultar, cancelará la
  suscripción al salir de la vista y hará lectura inicial/de recuperación al
  entrar o reconectar.
- La disponibilidad visible es informativa. La venta puede rechazarse si el
  stock ya cambió; el servidor no confía en la señal ni en el valor mostrado.
- La prueba staging debe cubrir dos vendedores en dispositivos separados,
  aprobación administrativa, cambios de stock/reserva, desconexión/reconexión,
  autorización revocada, cross-tenant, replay y ausencia de lecturas de costo.

## Rollback

Revertir por PR la suscripción y las escrituras de señales y restaurar la lectura
actual con recuperación manual/polling. Revertir las Rules asociadas en el mismo
rollback. Las señales solo contienen versiones técnicas, por lo que su
persistencia residual no cambia ventas, inventario, aprobaciones ni ledger y no
requiere borrar datos canónicos.

## Decisión requerida

El ADR permanece `PROPUESTO`. El responsable debe aprobar la Opción 3, escoger
otra opción o rechazar el cambio. La aceptación habilitaría un PR de
implementación separado, con Rules, transacciones, reconciliación, tests y
preflight de staging; no autoriza por sí misma deploy, escritura de datos del
cliente ni producción.
