# ADR-SAAS-038 — Recuperación controlada de P2-05: integración administrativa POS → Dusema

## Estado

**Aceptado.**

La aprobación de este ADR autoriza exclusivamente recuperar de forma controlada
el código histórico de las Fases 1–4 de P2-05 sobre el `main` vigente. No
autoriza despliegues, configuración externa, secretos, claves RS256, bindings
reales, provisioning, pruebas end-to-end, configuración Dusema, tenant de
prueba, usuarios, sincronización, billing, SSO ni IAM global.

## Goal, planificación y límite

- **Goal:** `G-SAAS-02`.
- **Iniciativa:** `P2-05` — integración administrativa POS → Dusema.
- **Autorización propuesta:** recuperación técnica paralela y acotada; no
  modifica el resultado comercial, Milestone, Epic ni criterios de aceptación
  vigentes del Goal.
- **Baseline de recuperación:** `origin/main @ 4add01aa0151cba3145de577212c269eea4a0fe1`.

## 1. Contexto

Las Fases 1–4 de P2-05 existen en commits históricos, pero no son ancestros del
`main` vigente. Por tanto, su existencia histórica no equivale a código
integrado ni autoriza recuperar su genealogía.

Fuentes de contenido históricas:

- F1: `8e5437ef010c540af11a5fa5ce7f08d1364ad90c`;
- F2: `442ae329b1c5116b72d8427080e4b495e5ca6993`;
- F3: `b7251cbf005e80c3798dd8e48ec08a5a1c2e28de`;
- F4: `b1813539864a01353cadbfc839b7906711dacb82`.

STG-02 ya está integrado en el `main` vigente y debe preservarse.

## 2. Decisión propuesta

Recuperar F1–F4 sobre el `main` vigente usando los commits históricos únicamente
como **fuente de contenido**, no como una genealogía que deba reincorporarse.

La recuperación se realizará en una rama nueva basada en el `main` vigente,
fase por fase y con validación antes de pasar a la siguiente:

1. F1: facultad y binding backend-only.
2. F2: cliente S2S y emisión JWT RS256.
3. F3: Callable, autorización y auditoría.
4. F4: integración read-only del Backoffice.

No se hará merge de la rama histórica, rebase de su genealogía ni incorporación
ciega de sus cambios. Los archivos que hayan evolucionado en `main` se
integrarán mediante aplicación controlada de los hunks P2-05, conservando los
contratos y cambios vigentes ajenos a P2-05.

## 3. Alcance autorizado tras la aceptación

- Recuperar la facultad `DUSEMA_TENANT_CONSULTAR`, el binding backend-only y
  sus Rules y pruebas.
- Recuperar el cliente S2S, la emisión JWT RS256 y sus pruebas, sin configurar
  valores reales.
- Recuperar la Callable read-only, su autorización, auditoría, contrato y
  pruebas.
- Recuperar el cliente frontend y la tarjeta read-only de Empresa, con sus
  pruebas.
- Preservar STG-02 y validar cada fase de forma independiente antes de avanzar.

## 4. Fuera de alcance

- Provisioning de Firebase, despliegues o configuración de infraestructura.
- Secrets, claves RS256, parámetros runtime o configuración Dusema.
- Creación, edición o revocación de bindings reales.
- Tenant Dusema de prueba, pruebas E2E o smoke contra entornos externos.
- Creación o administración de tenants, usuarios, invitaciones, roles,
  sincronización, impersonación, suscripciones, billing, SSO o IAM global.
- Cualquier cambio a Dusema, B3, STG-02 o al alcance comercial del Goal.

## 5. Validación y rollback

Cada fase recuperada debe pasar sus pruebas focalizadas, typecheck, build,
lint y `git diff --check` antes de continuar. La recuperación no despliega
artefactos ni escribe datos externos; su rollback consiste en revertir el PR
de recuperación antes de cualquier configuración o despliegue posterior.

## 6. Consecuencias

Esta decisión elimina la ambigüedad entre código histórico y código integrado:
P2-05 solo se considerará recuperado cuando un PR nuevo, basado en el `main`
vigente, sea validado e integrado. La aceptación de este ADR no habilita ningún
paso operativo posterior.
