# U2 — Requisitos pendientes de infraestructura y U1

Este documento registra dependencias confirmadas durante la implementación de U2.
No modifica reglas Firestore.

## Estado

- **U1.1 implementado:** suscripciones administrativas de relaciones,
  reactivación que preserva configuración, reordenamiento transaccional e
  integridad al eliminar opciones.
- **Infraestructura pendiente:** reglas Firestore para ambas colecciones.

## Requisito de infraestructura

Las colecciones `modificador_grupos` y `producto_modificador_grupos` no tienen
un `match` específico en `firestore.rules`; el fallback actual las deniega.

La unidad de infraestructura y seguridad debe definir reglas para:

- lectura autenticada que permita administrar y, en U3, resolver modificadores;
- escritura restringida al rol o permiso administrativo que se apruebe;
- coherencia de pertenencia a `espacioId`, si esta validación se lleva a reglas.

U2 no debe modificar estas reglas. Hasta que esa unidad se despliegue, las
suscripciones y escrituras de modificadores recibirán `permission-denied`.

## Limitaciones confirmadas de U1

### Relaciones inactivas

`suscribirProductoModificadorGrupos(productoId)` devuelve únicamente relaciones
activas. Al desactivar una relación, la interfaz deja de recibirla y no puede
mostrarla ni reactivarla conservando sus overrides.

**U1.1 implementado:** se expuso
`suscribirTodosProductoModificadorGrupos(productoId, callback)`, sin filtro por
`activo`, ordenado igual que la suscripción actual. La hoja administrativa podrá
entonces mostrar estado activo/inactivo y reactivar la misma relación mediante
`reactivarGrupoEnProducto` sin perder sus overrides.

### Resumen en la tabla de productos

Los servicios U1 solo consultan relaciones de un producto individual. Mostrar
los grupos asignados en cada fila de Inventario sin N+1 suscripciones requiere
una lectura agregada por espacio.

**U1.1 implementado:** se expuso
`suscribirProductoModificadorGruposPorEspacio(espacioId, callback)` para que U2
construya un mapa `productoId -> relaciones` y presente chips/resumen en la
tabla.

### Reordenamiento confiable

U1 permite cambiar el orden mediante `asignarGrupoAProducto`, pero no incluye
una operación atómica para intercambiar o normalizar varias relaciones. Varias
escrituras independientes pueden dejar órdenes parciales si falla la red.

**U1.1 implementado:** se añadió una operación transaccional
`reordenarProductoModificadorGrupos(productoId, grupoIdsOrdenados)` que valide
que las relaciones pertenecen al producto y escriba sus órdenes en una sola
transacción.

### Eliminación de opciones referenciadas

Las opciones se guardan embebidas en el grupo, mientras que las relaciones
pueden contener `opcionesPermitidas` y `opcionOverrides` por ID. Eliminar una
opción referenciada deja configuraciones obsoletas que U1 rechazará al siguiente
guardado de la relación.

**U1.1 implementado:** la edición del grupo valida previamente las relaciones
por `grupoId` y bloquea la eliminación cuando una opción está presente en
`opcionesPermitidas` u `opcionOverrides`. Es una validación preventiva del
cliente: la garantía atómica frente a escrituras concurrentes requiere una
unidad posterior de infraestructura de servidor o reglas, que queda fuera de
U1.1 y U2.

## Decisión de alcance

U1.1 se limita a los bloqueos de U2 descritos arriba. No crea modelos ni
colecciones, y no incluye reglas Firestore ni lógica del POS.
