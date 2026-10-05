# G-SAAS-02 / M2 / E2.2 — Backoffice Bodega autenticado en preview (2026-10-05)

## Alcance

Esta evidencia cierra únicamente la comprobación de acceso y navegación del
Backoffice Bodega para el fixture sintético retenido
`E2_2-BODEGA-STAGING-FIXTURE` en `micafe-pos-staging`. No cierra Gate F, Gate G,
rehearsal, certificación, cutover, tenant real, aceptación operativa ni
producción.

## Identidad del preview y del tenant

- Preview Vercel: `https://cafeatrato-n1rj3einy-glemynarts-projects.vercel.app`.
- Deployment: `dpl_8J37BfRhuNxWJkMvn7fsPzXrswxy`, target `preview`, estado
  `READY`.
- Fuente del preview: commit `487e86a39abccb26abb39f092520c87ac4fbeb3a`,
  integrado por PR #445. Su árbol coincide con `origin/main` en
  `35d5b3002b1b92c15e435f1ee594a92aefed6d7c`.
- CI post-merge de `main`: run `37272635337`, `PASS`.
- Proyecto Firebase mostrado por el panel: `micafe-pos-staging`.
- Empresa: `Bodega Atrato Demo`; identificador del fixture:
  `E2_2-BODEGA-STAGING-FIXTURE`; vertical Bodega MVP-1.
- Contexto: sesión autenticada de administrador sintético del tenant. No se
  registran credenciales, PIN ni identificadores personales.

## Comprobaciones observadas

En el preview vigente se comprobó:

| Ruta / superficie | Resultado |
| --- | --- |
| `/admin` | PASS; carga el centro de operación Bodega con navegación a productos/precios, clientes, inventario, ventas y configuración operativa. |
| `/admin/usuarios` | PASS; muestra cinco operadores del fixture: cuatro vendedores y un administrador. La frontera deshabilita actualizar al administrador y limita la acción de estado a vendedores. |
| `/admin/permisos` | PASS; presenta la política Bodega con roles `admin`/`vendedor`, sin módulos genéricos de restaurante, reservas o consignaciones ni asignación arbitraria de permisos. |
| Navegación de Configuración operativa | PASS; conduce a la gestión Bodega de permisos/operadores, no al selector genérico de módulos de restaurante. |

La sesión mantuvo el tenant del fixture. No se crearon usuarios ni fixtures y
no se enviaron formularios mutantes. No se cambiaron membresías, claims,
credenciales, configuración, tráfico ni recursos remotos.

## Límite de la evidencia y estado de Gate F

Resultado: `PASS` para la comprobación autenticada de acceso y navegación del
Backoffice Bodega.

Esto no demuestra una operación de cambio de estado de membresía. ADR-SAAS-059
y ADR-SAAS-060 aún requieren evidencia funcional staging del comando canónico
`actualizarMembresiaBodegaV1`, sincronización de claims y hechos append-only de
auditoría, incluido el comportamiento de replay. La reemisión/activación de
credencial documentada previamente no sustituye esa validación. Por tanto,
Gate F continúa `BLOCKED / PENDING FUNCTIONAL MATRIX`; Gate G/H, tenant real,
aceptación operativa y producción siguen pendientes.

## Mutation audit

- Archivos productivos: 0.
- Commit, push, PR, merge, deploy y cambio de tráfico durante la observación:
  0.
- Firestore/Auth: 0 escrituras o cambios.
- Rules/IAM/Secrets/Storage/Hosting: 0 cambios.
- Fixture adicional, Bootstrap, Activation y cleanup destructivo: 0.
- Producción: 0.
