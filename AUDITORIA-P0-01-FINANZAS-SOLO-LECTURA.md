# Auditoría P0-01 — Finanzas sin escrituras desde el cliente

## Trazabilidad

- Goal: `G-MVP-01 — MVP comercial de Café Atrato`
- Milestone: `M1 — Tenant y fiscalidad listos para operar`
- Epic: `E1.1 — Tenant operativo`
- PR: `P0-01 — eliminar la escritura financiera legacy desde el cliente`
- Rama: `codex/e1-1-p0-01-finanzas-no-client-writes`

## Alcance auditado

- `inicializarCuentasBancarias` conserva únicamente una lectura tenant-aware.
- Se eliminó el seed de cuentas y la escritura `setDoc` desde el cliente.
- Bootstrap/backend conserva la responsabilidad de provisión.
- No se modificaron Firestore Rules.
- No se introdujeron autoridades, estados de dominio ni creación automática de
  cuentas desde el cliente.
- El smoke P0-01 abre Finanzas en `/pos` y `/admin/finanzas`, y verifica que un
  tenant emulado sin cuentas permanezca sin cuentas.
- La fixture añade únicamente datos fiscales y numeración sintéticos para
  superar `OnboardingGate` en el entorno local y limpiar esos datos al finalizar.

## Arquitectura, seguridad y compatibilidad

- ADR aplicable: `ADR-SAAS-015`, que mantiene las operaciones críticas bajo
  autoridad server-side. Este PR no cambia su decisión.
- `ADR-SAAS-014` permanece sin cambios; no se ejecuta Trial ni ninguna escritura
  productiva.
- Las Rules de `cuentas_bancarias` permanecen intactas y siguen negando
  `create`, `update` y `delete` desde cliente.
- Las operaciones financieras existentes continúan invocando las callables
  server-side; no se alteran idempotencia, auditoría ni transacciones.
- Rollback: revertir el commit restaura el comportamiento anterior sin
  migración de datos; la corrección no requiere migración ni cambio de esquema.

## Evidencia de validación

- `npm run e2e:p0-01`: PASS, `runId=p0-01-1785777885827`, entorno
  `demo-p0-01-e2e`. Resultado: `exitCode=0`, cero errores de consola/página,
  cero respuestas 404/401/403 y cero cuentas creadas para el tenant fixture.
- `npx tsc --noEmit --pretty false`: PASS.
- `npm run build`: PASS.
- `npm run build:functions`: PASS.
- `npm run test:auth-foundation`: PASS, 225 pruebas OK y 1 skip explícito por
  requerir Auth real.
- `npm run test:rules`: PASS. Los `PERMISSION_DENIED` emitidos son los casos
  negativos esperados de la suite; no se cambió el archivo de Rules.
- `npm run test:tickets`: PASS, 51 OK y 1 skip aprobado por alcance existente.
- `npm run test:reimpresion`: PASS, 18 OK.
- `npm run test:tenant`: PASS, 8 OK y 1 skip de infraestructura existente.
- `npm run test:backfill`: PASS, 19 OK.
- `npm run test:email:integration`: PASS.
- `npm run test:onboarding`, `npm run test:p0-01:verifier`,
  `npm run test:p0-01:plan` y `npm run test:configuracion`: PASS.
- `npm run lint`: no ejecutable en este checkout porque el binario `eslint` no
  está instalado; el workflow CI oficial tampoco contiene un check de lint.

## Resultado

APROBADO PARA MERGE
