# ADR-SAAS-101 — Supresión verificable y conservación legal

## Estado

**Propuesto**, 2026-11-23. `G-SAAS-02 → M2 → E2.2`.
La orden de resolver las deficiencias autoriza investigación, propuesta y
herramientas de preflight. No se atribuye aprobación a estas nuevas reglas de
destrucción ni se supersede implícitamente la inmutabilidad de ledger/contratos.

## Problema

Desactivar y marcar `eliminada` no borra el tenant. Una purga recursiva indiscriminada
puede destruir pruebas comerciales, registros de otros tenants e identidades
compartidas. Las invariantes actuales de ledger exigen conservación y correcciones
por contramovimiento, no borrado operativo. Hace falta una autoridad explícita
para la destrucción al terminar plazos legales, separada de las operaciones POS.

## Alternativas

A. **Conservación clasificada y supresión dirigida**, recomendada. Retirar acceso
al terminar según contrato; conservar de forma restringida solo lo justificado;
suprimir datos descartables y, cuando venza su deber legal, el archivo afectado
mediante un procedimiento específico con autorización y evidencia.

B. Purga total al vencer 60 días. Rechazada: trata todos los datos igual y puede
incumplir deberes de conservación o afectar referencias/usuarios compartidos.

C. Conservar todo indefinidamente. Rechazada: contradice finalidad y temporalidad.

## Diseño propuesto

- Preflight no mutante con proyecto, tenant, terminación efectiva, entrega de
  datos, fundamento/plazo por categoría, referencias y holds legales verificados.
- Fechas propuestas de salida/supresión se aprueban comercialmente por separado;
  no se convierten en ley ni en reglas desplegadas por aparecer en el plan.
- Ledger, snapshots contractuales, recibos y hechos comerciales no son descartables
  por defecto. Clasificar su obligación y archivo; no modificar cantidades,
  saldos, Trial o hechos históricos para conseguir una supresión aparente.
- Contactos redundantes y datos sin finalidad pueden suprimirse o anonimizarse
  según esquema autorizado, sin reidentificación trivial. No modificar snapshots
  de comercio si existe deber legal vigente sin la revisión correspondiente.
- Al concluir conservación, destrucción de ese archivo únicamente mediante nuevo
  corte autorizado que resuelva expresamente la excepción a la inmutabilidad de
  conservación. Este ADR propuesto todavía no concede esa excepción.
- Identidad Auth solo si es exclusiva, no existen otras membresías/dependencias
  y la autorización la incluye. Nunca `deleteUser` por un UID de payload aislado.
- Objetos Storage: ruta y generación exactas; registrar soft delete de siete días
  y su vencimiento, sin prometer eliminación física inmediata del proveedor.
- Firestore: selector acotado y precondición de versión; sin recursiveDelete en
  colección global ni batches que mezclen tenants. Cambios concurrentes abortan
  el lote. Revalidar operador con `CONSERVACION_GOBERNAR` antes de cada etapa.
- Evidencia mínima fuera del área a suprimir: actor, autorización, fundamento,
  conteos, referencias opacas y resultado. No duplicar payloads personales en
  logs/recibos como supuesto comprobante de eliminación.
- Registrar restricciones/supresiones para que un restore no reabra tratamientos
  terminados. La ubicación, acceso y retención de ese registro requieren aprobación
  del diseño antes de crear persistencia productiva.

## Comprobación y recuperación

Ensayo sintético de dos tenants, identidad compartida, hold y ledger inmutable;
manifestar objetos/versiones, ejecutar únicamente en Emulator tras aprobación y
verificar ausencia dirigida y conservación del tenant vecino. Recuperación nunca
es restaurar una base global sobre producción; reanudación idempotente y revisión
por categoría, con restauración solo si es legal y está expresamente autorizada.

El primer corte de código incorpora **solo un planificador puro** que devuelve
`PREVIEW_ONLY`, `executable=false`, bloqueos y referencias opacas. No implementa
un ejecutor de borrado ni permite convertir el resultado en aprobación remota.
El borrado remoto sigue bloqueado aunque el preflight no encuentre obstáculos.

Referencias: ADR-SAAS-028/029/031/093/094/096/097, ADR-SAAS-100 y
[conservación propuesta](docs/legal/OPERACION-Y-CONSERVACION.md).
