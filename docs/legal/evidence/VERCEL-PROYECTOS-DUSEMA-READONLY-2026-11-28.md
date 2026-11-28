# Revisión read-only de proyectos Vercel vinculados a Dusema — 2026-11-28

Consulta de metadatos y respuestas HTTP, sin cambios, en el equipo
`glemynarts-projects`. No se leyeron variables de entorno, secretos, cuerpos de
páginas, código de deployments ni datos de clientes; no se borró ni pausó ningún
deployment, dominio o proyecto.

## Hallazgos

- La consulta de plan devolvió `Hobby` activo. Los [términos de Vercel](https://vercel.com/legal/terms)
  y la [descripción del plan Hobby](https://vercel.com/docs/plans/hobby) limitan
  este plan a uso personal/no comercial. La cuenta no se actualizó ni se inició
  una prueba de pago.
- Los términos vigentes incluyen una autorización de uso de contenido de Hobby
  para entrenamiento de modelos de IA. El [DPA de Vercel](https://vercel.com/legal/dpa)
  declara que aplica al procesamiento como encargado para clientes Pro y
  Enterprise; no incluye Hobby en ese alcance. No se comprobó si datos de
  clientes pasan por `saa-s-web`, ni la preferencia de entrenamiento de la
  cuenta. Por ello no se concluye que hubo uso o exposición de datos, pero
  tampoco queda acreditado un DPA aplicable al staging de Hobby.
- El equipo tiene dos proyectos relevantes para esta revisión:
  `cafeatrato` (URL de producción `cafeatrato.vercel.app`) y `saa-s-web`
  (dominio personalizado `staging.dusema.com`). `pos.dusema.com` continúa fuera
  de Vercel; la raíz de producción del POS es App Hosting/Firebase.
- `cafeatrato` tiene cuatro deployments `Production/READY`, creados hace
  aproximadamente 53 días. Las cuatro URLs directas examinadas redirigen a
  Vercel SSO; el alias `cafeatrato.vercel.app` devuelve HTTP 404. El proyecto
  tiene deshabilitada la creación de deployments desde Git. Esto no prueba que
  se hayan eliminado los artefactos ni que su retención haya vencido.
- `saa-s-web` está ligado al repositorio público `Glemynart/SaaS`, con raíz
  `apps/web`. La configuración le permite crear deployments Git. La protección
  SSO está configurada para deployments excepto los dominios personalizados;
  por tanto, no cubre `staging.dusema.com` ni
  `saa-s-web-two.vercel.app`. Solicitudes HTTP anónimas de solo encabezados a
  esos dos dominios devolvieron HTTP 200. No se leyó el contenido entregado y
  este resultado no demuestra por sí solo que se expongan datos o funciones
  privadas.
- Una lectura GET anónima y acotada de `/` en `staging.dusema.com` devolvió
  HTTP 200. El título HTML identifica una aplicación de gestión laboral para
  operadores educativos, distinta de la interfaz del POS. No se verificó si
  forma parte del servicio POS o si procesa datos de sus clientes. En el HTML
  inicial, un conteo automatizado detectó cuatro patrones de correo solo dentro
  de atributos `href` (ninguno en texto visible) y ocho secuencias numéricas de
  9–12 dígitos. No se conservaron ni registraron los valores; no se hizo una
  revisión manual del HTML, del estado serializado ni de respuestas API, así
  que esos patrones no están clasificados como datos personales o registros.
- Se recorrió la paginación de previews del proyecto `saa-s-web`: 591 entradas,
  531 `READY` y 60 `CANCELED`, con fechas observadas entre el 29 de octubre y
  el 17 de noviembre de 2026. La muestra no establece por sí sola la política
  interna de expiración ni garantiza que todos los aliases históricos respondan
  igual. La configuración de retención reporta vencimiento de deployments API
  a 30 días y conservar 10; no equivale a una medición de borrado efectivo.

## Evaluación y límite operativo

Queda un bloqueo de aptitud comercial para el uso observado de Vercel: el
proyecto de staging `saa-s-web` está activo en Hobby y sirve una aplicación
separada de gestión laboral por un dominio personalizado con HTTP 200. La
protección SSO de previews no sustituye el requisito contractual del plan. La
relación de esa aplicación con el POS y su flujo de datos no están demostrados;
este hallazgo es adyacente al corte #706 y no prueba que Vercel procese datos
personales del POS. No se cambió el plan porque la misión excluye costos, y no
se deshabilitó el proyecto, previews ni dominios porque son la superficie de
staging de otro repositorio y la operación podría interrumpir su trabajo activo.

Antes de declarar que el uso de Vercel por Dusema está regularizado, se debe
determinar si `saa-s-web` pertenece a la operación comercial, clasificar sus
flujos y resolver hosting/contrato mediante migración o alternativa autorizada.
Mientras se mantenga el plan Hobby, no se debe afirmar que el uso comercial de
Vercel está regularizado. La revisión de `cafeatrato` tampoco cierra
expiración/retención de artefactos ni contenido de previews de `saa-s-web`.

## Fuentes técnicas

- [Vercel CLI `list`](https://vercel.com/docs/cli/list)
- [Vercel CLI `inspect`](https://vercel.com/docs/cli/inspect)
- [Configuración Git de Vercel](https://vercel.com/docs/project-configuration/git-configuration)
- [Términos de Vercel](https://vercel.com/legal/terms)
- [Plan Hobby](https://vercel.com/docs/plans/hobby)
- [DPA de Vercel](https://vercel.com/legal/dpa)
