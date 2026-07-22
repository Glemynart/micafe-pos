# ADR-SAAS-005 — Rol Supervisor y acceso operativo

## Estado

Aceptado. Complementa `MT-U5-CAPA0-preflight-arquitectonico.md` §2 y fija el
contrato pendiente para que una implementación posterior pueda crear la plantilla
global `permisos_roles/supervisor` sin inferir privilegios.

## Contexto

El contrato canónico de MT-U5 define cinco roles tenant: `admin`, `supervisor`,
`cajero`, `cocinero` y `marketing`. Aunque `supervisor` ya es un rol válido en
claims, Rules y tipos, faltaba su plantilla de permisos. El gate de preparación de
MT-U5B detectó correctamente esa ausencia y bloqueó el cambio de autoridad hacia
`membresias`.

Los permisos concretos son datos de plantilla, no una taxonomía derivada de código.
Por tanto, no corresponde equiparar implícitamente `supervisor` a `admin` ni
deducir sus privilegios desde fallbacks legacy. Este ADR define el alcance funcional
y la proyección exacta sobre los permisos existentes.

## Problema

La operación diaria requiere un responsable que pueda mantener el establecimiento
funcionando desde el POS, sin darle facultades de administración de empresa,
seguridad, plataforma SaaS o configuración. `admin` es demasiado amplio para este
caso y los roles operativos restantes son demasiado restringidos o tienen otra
superficie de acceso.

## Decisión

Se define `supervisor` como el rol de **responsable de operación diaria del
establecimiento**. Opera exclusivamente desde el POS y es distinto de `admin`.

### Superficie de acceso

| Rol | POS | PWA |
|---|---:|---:|
| `admin` | Sí | Sí |
| `supervisor` | Sí | No |
| `cajero` | Sí | No |
| `cocinero` | Sí | No |
| `marketing` | No | Sí |

El acceso al POS no concede acceso al PWA, ni viceversa. Esta matriz expresa la
superficie de producto; las rutas, guards y Rules que la hagan efectiva se ajustan
en su unidad de implementación correspondiente, no en este ADR.

### Responsabilidades permitidas

El supervisor puede ejecutar y supervisar estas funciones operativas desde el POS:

- ventas, caja, pedidos, descuentos autorizados, cancelaciones autorizadas y
  reimpresiones;
- salón/pedidos y cocina;
- productos, categorías, recetas, inventario y ajustes de inventario;
- turnos, gastos operativos y mermas;
- clientes y reservas; y
- consulta del historial operativo necesario para resolver la operación diaria.

### Contrato de plantilla

Una implementación posterior deberá crear exactamente una plantilla global con
`rol: "supervisor"` y los siguientes permisos existentes, sin añadir aliases ni
permisos nuevos:

```text
sell
salon
kitchen
inventory
recipes
shifts
waste
gastos
clientes
reservas
historial
```

La plantilla `permisos_roles/supervisor` representa el conjunto **predeterminado**
del rol. Un administrador podrá modificar explícitamente los permisos de una
membresía desde el PWA, por lo que sus permisos efectivos pueden diferir de la
plantilla. Tras el cambio de autoridad de MT-U5B, la autorización siempre se basa
en el conjunto de permisos efectivos almacenado en la membresía; la plantilla no
es una fuente decisoria de autorización.

La correspondencia funcional es la siguiente:

| Permiso | Capacidad de supervisor |
|---|---|
| `sell` | Ventas, caja, pedidos, descuentos, cancelaciones y reimpresiones autorizadas. |
| `salon` | Gestión operativa de salón y pedidos. |
| `kitchen` | Coordinación de cocina y pedidos. |
| `inventory` | Productos, categorías, inventario y ajustes de inventario. |
| `recipes` | Consulta y gestión operativa de recetas. |
| `shifts` | Operación de turnos y caja. |
| `waste` | Registro operativo de mermas. |
| `gastos` | Gastos operativos asociados a la jornada. |
| `clientes` | Gestión de clientes en la operación. |
| `reservas` | Gestión de reservas. |
| `historial` | Consulta y reimpresión desde el historial operativo. |

Los flujos de descuentos, cancelaciones y reimpresiones no crean nuevos permisos:
forman parte de la capacidad operativa `sell`. Si más adelante requieren una
autorización independiente, deberán introducirse mediante un ADR nuevo antes de
ampliar cualquier plantilla.

### Restricciones explícitas

El supervisor no puede acceder al PWA ni administrar:

- usuarios, membresías, roles o permisos;
- configuración de empresa o configuración del sistema;
- seguridad, integraciones, plataforma SaaS o landing;
- facturación electrónica, DIAN o numeraciones; ni
- marketing.

Por ello, la plantilla de supervisor excluye explícitamente los permisos existentes
`permissions`, `settings`, `finanzas`, `purchases`, `reports`, `cuentas_cobro`,
`consignaciones` y `alquiler_dashboard`. La ausencia de esos permisos no autoriza
un acceso alternativo mediante UI, servicio, claim o Rule.

## Comparación de roles

| Rol | Propósito | Diferencia frente a supervisor |
|---|---|---|
| `admin` | Administración integral de su empresa. | Puede administrar identidad, permisos, configuración y demás funciones de negocio; el supervisor no. |
| `supervisor` | Operación diaria ampliada desde el POS. | Es el rol definido por este ADR. |
| `cajero` | Operación de caja y POS acotada. | No gestiona la operación ampliada de inventario, cocina, turnos y supervisión. |
| `cocinero` | Operación de cocina/KDS. | No adquiere caja, inventario, clientes ni reservas. |
| `marketing` | Operación de marketing y contenido desde PWA. | No tiene acceso al POS ni permisos operativos por defecto. |

## Justificación arquitectónica

- **Mínimo privilegio:** separa las decisiones de operación diaria de la
  administración de identidad, configuración y plataforma.
- **Separación de planos:** no concede capacidades de `superadmin`, soporte ni
  Electron local; esos dominios permanecen fuera de los roles tenant.
- **Fuente única de contrato:** la plantilla futura se deriva de esta lista, no de
  `PERMISOS_POR_ROL`, datos demo ni equivalencias con `admin`.
- **Evolución controlada:** cambios al conjunto de permisos requieren actualizar
  este ADR antes de modificar `permisos_roles/supervisor` o las membresías que se
  deriven de ella.

## Consecuencias

- El gate de preparación de MT-U5B podrá usar este ADR como fuente aprobada para
  materializar y validar `permisos_roles/supervisor`.
- El rol sigue siendo un rol tenant canónico y su claim continúa siendo
  `{ empresaId, rol: "supervisor" }`; los arrays de permisos no se incorporan al
  claim.
- Este documento no crea ni modifica documentos Firestore, membresías, Rules,
  contexts, servicios ni flujos de login.
- La autoridad continúa temporalmente en el modelo legacy hasta el Bloque 2 de
  MT-U5B; este ADR no inicia ni adelanta ese cambio.

## Relación con otros ADR y documentos

- `MT-U5-CAPA0-preflight-arquitectonico.md` define los cinco roles canónicos y
  establece que `supervisor` no equivale a `admin`.
- `ADR-SAAS-001-tenancy.md` define el aislamiento por tenant mediante claims y
  Rules.
- `ADR-SAAS-002-identidad.md` define la identidad y la emisión privilegiada del
  claim `{ empresaId, rol }`.
- `MT-U5B-BLOQUE1-PREPARACION-AUTORIDAD.md` define el gate que exige la plantilla
  antes de cambiar la autoridad hacia `membresias`.
