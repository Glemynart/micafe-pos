# ADR-SAAS-054 — Superficie operativa Bodega y alta controlada de operadores para staging

## Estado

**PROPUESTO — PENDIENTE DE ACEPTACIÓN.**

Esta propuesta pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding →
E2.2 — Configuración inicial`. No autoriza implementación, cambios de
`firebase.json`, deploy, tráfico, fixture adicional, Bootstrap, Activation,
producción ni cambios en el tenant real.

## Contexto y evidencia

El fixture sintético retenido `E2_2-BODEGA-STAGING-FIXTURE` existe en
`micafe-pos-staging`, tiene un administrador activo y ya contiene una
categoría, un producto con stock inicial, una presentación y un cliente
sintéticos creados mediante las rutas canónicas de Bodega.

La continuación de Gate E no puede completar la preparación de vendedor ni la
validación funcional de Gate F:

- la interfaz administrativa invoca `crearIncorporacionDirecta`, pero esa
  callable no aparece en la superficie desplegada de staging;
- el ajuste administrativo invoca `actualizarArticuloInventarioV1`, que
  tampoco aparece desplegado;
- el PWA vendedor requiere además las lecturas de catálogo, clientes y ventas
  propias, así como apertura y cierre de turnos, que no forman parte de la
  superficie remota actualmente publicada.

Los intentos fallidos no dejaron efectos parciales: no se creó un vendedor, el
stock conservó su valor inicial y no se creó venta ni turno.

ADR-SAAS-049 limita deliberadamente `saas-bodega` a su corte aprobado y deja
fuera estas superficies. Desplegar `saas-auth` para recuperarlas no permite
demostrar un delta limitado y contradice el control de superficie de
ADR-SAAS-048. Por tanto, el bloqueo es arquitectónico y no un error de PIN,
CORS o de la UI.

## Problema a decidir

Se necesita una frontera desplegable y auditable que permita completar el
ensayo Bodega sin ampliar silenciosamente `saas-auth`, sin duplicar lógica de
negocio y sin usar escrituras directas de Firestore.

## Alternativas

| Alternativa | Resultado |
| --- | --- |
| Desplegar `saas-auth` con un filtro de Functions | **Rechazada**: discovery, Secrets y closure ajenos impiden demostrar un deploy limitado y un rollback seguro. |
| Añadir todas las superficies a `saas-operational-activation` | **Rechazada**: mezcla alta de operadores con activación y contradice ADR-SAAS-046. |
| Crear operadores mediante una ruta administrativa directa | **Rechazada**: evita la incorporación canónica, rompe autoridad/auditoría y no es aceptable para staging. |
| Crear fronteras dedicadas y reutilizar helpers neutrales | **Recomendada**: limita Secrets y discovery, conserva contratos y permite gates independientes. |

## Decisión propuesta

Crear dos fronteras dedicadas, sin retirar todavía las exportaciones legacy.

### 1. Alta de operador tenant

Crear el codebase `saas-operational-onboarding`, con una única callable:

`crearIncorporacionDirecta`

Características obligatorias:

- Gen2, `us-central1`, Node.js 22;
- único Secret: `OPERATIONAL_PIN_PEPPER`;
- autoridad derivada de Auth + Empresa + Membresía server-side;
- contrato y errores actuales preservados;
- `empresaId`, UID, rol, permisos y PIN no pueden ser autoridad aportada por
  el cliente;
- idempotencia y auditoría canónicas;
- sin Bootstrap, email, Activation, comercial, Wompi, Dusema ni schedules;
- closure basada en el emisor neutral aceptado por ADR-SAAS-051.

### 2. Superficie operativa Bodega

Crear el codebase `saas-bodega-operations`, sin Secrets, con estas callables:

- `consultarCatalogoPresentacionesVendedorV1`;
- `consultarClientesVendedorV1`;
- `consultarMisVentasVendedorV1`;
- `actualizarArticuloInventarioV1`;
- `abrirTurnoOperativoV1`;
- `cerrarTurnoOperativoV1`.

La superficie debe reutilizar unidades neutrales de autoridad, configuración,
turnos, inventario, ledger y auditoría. No debe copiar handlers completos ni
importar `functions/src/index.ts`, `operational-auth.ts` completo,
`configuracion/service.ts`, Secrets, Wompi, Dusema, Bootstrap, email,
commercial o recovery.

Las seis callables conservarán sus contratos, validación server-side,
aislamiento tenant, idempotencia, auditoría y errores actuales. Ninguna
callable aceptará `empresaId`, actor, rol, permisos, precio, costo, stock,
turno o total como autoridad del cliente.

## Topología y migración

La propuesta no autoriza todavía ningún deploy ni reasignación de tráfico.
Cada codebase deberá tener su propio discovery, build, module-load y preflight.
No se retirará ninguna exportación legacy hasta demostrar equivalencia,
coexistencia controlada y rollback reproducible.

El despliegue futuro deberá demostrar exclusivamente:

- `saas-operational-onboarding → crearIncorporacionDirecta`;
- `saas-bodega-operations →` las seis callables indicadas;
- región y runtime correctos;
- Secrets exactamente según esta propuesta;
- cero deletes, replacements o cambios de otros codebases;
- cero cambios de producción, Rules, IAM, Firestore o Auth fuera de los
  efectos funcionales autorizados por el gate.

## Validación requerida

Antes de aceptar Gate E/F se deberán demostrar:

- build reproducible, TypeScript, lint y tests;
- discovery exacto y cero imports prohibidos;
- module-load sin I/O accidental;
- autoridad, tenant isolation, idempotencia y errores;
- creación canónica de un vendedor sintético del fixture;
- autenticación/activación sin exponer secretos en evidencia;
- turno, catálogo, cliente, inventario, venta, pagos, ledger y auditoría;
- negativos, replay, payload manipulado y acceso cruzado;
- preflight y deploy dirigido en staging;
- rollback de código y revisión remota conocida.

Los gates E2.2 siguen separados: esta propuesta no cierra Gate E, Gate F,
rehearsal, certificación ni producción.

## Rollback y riesgos

Antes del primer deploy, rollback significa revertir la rama técnica. Después,
cualquier rollback de revisión o tráfico requiere un gate operativo explícito.
Los efectos de Firestore/Auth no se revierten con tráfico: solo se corrigen
mediante comandos canónicos e idempotentes.

El riesgo principal es ampliar la superficie Bodega sin una closure neutral.
Discovery transitivo, tests de aislamiento y preflight son condiciones de
aceptación, no mejoras opcionales.

## Fuera de alcance

- desplegar cualquiera de las dos fronteras;
- cambiar `saas-auth` o retirar sus exports;
- modificar Rules, IAM, Secrets o producción;
- crear otro tenant o fixture;
- repetir Bootstrap o Activation;
- preparar o modificar Distribuidora Las Jiménez;
- marcar E2.2 como completado.

## Decisión solicitada

Aceptar o rechazar esta arquitectura antes de iniciar implementación. Hasta
entonces, Gate F permanece `BLOCKED` y E2.2 permanece `EN EJECUCIÓN`.
