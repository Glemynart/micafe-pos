# ADR-SAAS-029 — Transición de tenant histórico a contrato anual

## Estado

**Aceptado.** La autorización explícita de ejecución autónoma registrada para G-SAAS-02 acepta la alternativa recomendada y habilita su implementación dentro del alcance descrito. Las escrituras productivas siguen sujetas a preflight, comandos canónicos, auditoría, idempotencia y verificación.

- **Goal:** `G-SAAS-02` — Primer cliente real operable durante todo el ciclo comercial
- **Milestone:** `M2` — Operación comercial real y cierre del primer Trial
- **Epic:** `E2.1` — Tenant, contrato y provisioning del primer cliente
- **Tenant de referencia:** Café Atrato (`1ae0rD9H8t3ZFSBKrrHR`)
- **ADRs relacionados:** `ADR-SAAS-003`, `ADR-SAAS-009`, `ADR-SAAS-014`, `ADR-SAAS-028`

## Contexto

La auditoría read-only del 2026-08-12 confirmó que Café Atrato existe y está operativo, pero su estado actual debe conservarse:

- `suscripciones/{empresaId}` ya existe con `planId=mvp_comercial`, `planVersion=1`, periodicidad mensual, estado `trialing`, `trialInicio=2026-08-03` y `trialFin=2026-09-02`;
- la configuración tiene siete capacidades históricas y no contiene `shifts` ni `cuentas_cobro`;
- el catálogo publicado solo tiene la versión mensual v1;
- el contrato aprobado para G-SAAS-02 es anual, de `1.800.000 COP`, Trial de 30 días, pago manual y nueve capacidades;
- la versión anual v2 y su blueprint existen en el repositorio, pero todavía no existe una relación anual materializada para este tenant.

Los comandos actuales no permiten realizar la transición sin romper una invariante: `CrearSuscripcionTrial` y `CrearSuscripcionActiva` rechazan un documento de suscripción existente; `cambiarPlanSuscripcion` rechaza el cambio durante `trialing`, muta la referencia del mismo documento y no materializa el snapshot anual. Escribir directamente, reiniciar fechas o rellenar el snapshot mensual destruiría evidencia histórica y contradiría `ADR-SAAS-014` y `ADR-SAAS-028`.

La instrucción operativa exige que Café Atrato sea el tenant de referencia y prohíbe crear un cliente sustituto o reiniciar el Trial mensual. Se necesita una decisión explícita para representar una nueva relación comercial sin alterar la histórica.

## Decisión propuesta

### 1. Relación contractual append-only dentro del agregado de suscripción

La autoridad comercial seguirá siendo el agregado de suscripción. Se añadirá una subcolección canónica:

```text
suscripciones/{empresaId}/relaciones/{relacionId}
```

Cada documento representa una relación contractual completa e inmutable después de su materialización:

```text
{
  schemaVersion,
  relacionId,
  empresaId,
  estado,
  planId,
  planVersion,
  snapshotContrato: {
    schemaVersion,
    planId,
    planVersion,
    codigoPlan,
    periodicidad,
    precio: { importe, moneda },
    capacidades,
    limites,
    sedeConceptual,
    fiscalidad,
    vigencia: { inicio, fin }
  },
  origen,
  relacionAnteriorId,
  createdAt,
  updatedAt,
  revision
}
```

El snapshot y la identidad contractual no se reescriben. Las transiciones de lifecycle se registran mediante comandos server-side y evidencia append-only; una transición no cambia el snapshot original.

El documento raíz existente `suscripciones/{empresaId}` se conserva para compatibilidad con lectores históricos y no se utilizará para sobrescribir la relación mensual observada. Los nuevos lectores y comandos del contrato anual resolverán la relación vigente desde el agregado y tratarán el documento raíz legacy como proyección compatible hasta completar la migración de lectores. La relación vigente será resuelta por el servicio canónico, no por el cliente ni por una segunda autoridad comercial.

### 2. Comando de transición

Se añadirá un comando comercial server-authoritative, por ejemplo `CrearRelacionContractualTrial`, que:

- exija `COMERCIAL_GOBERNAR` y revalide el operador en backend;
- reciba solo `empresaId`, versión de plan autorizada, evidencia mínima y clave de idempotencia;
- lea empresa, catálogo publicado, relación histórica y revisiones dentro de una transacción;
- rechace la transición mientras la relación mensual esté `trialing`/vigente, para no reiniciar ni solapar el Trial;
- permita materializar la relación anual solo después del cierre canónico de la anterior, enlazándola mediante `relacionAnteriorId`;
- calcule fechas con reloj server-side y exactamente 30 días;
- copie el snapshot de la versión anual publicada: `ANUAL`, `1.800.000 COP` y exactamente las nueve capacidades;
- sea idempotente y rechace revisión conflictiva, plan no publicado, relación existente o evidencia inconsistente;
- escriba auditoría y nunca acepte un payload que sustituya precio, capacidades, estado o fechas resueltas desde Firestore.

La configuración resolverá módulos desde el snapshot de la relación vigente mediante el servicio canónico. No se usarán claims, UI ni escrituras directas. Los seis espacios históricos seguirán siendo datos operativos; no se crearán Sedes técnicas.

### 3. Secuencia para Café Atrato

1. conservar sin cambios el Trial mensual `2026-08-03`–`2026-09-02`;
2. publicar y certificar la versión anual v2 mediante comandos canónicos, sin modificar v1;
3. al finalizar el intervalo histórico, ejecutar idempotentemente el cierre/suspensión canónico si no existe pago;
4. ejecutar `CrearRelacionContractualTrial` para Café Atrato con `relacionAnteriorId` y snapshot anual;
5. verificar 30 días exactos, nueve capacidades desde el snapshot y que el historial mensual no cambió;
6. operar soporte, recuperación y evidencia contra la relación vigente;
7. confirmar manualmente el pago anual con comando autorizado, calculando el periodo server-side y conservando el snapshot;
8. cancelar o cerrar al final de la vigencia sin archivar/eliminar datos automáticamente.

Si el Trial mensual concluye con pago u otro estado que no permita la transición, el comando debe rechazarla y dejar evidencia; no se autoriza una mutación compensatoria.

### 4. Compatibilidad, Rules y lecturas

La implementación debe mantener lectores mensuales históricos; actualizar plan/capacidades, lifecycle, panel y soporte para resolver la relación vigente; proteger la subcolección con Rules sin escrituras de cliente; e incluir validación de tenant, operador, auditoría, idempotencia, revisiones y rollback. La proyección de compatibilidad del documento raíz debe definirse antes de cambiar consumidores.

No se permite crear una colección global paralela, mutar la suscripción histórica, alterar fechas observadas, crear otra Empresa ni transformar espacios en Sedes.

## Alternativas consideradas

1. **Mutar `suscripciones/{empresaId}` o reutilizar el Trial:** rechazada porque destruye/confunde evidencia y no crea snapshot anual inmutable.
2. **Usar `cambiarPlanSuscripcion` después del Trial:** rechazada; muta el mismo documento y no crea relación separable ni snapshot completo.
3. **Colección global independiente de contratos:** rechazada por duplicar autoridad y contradecir `ADR-SAAS-028`.
4. **Nueva Empresa/tenant:** rechazada porque contradice Café Atrato como referencia y evita la divergencia.
5. **Relaciones versionadas dentro del agregado:** recomendada; conserva historial, habilita idempotencia y hace explícito el vínculo contractual. Requiere actualizar consumidores y Rules, por lo que solo se implementará tras aceptar este ADR.

## Consecuencias

El Trial mensual permanece intacto, Café Atrato sigue siendo el cliente real y el contrato anual obtiene snapshot autosuficiente e inmutable. El coste es ampliar modelo, comandos, resolvers, panel, Rules, pruebas, auditoría y soporte; la transición no puede ocurrir antes del cierre histórico y G-SAAS-02 debe conservar evidencia durante los 30 días reales del Trial anual y hasta el cierre contractual.

## Rollback

Antes de cada escritura se hará preflight read-only de empresa, suscripción raíz, relaciones, plan, configuración, membresías, Rules y operador. La materialización será transaccional e idempotente. Si falla la publicación o el código, se deshabilita selección anual y se mantienen lectores compatibles con v1 y con la raíz histórica. No se elimina ni edita la relación mensual ni un snapshot anual ya materializado; las correcciones son comandos de lifecycle autorizados y evidencia append-only.

## Criterios de aceptación del ADR

- el ADR se acepta antes de implementar relación o comando;
- los campos contractuales observados de la suscripción mensual quedan equivalentes;
- existe ruta canónica para relación anual nueva, sin reutilizar Trial mensual;
- snapshot anual con precio, moneda, nueve capacidades, vigencia y versión;
- Trial server-side de 30 días y enlace explícito a relación anterior;
- Rules, auditoría, idempotencia, lectores y rollback cubiertos;
- sin tenants, Sedes técnicas, cuotas, billing automático, notificaciones ni funcionalidad fuera de G-SAAS-02.

## Gate

Con estado **Aceptado**, este ADR autoriza el siguiente PR mínimo para implementar la relación contractual, sus consumidores, Rules, pruebas y rollback. No autoriza tenants sustitutos, Sedes técnicas, billing automático ni funcionalidad fuera de G-SAAS-02.