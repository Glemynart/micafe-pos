# ADR-SAAS-039 — Staging controlado P2-05 POS → Dusema

## Estado

**Propuesto.**

Este ADR no autoriza ninguna operación externa. La Etapa B permanece bloqueada
hasta su aprobación explícita y hasta que se cumplan todos sus gates.

## Goal, iniciativa y límite

- **Goal:** `G-SAAS-02`.
- **Iniciativa:** `P2-05` — integración administrativa POS → Dusema.
- **Ámbito exclusivo propuesto:** Firebase `micafe-pos-staging` y Dusema
  staging. No incluye recursos productivos.
- **Relación:** complementa, sin modificar, ADR-SAAS-038.

## 1. Etapas separadas

### Etapa A — Recuperación técnica

F1–F4 están completadas e integradas en `main @ 91bb6ae`:

1. binding backend-only;
2. cliente S2S RS256;
3. Callable `consultarTenantDusemaSaas`;
4. tarjeta Dusema read-only en `CompanyDetail`.

ADR-SAAS-038 queda como la decisión histórica aceptada de esta recuperación. No
autoriza operaciones de staging y no se modifica retroactivamente.

### Etapa B — Staging controlado P2-05

**Estado: BLOQUEADA / pendiente de aprobación.**

Su eventual ejecución se limita a datos sintéticos y al recorrido Backoffice
POS → Firebase Auth → `consultarTenantDusemaSaas` → binding backend-only →
cliente S2S POS → Dusema staging. La existencia de este ADR propuesto no
autoriza provisioning, despliegue, binding ni E2E.

## 2. Gate de región Firestore

La región de Firestore staging no está aprobada. Su elección es irreversible y no se infiere de la región productiva. Antes de crear Firestore se debe aprobar explícitamente la región, documentar sus dependencias —Functions, latencia, recuperación, residencia de datos y costes— y registrar el responsable de la decisión.

Las alternativas técnicas a evaluar son `us-central1` y
`southamerica-east1`. `us-central1` queda favorecida únicamente como propuesta
técnica por la proximidad con las Functions existentes; no es una decisión
ejecutable. La aprobación debe registrar también impacto operativo, plan de
recuperación, residencia de datos y costes.

## 3. Plan operativo posterior a las aprobaciones

La aprobación de este ADR y de la región habilita únicamente la planificación
detallada. No constituye autorización automática para ninguna operación
externa: cada paso requerirá autorización operativa explícita, responsable,
preflight y verificación posterior. Solo entonces se podrá planificar, en orden,
lo siguiente:

1. habilitar las APIs estrictamente necesarias en `micafe-pos-staging`;
2. crear Firestore staging en la región aprobada;
3. configurar Firebase Authentication staging;
4. configurar los parámetros S2S conocidos;
5. cargar el secreto privado exclusivamente en Secret Manager;
6. desplegar Rules, índices y la Function selectiva necesaria;
7. crear operador, empresa y tenant Dusema exclusivamente sintéticos;
8. crear el binding por una ruta backend autorizada;
9. ejecutar el E2E controlado, auditarlo y conservar evidencia redactada.

Los parámetros S2S conocidos para staging son:

| Parámetro | Valor |
|---|---|
| `DUSEMA_ADMIN_BASE_URL` | `https://staging-api.dusema.com/` |
| `DUSEMA_S2S_ISSUER` | `micafe-pos-staging` |
| `DUSEMA_S2S_AUDIENCE` | `dusema-platform-admin-staging` |
| `DUSEMA_S2S_KID` | `micafe-pos-staging-rs256-20260907-01` |
| `DUSEMA_S2S_ENVIRONMENT` | `staging` |

La clave pública ya registrada en Dusema staging corresponde al fingerprint
DER SPKI `1edb1f59dd19625332ca3c6019be8d2e3323c3aa14c8cddbda2f3ff0b6693c5b`.

## 4. Functions, secreto y operación mínima

El primer despliegue deberá ser selectivo y limitado a
`consultarTenantDusemaSaas`; no se despliega el codebase completo. Sus
dependencias operativas v2 conocidas incluyen Cloud Functions, Cloud Run,
Cloud Build, Artifact Registry, Logging y el almacenamiento de artefactos de
despliegue, además de Firestore, Firebase Authentication y Secret Manager.

`DUSEMA_S2S_PRIVATE_KEY` existe únicamente en Secret Manager de
`micafe-pos-staging`. No se registra ni se solicita en Git, `.env`, código,
logs, terminal, evidencia o capturas. No se inventan otros secretos.

`OPERATIONAL_PIN_PEPPER`, `EMAIL_INVITATION_TOKEN_PEPPER` y
`WOMPI_EVENTS_SECRET` pertenecen a otras Functions y no deben provisionarse
en este gate si el despliegue permanece limitado a
`consultarTenantDusemaSaas`.

## 5. Binding y autoridad

El binding esperado es `staging:DUSEMA:{empresaPosId}`. Debe seguir siendo
backend-only: el cliente no puede leerlo ni escribirlo. F1 resuelve y valida
el binding, pero no provee una ruta canónica para crearlo.

Quedan prohibidas las escrituras directas o ad hoc mediante Admin SDK. Antes
de provisioning debe existir una ruta administrativa idempotente, auditada y
restringida a staging. Diseñar o implementar esa ruta es un gate posterior y
requiere una decisión explícita independiente.

## 6. Evidencia, auditoría y rollback

La evidencia de una Etapa B aprobada debe identificar proyecto, ambiente, SHA,
región aprobada, responsable, versiones desplegadas, IDs sintéticos mínimos,
resultado del E2E y auditoría `DUSEMA_TENANT_CONSULTADO`, sin secretos, JWT ni
documentos completos.

El rollback de parámetros, Function, Rules o binding deberá usar su mecanismo
canónico y quedar auditado. La ubicación de Firestore no tiene rollback: el
control preventivo es no crearla antes de la aprobación documental. Ante una
falla de identidad, aislamiento, secreto, región o auditoría, se detiene el
flujo sin ampliar el alcance.

## 7. Prohibiciones

Este ADR no autoriza producción, Dusema producción, datos, tenants, empresas u
usuarios reales, IAM global, billing, secretos productivos, despliegues
productivos ni cambios a F1–F4 sin una incompatibilidad demostrada. También
prohíbe crear Firestore antes de aprobar la región y crear el binding mediante
una escritura ad hoc.
