# ADR-SAAS-055 — Provisionamiento de cuenta operativa Bodega para staging

## Estado

**ACEPTADO — 2026-10-03.**

La aceptación de este ADR constituye la decisión arquitectónica para una
capacidad administrativa canónica de provisionamiento de cuentas operativas.
Autoriza únicamente su implementación controlada. No autoriza por sí misma
deploy, tráfico, creación o modificación del fixture, Bootstrap, Activation,
producción, cambios en `saas-auth`, Rules, IAM, Secrets, Firestore o Auth.

La implementación debe reproducir el comportamiento server-authoritative,
tenant-aware, idempotente y auditable definido aquí. No se permite resolver el
bloqueo mediante escritura directa del fixture ni mediante cambios a
`confirmarVentaBodegaV1`.

**Fecha de propuesta:** 2026-10-03
**Fecha de aceptación:** 2026-10-03

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

La causa es una dependencia de lifecycle/provisioning del fixture, no un
problema de CORS, autenticación, aislamiento ni resolución de catálogo.

## 2. Restricciones vigentes

La solución debe conservar:

1. autoridad server-side de plataforma, tenant y cuenta;
2. resolución por `(empresaId, claveOperativa, cuentaDocumentoId)`;
3. identidad física tenant-scoped definida por R1-B;
4. idempotencia, atomicidad, ledger y auditoría;
5. prohibición de crear cuentas desde el cliente;
6. prohibición de escribir directamente el fixture para simular una ruta de
   producto;
7. cero cambios en producción y cero secretos nuevos;
8. compatibilidad con ADR-SAAS-019, ADR-SAAS-041, ADR-SAAS-048 y ADR-SAAS-049.

La cuenta `bancolombia` es una cuenta operativa no reservada necesaria para
completar el escenario de transferencia de Bodega. Las cuentas reservadas de
Bootstrap no se sustituyen ni se modifican.

## 3. Decisión aceptada

Se acepta la alternativa C: una capacidad administrativa canónica para cuentas
operativas no reservadas, con una frontera independiente:

- **Codebase:** `saas-platform-financial-account-provisioning`;
- **Source:** `functions-platform-financial-account-provisioning`;
- **Callable:** `provisionarCuentaOperativaTenantSaas`;
- **Región:** `us-central1`;
- **Runtime:** Node.js 22 / Gen2;
- **Secrets:** cero;
- **Autoridad:** operador de plataforma con la facultad existente
  `LIFECYCLE_GOBERNAR`, validada server-side mediante el envelope de plataforma.

El contrato futuro debe aceptar únicamente los datos funcionales necesarios
para la cuenta (`empresaId` derivado/validado server-side, `claveOperativa`,
nombre y tipo). El cliente no puede suministrar autoridad, identidad física,
saldo, movimientos, membresías ni claims. La identidad física se deriva de
`empresaId` y `claveOperativa`; las claves reservadas `caja-principal` y
`caja-fuerte` no pueden crearse mediante esta operación.

La operación debe ser read/write administrativa, idempotente y transaccional:
una repetición con la misma intención devuelve el resultado existente; una
intención distinta con la misma clave de idempotencia se rechaza; no crea
duplicados y deja obligación/auditoría server-side. No genera movimientos de
ledger ni cambia el saldo inicial distinto de cero.

La frontera no importa `functions/src/index.ts`, el monolito `saas-auth`,
`operational-auth.ts` completo, `configuracion/service.ts`, Bootstrap,
Activation, comercial, Wompi, Dusema, email, recovery ni módulos con Secrets.

## 4. Alternativas consideradas

| Alternativa | Resultado |
| --- | --- |
| Mantener transferencia no ejecutable en el fixture | Rechazada: deja Gate F sin la evidencia funcional requerida. |
| Ampliar Bootstrap para crear `bancolombia` | Rechazada: amplía el contrato de Bootstrap y la política de cuentas reservadas. |
| Provisionamiento administrativo canónico dedicado | **Aceptada:** conserva autoridad, aislamiento, idempotencia y reutilización futura. |
| Herramienta exclusiva del fixture | Rechazada: introduce una superficie temporal sin contrato reusable. |

## 5. Migración, rollback y gates

La implementación será un PR técnico independiente. Antes del primer deploy
deberán pasar build reproducible, TypeScript, lint, tests de autoridad,
idempotencia, aislamiento, discovery, module-load y preflight dirigido. El
preflight debe demostrar exactamente un codebase y una callable, cero Secrets,
cero deletes/replacements y cero cambios ajenos.

Después del merge, un gate separado podrá autorizar únicamente el deploy
dirigido a `micafe-pos-staging`. La creación de `bancolombia` en el fixture
requiere posteriormente una invocación canónica autorizada; no se permite
escritura directa. La operación debe conservar una revisión conocida y un
rollback de código/tráfico explícito antes de modificar el fixture.

Gate F continúa **BLOCKED** hasta demostrar, como mínimo, transferencia
exitosa, ledger, inventario, auditoría, idempotencia, negativos y aislamiento.
Gate G, H, I, J, K y L permanecen pendientes. E2.2 permanece `EN EJECUCIÓN`.

## 6. Compatibilidad y fuera de alcance

ADR-SAAS-055 no modifica silenciosamente ADR-SAAS-019, ADR-SAAS-041,
ADR-SAAS-048, ADR-SAAS-049, ADR-SAAS-050, ADR-SAAS-051, ADR-SAAS-053 ni
ADR-SAAS-054. No retira las cinco callables legacy de `saas-auth`, no amplia
`saas-bodega`, no modifica Bootstrap ni cambia `confirmarVentaBodegaV1`.

Quedan fuera de alcance: producción, Distribuidora Las Jiménez, otro tenant o
fixture, Bootstrap adicional, Activation adicional, cleanup destructivo,
Secrets, IAM, Rules, tráfico manual y cualquier deploy no autorizado por su
gate correspondiente.

La aceptación de ADR-SAAS-055 autoriza exclusivamente la implementación de la
frontera `saas-platform-financial-account-provisioning` dentro de este alcance.
No autoriza por sí misma deploy, tráfico, fixture, Bootstrap, Activation,
cutover ni producción.
