# ADR-SAAS-083 — Firebase App Hosting como destino web de producción

## Estado

**Aceptado — decisión explícita del administrador del proyecto, 2026-10-15.**

- **Goal:** `G-SAAS-02` → `M2 — Provisioning y onboarding` → `E2.2 — Configuración inicial`.
- **Decisión:** Firebase App Hosting es el destino de hosting web para el release actual de Café Atrato. Vercel deja de ser destino de publicación y sus límites, aliases y SHA servido son `NOT APPLICABLE TO CURRENT RELEASE`.
- **Límites:** esta decisión no autoriza por sí sola crear un backend productivo, publicar, cambiar DNS/dominios, variables, IAM, Rules, Functions, tenants ni datos productivos.

## Contexto y evidencia

La lectura App Hosting del 2026-10-15 confirmó el backend de staging
`projects/micafe-pos-staging/locations/us-central1/backends/micafe-pos`, URI
`micafe-pos--micafe-pos-staging.us-central1.hosted.app`, runtime Node 24, cuenta
de ejecución de staging, siete nombres de variables Firebase web de staging,
actualizaciones automáticas desactivadas y rama `main`. El rollout
`build-2026-10-15-001` está `SUCCEEDED`, el build `READY`, tráfico observado
100% a ese build y commit fuente
`a460f4d33be2ef08991fd0ed898c3e7e24c724b1`.

La lectura `firebase apphosting:backends:list --project micafe-pos --json`
devolvió una lista vacía. Por tanto, App Hosting productivo no está
configurado; el backend staging no es producción. El proyecto Firebase
`micafe-pos` continúa siendo el proyecto productivo de Rules y Functions. La
lectura Vercel anterior (deployment antiguo y almacenamiento casi lleno) queda
como historia de la plataforma sustituida, no como precondición del release.
Los checks Vercel Preview requeridos por la política de PR no cambian: son
validaciones de PR, no publicación productiva.

La versión candidata de Next.js es `16.4.1`. La documentación oficial de App
Hosting consultada el 2026-10-15 marca Next.js `15.2.x` como activo y considera
Preview las versiones más nuevas que aún no están designadas como activas. La
aceptación anterior de Next.js 16.4.1 se limitó a staging; no aprueba el riesgo
Preview para producción. Referencia: [frameworks y herramientas de App
Hosting](https://firebase.google.com/docs/app-hosting/frameworks-tooling).

## Registro separado de decisión y autorización (2026-10-15)

1. **Decisión técnica:** se conserva `next@16.4.1`, ya integrado en el
   candidato. La revalidación aplica a `origin/main @
   965691ea21ea8c22749f73dc926ed26d191810b5`: desde el build servido
   `a460f4d33be2ef08991fd0ed898c3e7e24c724b1` sólo cambiaron documentos;
   no hubo cambio de código de aplicación ni de dependencias. La evidencia de
   build, tipos, lint, pruebas de rutas y audit de `16.4.1` sigue aplicable.
2. **Aceptación limitada del riesgo Preview:** el administrador acepta evaluar
   `16.4.1` en el canal Preview de App Hosting para el candidato productivo.
   No transforma a la versión en soporte activo ni reduce los gates de
   seguridad. Riesgos: adaptador/framework con soporte de mejor esfuerzo,
   incompatibilidad de build o runtime, y ausencia de una revisión previa de
   App Hosting productivo a la que volver.
3. **Autorización operativa:** `NOT GRANTED` por esta decisión. Crear el
   backend productivo, configurar IAM o variables, iniciar un rollout, cambiar
   tráfico o DNS y realizar smoke siguen requiriendo preflight satisfactorio y
   autorización operativa específica. No se infiere esa autorización de los
   dos puntos anteriores.

Condiciones de recuperación si se autoriza y falla el rollout: detener la
promoción/tráfico, conservar logs y build fallido para diagnóstico, y aplicar
un forward-fix validado. No volver a `16.4.0` ni a `15.2.9`: la evidencia de
seguridad los mantiene como alternativas no aceptables. Como no existe aún un
backend App Hosting productivo, tampoco existe un build previo de App Hosting
al cual revertir; la reversión de la primera activación es no promover el
candidato o retirar su tráfico sólo mediante el procedimiento autorizado.

## Decisión

1. Consultar y acreditar producción exclusivamente en Firebase App Hosting.
   Las comprobaciones de capacidad, publicación, deployment, alias y SHA de
   Vercel son `NOT APPLICABLE TO CURRENT RELEASE`.
2. Tratar `micafe-pos-staging` como staging únicamente. No publicar producción
   allí ni reutilizar sus variables, IAM o cuenta de ejecución.
3. Tratar la ausencia de backend App Hosting en `micafe-pos` como prerequisito
   pendiente. Antes de crearlo, registrar backend ID, región, URL inicial,
   procedencia exacta del código, configuración de entorno y principal IAM; no
   migrar DNS ni aliases existentes en este alcance.
4. Conservar Next.js `16.4.1` para el staging ya probado. Antes de un rollout
   productivo, resolver la compatibilidad: usar una versión oficialmente
   activa con build/regresión aprobados, o registrar aceptación explícita del
   riesgo Preview para producción. El uso en staging no satisface esta decisión.
5. Validar Rules, Functions, autorización/controles de compra, smoke
   autenticado, recuperación y acceso de Diana por separado. App Hosting
   `READY` no certifica esos controles.

## Consecuencias y recuperación

- El backoffice y el POS no se duplican: se publica el mismo producto desde el
  SHA aprobado por el pipeline App Hosting.
- La primera creación de backend y su identidad de ejecución son recursos de
  producción nuevos; requieren preflight separado y no heredan IAM, variables
  ni Secrets de staging.
- La URI `hosted.app` del backend productivo se registra y verifica antes de
  comunicar acceso. El dominio propio existente no cambia por esta ADR.
- Ante un rollout fallido, conservar el build previo si existe y seguir el
  procedimiento App Hosting de rollback/forward-fix. No usar Vercel como
  rollback ni cambiar DNS automáticamente.
- El gate de framework Preview permanece abierto hasta resolver el punto 4.

## Verificaciones

- Rollout y backend staging: `PASS` técnico para el alcance observado.
- Backend productivo en `micafe-pos`: `NOT FOUND` (lista vacía, 2026-10-15).
- Publicación/alias/SHA de Vercel: `NOT APPLICABLE TO CURRENT RELEASE`.
- Producción App Hosting, dominio, IAM y variables: `NOT EXECUTED`.
- Rules/Functions/controles, smoke productivo y Trial: conservan sus estados
  independientes; esta ADR no los aprueba.
