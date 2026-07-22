# ADR-SAAS-007 — Bootstrap empresarial atómico, idempotente y recuperable

## Estado

Aceptado. Forma parte del programa MT-U6→MT-U8 y extiende el flujo de creación de
empresa descrito en `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` sin alterar la identidad de
ADR-SAAS-002 ni el contrato de incorporación de ADR-SAAS-006.

## Contexto

Una empresa nueva necesita nacer con un conjunto coherente de recursos: empresa,
configuración, primer espacio, numeración inicial, owner, membresía administrativa y
suscripción de trial. Además, el owner debe recibir claims que le permitan entrar al
tenant.

Los documentos de dominio viven en Firestore, mientras que los custom claims se emiten
mediante Firebase Auth. No existe una transacción distribuida que abarque ambos
sistemas. Una creación secuencial desde el cliente podría dejar empresas sin admin,
sin configuración, sin suscripción o con claims emitidos sobre un tenant incompleto.

## Problema

El onboarding necesita una operación de creación que sea segura frente a reintentos,
timeouts, cierres del cliente y fallos posteriores al commit. La recuperación no puede
depender de borrar recursos fiscales o empresariales ya creados ni de que el usuario
repita manualmente todo el flujo.

También debe distinguirse entre una solicitud de empresa nueva y una `Empresa` ya
existente. Exponer un estado empresarial `nueva` o `provisionando` convertiría un
proceso técnico incompleto en un estado de negocio y obligaría al resto del sistema a
soportarlo.

## Decisión

### Precondición de identidad

El owner existe previamente como identidad SaaS global autenticada mediante email real.
El bootstrap recibe un `ownerUid` verificado; no crea ni reemplaza credenciales globales.

### Registro durable de provisionamiento

Cada solicitud crea o reutiliza un registro backend-only de provisionamiento
empresarial. El registro se identifica mediante una clave de idempotencia y conserva
una huella de la carga original, el `empresaId` reservado, el owner, el paso alcanzado,
los intentos y cualquier error recuperable.

Repetir la misma clave con la misma carga devuelve o continúa el mismo resultado.
Reutilizarla con una carga incompatible se rechaza.

`NUEVA` pertenece al proceso de provisionamiento; no es un valor de `Empresa.estado`.

### Commit atómico del núcleo

Una única transacción Firestore crea el núcleo empresarial y avanza el registro a
`CORE_COMMITTED`. El núcleo contiene:

1. `empresas/{empresaId}` en estado `trial`.
2. `configuraciones/{empresaId}` con su revisión inicial.
3. El primer espacio de la empresa.
4. Una numeración inicial, que puede quedar en `BORRADOR` si faltan datos fiscales.
5. `membresias/{empresaId}_{ownerUid}` activa con rol administrativo.
6. `suscripciones/{empresaId}` en estado `trialing` y con fechas calculadas por servidor.

La transacción no publica un tenant parcial: o todos estos recursos existen de forma
coherente o ninguno se crea.

### Claims como paso recuperable

Después del commit, el backend emite o actualiza los claims tenant del owner. Al
confirmarlos, el registro pasa a `CLAIMS_ISSUED` y luego a `COMPLETED`.

Si Firebase Auth falla después del commit:

- el núcleo no se elimina;
- no se crea una segunda empresa;
- el registro conserva el paso confirmado;
- un reintento reanuda la emisión de claims;
- un reconciliador puede completar el proceso sin intervención del cliente.

Los estados terminales de error se reservan para solicitudes inválidas o incompatibles;
los fallos de infraestructura permanecen reintentables.

### Bootstrap completo y readiness

`COMPLETED` significa que el tenant existe y el owner puede acceder. No implica por sí
solo que la empresa pueda emitir ventas fiscales. Esa capacidad exige configuración
obligatoria y una asignación de numeración vigente conforme a ADR-SAAS-008.

### Frontera con MT-U5B

La membresía del owner forma parte del núcleo y no se modela como incorporación. Una
vez creada la empresa, el onboarding puede invocar `DIRECTA` o `EMAIL` para empleados,
pero ADR-SAAS-006 conserva la autoridad sobre esos ciclos.

## Consecuencias

- No existe el estado observable “empresa sin admin”.
- Los reintentos no duplican empresas, trials, espacios ni membresías.
- Un fallo de Auth posterior al commit deja un núcleo consistente y recuperable.
- Se requiere conservar y reconciliar registros de provisionamiento.
- El backend, no el cliente, se convierte en la frontera exclusiva de creación de
  tenants.
- La finalización de onboarding y la habilitación fiscal se mantienen separadas.
- El commit debe mantenerse pequeño y determinista; la carga de datos opcionales o de
  empleados ocurre después.

## Alternativas consideradas

- **Crear cada recurso secuencialmente desde el cliente.** Rechazada: deja estados
  parciales, permite reintentos duplicados y confía al cliente autoridad privilegiada.
- **Añadir `nueva` o `provisionando` a `Empresa.estado`.** Rechazada: mezcla progreso
  técnico con lifecycle de acceso y obliga a todos los consumidores a soportar tenants
  incompletos.
- **Intentar una operación monolítica Firestore + Firebase Auth.** Rechazada: no existe
  una transacción distribuida entre ambos sistemas.
- **Compensar fallos eliminando la empresa.** Rechazada: la compensación destructiva es
  insegura una vez creados datos fiscales, membresías o referencias auditables.
- **Emitir claims antes del commit.** Rechazada: podría autenticar al owner contra un
  tenant inexistente o incompleto.

## Relación con otros ADR

- **ADR-SAAS-001** define el aislamiento que debe cumplir el núcleo creado.
- **ADR-SAAS-002** define la identidad SaaS preexistente del owner y la emisión de
  claims.
- **ADR-SAAS-003** define el trial y la separación empresa/suscripción.
- **ADR-SAAS-004** define Empresa, Configuración, Espacio y Numeración.
- **ADR-SAAS-006** conserva el ciclo de incorporación de empleados.
- **ADR-SAAS-008** define cuándo la numeración inicial habilita emisión fiscal.
- **ADR-SAAS-009** define el enforcement del estado `trial` creado por el bootstrap.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§4, §7.3 y §13).

