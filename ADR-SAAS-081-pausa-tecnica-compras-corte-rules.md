# ADR-SAAS-081 — Pausa técnica de compras durante un corte de Rules

## Estado

**PROPUESTO — pendiente de decisión arquitectónica explícita.**

- **Fecha de propuesta:** 2026-10-15.
- **Última revisión:** 2026-10-15.
- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` →
  `E2.2 — Configuración inicial` / Gate I.
- **Decisor pendiente:** responsable del proyecto.
- **Relacionados:** ADR-SAAS-072, ADR-SAAS-075, ADR-SAAS-078, R1 §§7 y 9,
  y la matriz de compatibilidad de Gate I.
- **Límite:** este ADR no autoriza implementación, cambios de Rules, Functions,
  datos, IAM/Secrets, despliegues ni pausa de ningún tenant.

## Contexto

Gate I necesita reconciliar 14 paths de Firestore Rules. El corte global no
puede usar como rollback ordinario la Ruleset antigua porque reabriría escrituras
directas de compras. La evidencia vigente exige una pausa verificable, operadores
y un forward-fix antes de cualquier release.

Existe una transición de lifecycle `activa/trial → suspendida`, con autoridad
`LIFECYCLE_GOBERNAR`. No es una pausa mínima de compras: bloquea toda escritura
operativa del tenant y altera su lifecycle comercial. Usarla para un corte de
Rules afectaría ventas, inventario, caja y otros flujos; además requeriría una
mutación productiva por tenant. Por tanto no satisface el objetivo de detener
solo compras ni debe usarse como sustituto implícito de un control de release.

Las Rules actuales no cierran todavía todos los escritores directos que el
corte va a cambiar. Las Functions de compra usan transacciones y validación de
tenant; `registrarCompraOperativaV1` también debe conservar el guard
`BODEGA_USE_CANONICAL` de ADR-SAAS-075 para operación nueva y replay. Una
bandera solo en UI o solo en callable dejaría una ruta de bypass.

## Problema a decidir

¿Cómo pausar y reanudar exclusivamente las operaciones de compra relevantes
durante un corte de Rules, sin modificar el lifecycle comercial, sin permitir
bypass por escrituras directas y sin crear compras duplicadas tras fallos de
red?

## Impulsores

- La autoridad debe ser server-authoritative y comprobable antes del release.
- La pausa no puede ampliar permisos ni reabrir escrituras directas.
- La operación en curso debe tener resultado determinista y auditable.
- Los reintentos deben mantener idempotencia y no producir efectos parciales.
- La reanudación solo debe ocurrir con hashes y verificaciones de release
  esperados, no por un timeout de cliente.
- El mecanismo debe ser específico de compras; no reemplaza el lifecycle,
  smoke, rollback ni autorización de deploy.

## Opciones consideradas

### Opción 1 — Control de release server-authoritative para compras (recomendada)

Crear un documento canónico de control de corte, modificable solo por un
comando backend con facultad nueva y acotada de release. El documento expresa
`ACTIVA` o `PAUSADA`, una revisión monotónica, motivo/correlación mínimos y la
ventana autorizada. Rules consultan ese control para negar escrituras directas
de compra mientras esté pausado; las callables de compra lo leen dentro de su
transacción antes de cualquier efecto y vuelven a verificarlo en replay.

**Comportamiento propuesto:**

- Una compra nueva durante `PAUSADA` termina con un error estable
  `COMPRAS_EN_CORTE`, sin compra, inventario, ledger, señal ni auditoría de
  compra.
- Un replay que ya tiene recibo confirmado puede devolver únicamente ese
  recibo, sin efectos nuevos; si no existe recibo previo, se rechaza.
- La modificación del documento de control provoca reintento de la transacción
  que lo leyó; una transacción que observa la pausa no puede confirmar después
  de ella.
- Una escritura directa se autoriza o deniega contra el estado del control al
  confirmar en servidor. Escrituras offline no ganan una excepción: se evalúan
  al sincronizar.
- Un timeout o caída de red se resuelve reintentando con la misma llave de
  idempotencia; el cliente no debe crear una segunda orden ni asumir éxito.

**Ventajas:** control mínimo por dominio, auditado, visible para Rules y
Functions, con recuperación por reanudación explícita y sin cambiar lifecycle.

**Costes:** introduce autoridad, documento, facultad, contratos, Rules y
pruebas nuevas. Requiere coordinación de todos los escritores de compra y no
puede implementarse dentro de un PR documental.

### Opción 2 — Suspender temporalmente cada empresa

Usar la transición de lifecycle existente a `suspendida`, y reactivarla tras el
corte.

**Ventajas:** autoridad y pruebas existentes; bloquea escrituras operativas.

**Costes:** no es específica de compras, interrumpe otros dominios, modifica
estado comercial real y obliga a mutaciones por tenant. No ofrece una garantía
de compatibilidad para el Trial ni una recuperación mínima. No recomendada.

### Opción 3 — Corte manual sin control técnico

Los operadores dejan de iniciar compras durante una ventana y el release se
ejecuta tras drenar operaciones conocidas.

**Ventajas:** no añade contrato ni código.

**Costes:** no evita llamadas directas, clientes en segundo plano, reintentos u
operaciones ambiguas. No es una barrera de seguridad y no debe considerarse
aprobada por defecto. Solo podría usarse como procedimiento excepcional con
riesgo y autorización operativa explícitos.

## Recomendación pendiente de aceptación

Adoptar la **Opción 1**. El estado inicial debe ser `ACTIVA`; no hay pausa
implícita ni timeout que cambie el estado. La orden de pausar y reanudar debe
ser un comando de plataforma idempotente, con revisión esperada y auditoría
inmutable. La reanudación requiere una atestación de hashes/alias/Rules y el
fin explícito de la ventana; no basta con que no haya errores visibles.

La facultad exacta, ubicación del documento y esquema del comando deben ser
aceptados antes de implementar. Ningún cliente controla la pausa ni recibe
privilegios nuevos por este mecanismo.

## Diseño de referencia para una futura implementación

```text
comando platform release-control
       │  (facultad de release, revision esperada, auditoría)
       ▼
control canónico de compras ──► Firestore Rules: niega escrituras directas
       │
       └──────────────────────► transacción de callable: valida antes de efectos
                                      │
                                      ├─ PAUSADA: rechazo estable / replay sin efectos
                                      └─ ACTIVA: compra canónica idempotente
```

### Seguridad, concurrencia y recuperación

- El control se lee dentro de la misma transacción que compra, recibo,
  inventario y ledger; no se confía en estado suministrado por cliente.
- Pausar y reanudar exigen `expectedRevision`; solicitudes concurrentes solo
  pueden producir una transición válida. Cada transición deja actor, motivo
  codificado, correlación, timestamps servidor y resultado, sin PII ni secretos.
- Antes de pausar, el operador debe drenar y registrar operaciones ambiguas.
  Después de pausar, reintentos sin recibo quedan rechazados; replays con recibo
  no mutan. El soporte investiga una llave ambigua, no crea una compra nueva.
- Una incompatibilidad de Rules, hash, cliente o error 5xx mantiene `PAUSADA`
  y exige forward-fix aprobado. No se restaura automáticamente una Ruleset que
  reabra escritura directa.
- La recuperación es una reanudación auditada tras comprobaciones posteriores;
  no es un rollback de lifecycle, Rules ni inventario.

### Pruebas requeridas antes de aceptar una PR de implementación

1. Functions: nueva compra denegada sin efectos durante pausa; compra permitida
   al reanudar; replay confirmado sin efectos nuevos; replay inexistente
   denegado; cambio concurrente de revisión y timeout/idempotencia.
2. Rules Emulator: create/update/delete directos de compra denegados durante
   pausa para todos los roles/verticales pertinentes; aislamiento tenant y
   contratos GENERAL preservados al estar activa.
3. Integración: la callable lee el mismo control transaccional; no hay bypass
   mediante payload, claim, cliente offline o endpoint legacy.
4. Seguridad: solo la autoridad de release designada puede transicionar;
   auditoría no filtra PII/secretos; cliente no puede editar el control.
5. Release rehearsal: abortar y forward-fix sin restaurar Rules inseguras;
   confirmar que DIAN web, Vercel, smoke y Trial siguen fuera de alcance.

## Paquete operativo alternativo: corte manual

Si se rechaza la Opción 1, el corte manual debe quedar como excepción explícita
con: ventana aprobada, tenants/operadores designados, aviso de no iniciar
compras, drenaje confirmado, observación de errores, criterios de aborto y
forward-fix. Sus riesgos residuales — bypass directo, trabajo offline, reintento
ambiguo y error humano — permanecen; no proporciona el control técnico que
requiere Gate I.

## Fuera de alcance

- Implementar documento, comando, Rules, callable, interfaz o despliegue.
- Cambiar lifecycle, estado comercial, IAM, Secrets o datos de tenants.
- Autorizar el corte de Rules, Functions, Vercel o smoke.
- Resolver la autoridad server-side DIAN; continúa como ADR-SAAS-080 propuesto.

## Referencias

- [ADR-SAAS-072](ADR-SAAS-072-corte-seguro-compras-bodega.md).
- [ADR-SAAS-075](ADR-SAAS-075-aislamiento-callable-legacy-compras-bodega.md).
- [ADR-SAAS-078](ADR-SAAS-078-aislamiento-wompi-de-saass-auth.md).
- [Matriz de Gate I](docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-RULES-COMPATIBILITY-MATRIX-2026-10-14.md).
- [Cierre y evidencia Gate I](docs/goals/evidence/G-SAAS-02-E2-2-PR595-POSTMERGE-CLOSEOUT-2026-10-14.md).
