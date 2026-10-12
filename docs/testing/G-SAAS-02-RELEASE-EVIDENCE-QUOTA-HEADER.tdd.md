# TDD — proyecto de cuota en la lectura de Firebase Rules

## Resultado

El colector de release ahora envía `x-goog-user-project` en las consultas
read-only a Firebase Rules. Esto evita el `403` por falta del proyecto de cuota
y permite que el preflight detecte divergencias reales.

## Recorrido y RED/GREEN

Recorrido derivado del fallo observado: al recolectar evidencia de producción,
el proceso autenticado debe poder listar releases y rulesets de Rules bajo el
proyecto explícito; la lectura no debe modificar recursos.

| Garantía | Archivo/comando | Tipo | Resultado |
|---|---|---|---|
| Los encabezados conservan Auth y fijan el proyecto de cuota esperado. | `scripts/g-saas-02/rules-api-headers.test.ts` | Unitario | RED: helper ausente. GREEN: 1/1 pasa. |
| La evaluación previa continúa distinguiendo evidencia incompleta, referencias no verificadas y drift de Rules/Storage. | `npm run test:g-saas-02:release-evidence` | Unitario | 9/9 pasa. |
| La llamada remota puede leer Rules y reporta el estado del release sin mutarlo. | `scripts/g-saas-02/release-evidence.ts`, proyecto `micafe-pos`, SHA `ecd2bcc48ee4888b7493b810a8f54b6a5e8127ad` | Integración read-only | `INCOMPLETE`; Rules=`MISMATCH`, Storage=`PASS`, sin error de colección. |

## Evidencia de integración

La consulta registrada el `2026-10-12T08:32:15Z` obtuvo Rules local
`69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb` y Rules
desplegadas `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`.
El resultado `MISMATCH` es el bloqueo real de Gate I; no se intentó corregirlo
ni desplegar Rules. Storage coincidió. El colector observó 80/80 Functions
activas en Node.js 22 y 35 backups en `southamerica-east1`; PITR está
deshabilitado. Smoke y atestación independiente de recovery para el release
objetivo siguen faltantes en esta colección.

La credencial de consulta se obtuvo en memoria con `gcloud`; no se imprimió ni
guardó. El colector escribió su JSON temporal fuera del repositorio. No hubo
escrituras en Firebase, cambios de IAM/Secrets, ni despliegues.

## Validación

- `npm run test:g-saas-02:release-evidence`: 9/9.
- `npm run test:g-saas-02:preflight`: 8/8.
- `npm run test:g-saas-02:recovery`: 14/14.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- CI del PR: pendiente al redactar este reporte.
- La integración read-only confirma que la API responde; el smoke autenticado y
  la alineación productiva requieren gates y autorización separados.
