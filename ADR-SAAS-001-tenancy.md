# ADR-SAAS-001 — Modelo de tenancy multiempresa

## Estado

Aceptado. Deriva del documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
(decisión D-1, §3 y §6).

## Contexto

El sistema nació como un POS de un único establecimiento: las colecciones Firestore
son planas y su acceso se controla solo por rol (`esAdmin`, `esOperativo`), sin
ninguna noción de empresa propietaria. La identidad de Firebase Auth usa un dominio
interno global (`@micafe-pos.internal`). Todo el POS —ventas, pedidos, reservas, KDS,
inventario con ledger, impresión, alquileres, modificadores U1–U5— ya está en
producción y debe preservarse.

El objetivo es que cientos de restaurantes distintos operen sobre la misma
infraestructura con aislamiento fuerte entre ellos.

## Problema

Firestore no aísla datos por sí solo. Sin un modelo explícito de tenancy, cualquier
usuario autenticado puede leer colecciones completas de todos los negocios. Se
necesita decidir **cómo** se separa la información de cada empresa sin reescribir la
arquitectura por servicios (`lib/*-service.ts`) ni el modelo de datos existente.

## Decisión

Se adopta la **Estrategia A: colecciones planas + discriminador `empresaId` + custom
claims + Firestore Rules**, como capa transversal que se inserta debajo de los
servicios existentes.

1. **Colecciones planas.** Se conserva la estructura de colecciones actual. No se
   migran datos a subcolecciones `empresas/{id}/...` ni a bases de datos por tenant.

2. **`empresaId` obligatorio.** Todo documento operativo lleva `empresaId`. Es
   obligatorio en escritura y filtro obligatorio en lectura. Las colecciones del
   plano de plataforma (`planes`, `saas_operadores`, `saas_auditoria`) y la identidad
   global (`usuarios`) son la única excepción documentada (ver ADR-SAAS-004).

3. **Custom claims como fuente de verdad del aislamiento.** El token de Firebase Auth
   transporta `{empresaId, rol}` (o el claim de operador de plataforma). El cliente
   **nunca** decide su `empresaId`; lo impone el claim. Cambiar de empresa exige
   re-emitir el token.

4. **Firestore Rules como red de seguridad dura.** Toda regla operativa exige
   `resource.data.empresaId == request.auth.token.empresaId` en lectura y
   `request.resource.data.empresaId == request.auth.token.empresaId` en escritura.
   Un filtro olvidado en el cliente produce *deny*, no fuga. Las rules usan claims, no
   lecturas `get()`, para evitar costo y latencia.

5. **Defensa en profundidad en cuatro capas:** claims (Auth) → rules (Firestore) →
   helper de tenant en la capa de servicios (estampa y filtra `empresaId`
   centralizadamente) → prohibición de queries sin filtro de `empresaId`.

6. **Principio "extender, no reemplazar".** La multi-tenencia no rediseña el POS; cada
   servicio solo añade el filtro/estampado de `empresaId`. La forma de las entidades
   operativas existentes no cambia salvo la incorporación del campo.

## Consecuencias

- Impacto mínimo en los servicios: cada `lib/*-service.ts` añade el filtrado/estampado
  de `empresaId`, sin cambiar rutas de colección.
- Cada consulta gana `empresaId`, lo que multiplica los índices compuestos; debe
  vigilarse el límite de índices por proyecto Firestore.
- Se cierra de paso la deuda de queries sin `limit()` (IMP-13): a escala N-tenant una
  query sin cota es un incidente de costo.
- La seguridad depende de que **ninguna** capa se omita; el helper de servicios y las
  rules son redundantes a propósito.
- `movimientos_inventario` ya tiene `empresaId` reservado (FASE-15) y es el primer
  consumidor natural del modelo.

## Alternativas consideradas

- **B. Subcolecciones `empresas/{empresaId}/ventas/...`.** Aislamiento natural muy
  fuerte, pero obliga a reescribir las rutas de colección de todos los servicios.
  Rechazada por violar "extender, no reemplazar".
- **C. Base de datos por tenant.** Aislamiento máximo, pero operativamente inviable
  para cientos de tenants (provisión, índices, backups y despliegue de rules por base).
  Rechazada.

## Relación con otros ADR

- **ADR-SAAS-002** define la identidad y cómo los claims `{empresaId, rol}` que este
  ADR exige llegan al token (email global y autenticación operativa por código + PIN).
- **ADR-SAAS-004** define qué datos pertenecen a plataforma, empresa y espacio, y por
  tanto qué colecciones llevan `empresaId` bajo este modelo.
- **ADR-SAAS-003** se apoya en estas rules/claims para el enforcement de estados de
  suscripción y ciclo de vida de la empresa.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (D-1, §3, §6).
