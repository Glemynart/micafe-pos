# ADR-SAAS-032 - Cierre anticipado controlado del Trial historico

## Estado

**Aceptado.** Esta decision registra la instruccion explicita del Product
Owner del 2026-08-14: Cafe Atrato es el primer cliente real y su Trial
mensual actual debe cerrarse para continuar con el contrato anual del Goal
G-SAAS-02. La decision cambia solamente el momento del cierre; no cambia el
modelo append-only ni autoriza escrituras directas.

- **Goal:** `G-SAAS-02`
- **Milestone / Epic:** `M2 / E2.1`
- **Tenant:** Cafe Atrato (`1ae0rD9H8t3ZFSBKrrHR`)
- **Supersede parcialmente:** `ADR-SAAS-029`, solo en la condicion temporal de
  esperar hasta `2026-09-02`.
- **No supersede:** `ADR-SAAS-028`, `ADR-SAAS-029` en su modelo contractual,
  `ADR-SAAS-031` ni sus gates de recovery.

## Contexto

La observacion read-only confirmo que la Empresa esta `activa`, la suscripcion
raiz sigue en `trialing`, conserva `planVersion=1`, `trialInicio=2026-08-03`,
`trialFin=2026-09-02`, revision 1 y no tiene `snapshotContrato`. La
configuracion conserva siete capacidades, no existe relacion contractual anual
y el plan v2 anual publicado mantiene 1.800.000 COP y nueve capacidades.

El servicio canonico permite `trialing -> canceled`, mientras que
`suspenderTrialVencido` solo actua cuando la fecha historica ya vencio. Por
tanto, cerrar ahora requiere el comando comercial de transicion y no una
simulacion de vencimiento.

## Decision

1. El Trial mensual historico se cierra mediante
   `ejecutarComandoComercialSaas` con `TransicionarSuscripcion`, destino
   `canceled`, revision esperada y envelope idempotente.
2. No se cambian `trialInicio`, `trialFin`, `planId`, `planVersion`, las siete
   capacidades historicas ni se agrega `snapshotContrato` a la raiz.
3. La Empresa no se cancela ni se archiva como parte de este cierre. Su
   lifecycle se mantiene operativo para que la relacion anual pueda
   materializarse cuando todos los gates pasen.
4. La relacion anual se crea despues del cierre con
   `CrearRelacionContractualTrial`; sus fechas las calcula el servidor y el
   Trial anual empieza solamente al materializar esa relacion. No se reinicia
   ni se reutiliza el Trial historico.
5. La configuracion se amplia a las nueve capacidades unicamente mediante el
   comando canonico de configuracion y despues de que el snapshot anual exista.
6. Antes de cualquier escritura siguen siendo obligatorios el recovery
   productivo observable de `ADR-SAAS-031`, la autenticacion del operador, el
   release verificado, la idempotencia, la auditoria y la verificacion
   read-only posterior.

## Secuencia operativa

```text
preflight read-only
-> TransicionarSuscripcion(trialing -> canceled)
-> verificar raiz historica intacta
-> CrearRelacionContractualTrial(v2, 30 dias, snapshot anual)
-> verificar relacion y nueve capacidades
-> actualizar configuracion por comando canonico
-> smoke y evidencia del Trial real
```

Si un gate falla, la secuencia se detiene y no se compensa con escrituras
directas ni con fechas inventadas. El preflight reproducible requiere la
referencia `G-SAAS-02-PO-DECISION-CIERRE-ANTICIPADO-2026-08-14` cuando se usa
antes del 2026-09-02.

## Consecuencias y limites

- Cafe Atrato deja de estar en el Trial mensual historico cuando el comando
  sea ejecutado con exito.
- El Trial anual aun no existe por el solo hecho de cancelar la raiz.
- El cierre no autoriza Wompi, billing automatico, Sede, referidos, offline,
  notificaciones, limites comerciales nuevos ni overages.
- El rollback de la decision es otro comando de lifecycle autorizado y
  auditable; nunca se edita la raiz historica directamente.
