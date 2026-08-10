# E4.1 — Remediación del bloqueo de build

- Fecha: 2026-08-10
- Rama local: `codex/e4-1-p0-01-runner-remediation`
- Commit base de la remediación del runner: `24088c1`
- Alcance: corrección mínima del contrato de módulos `app/**/route.ts` que bloqueaba el release gate.

## Resultado

`BUILD REMEDIADO — LISTO PARA REAUDITORÍA DE GATE 3`

## Problema reproducido

El build ejecutado sobre el padre de `24088c1` (`b62c75f`) compiló el código, pero falló durante el type-check generado por Next 16.3.0 porque seis módulos de ruta exportaban funciones auxiliares además de sus métodos HTTP:

- `app/api/public/eventos/route.ts` — `listarEventosPublicos`.
- `app/api/reservas/salas/route.ts` — `listarSalasPublicas`.
- `app/api/reservas/disponibilidad/route.ts` — `consultarDisponibilidad`.
- `app/api/reservas/hold/route.ts` — `crearHoldPublico`.
- `app/api/reservas/cancelar/route.ts` — `evaluarCancelacionPublica` y `cancelarHoldPendiente`.
- `app/api/webhooks/wompi/route.ts` — helpers de propiedad y `procesarWebhookWompi`.

El error fue el contrato `OmitWithTag` de Next: los exports no HTTP de un route module deben ser inexistentes.

El commit `24088c1` no modificó rutas, dependencias, `package.json`, `package-lock.json` ni `next.config.mjs`; la comparación contra `24088c1^` y la reproducción en un clon base confirman que el defecto era preexistente al runner.

El primer `npm run build` del clon temporal también mostró un error independiente de Turbopack por una `node_modules` junction fuera de la raíz del proyecto. Con dependencias reales instaladas dentro del clon, el mismo comando pasó.

## Causa raíz

Los helpers de pruebas y de reutilización estaban definidos como exports públicos de módulos que Next trata como route handlers. Next 16 valida que esos módulos solo expongan métodos HTTP y configuración permitida.

## Corrección aplicada

Se extrajeron los auxiliares a módulos hermanos `service.ts` y los routes quedaron limitados a sus métodos HTTP:

- `app/api/public/eventos/service.ts`.
- `app/api/reservas/salas/service.ts`.
- `app/api/reservas/disponibilidad/service.ts`.
- `app/api/reservas/hold/service.ts`.
- `app/api/reservas/cancelar/service.ts`.
- `app/api/webhooks/wompi/service.ts`.

Los tests afectados fueron actualizados para importar desde los servicios. Las consultas, respuestas HTTP, validaciones tenant-aware, transacciones, idempotencia, auditoría, autoridad server-side y efectos financieros permanecen sin cambios.

No se modificaron Firestore Rules, Storage Rules, Bootstrap, contratos de dominio, migraciones, Firebase remoto, producción ni la configuración del runner ya integrada en `24088c1`.

## Validación

| Validación | Resultado |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` con dependencias reales y Turbopack | PASS; 40 páginas generadas |
| `npx next build --webpack` | PASS |
| `npm run build:functions` | PASS |
| `npm run test:auth-foundation` | PASS; 271 tests, 268 PASS, 3 SKIP, 0 FAIL |
| `npm run test:rules` | PASS; denegaciones observadas corresponden a casos negativos |
| `npm run test:storage-rules` | PASS; 7/7 |
| `npm run test:eventos-publicos` | PASS; 3/3 |
| Tests de reservas y Wompi afectados | PASS; 22/22 |
| `npm run test:e2e:preflight` | PASS; 6/6 |
| `npm run e2e:b2-eventos` | PASS; código de salida 0 |
| `npm run e2e:p0-01` | PASS; 1 escenario |
| `npm run e2e:e4-01` | PASS; P0-01, P0-06, P1-02, P1-04 y P0-10 |

La evidencia E4.1 más reciente registra:

- `status: PASS`.
- `environment: Firebase Emulator Suite only`.
- `productionWrites: false`.
- `failedSteps: []`.

## Auditoría final

- Goal/Milestone/Epic: el cambio desbloquea la certificación E4.1/release gate y no adelanta funcionalidades.
- Arquitectura: no se introduce nueva autoridad, frontera de dominio, persistencia, migración ni estado.
- Seguridad: se preservan las validaciones tenant-aware, la autoridad server-side y las transacciones existentes.
- Compatibilidad: los métodos HTTP y sus respuestas permanecen en las mismas rutas; solo cambia la ubicación de auxiliares reutilizados.
- Rollback: reversible eliminando los `service.ts`, restaurando los imports de tests y reponiendo el contenido anterior de los routes.
- Alcance: limitado al build blocker y documentación de remediación.

Conclusión de auditoría: `APROBADO PARA MERGE` condicionado a la auditoría/revisión del Gate 3. Esta remediación no hace push, no abre PR, no fusiona y no actualiza el Goal.
