# G-SAAS-02 / M2 / E2.2 — Gate C preflight compras Bodega (2026-10-11)

## Dictamen

`PREFLIGHT = PASS` para el despliegue futuro y aislado de
`saas-bodega-operations` en `micafe-pos-staging`, limitado al candidato de
compra Bodega integrado por PR #539. Este dictamen no autoriza ni ejecuta Gate
D. No se desplegaron Functions, Rules, cliente, ni otros recursos; no hubo
escrituras de datos.

## Identidad del candidato y alcance

- La implementación `registrarCompraBodegaV1` quedó integrada por PR #539 en
  `main @ 504342634e25a6929f12fc2ab1669f350e54b644`. Sus checks del PR
  terminaron `PASS` en run `38124550538`; la CI post-merge de `main`, run
  `38125879717`, terminó `success`.
- El checkpoint documental #542 se integró después en
  `main @ 005a2393c9f7b4fbcdccfd301b343fb8d125fa43`. Entre el SHA del código
  de #539 y ese `main`, la única ruta modificada fue
  `docs/goals/GOAL-MVP-COMERCIAL.md`; no cambió el artefacto de Functions.
- Proyecto consultado: `micafe-pos-staging`, región `us-central1`.
- Único codebase seleccionado para el despliegue futuro:
  `saas-bodega-operations`. `saas-auth`, Rules, Storage, `saas-bodega` y los
  demás codebases quedan fuera de este delta.
- Firebase CLI `prepareFunctionsUpload` se usó localmente para construir y
  medir los paquetes; no se ejecutó `firebase deploy` ni `firebase deploy
  --dry-run`.

## Artefactos locales reproducibles

Los artefactos se generaron desde el código de `main` correspondiente al PR
#539. La lista y el contenido incluidos por Firebase CLI se mantuvieron
deterministas al inspeccionar el candidato.

| Codebase | ZIP | Firebase `sourceHash` | SHA-256 del ZIP |
|---|---:|---|---|
| `saas-bodega` (no seleccionado) | 150.821 bytes | `dcf842ff4bc9a47585eec0cdf4f4d8d4b4d1038a` | `567d4d49b74db2734be45661a22a7551883fff1066d0a475ac4242696138c7fc` |
| `saas-bodega-operations` (seleccionado) | 134.491 bytes | `81db62915887743ab1e64ae19ffb420ad737ef9d` | `bd42e9cf3a9311c2d33716da08377c9693ec4756ba09bef21b9413e582e8743f` |

El descubrimiento de los paquetes locales pasó: 17 endpoints Bodega y 7
callables operativas, incluida `registrarCompraBodegaV1`; los codebases no
declaran Secrets. `firebase.json` mantiene los codebases Bodega aislados de
`saas-auth`.

## Validaciones locales

- Build y discovery de `functions-bodega`: `PASS`.
- Build y discovery de `functions-bodega-operations`: `PASS`.
- Pruebas del paquete `functions-bodega`: `PASS`, 14/14, más module-load.
- Pruebas del paquete `functions-bodega-operations`: `PASS`, 6/6, más
  module-load.
- Suite de núcleo de compra y enrutamiento de cliente
  (`functions/src/finanzas/compras.test.ts` y
  `lib/bodega/compra-routing.test.ts`): `PASS`, 17/17.
- Auditoría de dependencias con umbral `high` para ambos codebases: exit 0,
  sin vulnerabilidades `high`/`critical`; permanece el aviso `moderate`
  transitivo de `uuid` a través de `gaxios`, sin cambios de dependencias.

## Inventario remoto y delta exacto

La lectura de Functions Gen 2 observó 43 Functions en el proyecto. Las 17
exportaciones del codebase `saas-bodega` están presentes. En
`saas-bodega-operations` están presentes las seis funciones actuales; la nueva
`registrarCompraBodegaV1` aún no existe. Tampoco aparece
`registrarCompraOperativaV1` en el inventario del proyecto.

El `sourceHash` operativo local difiere del código fuente desplegado. El delta
esperado para el siguiente deploy dirigido de `functions:saas-bodega-operations`
es exactamente seis actualizaciones y una creación, con cero eliminaciones y
cero cambios a cualquier otro codebase. Cualquier diferencia en el inventario
o delta exige repetir el preflight antes del deploy.

Las seis funciones operativas existentes están `ACTIVE`, Runtime `nodejs22`,
región `us-central1`, sin Secrets y con 100 % del tráfico en la revisión
capturada:

| Servicio | Revisión lista / 100 % tráfico |
|---|---|
| `abrirturnooperativov1` | `abrirturnooperativov1-00001-noy` |
| `actualizararticuloinventariov1` | `actualizararticuloinventariov1-00002-yoc` |
| `cerrarturnooperativov1` | `cerrarturnooperativov1-00001-bef` |
| `consultarcatalogopresentacionesvendedorv1` | `consultarcatalogopresentacionesvendedorv1-00002-kiy` |
| `consultarclientesvendedorv1` | `consultarclientesvendedorv1-00001-peg` |
| `consultarmisventasvendedorv1` | `consultarmisventasvendedorv1-00001-buk` |

La lectura de política de servicio confirmó el patrón existente
`roles/run.invoker` → `allUsers` de la callable actual. No se identificó un
binding IAM de proyecto nuevo necesario para el delta. No se seleccionó ni
modificó política IAM; la creación futura de la callable debe mantener el
contrato de autenticación Firebase del código y detenerse si el despliegue
solicita IAM adicional o distinto.

## Rules, compatibilidad y ADR-SAAS-072

No se modificaron ni empaquetaron Rules. Las Rules actuales todavía permiten
create/delete administrativo directo de `/compras`; eso no incorpora por sí
mismo inventario, ledger, idempotencia ni señal. ADR-SAAS-072 Opción 2 aceptada
ordena implementar ese corte Bodega en una PR independiente y solo después de
verificar un cliente compatible y la ausencia de una callable legacy invocable
para Bodega. El preflight actual observa que
`registrarCompraOperativaV1` no está desplegada en staging; esta lectura es
temporal y debe repetirse por proyecto antes del corte de Rules.

No se habilitaron APIs, no se cambiaron IAM/Secrets, Rules, Auth, Firestore,
tráfico, fixture, tenant real ni producción. Gate C se limita al deploy futuro
de Functions y no certifica el corte de Rules de ADR-SAAS-072.

## Rollback preparado

Si falla la verificación del deploy futuro, revertir cada función actualizada a
la revisión capturada en la tabla anterior. Si se creó
`registrarCompraBodegaV1` y la verificación falla, retirar únicamente ese
servicio nuevo. Antes de una ejecución real se volverán a capturar inventario,
tráfico y revisiones; no se asumirá vigente una revisión de esta lectura.
Rollback no restaura escrituras cliente ni cambia `saas-auth`.

## Estado de gates y autorización

- Gate C: `PASS` para el candidato y alcance Functions descritos arriba.
- Gate D: `NOT EXECUTED`. ADR-SAAS-071 autoriza preparar el PR, no el deploy;
  se requiere autorización operativa específica antes de cualquier escritura
  de recursos en staging.
- El corte de Rules de ADR-SAAS-072 exige un PR, pruebas Rules Emulator y un
  preflight específico por proyecto posterior a la compatibilidad del cliente.
- Tenant real y producción: sin cambios. Gate I sigue bloqueado por sus
  precondiciones comerciales, legales, de entorno y autorización propias.
