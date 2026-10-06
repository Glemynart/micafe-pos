# ADR-SAAS-063 — Política de deployments Vercel desde `main`

## Estado

**ACEPTADO — 2026-10-06.**

**Fecha de propuesta:** 2026-10-06.
**Aprobación:** el responsable del proyecto aprobó explícitamente la Opción 2 el 2026-10-06; Lead Engineer registra y ejecuta la decisión.

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 —
Configuración inicial`, con efecto transversal sobre los PR que integran a
`main` y sobre el release de `M4 / E4.1`. La aceptación autoriza únicamente
implementar la barrera descrita en esta ADR mediante configuración versionada;
no autoriza un release, promoción, cambio de alias o tráfico.

## Contexto

El proyecto Vercel `cafeatrato` está conectado al repositorio Git y tiene
`main` como rama de producción. La documentación oficial de Vercel indica que,
por defecto, un merge a la rama de producción genera un deployment de
producción. Los deployments de ramas de PR distintas de `main` son previews.

La evidencia local más reciente confirma el efecto en este proyecto:

- El merge de PR #460 produjo el deployment
  `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, creado el 2026-10-06 a las 14:52 UTC,
  `READY`, target `production`, con los alias automáticos
  `cafeatrato-glemynarts-projects.vercel.app` y
  `cafeatrato-git-main-glemynarts-projects.vercel.app`.
- El deployment actual de PR #461,
  `dpl_FMCayJ7JDWrVy7En9St2qi9xcpFX`, está `READY`, target `preview`.
- `vercel.json` no contiene actualmente `git.deploymentEnabled`.
- PR #461 declara fuera de alcance producción. Fusionarlo bajo la configuración
  actual ocasionaría otro deployment con target `production`, antes de cerrar
  Gate I y la aceptación operativa.

Por tanto, no cambiar el dominio canónico no equivale a no crear un
deployment de producción: un deployment `production` puede tener aliases
automáticos aunque el dominio comercial esperado no se haya promovido
manualmente. ADR-SAAS-048, ADR-SAAS-049, ADR-SAAS-061 y ADR-SAAS-062 mantienen
los gates de despliegue/producción separados de la implementación y no
resuelven este comportamiento Git→Vercel.

## Drivers de decisión

- No desplegar ni exponer cambios a un entorno Vercel `production` antes del
  gate de release correspondiente.
- Mantener los deployments Preview y Vercel Preview Comments para revisar PRs.
- Hacer explícita y auditable la autorización de producción, ligada a un SHA
  aprobado y a evidencia de release.
- No alterar dominios, aliases, variables de entorno, Firebase ni datos remotos
  como efecto colateral de esta decisión.

## Opciones consideradas

### Opción 1 — Conservar deployments automáticos de `main`

Los merges continúan generando deployments con target `production`; el equipo
evita exponer cambios únicamente mediante cautela sobre el merge o sobre la
promoción del dominio canónico.

**Ventajas:** conserva el flujo Vercel actual sin cambios.
**Desventajas:** no satisface la separación entre merge y release; ya se
observaron aliases automáticos de producción y no existe una barrera técnica
que impida repetir el efecto antes del gate.

### Opción 2 — Deshabilitar deployments Git de `main` y conservar previews

Añadir a `vercel.json` una regla de configuración equivalente a:

```json
{
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

La regla se integraría con las propiedades actuales del archivo, no las
reemplazaría. Las demás ramas no especificadas conservan el valor por defecto
habilitado, incluidos los branches de PR. La publicación de producción se
realizaría únicamente mediante un procedimiento explícito posterior al gate de
release, con SHA y artefacto verificados.

**Ventajas:** cambio versionado y auditable; conserva previews de PR; evita que
un merge ordinario a `main` cree un deployment de producción.
**Desventajas:** es una política transversal para todos los merges futuros a
`main`; hasta que exista un flujo explícito de release, `main` no se publica
automáticamente en Vercel Production.

### Opción 3 — Mover la rama de producción de Vercel a una rama de release

Cambiar la rama de producción en los ajustes del proyecto y promover a esa
rama únicamente releases aprobados.

**Ventajas:** separa visualmente integración y release en Git.
**Desventajas:** introduce una rama de release, reglas de sincronización,
protección y rollback no existentes ni aprobadas; el ajuste ocurre fuera del
repositorio y es más fácil que la configuración remota diverja.

### Opción 4 — Desconectar Git o deshabilitar todos los deployments

**Ventajas:** bloquea el auto-deploy.
**Desventajas:** elimina o degrada previews y comentarios requeridos por el
flujo de PR; es más amplio de lo necesario.

## Decisión aceptada

Se acepta la **Opción 2** como política de separación entre integración y
release para todo el proyecto Vercel `cafeatrato`: deshabilitar deployments Git
automáticos de `main` y conservar los deployments Preview de las demás ramas.
La regla se implementará en `vercel.json`, integrada con la configuración
existente y mediante el flujo normal de PR, CI y auditoría.

PR #461 permanece abierto hasta que la barrera esté integrada y se complete su
auditoría propia. Sus checks verdes no sustituyen ese gate.

## Límites de la decisión aceptada

La implementación autorizada podrá modificar exclusivamente la configuración
de deployments Git de Vercel necesaria para bloquear `main` y conservar
previews. No podrá:

- lanzar `vercel deploy --prod`, promover deployments ni cambiar aliases;
- modificar Firebase, staging, producción de Firebase, tráfico, Firestore,
  Auth, Rules, IAM o Secrets;
- cambiar variables de entorno, dominios o la rama base Git;
- declarar producción autorizada;
- alterar la funcionalidad de PR #461.

La autorización para realizar un release de producción seguirá requiriendo un
gate separado con SHA, artefacto, smoke, rollback y aprobación conforme a los
documentos vigentes. La aceptación de esta ADR autoriza únicamente implementar
la barrera de auto-deployment descrita; no autoriza un release.

## Consecuencias de la decisión

- Los pushes y merges a `main` no generan deployments Git Vercel.
- Los pushes a branches de PR continúan generando Preview, salvo una regla
  explícita distinta.
- La operación de release Vercel deja de inferirse del merge y necesita un
  procedimiento explícito, rastreable y vinculado a un gate aprobado.
- Rollback de esta política no debe consistir en reactivar `main` de forma
  inadvertida, pues el cambio puede volver a habilitar el auto-deployment.
- No se modifica ni revierte ningún deployment existente ni sus aliases.

## Validación requerida antes de implementar

1. Confirmar en preview que la configuración no deshabilita Vercel para una
   rama `codex/*` ni impide Vercel Preview Comments.
2. Auditar el diff para demostrar que solo cambia la regla de Git deployment.
3. Tras integrar la regla, comprobar que un merge a `main` no generó un nuevo
   deployment de target `production`, mientras el preview del PR sí terminó
   `PASS`.
4. Verificar que el deployment y aliases de producción existentes no fueron
   modificados.

La comprobación post-merge solo se ejecutará después de la aprobación de esta
ADR y de la auditoría/CI requeridas; no se hará un merge experimental para
probar la configuración.

## Registro de aprobación y alcance

El responsable del proyecto aprobó explícitamente la Opción 2 el 2026-10-06.
La aceptación autoriza añadir `git.deploymentEnabled.main = false` a
`vercel.json`, preservar deployments Preview para las ramas de PR y verificar
la política después de integrarla. También reserva cualquier publicación
Vercel de producción a un gate explícito posterior, con SHA y artefacto
verificados.

Esta aceptación no autoriza `vercel deploy --prod`, promover deployments,
cambiar dominios o aliases, modificar variables de entorno, ni desplegar o
alterar Firebase, staging, producción de Firebase, datos o tráfico. No modifica
la funcionalidad de PR #461 ni declara E2.2 completado.

## Referencias

- Evidencia del deployment actual de `main`: PR #460, deployment
  `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, inspeccionado con Vercel CLI 62.1.0 el
  2026-10-06.
- Evidencia del preview actual de PR #461: deployment
  `dpl_FMCayJ7JDWrVy7En9St2qi9xcpFX`, inspeccionado con Vercel CLI 62.1.0 el
  2026-10-06.
- [Vercel Git deployments](https://vercel.com/docs/git).
- [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration),
  propiedad `git.deploymentEnabled`.
- `ADR-SAAS-048-superficie-bodega-lifecycle-fixture-staging.md`.
- `ADR-SAAS-049-aislamiento-codebase-bodega-staging.md`.
- `ADR-SAAS-061-oferta-comercial-tenant-especifica.md`.
- `ADR-SAAS-062-aprobacion-previa-ventas-bodega.md`.
