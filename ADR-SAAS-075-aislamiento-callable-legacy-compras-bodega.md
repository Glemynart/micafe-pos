# ADR-SAAS-075 — Aislamiento de la callable legacy de compras para Bodega

## Estado

**PROPUESTO — pendiente de aprobación explícita.**

- **Fecha de propuesta:** 2026-10-12.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial`.
- **Relacionados:** ADR-SAAS-049, ADR-SAAS-054, ADR-SAAS-071, ADR-SAAS-072 y ADR-SAAS-074.
- **Límite:** esta propuesta no autoriza cambios de código, cliente, deploy,
  Rules, IAM, Secrets, Functions, datos ni producción.

## Contexto y evidencia

ADR-SAAS-071 separó las compras Bodega en `registrarCompraBodegaV1` y preservó
`registrarCompraOperativaV1` para los verticales generales. ADR-SAAS-072 aceptó
cerrar escrituras directas de `/compras` por proyecto, pero exige demostrar que
la callable legacy no puede ser invocada para Bodega; si sí puede, ordena una
ADR nueva antes del corte.

La revalidación read-only de producción en `micafe-pos @ 380928b` encontró
`registrarCompraOperativaV1` activa bajo `saas-auth`. En el código actual, el
handler deriva tenant y membresía mediante `exigirTenantActivo` y llama
`ejecutarRegistrarCompraOperativaV1`. Esa entrada ejecuta el efecto genérico de
compra, sin `exigirCompraBodegaHabilitada` ni `validarPayloadCompraBodega`.
`revalidarAutoridadFinancieraEnTransaccion` valida estado, membresía y permiso,
pero no restringe por vertical. Bodega tiene el módulo `purchases`; por tanto,
la autoridad genérica permite intentar la compra Bodega.

La ruta aislada ya comprueba la política y payload Bodega. El helper
`executeConContexto` permite un replay idempotente sin ejecutar el efecto; una
restricción puesta solo en el efecto inicial dejaría un hueco en los replays,
por lo que el control también debe ejecutarse en la ruta de validación de
replay.

La evidencia no invocó la callable en producción. No hubo deploy ni escrituras.

## Problema a decidir

¿Cómo impedir que Bodega omita la política de compras aislada llamando el
endpoint genérico activo, sin cambiar el comportamiento de otros verticales y
sin convertir un corte de Firestore Rules en un control incompleto?

## Impulsores de decisión

- La compra Bodega debe cumplir la validación de vertical, módulo y payload.
- La barrera debe ser server-authoritative y aplicarse a operaciones nuevas y
  replays.
- Los verticales distintos a `BODEGA_MVP1` deben conservar el contrato actual.
- El alcance de despliegue debe ser demostrable conforme a Gate C y ADR-SAAS-049
  / ADR-SAAS-054; no presumir que un filtro de CLI vuelve seguro un deploy.
- Mantener `saas-auth` intacto es una decisión vigente de ADR-SAAS-071/072; una
  modificación requiere aprobación que la superseda de forma explícita y
  acotada.

## Opciones

### Opción 1 — Rechazo vertical Bodega en la callable genérica (recomendada)

Agregar a la ruta de `registrarCompraOperativaV1` un control del vertical desde
la configuración canónica del tenant. Para `BODEGA_MVP1`, rechazar con un error
de dominio estable que indique usar `registrarCompraBodegaV1`; los demás
verticales continúan por el flujo actual. La validación debe cubrir tanto la
operación nueva como replay/idempotencia y debe ejecutarse sin efectos parciales.

Esta opción cambia de manera deliberada el comportamiento de
`saas-auth` únicamente para Bodega y, por lo tanto, requiere superseder de forma
limitada la preservación absoluta descrita por ADR-SAAS-071/072. El preflight y
cualquier deploy siguen siendo una decisión y gate posteriores; esta ADR no los
autoriza.

**Ventajas:** cierra la ruta legacy a nivel de autoridad, conserva a los demás
verticales, mantiene la callable Bodega como única entrada y permite cumplir
ADR-SAAS-072 sin depender de Rules para bloquear Admin SDK.

**Costes:** cambia el comportamiento de un handler en `saas-auth`; requiere
pruebas de no regresión por vertical, evaluar el closure de despliegue y
demostrar un Gate C/rollback exactos antes de publicar.

### Opción 2 — Migrar todos los verticales y retirar la callable genérica

Migrar de forma coordinada todos los consumidores de compras a endpoints
aislados y luego retirar `registrarCompraOperativaV1`.

**Ventajas:** elimina la ruta legacy y simplifica el modelo de autoridad a
largo plazo.

**Costes:** amplía alcance más allá de E2.2, requiere inventario y coordinación
de los otros verticales, y no resuelve el bloqueo inmediato sin una migración
completa y certificada.

### Opción 3 — Preservar la callable y mantener bloqueado el corte Bodega

No modificar `saas-auth`; no declarar seguro el corte de `/compras` ni dar de
alta el tenant Bodega en producción hasta que la callable no esté presente o
exista otro control aprobado que pruebe que no la puede invocar.

**Ventajas:** conserva exactamente las decisiones vigentes y evita cambios de
comportamiento no aprobados.

**Costes:** mantiene Gate I bloqueado; el hecho de que el cliente use la nueva
callable no impide invocaciones directas de la legacy.

## Decisión propuesta

Se recomienda la **Opción 1**, limitada a impedir que un tenant con vertical
canónico `BODEGA_MVP1` procese compras por `registrarCompraOperativaV1`. La
decisión debe expresamente autorizar una excepción acotada a la preservación de
`saas-auth` en ADR-SAAS-071/072. No debe alterar comportamiento, discovery,
Secrets ni contratos de otros verticales.

La implementación deberá comprobar la vertical dentro de la autoridad
transaccional, cubrir el camino de operación nueva y el replay, y responder con
un error no ambiguo que no registre compra, inventario, ledger, señal ni
auditoría. Las pruebas deben acreditar la denegación Bodega y regresión positiva
de compras en otros verticales.

## Consecuencias y límites

- La propuesta no cambia el estado aceptado de ADR-SAAS-071/072. Su aceptación
  los supersedería solo en la restricción necesaria para esta barrera Bodega.
- La aceptación autorizaría preparar una PR de implementación aislada; no
  autorizaría deploy, reglas, IAM, Secrets, compras, datos ni tenant real.
- Un deploy de `saas-auth` requiere Gate C que demuestre la superficie exacta,
  secretos, dependencias y rollback; no se autoriza por el solo hecho de que
  exista una opción `--only`.
- La barrera de callable y el corte de escrituras directas de Rules son controles
  distintos; se necesitan ambos para cerrar ADR-SAAS-072.
- Gate I seguirá bloqueado por los restantes hallazgos de producción,
  incluida la identidad del artifact Vercel, Rules, colisiones de nombres,
  smoke y restore independientes.

## Migración, validación y rollback propuestos

Tras aprobación explícita, una PR de implementación deberá:

1. aplicar el control por vertical desde configuración canónica, sin confiar en
   claims aportados por el cliente;
2. validar el mismo control en el camino nuevo y en replay antes de devolver
   recibos previos;
3. añadir pruebas de Bodega rechazada, otros verticales permitidos, replay,
   payload inválido y ausencia de efectos parciales;
4. ejecutar las suites de compra, autoridad, idempotencia y Rules afectadas;
5. probar el cliente Bodega contra `registrarCompraBodegaV1` en Emulator/staging;
6. completar preflight y Gate C/D separados antes de cualquier deploy; detenerse
   si el delta o closure de `saas-auth` no se demuestra exactamente.

Rollback antes del tenant real: revertir la PR de código y mantener bloqueado
el corte de Rules y el alta productiva. Si ya existiera un tenant real, no
reabrir la callable genérica ni escrituras directas de Rules como rollback
automático; exigir corrección hacia delante o un plan de migración/restauración
aprobado que preserve compras e inventario.

## Decisión solicitada

Aceptar o rechazar explícitamente la Opción 1. Si se rechaza, escoger Opción 2
u Opción 3 y actualizar Goal/ADR antes de implementar. La aprobación de esta
propuesta no autoriza deploy ni escrituras productivas.
