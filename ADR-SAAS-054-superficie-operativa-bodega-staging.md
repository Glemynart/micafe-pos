# ADR-SAAS-054 — Superficie operativa Bodega y alta controlada de operadores para staging

## Estado

**ACEPTADO — 2026-10-02.**

La aceptación formal de ADR-SAAS-054 constituye la decisión arquitectónica
necesaria para continuar E2.2. Autoriza únicamente la implementación futura de
las dos fronteras y las callables descritas en este ADR. No autoriza por sí
misma deploy, tráfico, fixture adicional, Bootstrap, Activation, producción ni
cambios en `saas-auth`, Rules, IAM, Secrets, Firestore o Auth.

Esta decisión pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding →
E2.2 — Configuración inicial`. Autoriza únicamente la implementación
controlada de las dos fronteras descritas. No autoriza cambios de
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

## Decisión aceptada

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

La decisión no autoriza todavía ningún deploy ni reasignación de tráfico.
Cada codebase deberá tener su propio discovery, build, module-load y preflight.
No se retirará ninguna exportación legacy hasta demostrar equivalencia,
coexistencia controlada y rollback reproducible.

El despliegue futuro deberá demostrar exclusivamente:

- `saas-operational-onboarding → crearIncorporacionDirecta`;
- `saas-bodega-operations →` las seis callables indicadas;
- región y runtime correctos;
- Secrets exactamente según esta decisión;
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

Los gates E2.2 siguen separados: esta decisión no cierra Gate E, Gate F,
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

## Decisión aceptada

La arquitectura queda aceptada para implementación controlada dentro del
alcance descrito. La implementación fue integrada mediante PR #415, con
merge en `main` `8710b04400ed58973ccbc33b268f20dc0eeede3f`; el deploy dirigido
en `micafe-pos-staging` creó `crearIncorporacionDirecta` y las seis callables
de `saas-bodega-operations`, todas `ACTIVE` en `us-central1`, Node.js 22 y
100 % de tráfico en la revisión más reciente. `OPERATIONAL_PIN_PEPPER` quedó
enlazado únicamente a `crearIncorporacionDirecta`; las seis callables Bodega
operations tienen cero Secrets.

La corrección de UI necesaria para que un vendedor Bodega no dependa de la
callable legacy ausente quedó integrada mediante PR #416, merge
`e3b414dc61f111dbc585c8fa7e73f8fd303a165f`, con CI post-merge PASS.
Gate F permanece pendiente: la entrada al POS fue verificada, pero la
validación funcional completa aún debe ejecutarse contra el fixture Bodega
retenido, sin convertir pruebas realizadas en otro fixture sintético en
evidencia de E2.2. E2.2 permanece `EN EJECUCIÓN`.

La aceptación no convierte ninguna validación pendiente en PASS ni autoriza
avanzar automáticamente a los gates de preflight, deploy, fixture,
rehearsal, certificación o producción.
