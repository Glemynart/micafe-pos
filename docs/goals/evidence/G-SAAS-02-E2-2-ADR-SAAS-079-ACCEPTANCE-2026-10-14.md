# G-SAAS-02 / M2 / E2.2 — Aceptación ADR-SAAS-079

**Fecha:** 2026-10-14
**Resultado:** ADR aceptado para implementación del guard; Gate I sigue `INCOMPLETE`.

## Decisión aceptada

El propietario aprobó ADR-SAAS-079 y la indisponibilidad temporal de emisión DIAN
para estas dos empresas, identificadas en la lectura read-only de Gate I del
2026-10-14:

| Empresa | `empresaId` | Estado observado |
|---|---|---|
| Cafe Atrato | `1ae0rD9H8t3ZFSBKrrHR` | `activa` |
| Prueba | `Prueba` | `trial` |

La indisponibilidad es exclusiva de esos IDs. No se extiende a empresas nuevas,
otros tenants presentes ni a todos los clientes de Factus.

## Alcance técnico autorizado

Implementar en el cliente un guard tenant-aware antes de las invocaciones a
Factus para emisión individual, por lote, nota débito y nota crédito; explicar
la pausa en la interfaz; conservar sin eliminar ni reimplementar la integración
actual de Factus. La futura reactivación queda condicionada a una migración
fiscal server-side verificada y a un cambio aprobado posterior.

El guard no cambia ventas, inventario, caja ni otros flujos no fiscales; no crea
excepciones para Rules. Debe verificarse aislamiento de tenant y ausencia de
efectos fiscales parciales para los dos IDs, además de que otro tenant no sea
bloqueado.

## Límites independientes

Esta aceptación y autorización de código/PR no autorizan:

- desplegar Firestore Rules, Functions o Vercel en producción;
- invocar Factus contra producción, alterar datos, IAM o Secrets;
- ejecutar smoke productivo autenticado sin identidad y alcance autorizados;
- iniciar el Trial de Diana ni asignarle fecha nueva.

Gate I no se declara `PASS`. Los checks, auditoría, preflight y demás atestaciones
de release permanecen pendientes según su propia evidencia.

## Implementación y verificación local (provisional, en PR #595)

La implementación agrega un guard reversible por igualdad exacta de `empresaId`
antes de las cuatro llamadas DIAN encontradas en Historial: factura individual,
lote, nota débito y nota crédito. Los IDs afectados salen antes de invocar
Factus y antes de leer datos adicionales o persistir `guardarMetadatosDian()`;
para una empresa no afectada, la acción continúa. Si no se resuelve el tenant,
la emisión falla cerrada. La integración Factus existente se conserva.

Validaciones locales en el worktree del PR, sobre emuladores/demo y sin
escrituras productivas:

| Validación | Resultado |
|---|---|
| RED TDD: ejecutar la prueba antes del guard | Falló por módulo de guard ausente, como se esperaba. |
| `npm exec -- tsx --test lib/__tests__/dian-temporary-gate.test.ts` | 10/10 pasaron: matriz de 2 empresas x 4 acciones DIAN, tenant ajeno y tenant no resuelto. El callback que representa Factus + metadata no corre para los dos IDs ni para tenant no resuelto. |
| Mutation audit manual: quitar `Prueba` de la allowlist | Mutante detectado por su prueba específica. |
| Mutation audit manual: convertir el guard en bloqueo para todo tenant | Mutante detectado por la prueba del tenant ajeno. |
| `npx tsc --noEmit` | Pasó. |
| `npm run lint` | Pasó. |
| `npm run build` | Pasó. |
| `npm run test:rules` | 45/45 pasaron en Firestore Emulator. |
| `npm run test:tenant` | 8 pasaron, 1 omitida por requerir fixture de autenticación Firebase real/mock. |
| `npm run test:auth-foundation` | 436 pasaron, 5 omitidas. |
| `npm run e2e:p0-06` | 1/1 pasó: ciclo de caja, venta, inventario, arqueo/replay y aislamiento. |
| `npm run e2e:p1-02` | 1/1 pasó: venta con receta, consumo de insumos e idempotencia multi-tenant. |
| `npm run e2e:bodega-u4-u5` | 12/12 pasaron en Emulator: flujos Bodega de vendedor/admin, solicitud de venta, aislamiento entre tenants, inventario y compatibilidad GENERAL LEGACY. |
| `git diff --check origin/main...HEAD` | Pasó. |

La regresión E2E es evidencia local para operaciones no fiscales; no equivale a
smoke autenticado productivo. Las pruebas unitarias verifican el contrato del
guard y la auditoría de fuente confirmó que las cuatro invocaciones actuales a
Factus están dentro de él. CI del PR aún debe completar; no se ha autorizado ni
realizado publicación de Vercel, Rules o Functions. El rollback de código es
revertir el commit del guard, pero no debe hacerse en producción hasta que la
indisponibilidad aceptada y el corte seguro de Rules sigan cubiertos; revertir
no reactiva de forma segura la persistencia fiscal legacy.
