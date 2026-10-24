# G-SAAS-02 — Ensayo limitado de actualización y recuperación de Functions en staging

Estado: `PREPARADO PARA DECISIÓN — SHA GIT PREVIO NO DEMOSTRADO; NO AUTORIZADO PARA EJECUCIÓN`
Fecha: 2026-10-24  
Última revisión: 2026-10-24

## Propósito y límite

Este paquete prepara una ejecución dirigida contra
`micafe-pos-staging`, exclusivamente para
`saas-platform-context / consultarContextoPlataforma`.

No es un despliegue autorizado y no prueba una migración de codebase: la
lectura remota del 2026-10-24 ya observa la Function en el codebase objetivo
`saas-platform-context`. No se recreará artificialmente el estado anterior
`saas-auth`.

El SHA candidato es `6740e5c86bbd2abfed6b8809f222d9baec0e4550`; solo puede
usarse cuando su CI post-merge haya terminado en `success` y se confirme que
`origin/main` continúa en ese SHA. Si `main` avanza, este procedimiento se
detiene y se emite un paquete nuevo para el SHA exacto elegido.

## Estado remoto de referencia

Lectura sin mutaciones de `micafe-pos-staging`, región `us-central1`:

| Campo | Valor observado |
|---|---|
| Function | `consultarContextoPlataforma` |
| Estado | `ACTIVE` |
| Generación / runtime | Gen2 / `nodejs22` |
| Codebase | `saas-platform-context` |
| URI | `https://consultarcontextoplataforma-qn7mt3dyyq-uc.a.run.app` |
| Cuenta de servicio | `192423427245-compute@developer.gserviceaccount.com` |
| Trigger | Callable HTTPS; sin `eventTrigger` observado |
| Referencias de secretos | Ninguna observada |
| Hash de artefacto Firebase | `3d920444431b39896439f7102d78d46c2e3a5c2c` |
| Build anterior | Cloud Build `507ac908-bae5-49d5-a354-bb84c7f26c68` (`SUCCESS`) |
| Fuente inmutable anterior | `gs://gcf-v2-sources-192423427245-us-central1/consultarContextoPlataforma/function-source.zip#1792796958918929` |
| SHA-256 de ese ZIP | `88252db06efea6cad82824cdb6af5620b785894e691d4b0bb428ee21e731b501` |
| Revisión Cloud Run que sirve tráfico | `consultarcontextoplataforma-00002-leh` (100 %) |
| Digest de imagen de esa revisión | `sha256:b7668d084fac44359a8d11191fd3c3d16faae0eb25b843f5cfdad1df4ab30edd` |

## Procedencia investigada — sin vínculo verificable a un SHA Git

Se consultaron el recurso Cloud Functions v2, el Build, sus logs, los logs de
auditoría disponibles, la revisión Cloud Run y el objeto GCS fijado por
generación. El Build `507ac908-…` terminó `SUCCESS`, pero `sourceProvenance`
está vacío; no contiene `repoSource`, repositorio ni `commitSha`. El log
registra que `FETCHSOURCE` tomó el ZIP de GCS indicado arriba. El objeto no
tiene metadatos personalizados de procedencia. El ZIP mide 56.715 bytes y su
contenido incluye fuentes y archivos compilados, pero no `.git` ni un SHA Git
completo. Su SHA-256 identifica esos bytes, no un commit.

Los registros de auditoría y anotaciones de la revisión identifican el uso de
Firebase CLI, el codebase, el Build y el hash de despliegue; no registran un
SHA Git. `firebase-functions-hash` es una etiqueta de despliegue, sin una
correspondencia demostrada con un commit. La consulta de procedencia de
Artifact Registry no pudo completarse porque Container Analysis no está
habilitado y la identidad disponible no tiene acceso para esa consulta; no
se habilitó el servicio ni se ampliaron permisos. Por ello, no se puede
afirmar que no exista evidencia en algún otro sistema, pero la evidencia
remota disponible no permite vincular inequívocamente este Build, ZIP o
imagen con un SHA Git exacto.

La revisión `consultarcontextoplataforma-00002-leh` y el digest de imagen sí
identifican el runtime que sirve actualmente el 100 % del tráfico. Una
revisión anterior distinta (`…00001-cov`) también aparece en el historial,
pero no es la revisión actualmente servida y no debe usarse como destino de
recuperación de este ensayo.

## Precondiciones obligatorias

1. Autorización operativa escrita que limite el alcance a esta Function,
   este proyecto y una ventana concreta.
2. `origin/main` y la CI post-merge verificados para el SHA candidato.
3. Checkout limpio del SHA autorizado, Node.js 22 y Firebase CLI de las
   dependencias bloqueadas del repositorio.
4. Un responsable de plataforma con identidad ya autorizada para invocar
   `consultarContextoPlataforma`; nunca imprimir, copiar ni registrar su
   token.
5. Antes de desplegar, confirmar que la revisión de referencia
   `consultarcontextoplataforma-00002-leh` sigue existiendo y que su digest
   continúa siendo el registrado. Esta referencia permite plantear un retorno
   del tráfico al runtime previo; no sustituye un SHA de fuente.
6. Acordar que la recuperación, si se requiere, será un retorno de tráfico a
   esa revisión inmutable. Si se exige poder reconstruir el estado de
   Functions desde un commit Git, detenerse: ese SHA previo no está probado.
7. Ninguna otra operación remota en curso sobre esa Function.

## Preparación local verificable

Desde un checkout limpio del SHA autorizado:

```powershell
git rev-parse HEAD
npm ci
npm --prefix functions-platform-context ci
npm --prefix functions-platform-context run build
npm --prefix functions-platform-context run test:discovery
```

El valor de `git rev-parse HEAD` debe ser el SHA autorizado. El discovery debe
declarar solo `consultarContextoPlataforma`, sin parámetros ni secretos.

## Snapshot previo

Guardar la salida en una ubicación de evidencia aprobada, sin valores de
secretos ni tokens:

```powershell
gcloud functions describe consultarContextoPlataforma --v2 `
  --project micafe-pos-staging --region us-central1 `
  --format='json(name,buildConfig.runtime,serviceConfig.uri,serviceConfig.serviceAccountEmail,eventTrigger,labels,updateTime,state)'
```

Comparar y registrar: nombre, región, runtime, URI, cuenta de servicio,
trigger, labels, estado y las **referencias** de secretos si aparecieran.

## Ejecución propuesta — requiere autorización posterior

El único comando de despliegue permitido por este paquete es:

```powershell
firebase deploy --project micafe-pos-staging --only functions:saas-platform-context:consultarContextoPlataforma
```

No usar `firebase deploy` sin `--only`; no incluir App Hosting, Rules ni otro
codebase. Conservar el log del CLI, el SHA, hora, identidad operadora y Build
ID si el proveedor lo devuelve, sin secretos.

## Verificación posterior no mutante

1. Repetir el snapshot previo y comparar todos los campos protegidos.
2. Exigir `ACTIVE`, misma región, Gen2, `nodejs22`, mismo nombre, URI y cuenta
   de servicio; el hash, la revisión y la hora pueden cambiar.
3. Con la sesión de plataforma ya autorizada, invocar
   `consultarContextoPlataforma` una vez y conservar únicamente el resultado
   redactado: éxito, UID/estado/facultades presentes y ningún dato sensible.
4. Confirmar que no hubo cambios de Rules, App Hosting, Firestore, Auth,
   Storage, oferta, Bootstrap ni Trial.

El ensayo es satisfactorio solo con las cuatro condiciones anteriores y con
evidencia de pre/post snapshot y de la llamada de solo lectura. No demuestra
migración de codebase ni autoriza producción.

## Aborto y opciones de recuperación

Abortar antes de la actualización si cambia el SHA candidato o la CI no está
verde; si la Function no está `ACTIVE`; si cambia cualquiera de los campos
protegidos del snapshot; o si la revisión/digest de referencia ya no existe o
no coincide. Si el despliegue crea una revisión con diferencias inesperadas,
detener el ensayo y solicitar autorización específica de recuperación.

### Opción 1 — restaurar exactamente el runtime que sirve hoy

La revisión y digest actuales están identificados directamente. Si la
revisión sigue disponible después del ensayo, el mecanismo documentado de
Cloud Run para volver a una revisión previa es reasignarle el 100 % del
tráfico:

```powershell
gcloud run services update-traffic consultarcontextoplataforma `
  --project micafe-pos-staging --region us-central1 `
  --to-revisions consultarcontextoplataforma-00002-leh=100
```

Después se comprobaría que el servicio asigna 100 % a esa revisión, que el
digest servido es el registrado y que una invocación autenticada de solo
lectura tiene el resultado esperado. Esto restaura el runtime inmutable
anterior, pero no revierte `buildConfig.source`, Build, etiquetas ni otra
metadata de Cloud Functions al estado previo. El recurso muestra
`allTrafficOnLatestRevision=true`. La documentación de la API Cloud Functions
v2 especifica que, en `functions.create` o `functions.patch`, ese valor hace
que la revisión desplegada reciba el 100 % del tráfico e ignore cualquier
reparto configurado. Por tanto, un posterior `patch` con ese valor puede
revertir un retorno manual de tráfico. No se verificó si el Firebase CLI
usado por este repositorio envía ese campo en su siguiente despliegue; antes
de cualquier redeploy hay que comprobar ese comportamiento y volver a
verificar el tráfico. [Referencia API](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions#ServiceConfig).
La operación cambia tráfico remoto, requiere autorización específica y no
se ha ejecutado ni probado.

### Opción 2 — recuperar código desde la fuente GCS fijada

El ZIP de generación `1792796958918929`, verificado por SHA-256, conserva los
bytes de la fuente empaquetada. Recompilar o volver a desplegar esa fuente
puede recuperar el código fuente exacto del paquete, pero producirá un Build
y una revisión nuevos; no garantiza el mismo digest de imagen ni restaura
idénticamente la revisión Cloud Run. Antes de usar esta vía falta validar un
procedimiento dirigido que preserve la generación GCS y el resto de la
configuración de la Function. No se incluye un comando de ejecución no
verificado.

### Opción 3 — volver a desplegar desde Git

Un SHA de `main` elegido y aprobado permitiría hacer una recuperación de
código versionado, pero, al no ser el SHA histórico demostrado, sería una
reversión deliberada a ese código y no una restauración probada del estado
previo. `firebase deploy` desde ese checkout también generaría un nuevo Build
y runtime; no recuperaría la imagen exacta por sí solo.

Ninguna opción de recuperación se ha ensayado. La opción 1 es la única que
apunta a la revisión runtime actualmente identificada; las opciones 2 y 3
reconstruyen código y generan artefactos nuevos.

## Riesgos abiertos

- El ensayo valida actualización y recuperación de una Function que ya ocupa
  su codebase objetivo; no valida traslado entre codebases.
- Falta el vínculo entre artefacto y SHA Git histórico. No se debe inventar
  `SHA_PREVIO` ni declarar una recuperación Git reproducible.
- El retorno de tráfico a la revisión exacta actual es una alternativa
  identificada, pero requiere autorización y todavía no se ha probado.
- La llamada autenticada requiere una sesión de plataforma existente y
  autorizada; no se crearán credenciales ni se expondrán tokens.
