# TDD — remediación de advisories altos/críticos del runtime web

## Alcance

- Goal/Milestone/Epic: `G-SAAS-02 / M2 / E2.2`, preparación de Gate I.
- Base verificada: `main @ b25579150b855521bcad7f0283c85cc704c1ca29`.
- Plan externo: ninguno; el criterio de aceptación deriva del Gate I y del
  bloqueo de release confirmado por el audit read-only.
- Fuera de alcance: deploy, Rules, Functions remotas, IAM, Secrets, datos,
  tenant, configuración del cliente y producción.

## Garantía y ciclo RED/GREEN

| Garantía | Comando | Tipo | RED observado | GREEN requerido |
|---|---|---|---|---|
| El árbol de dependencias de runtime web no contiene advisories `high` o `critical`. | `npm audit --omit=dev --audit-level=high` | Seguridad de dependencias / release gate | RED en `b255791`: exit 1, 18 advisories totales (9 high, 1 critical); `next@16.3.0` es directo y está en rango crítico `16.0.0–16.3.7`. | GREEN el 2026-10-12: exit 0, cero vulnerabilidades en dependencias de producción. |

## Amenaza y mitigación

El boundary expuesto es la aplicación Next.js de producción y sus dependencias
de servidor. El baseline tenía ejecución remota crítica en Next.js y fallos
altos de disponibilidad/seguridad en transitivas. La mitigación actualiza Next
a `16.4.0`, las dependencias compatibles del lockfile y `@grpc/grpc-js` a
`1.14.6` por override para corregir la copia fijada por Firestore. No se usó
`npm audit fix --force` ni hubo cambios remotos.

## Evidencia de validación

- Baseline RED ejecutada contra `main @ b255791` el 2026-10-12; salida resumida
  en esta tabla.
- Validaciones GREEN: `npm ci`; `npm audit --omit=dev --audit-level=high`
  (cero vulnerabilidades); `npx tsc --noEmit`; `npm run build` con Next
  `16.4.0`; `npm run lint`; `test:firebase-push-service-worker` (9/9),
  `test:tenant` (8 aprobadas, 1 omitida por infraestructura declarada),
  `test:g-saas-02:preflight` (8/8),
  `test:g-saas-02:release-evidence` (8/8) y `test:g-saas-02:recovery` (14/14).
- Next regeneró `next-env.d.ts` con la referencia de tipos de `root-params`;
  se incluye el artefacto generado para alinear el árbol de tipos con 16.4.0.
- El audit completo incluye 11 advisories restantes (7 high, 4 moderate) en
  transitivas exclusivas de `firebase-tools`/herramientas de desarrollo; no
  aparecen en el audit de producción. La resolución automática requiere
  degradar Firebase CLI 15 a 14 o forzar rangos transitivos mayores, por lo que
  se dejó fuera de este parche no-breaking y se conserva como riesgo explícito.
- Sin cobertura de código aplicable: el cambio modifica versiones, no lógica
  ejecutable propia. Build, typecheck y suites de CI verifican compatibilidad.
- No se ejecutaron escrituras, despliegues ni consultas autenticadas remotas.
