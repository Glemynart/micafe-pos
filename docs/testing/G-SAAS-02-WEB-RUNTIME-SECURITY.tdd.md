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
| El árbol de dependencias de runtime web no contiene advisories `high` o `critical`. | `npm audit --omit=dev --audit-level=high` | Seguridad de dependencias / release gate | RED en `b255791`: exit 1, 18 advisories totales (9 high, 1 critical); `next@16.3.0` es directo y está en rango crítico `16.0.0–16.3.7`. | Exit 0 para high/critical en el árbol actualizado; cualquier advisory menor residual queda reportado. |

## Amenaza y mitigación

El boundary expuesto es la aplicación Next.js de producción y sus dependencias
de servidor. Los advisories incluyen ejecución remota crítica en Next.js y
fallos altos de disponibilidad/seguridad en transitivas. La mitigación prevista
es actualizar Next.js a un parche compatible de su línea, resolver transitivas
solo a versiones compatibles y validar build/typecheck/tests; no aplicar
`npm audit fix --force` ni cambios remotos.

## Evidencia de validación

- Baseline RED ejecutada contra `main @ b255791` el 2026-10-12; salida resumida
  en esta tabla.
- GREEN pendiente de ejecutar tras la actualización del manifiesto/lockfile.
- Sin cobertura de código aplicable: el cambio modifica versiones, no lógica
  ejecutable propia. Build, typecheck y suites de CI verifican compatibilidad.
- No se ejecutaron escrituras, despliegues ni consultas autenticadas remotas.
