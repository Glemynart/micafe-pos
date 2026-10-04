# ADR-SAAS-059 — Frontera de membresías Bodega para staging

## Estado

**ACEPTADO — 2026-10-04.**

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial`.

La aceptación autoriza únicamente la implementación controlada de la frontera y
el refuerzo de política vertical descritos aquí. No autoriza por sí sola deploy,
tráfico, creación de fixture o tenant, Bootstrap, Activation, cambios de Rules
o IAM, ni producción.

## Contexto y evidencia

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` está activo en
`micafe-pos-staging`. Su Backoffice Bodega enlaza la tarjeta **Configuración
operativa** a la pantalla genérica de permisos. Esa pantalla enumera módulos
de restaurante y otros dominios que ADR-SAAS-041 deshabilita para Bodega.

La configuración canónica de Bodega ya restringe módulos a `sell`, `inventory`,
`purchases`, `reports`, `shifts`, `waste`, `permissions`, `settings`,
`clientes`, `gastos` y `finanzas`; el vendedor conserva exactamente la plantilla
`sell`, `shifts`. Sin embargo, el cliente genérico envía las actualizaciones a
`actualizarMembresia`, cuyo handler legacy solo valida sintaxis de rol y
permisos. No aplica la política de vertical.

La inspección remota de staging confirma que `actualizarMembresia` no está
desplegada. Desplegar `saas-auth` para corregir esa superficie no permite
demostrar un delta limitado y contradice ADR-SAAS-048. Crear usuarios,
membresías o permisos por escritura directa tampoco es admisible.

## Decisión

Se conserva el alta canónica `crearIncorporacionDirecta` de
`saas-operational-onboarding` y se refuerza para que, cuando la Empresa tenga
vertical `BODEGA_MVP1`, solo acepte los roles aprobados `admin` y `vendedor`.
No se cambian los contratos ni los roles de otros verticales.

Se crea un codebase dedicado, sin Secrets:

```text
saas-bodega-membership
└── functions-bodega-membership/src/index.ts
    └── actualizarMembresiaBodegaV1
```

La callable es Gen2, `us-central1`, Node.js 22 y declara cero Secrets. Solo un
administrador de una Empresa Bodega activa puede cambiar el estado de otro
vendedor de su mismo tenant. No acepta rol, permisos, `empresaId`, actor,
claims, código, PIN, hash ni autoridad desde el cliente. La plantilla de
permisos del vendedor sigue siendo canónica y no es editable desde esta
superficie.

La interfaz Bodega sustituirá el selector genérico por una vista de operadores
con roles aprobados y permisos informativos. Los módulos de restaurante y las
acciones de asignación arbitraria no se presentan ni se convierten en una
capacidad de Bodega.

## Autoridad, compatibilidad y migración

- Empresa, actor y membresía se derivan y revalidan server-side con la
  autoridad tenant neutral existente.
- La callable comprueba vertical `BODEGA_MVP1`, rol de administrador del actor,
  pertenencia del objetivo al mismo tenant, rol `vendedor` y que el actor no se
  modifique a sí mismo.
- El cambio de estado revoca o reemite claims de la sesión afectada mediante una
  unidad neutral extraída del comportamiento actual; no escribe directamente
  credenciales ni auditoría fuera del flujo canónico.
- `actualizarMembresia` legacy permanece para verticales no Bodega. El cliente
  Bodega no lo invoca: usa exclusivamente `actualizarMembresiaBodegaV1`, cuya
  política server-side impide asignar roles o permisos genéricos. No existe
  revisión remota staging de la callable legacy que deba migrarse.
- `crearIncorporacionDirecta`, recuperación de credenciales y activación
  conservan sus contratos y boundaries de ADR-SAAS-054, ADR-SAAS-058 y
  ADR-SAAS-053 respectivamente.

## Closure permitida

La implementación puede reutilizar exclusivamente:

- `tenant-configuration/authority.ts`;
- una unidad neutral mínima de actualización de membresía/claims extraída del
  comportamiento existente;
- contratos, plantillas de permisos y utilidades estrictamente transitivas; y
- la lectura de configuración necesaria para validar el vertical.

Quedan prohibidos imports de `functions/src/index.ts`, `operational-auth.ts`
completo, Bootstrap, comercial, Wompi, Dusema, email, schedules, Bodega de
ventas/inventario, configuración Web y módulos con Secrets ajenos. No hay I/O
en module-load.

## Alternativas evaluadas

| Alternativa | Resultado |
| --- | --- |
| Ocultar módulos genéricos solo en UI | Rechazada: un cliente manipulado seguiría pudiendo solicitar permisos incompatibles. |
| Desplegar `saas-auth` | Rechazada: contradice ADR-SAAS-048 y no ofrece una superficie ni rollback acotados. |
| Escribir membresías o credenciales directamente | Rechazada: viola autoridad, claims, auditoría e idempotencia. |
| Ampliar `saas-bodega-operations` | Rechazada: mezcla lifecycle de identidad con sus seis operaciones aprobadas en ADR-SAAS-054. |
| Boundary dedicado de membresía Bodega | Aceptada: conserva el mínimo privilegio, evita Secrets y permite preflight/deploy aislados. |

## Validación, deploy y rollback

La implementación debe demostrar TypeScript, lint, build, tests de autoridad,
aislamiento, payload manipulado, rol/vertical inválidos, auto-modificación,
estado, claims y auditoría. Discovery debe exponer exactamente
`actualizarMembresiaBodegaV1`, cero Secrets y module-load sin I/O.

El preflight demostrará un deploy dirigido exclusivamente a
`saas-bodega-membership → actualizarMembresiaBodegaV1` y, en gate separado, el
update dirigido de `saas-operational-onboarding → crearIncorporacionDirecta`.
No puede haber deletes, replacements, codebases ajenos ni producción.

Antes de cada primer deploy, rollback es revertir el cambio técnico. Tras
deploy, rollback de revisión o tráfico requiere un gate operativo explícito.
La desactivación de un vendedor es un hecho persistido y se revierte solo con
el comando canónico autorizado; no mediante escritura directa ni cleanup.

## Consecuencias

Esta decisión elimina la exposición funcional de permisos ajenos a Bodega sin
crear un operador, fixture ni credencial adicional. No cierra Gate E, Gate F,
rehearsal, certificación, tenant real, aceptación operativa ni producción.
