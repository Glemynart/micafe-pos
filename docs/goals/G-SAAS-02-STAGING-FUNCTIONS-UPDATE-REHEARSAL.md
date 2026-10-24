# G-SAAS-02 — Ensayo limitado de actualización y recuperación de Functions en staging

Estado: `PREPARADO — NO AUTORIZADO PARA EJECUCIÓN`  
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

El hash Firebase ni la fuente inmutable de Cloud Build incluyen un commit Git
que pueda comprobarse localmente. La recuperación exige identificar antes de
ejecutar el commit Git exacto que generó esa revisión, desde evidencia de
despliegue inmutable o registros de Firebase CLI; no se infiere del hash ni
del objeto GCS.

## Precondiciones obligatorias

1. Autorización operativa escrita que limite el alcance a esta Function,
   este proyecto y una ventana concreta.
2. `origin/main` y la CI post-merge verificados para el SHA candidato.
3. Checkout limpio del SHA autorizado, Node.js 22 y Firebase CLI de las
   dependencias bloqueadas del repositorio.
4. Un responsable de plataforma con identidad ya autorizada para invocar
   `consultarContextoPlataforma`; nunca imprimir, copiar ni registrar su
   token.
5. Commit Git previo recuperable (`SHA_PREVIO`) identificado y validado contra
   la configuración remota antes de desplegar. Sin este dato no se autoriza
   actualización, pues tampoco habría recuperación reproducible.
6. Ninguna otra operación remota en curso sobre esa Function.

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

## Aborto y recuperación

Abortar antes de cualquier llamada si cambia el SHA, la CI no es verde, falta
`SHA_PREVIO`, la Function no está `ACTIVE`, o el snapshot difiere en URI,
región, runtime, cuenta de servicio, trigger o referencias de secretos.

Si la actualización ya ocurrió y aparece una desviación, detener el ensayo y
solicitar autorización específica de recuperación. Con un checkout limpio de
`SHA_PREVIO`, el mecanismo compatible es el mismo despliegue dirigido:

```powershell
firebase deploy --project micafe-pos-staging --only functions:saas-platform-context:consultarContextoPlataforma
```

Después se repiten el snapshot y la llamada autenticada de solo lectura, y se
exige que concuerden con la evidencia previa. Este rollback está preparado,
pero **no está probado** hasta ejecutarlo bajo su autorización específica.

## Riesgos abiertos

- El ensayo valida actualización y recuperación de una Function que ya ocupa
  su codebase objetivo; no valida traslado entre codebases.
- Falta vincular la revisión remota anterior con un `SHA_PREVIO` Git
  recuperable. Es un bloqueo para autorizar cualquier actualización.
- La llamada autenticada requiere una sesión de plataforma existente y
  autorizada; no se crearán credenciales ni se expondrán tokens.
