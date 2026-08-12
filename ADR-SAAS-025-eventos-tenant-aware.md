# ADR-SAAS-025 — Contrato tenant-aware y transición de Eventos en Firestore

- **Estado:** Aceptado
- **Fecha:** 2026-08-08
- **Decision makers:** Lead Engineer; propietario del Goal
- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial
- **Milestone:** `M4` — Certificación comercial
- **Epic:** `E4.2` — Release readiness
- **Relacionados:** `ADR-SAAS-024`, `firestore.rules`, `firestore.indexes.json`, `lib/eventos-service.ts`, `components/ui/eventos-section.tsx`

> Este ADR establece el contrato de Firestore para Eventos y su transición
> desde el modelo global legacy. La aceptación autoriza únicamente PR B1
> (contrato Firestore, Rules, servicio y UI administrativa); no autoriza B2,
> B3, migraciones ni escrituras en producción.

> **Estado actual post-MVP (2026-08-11):** B1 (#196), B2 (#197), B3-A
> (#199), B3-B (#201) y el cierre productivo controlado (#235/#236) fueron
> integrados y auditados. El contrato público tenant-aware está vigente y los
> cuatro objetivos legacy autorizados ya fueron cerrados. Las restricciones de
> autorización de esta aceptación son **HISTÓRICAS**; no queda una migración B3
> pendiente en el Goal.

## 1. Contexto y problema

`ADR-SAAS-024` resolvió el contrato de Firebase Storage: los assets nuevos de
un tenant viven bajo `tenants/{empresaId}/...`. La colección Firestore
`eventos`, sin embargo, todavía es global:

- los documentos nuevos no contienen `empresaId`;
- el servicio cliente consulta y muta `eventos` sin filtro tenant;
- las Rules permiten lectura anónima global y escritura por rol sin validar
  propietario;
- la landing pública consulta la colección global;
- documentos históricos y URLs legacy no tienen una atribución confiable.

El modelo de producto aprobado establece que los eventos son contenido público
propiedad de un tenant. La landing, los eventos, las reservas y el marketing
son recursos públicos pertenecientes siempre a un tenant. La visibilidad
pública no elimina esa propiedad y un administrador de un tenant nunca puede
administrar contenido de otro.

## 2. Drivers y criterios

La decisión debe:

1. hacer obligatorio el propietario `empresaId` en todo Evento nuevo;
2. derivar `empresaId` de la sesión autenticada y no de un valor editable del
   cliente;
3. impedir lecturas administrativas y mutaciones cruzadas;
4. ofrecer lectura pública únicamente dentro del contexto tenant solicitado;
5. conservar documentos legacy sin asignarlos silenciosamente a un tenant;
6. evitar una migración física innecesaria de la colección existente;
7. mantener Storage y Firestore como fronteras separadas, según ADR-SAAS-024;
8. poder certificarse completamente con Emulator y fixtures multi-tenant;
9. no realizar escrituras en producción sin autorización explícita;
10. conservar una ruta de transición y rollback sin borrado masivo.

## 3. Alternativas consideradas

### A. Mantener `eventos/{eventoId}` y añadir `empresaId` inmutable — recomendada

La colección superior permanece, pero `empresaId` se convierte en un campo
obligatorio del contrato canónico. Las Rules comparan ese campo con el claim de
la sesión y todas las consultas tenant-aware filtran por él.

**Ventajas:**

- conserva el patrón vigente del SaaS: las colecciones operativas tenant-aware
  son superiores y llevan `empresaId`;
- no exige mover físicamente documentos a otra jerarquía;
- simplifica índices, tooling y compatibilidad con los identificadores actuales;
- permite una transición explícita de los documentos sin propietario conocido.

**Costes:**

- la propiedad no es visible en el path y depende de Rules y consultas correctas;
- los documentos legacy coexisten temporalmente con los canónicos;
- la lectura pública no debe mantenerse como un `allow read: if true` global.

### B. Mover el agregado a `tenants/{empresaId}/eventos/{eventoId}`

La propiedad se expresa en la ruta Firestore, siguiendo el ejemplo utilizado
para Storage.

**Ventajas:**

- la pertenencia tenant resulta visible en la jerarquía física;
- facilita expresar una regla de ruta para la administración.

**Costes:**

- introduce una segunda convención de persistencia distinta a `productos`,
  `reservas`, `ventas` y el resto del núcleo existente;
- requiere mover o duplicar documentos, índices, consultas y tooling;
- complica la transición de documentos legacy y la compatibilidad de IDs;
- la ruta por sí sola no sustituye la validación del claim.

Se rechaza para este corte por mayor superficie de migración sin una ganancia
de autorización proporcional.

### C. Mantener la colección global y controlar solo por rol

Se rechaza. El rol `admin` o `marketing` no identifica al tenant propietario y
mantendría la posibilidad de administrar eventos ajenos.

## 4. Decisión propuesta

### 4.1 Contrato Firestore canónico

Se conserva la colección superior `eventos`. Todo documento nuevo debe incluir:

```text
eventos/{eventoId}
  empresaId: string       // obligatorio, inmutable
  titulo: string
  descripcion: string
  fecha: string
  hora: string
  categoria: string
  activo: boolean
  creadoPor: string
  creadoEn: Timestamp
  imagenUrl?: string      // solo asset canónico del mismo tenant en documentos nuevos
```

`empresaId` se obtiene del claim tenant de la sesión. La UI puede usar el
contexto SaaS para construir una consulta, pero nunca puede convertir un valor
libre enviado por el cliente en autoridad.

Las Rules deberán exigir:

- lectura autenticada únicamente cuando el documento pertenece al tenant de la
  sesión y la Empresa es operativa;
- creación únicamente para `admin` o `marketing`, con `request.resource.data.empresaId`
  igual al claim;
- actualización únicamente conservando el mismo `empresaId`;
- eliminación únicamente para la facultad autorizada del tenant;
- ninguna escritura nueva sin `empresaId`.

La lectura anónima directa de la colección no será la autoridad del contenido
público. La superficie pública deberá resolver primero el tenant desde un slug
o dominio en el servidor y devolver solo eventos activos de ese tenant. El
dominio personalizado únicamente resuelve el contexto público (`empresaId`);
nunca sustituye el modelo de autorización administrativa ni se utiliza como
fuente de permisos. El dominio enviado por el cliente tampoco se convierte en
autoridad.

Durante B1 se conservó temporalmente la lectura anónima directa existente para
no romper la landing antes de que B2 entregara su superficie pública
tenant-aware. B2 sustituye esa compatibilidad por un endpoint server-side que
resuelve el slug, filtra por `empresaId` y devuelve únicamente la proyección
pública de eventos activos. La lectura anónima directa de Firestore queda
denegada.

### 4.2 Assets de Eventos

Los documentos nuevos solo podrán referenciar un asset canónico bajo:

```text
tenants/{empresaId}/eventos/{eventoId}/{archivo}
```

El uploader deberá correlacionar el ID del documento Firestore con el segmento
de Storage. Las URLs legacy se conservarán solo como evidencia histórica y no
se presentarán como assets tenant-aware. La UI no ofrecerá una URL externa como
forma de crear un asset nuevo del tenant.

### 4.3 Documentos legacy

Un documento `eventos/{eventoId}` sin `empresaId` se considera
`LEGACY_NO_CLASIFICADO`:

- no se asigna automáticamente a Café Atrato ni a otro tenant;
- no se modifica desde la UI tenant-aware;
- no aparece en consultas canónicas de administración ni en la superficie
  pública tenant-aware;
- se conserva hasta que exista un mapeo explícito y autorizado.

La transición podrá usar un backfill idempotente que conserve el ID del evento,
preserve su snapshot de contenido y registre evidencia de cada clasificación.
Un documento que no pueda atribuirse de forma verificable se mantiene
cuarentenado o se archiva mediante una decisión posterior; nunca se fuerza una
atribución por nombre visible, dominio o único tenant existente.

### 4.4 Compatibilidad pública

Durante la transición, la compatibilidad se implementará mediante una
superficie pública tenant-aware que reciba un identificador público legible
(`slug`) y lo resuelva server-side a `empresaId`. La futura resolución por
dominio personalizado reutilizará ese mismo contrato, pero requiere su propio
trabajo de routing y no se inventará dentro de una consulta Firestore del
cliente.

## 5. Invariantes arquitectónicas

- Todo Evento nuevo tiene exactamente un `empresaId` válido.
- `empresaId` no puede cambiar durante una actualización.
- Un tenant nunca puede crear, leer administrativamente, actualizar o eliminar
  Eventos de otro tenant.
- La resolución de autorización nunca depende de nombre, título, dominio libre
  ni slug enviado como sustituto del claim en una sesión autenticada.
- Un evento legacy sin `empresaId` nunca se presenta como perteneciente a un
  tenant por inferencia.
- La lectura pública de un Evento no convierte su documento ni su asset en un
  recurso global de administración.
- Todo asset nuevo referenciado por un Evento pertenece al mismo `empresaId` y
  usa la raíz canónica de Storage de ADR-SAAS-024.
- No se crean nuevas escrituras globales en `eventos`.
- La transición no borra documentos ni reescribe URLs históricas de forma
  implícita.

## 6. Plan de implementación propuesto

La decisión se implementará en cortes auditables, sin mezclarse con Storage:

1. **PR B1 — contrato Firestore y administración:** tipo, servicio, consultas,
   UI administrativa, Rules, índices y pruebas multi-tenant.
2. **PR B2 — lectura pública tenant-aware:** endpoint/contexto público,
   integración de la landing y pruebas de aislamiento por slug. La resolución
   completa por dominio personalizado queda como dependencia de routing si aún
   no existe el campo/contrato correspondiente. La implementación no expone
   campos administrativos ni modifica reservas, marketing o la landing fuera
   de la lectura de Eventos.
3. **PR B3 — transición legacy:** dry-run, mapeo autorizado, backfill idempotente,
   evidencia y retirada del modelo global. Las escrituras productivas requieren
   confirmación explícita.

La división evita que un cambio de Rules, un cambio de persistencia y una
migración de datos sean imposibles de revertir conjuntamente.

## 7. Migración, rollback y seguridad

### Migración

- primero se prueban documentos canónicos, legacy y dos tenants en Emulator;
- después se corta la creación de documentos sin `empresaId`;
- el backfill solo usa un mapa de atribución explícito, nunca heurísticas por
  nombre;
- cada operación es idempotente y produce evidencia de omitidos, clasificados y
  conflictos;
- no se despliega ni escribe en producción como parte de este ADR.

### Rollback

- antes del backfill, revertir conjuntamente servicio, UI, Rules e índices;
- no borrar documentos ni assets nuevos durante el rollback;
- después de una clasificación productiva, usar una corrección forward-only y
  conservar el `empresaId` auditado; no reabrir escrituras globales.

### Riesgo residual

Los documentos y URLs legacy sin propietario verificable seguirán fuera de la
superficie canónica hasta que exista evidencia suficiente para clasificarlos.

## 8. Fuera de alcance

- Storage tenant-aware ya resuelto por PR A/P2-03;
- impresión, Electron, DIAN, Wompi, offline y notificaciones;
- editor de landing, campañas o un CMS completo;
- facturación o efectos fiscales;
- datos ficticios del cliente;
- escrituras productivas sin autorización;
- eliminación masiva o migración automática de legacy;
- creación de una nueva autoridad financiera u operativa.

## 9. Alcance autorizado por la aceptación

La aceptación inicial autorizó abrir el PR B1 con el siguiente alcance exclusivo:

- cambiar el contrato de `eventos` para documentos nuevos tenant-aware;
- adaptar `firestore.rules`, índices y pruebas de Rules;
- adaptar `lib/eventos-service.ts` para consultas y mutaciones administrativas
  tenant-aware;
- adaptar exclusivamente la UI administrativa de Eventos;
- sincronizar los documentos maestros que todavía clasifican `eventos` como
  globales.

B2 fue autorizado posteriormente de forma explícita con su alcance propio:
resolución server-side por `slug`, lectura de eventos activos del tenant,
exclusión de legacy, integración de la landing y evidencia de aislamiento.
B3 (transición, backfill y retiro de legacy) permanece planificado como PR
independiente. Ninguno de estos cortes autoriza escrituras en producción.

## 10. Estado

Este documento está **ACEPTADO** por el propietario del Goal. La aceptación
incluye las dos precisiones sobre propiedad tenant de los recursos públicos y
sobre el dominio personalizado como contexto público, nunca como autoridad
administrativa. La implementación y el cierre legacy descritos arriba están
COMPLETADOS; cualquier backfill o limpieza adicional requeriría una decisión
independiente y no se infiere de este ADR.
