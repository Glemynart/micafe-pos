# ADR-SAAS-041 — Aislamiento de codebase para deploy de binding Dusema staging

## Estado

**Propuesto**

## Complementa

ADR-SAAS-040 — Binding canónico POS → Dusema exclusivo de staging.

## Ámbito

Topología de despliegue Firebase Functions. No modifica la autoridad, contrato
ni persistencia definidos por ADR-SAAS-040.

## Contexto

El codebase único `saas-auth` descubre toda su superficie de Functions antes de
aplicar `--only`. Su manifiesto incluye parámetros y secretos de
funcionalidades ajenas, entre ellos `EMAIL_INVITATION_TOKEN_PEPPER`.

Por ello, el comando actual:

```powershell
firebase deploy --project staging --only functions:saas-auth:crearBindingDusemaStagingSaas
```

exige secretos que no pertenecen a ADR-SAAS-040, aunque la callable objetivo no
los use. Esto impide un deploy selectivo sin aprovisionar secretos ajenos.

## Decisión

Crear un segundo codebase Firebase llamado `saas-dusema-binding`, dentro del
mismo repositorio y proyecto Firebase. No es un microservicio: es una frontera
de discovery y despliegue para una única autoridad administrativa de plataforma.

El codebase tendrá:

- Un `source` independiente en `firebase.json`.
- Un entrypoint dedicado que exportará exclusivamente
  `crearBindingDusemaStagingSaas`.
- Un grafo de imports cerrado y libre de `defineSecret(...)`, parámetros y
  módulos pertenecientes a otras Functions.
- La misma callable, contrato, nombre y semántica definidos por ADR-SAAS-040.
- La delegación al comando `CrearBindingDusemaStaging`, sin reimplementar lógica
  de negocio.

Permanecen invariantes:

- `DUSEMA_BINDING_GOBERNAR` exclusiva.
- Autorización revalidada dentro de la transacción.
- Receipts por `commandId` e `idempotencyKey`.
- Idempotencia y conflictos.
- Binding determinista y reserva inversa transaccional.
- Auditoría durable atómica.
- Rules deny-by-default.
- Guardia fail-closed para `micafe-pos-staging`.
- Sin secretos nuevos, cambios S2S, cambios en Dusema ni producción.

## Diseño del codebase

El futuro `firebase.json` declarará dos codebases independientes:

| Codebase | Responsabilidad |
|---|---|
| `saas-auth` | Superficie existente de autenticación y plataforma, incluidos sus secretos actuales. |
| `saas-dusema-binding` | Únicamente `crearBindingDusemaStagingSaas`. |

El deploy selectivo esperado será:

```powershell
firebase deploy --project staging --only functions:saas-dusema-binding:crearBindingDusemaStagingSaas
```

Ese comando se ejecutará solamente en un gate posterior autorizado. No debe
desplegar `saas-auth` ni otras Functions.

## Estrategia de código compartido

**Decisión: alternativa B — extraer solamente el cierre de módulos secret-free
necesario.**

Se creará una unidad privada, estrecha y específica del binding Dusema.
Contendrá el adaptador de callable y el cierre mínimo de dependencias requerido
para invocar el comando existente: autorización, contratos, binding, auditoría
y validación que sean estrictamente necesarios y no declaren secretos ni
parámetros.

Reglas de esa unidad:

- No importar `functions/src/platform/callables.ts`, porque su carga declara
  parámetros Dusema S2S y otros elementos ajenos.
- No importar el entrypoint de `saas-auth`.
- No usar imports entre directorios fuente independientes que dependan de rutas
  compiladas frágiles.
- No convertir esta extracción en una librería genérica de plataforma.
- El comando conserva una única implementación; el nuevo codebase solo la
  invoca.

Alternativas evaluadas:

| Alternativa | Resultado |
|---|---|
| A. Importar directamente módulos actuales desde el nuevo source | Rechazada: `platform/callables.ts` arrastra parámetros y secretos; los imports entre sources serían frágiles durante build y empaquetado. |
| B. Extraer cierre secret-free mínimo | Aprobada: evita secretos ajenos, preserva una sola implementación del comando y limita el cambio. |
| C. Duplicar callable o comando | Rechazada: introduce drift de autorización, receipts, auditoría e invariantes de ADR-SAAS-040. |
| D. Manipular manifiestos, variables CLI o filtros adicionales | Rechazada: no cambia que Firebase resuelve los parámetros globales antes de filtrar endpoints; sería no soportado y frágil. |

## Discovery y validación requerida

La implementación deberá demostrar localmente que:

- El discovery de `saas-dusema-binding` termina correctamente.
- El manifiesto contiene `crearBindingDusemaStagingSaas`.
- `EMAIL_INVITATION_TOKEN_PEPPER` está ausente.
- Todo secreto o parámetro ajeno a ADR-SAAS-040 está ausente.
- La callable no declara `secretEnvironmentVariables`.
- El discovery no realiza llamadas de red, Firestore, Dusema, Secret Manager ni
  carga payloads de secretos.
- El import del entrypoint no ejecuta inicialización externa.

CI deberá conservar las validaciones actuales de `functions` y añadir, para el
nuevo codebase:

- Instalación reproducible.
- Build y typecheck independientes.
- Test de discovery/manifiesto.
- Comprobación explícita de ausencia de parámetros y secretos ajenos.
- Tests focalizados existentes de ADR-SAAS-040.

No se autoriza despliegue automático desde CI por esta decisión.

## Migración del endpoint

La migración de código deberá garantizar que el endpoint se declare en un solo
codebase:

1. Retirar la exportación de `crearBindingDusemaStagingSaas` del entrypoint
   `saas-auth`.
2. Declararla solamente desde el entrypoint de `saas-dusema-binding`.
3. Verificar localmente ambos manifiestos antes de cualquier deploy.
4. Consultar metadata remota de la Function antes del deploy.

No debe existir una fase en la que ambos codebases declaren una Function con el
mismo nombre.

En staging actual no existe la Function remota. Si en otro entorno aparece una
Function previa bajo `saas-auth`, se detendrá la migración y se requerirá un
subgate explícito: no se elimina ni reemplaza automáticamente una Function
existente.

## Rollback

**Antes del deploy:** revertir el cambio de código/configuración en la rama o
PR; no hay efecto remoto.

**Después del deploy, antes de invocar la callable:** un rollback requiere un
gate operativo explícito y se limita a la topología de Function. No modifica
bindings, Firestore, Dusema, Secret Manager ni producción.

Si hubiera una Function previa en el codebase antiguo, su tratamiento requiere
una decisión operativa separada; este ADR prohíbe una eliminación automática.

## Riesgos y controles

- **Imports residuales con secretos:** controlados con test de manifiesto y
  cierre secret-free.
- **Drift entre codebases:** controlado evitando duplicación del comando.
- **Regresión de build:** builds independientes en CI.
- **Colisión de nombre durante migración:** controlada declarando el endpoint en
  un solo codebase y verificando metadata remota.
- **IAM gestionado por Firebase al crear una callable Gen 2:** el aislamiento no
  modifica IAM por sí mismo, pero un deploy inicial puede requerir un binding
  gestionado de invocación. Debe verificarse y autorizarse explícitamente en el
  gate de deploy; no queda autorizado por este ADR.
- **Alcance accidental a producción:** el comando futuro queda restringido al
  alias `staging` y a `micafe-pos-staging`.

## Archivos previstos para una implementación posterior

- `firebase.json`
- `functions/src/index.ts`
- `functions/src/platform/callables.ts`
- Nuevo adaptador secret-free de la callable.
- Nueva unidad privada con el cierre secret-free del binding.
- Nuevo directorio fuente del codebase `saas-dusema-binding`, con su
  `package.json`, lockfile, configuración TypeScript y entrypoint.
- Scripts o workflow CI existentes que validen builds y discovery de Functions.

ADR-SAAS-040, `consultarTenantDusemaSaas`, contratos S2S, Rules, Dusema y
producción quedan fuera de alcance.

## Gates previos al deploy

1. Aprobar este ADR.
2. Implementar y revisar el aislamiento en un PR independiente.
3. Validar build, tests ADR-040 y discovery secreto-libre.
4. Verificar que ambos manifiestos no declaren el mismo endpoint.
5. Preflight remoto metadata-only del proyecto staging y de la Function.
6. Autorizar explícitamente el posible efecto IAM gestionado por Firebase para
   la callable.
7. Autorizar el deploy selectivo de staging.
