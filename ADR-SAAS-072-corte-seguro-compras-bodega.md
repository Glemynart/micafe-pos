# ADR-SAAS-072 — Corte seguro de escrituras de compras Bodega

## Estado

**PROPUESTO — pendiente de aprobación explícita.**

- **Fecha:** 2026-10-11.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor:** responsable del proyecto. **Recomendación técnica:** Lead Engineer.
- **Relacionado:** ADR-SAAS-049, ADR-SAAS-054, ADR-SAAS-069, ADR-SAAS-071 (PR #538, pendiente de integración), R1 §7 y §9.
- **Límite de esta propuesta:** este documento no modifica código, Firestore Rules,
  Functions, datos ni tráfico; tampoco autoriza despliegues. La aprobación de
  esta ADR deberá ser explícita y separada.

## Contexto

La compra canónica debe registrar en una sola autoridad la compra, el movimiento
de inventario, los efectos financieros cuando correspondan, la idempotencia, la
auditoría y la señal de disponibilidad aceptada por ADR-SAAS-069.

El estado observado en el código de PR #539 es:

- La callable aislada `registrarCompraBodegaV1` llama al núcleo transaccional
  compartido y restringe la entrada a Bodega.
- `registrarCompraOperativaV1` permanece como callable genérica del codebase
  `saas-auth`; ADR-SAAS-071 preserva su contrato para otros verticales.
- Las Rules actuales permiten a un administrador crear y borrar directamente
  `/compras/{id}` con aislamiento de tenant, pero esas escrituras no producen
  por sí mismas los movimientos de inventario/ledger, la señal ni la auditoría
  transaccional de la callable.
- El helper `esBodegaMvp1()` ya identifica el vertical desde la configuración
  canónica y se usa para cerrar escrituras directas de categorías Bodega,
  conservando el comportamiento de otros verticales.
- El preflight documentado en PR #538 reporta que el proyecto de staging no
  tenía desplegada la callable legacy `registrarCompraOperativaV1` en su lectura
  del 2026-10-11. Esta evidencia es temporal: debe repetirse para cada proyecto
  antes de un corte.

Las Rules de Firestore solo controlan escrituras de clientes; no pueden impedir
que una callable con Admin SDK escriba. Por ello, denegar las escrituras directas
no basta si una ruta server-side legacy sigue disponible para Bodega. A la vez,
desplegar o cambiar `saas-auth` excedería la restricción aprobada en ADR-SAAS-071.

## Impulsores de decisión

- Evitar compras sin los efectos de inventario, ledger, señal y auditoría
  canónicos.
- Mantener la frontera de despliegue aislada de Bodega y el contrato legacy de
  los demás verticales.
- No interrumpir clientes antiguos antes de publicar y comprobar un cliente
  compatible con `registrarCompraBodegaV1`.
- Poder demostrar con pruebas y preflight cuál ruta de escritura está activa
  para cada vertical y proyecto.
- Mantener coherencia con el cutover descrito en R1 §§7 y 9 (documento aún en
  estado `DISEÑO PROPUESTO`): cerrar las rutas legacy antes de activar Rules
  restrictivas y no reabrir escrituras directas como rollback normal.

## Opciones consideradas

### Opción 1 — Conservar las Rules actuales

Mantener create/delete para administradores en `/compras` y confiar en que la
UI utilice la callable nueva.

- **Ventajas:** no requiere corte de compatibilidad ni despliegue de Rules.
- **Costes:** una sesión admin todavía puede crear o borrar documentos sin los
  efectos canónicos; la UI no es una frontera de seguridad. No permite cerrar
  el bypass de escritura directa.

### Opción 2 — Denegar escrituras directas solo para Bodega, con corte por proyecto

Aplicar una condición Bodega-específica equivalente al patrón ya usado en
categorías: negar create/delete directos de `/compras` para `BODEGA_MVP1`,
mantener las reglas de los demás verticales y conservar la callable legacy sin
cambios. Antes de activar el corte en cada proyecto, demostrar que el cliente
Bodega usa la callable nueva y que `registrarCompraOperativaV1` no es una ruta
invocable para Bodega en ese proyecto. Si la callable legacy está presente y no
existe un control aprobado que la cierre para Bodega, el corte y la certificación
se detienen; esta ADR no modifica `saas-auth` para añadir ese control.

- **Ventajas:** alcance acotado; evita cambiar el comportamiento de compras de
  otros verticales; compatible con la decisión actual de preservar `saas-auth`.
- **Costes:** necesita un preflight exacto por proyecto y evidencia de versión de
  cliente; Rules por sí solas no cierran una callable legacy con Admin SDK.
  Producción queda bloqueada si esa callable está expuesta a Bodega hasta una
  decisión de arquitectura posterior.

### Opción 3 — Denegar create/delete de compras para todos los verticales

Aplicar el objetivo global de R1 después de migrar y auditar todos los clientes
y rutas de compra.

- **Ventajas:** una política simple y uniforme para escrituras cliente.
- **Costes:** mayor radio de impacto; puede interrumpir verticales o clientes
  legacy que aún dependan de escrituras directas; tampoco impide invocar una
  callable Admin SDK incompatible con Bodega. Requiere evidencia y coordinación
  fuera del alcance de E2.2.

## Recomendación pendiente de decisión

Se recomienda la **Opción 2** para el corte Bodega de E2.2, en secuencia:

1. Integrar la callable Bodega y publicar el cliente compatible mediante PRs
   separados. Todo despliegue sigue bloqueado hasta satisfacer Gate C y los
   gates/autorizaciones operativas aplicables; no desplegar ni cambiar
   `saas-auth`.
2. Verificar con pruebas de Rules y de operación que la ruta nueva conserva
   compra, inventario, ledger, idempotencia, auditoría y señal atómicos.
3. Auditar escritores/clientes del proyecto y repetir el preflight de funciones.
   Confirmar que no hay un cliente Bodega que dependa de escritura directa ni
   una callable legacy genérica invocable desde ese tenant.
4. Solo tras esa evidencia, proponer y ejecutar en una PR de implementación
   separada la denegación de create/delete directos para Bodega y el despliegue
   dirigido de Rules bajo los gates correspondientes.
5. Si el endpoint genérico está desplegado y puede aceptar compras Bodega, no
   declarar seguro el corte ni certificar ese proyecto. Requerir una ADR nueva
   que resuelva esa autoridad de servidor; no modificar ni desplegar
   `saas-auth` implícitamente.

Esta recomendación no es una decisión aceptada. La presente ADR solo se volverá
vinculante después de la aprobación explícita del responsable.

## Consecuencias esperadas si se acepta

### Positivas

- Las compras Bodega no podrán entrar por escritura directa del cliente una vez
  que el corte autorizado se despliegue.
- Se preservan las escrituras legacy de otros verticales hasta que tengan su
  propio corte compatible.
- Se evita confundir seguridad de Rules con control de callables Admin SDK.

### Costes y límites

- El corte es por vertical para Rules, pero la evidencia de funciones debe ser
  por proyecto y actualizarse antes de cada release.
- No resuelve automáticamente la exposición de la callable genérica en
  producción; si existe para Bodega, será un bloqueo visible que necesita una
  decisión arquitectónica posterior.
- No autoriza despliegue, uso de staging, cambios de IAM/Secrets, ni escrituras
  en ningún entorno.

## Plan de verificación requerido para una implementación futura

- Rules Emulator: Bodega admin no puede crear ni borrar `/compras`; vendedores
  tampoco; lecturas y límites de tenant permanecen; otro vertical conserva su
  contrato hasta su migración independiente.
- Pruebas de callable: escritura Admin SDK solo por las rutas autorizadas,
  atómica con inventario/ledger/señal, replay idempotente y sin efectos parciales.
- Pruebas de compatibilidad: cliente Bodega vigente usa la nueva callable;
  búsqueda de clientes antiguos y demás escritores en el alcance del proyecto.
- Preflight read-only por proyecto: codebases, nombres/exportaciones y estado
  de `registrarCompraOperativaV1` y `registrarCompraBodegaV1`; detenerse ante
  cualquier superficie no explicada.
- Rollout: callable/cliente antes de Rules; Gate C PASS antes de cualquier
  deploy según los gates del Goal; despliegue de Rules aislado y verificable.
- Rollback: corregir hacia delante con cliente/callable compatibles. No
  restaurar escrituras cliente como rollback ordinario; cualquier break-glass
  de Rules requiere decisión explícita y auditoría conforme a R1.

## Fuera de alcance

- Cambiar o desplegar `saas-auth` o alterar el comportamiento de
  `registrarCompraOperativaV1`.
- Modificar o desplegar Firestore Rules, Functions, IAM o Secrets.
- Ejecutar compras, ajustar inventario, escribir datos o modificar tráfico.
- Habilitar un corte global de compras para todos los verticales.
- Aceptar esta decisión por el solo hecho de abrir o integrar este PR documental.

## Referencias

- ADR-SAAS-071 (Opción 1 aceptada; documentada en PR #538, pendiente de
  integración al redactar esta propuesta).
- [PR #539 — implementación de compras Bodega](https://github.com/Glemynart/micafe-pos/pull/539)
- [PR #538 — registro de ADR-SAAS-071 y evidencia de preflight](https://github.com/Glemynart/micafe-pos/pull/538)
- `firestore.rules`: reglas actuales de `/compras` y helper `esBodegaMvp1()`.
- `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`, §§7 y 9.
- `ADR-SAAS-069-bodega-sincronizacion-viva.md`.
