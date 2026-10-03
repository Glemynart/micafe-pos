# ADR-SAAS-055 — Provisionamiento de cuenta operativa Bodega para staging

## Estado

**Propuesto — pendiente de aprobación**

**Fecha de propuesta:** 2026-10-03

Este ADR se propone porque Gate F de G-SAAS-02 → M2 → E2.2 no puede completar
la prueba de transferencia del fixture sintético sin una cuenta tenant-aware
con `claveOperativa: "bancolombia"`.

La propuesta no autoriza por sí misma implementación, cambios de Bootstrap,
creación de endpoints, escritura manual en Firestore, deploy, tráfico,
producción ni modificación del fixture.

## Goal, Milestone y Epic

- **Goal:** `G-SAAS-02`
- **Milestone:** `M2 — Provisioning y onboarding`
- **Epic:** `E2.2 — Configuración inicial`
- **Dependencia:** Gate F — validación funcional del fixture Bodega.

## 1. Evidencia del bloqueo

En la revisión staging del fixture `E2_2-BODEGA-STAGING-FIXTURE`:

- `confirmarVentaBodegaV1` está activa en `saas-bodega` y su revisión
  `confirmarventabodegav1-00002-kig` recibió la solicitud;
- una venta en efectivo completó correctamente turno, venta, inventario,
  ledger y auditoría;
- una transferencia recibió HTTP 400 sin escrituras adicionales;
- `ventas-confirmation.ts` resuelve el medio `transferencia` mediante la clave
  lógica `bancolombia`;
- `resolverCuentaOperativa` exige exactamente una cuenta del tenant con esa
  clave;
- la consulta read-only del fixture solo encontró las cuentas reservadas
  `caja-principal` y `caja-fuerte`;
- Bootstrap materializa únicamente esas dos cuentas reservadas;
- no existe una callable canónica para crear cuentas no reservadas y la UI de
  Finanzas solo verifica cuentas existentes.

La causa es, por tanto, una dependencia de lifecycle/provisioning del fixture,
no un problema de CORS, autenticación, aislamiento ni resolución de catálogo.

## 2. Restricciones vigentes

La solución debe conservar:

1. autoridad server-side de tenant y cuenta;
2. la resolución por `(empresaId, claveOperativa, cuentaDocumentoId)`;
3. la identidad física tenant-scoped definida por R1-B;
4. idempotencia, atomicidad, ledger y auditoría;
5. la prohibición de crear cuentas desde el cliente;
6. la prohibición de escribir directamente el fixture para simular una ruta
   de producto;
7. cero cambios en producción y cero secretos nuevos;
8. compatibilidad con ADR-SAAS-019, ADR-SAAS-041, ADR-SAAS-048, ADR-SAAS-049
   y ADR-SAAS-054, o una supersesión explícita antes de implementar.

## 3. Alternativas

### A. Mantener transferencia no ejecutable en el fixture

Se conserva el comportamiento actual y Gate F registra transferencia como
`BLOCKED`/`NOT EXECUTED`. No introduce riesgo técnico, pero no satisface el
criterio vigente de validación funcional que exige comprobar efectivo y
transferencia.

### B. Ampliar Bootstrap para crear `bancolombia`

Bootstrap podría crear una cuenta no reservada junto con las dos cuentas
reservadas. Es simple para nuevos tenants, pero amplía el contrato de
Bootstrap, cambia la política de cuentas aceptada por R1-B/ADR-SAAS-019 y
materializa una cuenta que puede no ser necesaria para todos los tenants.

### C. Provisionamiento administrativo canónico de cuentas no reservadas

Definir una operación server-side, idempotente y tenant-aware, autorizada solo
para una autoridad administrativa explícita, que cree la cuenta con identidad
derivada y auditoría. El mismo contrato podría servir para staging y para un
tenant real, sin escritura desde el cliente. Requiere definir permisos,
lifecycle, contrato, rollback y superficie de despliegue.

### D. Provisionamiento exclusivo del fixture mediante herramienta de staging

Crear una operación de plataforma limitada a fixtures sintéticos de staging,
con autoridad fuera del cliente, auditoría e idempotencia. Minimiza el alcance
de producción, pero introduce una superficie temporal que debe gobernarse,
desplegarse y retirarse explícitamente.

## 4. Recomendación

Se recomienda **C**: una capacidad administrativa canónica para cuentas no
reservadas, diseñada primero como decisión de gobernanza y después como PR
separado. Debe permitir provisionar `bancolombia` para el fixture sin aceptar
ID físico desde el cliente, sin duplicar cuentas y sin alterar las cuentas
reservadas del Bootstrap.

La alternativa D solo debe elegirse si se decide explícitamente que las cuentas
no reservadas son exclusivas de ensayos y nunca forman parte del producto.

## 5. Alcance de la decisión pendiente

La aprobación deberá resolver, como mínimo:

- nombre y boundary de la operación;
- autoridad permitida y permisos;
- contrato de creación y campos mínimos;
- regla de identidad física derivada;
- claves permitidas y unicidad;
- idempotencia, auditoría y rollback;
- si la operación aplica a staging, a tenants reales o a ambos;
- si `bancolombia` es requisito del producto Bodega o una capacidad opcional;
- cómo se sincroniza ADR-SAAS-041 y el Goal sin cerrar E2.2 prematuramente.

## 6. Fuera de alcance

- modificar `confirmarVentaBodegaV1` para ocultar la ausencia de cuenta;
- usar `caja-principal` como sustituto de una transferencia;
- crear documentos directamente en Firestore;
- modificar Rules, IAM, Secrets o tráfico;
- ejecutar otra venta, Bootstrap o Activation;
- crear otro tenant o fixture;
- desplegar cualquier Function;
- iniciar Gate G, H, I, J, K o L.

## 7. Estado de gates

- Gate F: **BLOCKED**, con venta en efectivo demostrada y transferencia sin
  cuenta canónica disponible.
- Gate G: pendiente.
- Gate H: pendiente.
- E2.2: `EN EJECUCIÓN`.

## 8. Decisión requerida

La implementación no debe comenzar hasta que este ADR sea aceptado o se
apruebe explícitamente una alternativa de alcance equivalente. Tras la
aceptación deberán actualizarse los documentos maestros afectados y abrirse un
PR técnico independiente con preflight, CI, auditoría y deploy controlado.
