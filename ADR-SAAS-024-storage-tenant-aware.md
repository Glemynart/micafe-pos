# ADR-SAAS-024 — Contrato seguro y tenant-aware de Firebase Storage

- **Estado:** Aceptado
- **Fecha:** 2026-08-04
- **Decision makers:** Lead Engineer; propietario del Goal
- **Goal:** `G-MVP-01` — SaaS POS multi-tenant listo para primera versión comercial
- **Milestone:** `M4` — Certificación comercial
- **Epic:** `E4.2` — Release readiness (seguimiento técnico `P2-03`)
- **Backlog:** `P2-03`
- **Relacionados:** `MASTER-SECURITY-PLAN.md` (FB-4, SEC-005, SEC-006), `firestore.rules`, `firebase.json`, ADR-SAAS-019

> Este ADR está en estado **ACEPTADO**. La decisión autoriza únicamente el PR A
> de Storage tenant-aware; no autoriza el PR B de migración de Eventos ni
> despliegues o escrituras en producción.

> **Estado actual post-MVP (2026-08-11):** la decisión fue implementada y
> certificada por PR #195. El trabajo de Eventos se ejecutó posteriormente bajo
> ADR-SAAS-025 y B3-026/B3-027 quedó cerrado. El texto de autorización y
> separación de PRs que sigue es **HISTÓRICO** y no representa trabajo pendiente.

## 1. Contexto y problema

La aplicación utiliza Firebase Storage para imágenes de productos y eventos,
pero el repositorio no contiene un contrato versionado de Storage:

- `firebase.json` no declara `storage.rules` ni un emulador de Storage;
- no existe un archivo `storage.rules` en el repositorio;
- las imágenes de productos se escriben actualmente bajo
  `productos/{espacioId}/...`, sin `empresaId` en la ruta;
- las imágenes de eventos se escriben bajo `eventos/...` y la colección
  Firestore `eventos` todavía refleja un modelo legacy global;
- no existe una matriz de pruebas en Emulator que demuestre límites de tamaño,
  tipo de contenido, aislamiento entre tenants y denegación por defecto.

El modelo funcional confirmado para el SaaS es que landing, marketing,
eventos, reservas y productos pertenecen al tenant. Esos recursos pueden ser
públicos para visitantes, pero no son globales de la plataforma. ConnectTech no
publica ni administra el contenido comercial de los tenants.

La visibilidad pública no elimina la pertenencia. Un namespace como
`public/eventos/...` expresa una visibilidad, pero pierde la identidad del
propietario y por tanto no representa el dominio real.

## 2. Drivers y criterios de selección

La decisión debe:

1. incluir `empresaId` en toda ruta canónica de Storage;
2. distinguir propiedad tenant de visibilidad pública;
3. permitir lectura anónima solo de superficies que el tenant publica;
4. permitir crear, actualizar y eliminar únicamente al tenant propietario;
5. derivar la identidad del tenant de la sesión, nunca de un nombre, dominio o
   valor libre enviado por el cliente;
6. conservar Firebase Rules como control primario sin crear una autoridad de
   publicación de ConnectTech;
7. poder probarse con Emulator y CI, sin producción, hardware, datos fiscales
   ni datos reales;
8. evitar migraciones, dual-write y reescritura de URLs históricas dentro de
   este contrato;
9. hacer visible cualquier dependencia de la colección legacy `eventos`,
   landing, marketing o reservas.

## 3. Alternativas consideradas

### A. Namespace global por visibilidad

Usar rutas como `public/eventos/{archivo}` y controlar el acceso solo por
lectura pública.

**Rechazada.** Confunde visibilidad con propiedad, no permite probar quién
puede modificar el asset y no representa el modelo de dominios por tenant.

### B. Mantener rutas legacy y añadir controles por rol

Mantener `productos/{espacioId}` y `eventos/{archivo}`, autorizando por rol,
tamaño y MIME.

**Rechazada.** El rol no identifica por sí solo al tenant propietario de la
ruta. Permitir que `admin` o `marketing` escriban en `eventos/...` dejaría a
cualquier tenant como editor de contenido de los demás.

### C. Namespace canónico completamente tenant-aware con Rules declarativas

Usar `tenants/{empresaId}/...`, exigir coincidencia entre la ruta y el custom
claim, y separar visibilidad pública de autorización de escritura.

**Recomendada.** Representa el dominio confirmado, reutiliza la arquitectura
Firebase existente, no crea una nueva autoridad de negocio y permite pruebas
negativas entre dos tenants.

### D. Upload server-side con callable o URL firmada

Enviar la intención a Functions para que una autoridad backend valide y cargue
el archivo.

**No recomendada para `P2-03`.** Puede ser una evolución posterior, pero
introduce una frontera de autoridad, expiración y contrato de API innecesarios
para resolver el aislamiento base que Firebase Rules ya puede expresar.

## 4. Decisión propuesta

Adoptar la alternativa C.

### 4.1 Recursos privados de catálogo

Las nuevas imágenes de productos utilizarán la ruta canónica:

```text
tenants/{empresaId}/productos/{espacioId}/{archivo}
```

Las reglas deberán derivar `empresaId` del custom claim de la sesión y exigir
que coincida con el segmento de la ruta. El cliente podrá solicitar la carga
solo para un espacio que ya esté visible dentro del tenant; la ruta no podrá
usarse para leer ni escribir objetos de otro tenant.

El PR de implementación deberá adaptar el uploader de productos para construir
la ruta canónica con el tenant resuelto por la sesión. La UI no podrá aceptar
un `empresaId` arbitrario como autoridad. La incorporación de ese dato a una
proyección de sesión, si resulta necesaria, será una derivación del claim y no
un campo editable del agregado `Usuario`. El contexto SaaS existente ya expone
`empresaId` resuelto desde el claim, por lo que el PR no necesita ampliar el
contrato de `Usuario` ni crear una fuente de identidad paralela.

### 4.2 Recursos públicos propiedad del tenant

Todo asset público de un tenant usará una ruta bajo la raíz del propietario:

```text
tenants/{empresaId}/landing/{recurso}/{archivo}
tenants/{empresaId}/marketing/{recurso}/{archivo}
tenants/{empresaId}/eventos/{eventoId}/{archivo}
tenants/{empresaId}/reservas/{recurso}/{archivo}
```

La lectura podrá ser anónima para visitantes. La escritura, actualización y
eliminación solo podrán realizarse desde una sesión del mismo tenant, con la
facultad o permiso definido para esa superficie. Un `admin` o `marketing` de
Empresa A nunca podrá mutar una ruta bajo Empresa B.

No se crea un namespace global para ConnectTech. La resolución de un dominio
público como `cafeatrato.com` hacia `empresaId` pertenece a la arquitectura de
landing y no se resolverá confiando en un dominio enviado por el cliente de
Storage.

### 4.3 Eventos y contenido público legacy

La colección Firestore `eventos` actual es global y su uploader no incorpora
`empresaId`. Ese estado se clasifica como **legacy**, no como el modelo
canónico. Para afirmar que los eventos son tenant-aware:

- los eventos nuevos deben persistir `empresaId` derivado de la sesión;
- las consultas y mutaciones nuevas deben filtrar y verificar ese tenant;
- una actualización o eliminación nunca puede operar sobre un evento cuyo
  `empresaId` no coincida con la sesión;
- el uploader nuevo debe escribir en
  `tenants/{empresaId}/eventos/{eventoId}/{archivo}`;
- los documentos y URLs legacy no se convertirán silenciosamente en datos
  tenant-aware.

La landing multi-tenant, el routing por dominio y la clasificación o migración
de eventos históricos requieren trabajo propio. El PR A no modificará la
colección `eventos`, sus consultas, permisos ni su UI. Ese trabajo será el PR B
independiente de Eventos tenant-aware, con su propia auditoría y estrategia de
transición. PR A no podrá presentarse como certificación completa del dominio
de Eventos.

### 4.4 Contrato de archivo

Para las rutas nuevas, Storage deberá aplicar como mínimo:

- tamaño máximo de 5 MiB;
- tipos permitidos `image/jpeg`, `image/png`, `image/webp` y `image/gif`;
- rechazo de rutas no reconocidas;
- escritura autenticada para catálogo privado;
- lectura autenticada y tenant-aware para catálogo privado;
- lectura anónima únicamente para rutas públicas bajo el tenant propietario;
- escritura de landing, marketing, eventos y reservas permitida solo al tenant
  propietario con el permiso de superficie correspondiente;
- ausencia de permisos de eliminación directa para actores que no estén
  autorizados por el contrato de la ruta.

El contenido no se considerará validado por la extensión del nombre. El tipo
de contenido y el tamaño serán controles de Rules; la validación de formato
real de imagen seguirá siendo defensa adicional de la UI y no sustituirá a las
Rules.

### 4.5 Compatibilidad histórica

`P2-03` no migrará ni reescribirá objetos existentes bajo `productos/...`,
`eventos/...` ni documentos globales legacy. Las URLs históricas se
conservarán como datos legados y el PR deberá registrar explícitamente su
riesgo residual: una URL de descarga histórica que ya posea un token puede
continuar siendo accesible según su contrato anterior. No se afirmará
aislamiento retrospectivo completo sin una migración y una decisión separadas.

Las rutas legadas no recibirán nuevas cargas desde la aplicación después del
corte. La estrategia de lectura compatible de objetos legados deberá quedar
determinada durante la implementación sin relajar la raíz canónica del tenant
ni permitir escrituras nuevas fuera de ella; si esto exige modificar el
contrato de dominio o retirar acceso público histórico, se detendrá el PR y se
propondrá un ADR adicional.

## 5. Invariantes arquitectónicas

- Todo objeto canónico de Storage pertenece a un único `empresaId` contenido en
  su ruta.
- `empresaId` de la ruta debe coincidir con el claim de la sesión para cualquier
  mutación o lectura privada; nunca se confía en un valor libre del cliente.
- La lectura pública de un asset no convierte el asset en global ni autoriza su
  modificación.
- Ningún tenant puede crear, actualizar o eliminar assets de otro tenant.
- No existe `public/{superficie}/...` como namespace canónico de contenido
  comercial.
- La autorización no depende del nombre visible del tenant, espacio, producto,
  evento o dominio.
- Las rutas desconocidas se rechazan por defecto.
- Los límites de tamaño y tipos de contenido son parte del contrato de Rules y
  deben tener pruebas negativas en CI.
- Los eventos nuevos tienen propietario tenant explícito; los eventos legacy no
  pueden modificarse mediante una ruta tenant-aware como si estuvieran
  clasificados retroactivamente.
- ConnectTech no adquiere una facultad global de publicación por alojar la
  plataforma.
- No se introducen migraciones, dual-write, datos fiscales ni escrituras en
  producción como parte de esta decisión.
- Los objetos históricos no se reescriben ni se presentan como aislados de
  forma retroactiva sin evidencia de migración.

## 6. Separación de PRs y alcance de implementación

### PR A — `P2-03` Storage tenant-aware

Este es el único trabajo autorizado en la presente ejecución:

- implementar `storage.rules` y su configuración de Emulator/CI;
- cambiar los uploaders para usar `tenants/{empresaId}/...`;
- actualizar únicamente referencias y contratos de Storage;
- no modificar la colección Firestore `eventos`, consultas, permisos ni UI de
  dominio;
- no migrar datos históricos ni escribir en producción.

### PR B — Eventos tenant-aware

Será un trabajo posterior e independiente. Deberá:

- incorporar `empresaId` a los documentos nuevos;
- adaptar consultas, permisos y UI;
- definir la transición compatible de documentos y URLs legacy;
- retirar el modelo global cuando la transición esté certificada.

PR B no queda aprobado ni implementado por la aceptación de este ADR.

### Alcance técnico de PR A

#### Incluido

- `storage.rules` versionado con deny-by-default;
- declaración de Storage y Storage Emulator en `firebase.json`;
- rutas canónicas tenant-aware para productos y assets públicos;
- adaptación mínima de los uploaders existentes de productos y eventos a la
  raíz `tenants/{empresaId}`;
- en el uploader de Eventos, mientras Firestore conserve el modelo legacy, el
  segmento `eventoId` será un identificador de asset generado para la carga;
  PR A no lo presenta como identidad del documento Firestore ni modifica esa
  colección. PR B definirá la correlación canónica durante su migración;
- pruebas de Storage Emulator con `@firebase/rules-unit-testing` y Firebase
  CLI para lectura pública, escritura propia, aislamiento, roles, tamaño, MIME
  y rutas no reconocidas;
- integración de las pruebas en CI y generación de evidencia de certificación;
- documentación del riesgo residual de objetos y documentos legados.

PR A documentará como riesgo de transición que la colección `eventos` sigue
siendo legacy hasta que PR B sea integrado. Storage Rules no compensará ni
relajará las Rules de Firestore existentes.

### Fuera de alcance

- migración o borrado masivo de objetos y documentos históricos;
- resolver dominios personalizados, routing multi-tenant y landing multi-tenant;
- branding, SEO y campañas como funcionalidades de producto;
- migración de la colección legacy `eventos` o clasificación retroactiva;
- upload server-side con URLs firmadas;
- antivirus, OCR, thumbnails, CDN o procesamiento asíncrono;
- cualquier cambio en Firestore Rules, colección `eventos`, consultas, permisos
  o UI de dominio;
- cambios en Bootstrap, fiscalidad, ventas, compras, turnos o notificaciones;
- hardware, Electron, impresión, DIAN, Wompi, offline y producción.

## 7. Consecuencias y riesgos residuales

### Positivas

- Storage tendrá un contrato versionado, reproducible y verificable en CI.
- Las imágenes privadas y públicas quedarán bajo el tenant propietario, con
  controles de tamaño, tipo y escritura cruzada.
- La visibilidad pública y la propiedad tenant quedarán separadas de forma
  verificable.
- El contrato será reutilizable para Café Atrato y futuros tenants, sin
  conceder una autoridad global a ConnectTech.
- La solución reutiliza Firebase Rules y no crea una nueva autoridad de
  publicación.

### Negativas

- El uploader de productos debe conocer el tenant derivado de sesión para
  construir la ruta canónica.
- Los objetos y documentos históricos pueden mantener exposición heredada
  hasta que exista una migración aprobada.
- La colección `eventos` actual puede requerir un PR prerequisito para que las
  nuevas mutaciones verifiquen `empresaId`; Storage no puede compensar una
  autorización global en Firestore.
- La landing por dominio y la clasificación de documentos históricos no se
  resuelven únicamente con Storage Rules.
- La certificación exige incorporar Storage Emulator al runner y puede revelar
  divergencias de configuración del proyecto Firebase.

## 8. Migración, despliegue y rollback

- El cambio será forward-only para nuevas cargas: primero deben estar
  disponibles las reglas y el uploader compatible en el mismo corte lógico.
- No se ejecutará ningún despliegue productivo como parte del PR.
- En Emulator/CI se probarán las rutas privadas y públicas tenant-aware antes
  de considerar el PR listo.
- El rollback debe revertir conjuntamente `storage.rules`, la configuración de
  Firebase y los uploaders. No se eliminarán objetos históricos como parte del
  rollback.
- La activación productiva requerirá una confirmación explícita posterior y
  una verificación del bucket/proyecto objetivo.

## 9. Validación requerida tras la aceptación

- `npx tsc --noEmit`;
- `npm run build`;
- `npm run build:functions`;
- `npm run lint`;
- `npm run test:auth-foundation`;
- suite de Storage Emulator con al menos dos tenants y roles administrativos;
- lectura/escritura válida del tenant propio;
- lectura/escritura cruzada denegada;
- denegación de MIME y tamaño no permitidos;
- denegación de rutas no canónicas;
- lectura anónima de assets públicos bajo el tenant propietario;
- escritura anónima y escritura cruzada entre tenants denegadas;
- pruebas de regresión para URLs y documentos legacy sin migrarlos;
- verificación de que los eventos nuevos no se crean ni mutan sin
  `empresaId` tenant-aware;
- CI completamente verde y evidencia JSON/Markdown del runner;
- comprobación de que no hubo escrituras en producción.

## 10. Estado de decisión

Este documento está **ACEPTADO** por el propietario del Goal. PR A / `P2-03`
quedó integrado y no existe un seguimiento pendiente de Storage en el MVP.
PR B / Eventos tenant-aware se conserva como separación histórica y fue
resuelto posteriormente por ADR-SAAS-025.
