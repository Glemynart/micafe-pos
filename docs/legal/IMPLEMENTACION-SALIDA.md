# Implementación controlada de salida — estado real

Fecha de actualización: 2026-11-26. `G-SAAS-02 / M2 / E2.2`.
ADR-SAAS-100 aceptado para implementar por la orden posterior «ok resuelve eso».
ADR-SAAS-101 aceptado expresamente para implementación y pruebas locales.
ADR-SAAS-099 aceptado por separado para implementar aceptación legal versionada.
El 2026-11-24 se desplegaron las dos callables `saas-legal` y Firestore Rules en
staging y producción desde `81ba393f2f85956934b484f0ae9b32923b10e0aa`; las Rules
activas coinciden con el candidato. Ambas callables rechazan peticiones anónimas
con `UNAUTHENTICATED` (HTTP 401). PR #706 continúa abierto en draft y App Hosting
no recibió el candidato. No se ejecutó smoke autenticado ni se registraron
aceptaciones durante el corte.

## Corte de proveedores

- Eliminados import/render de Analytics y dependencia directa; no se envía
  nueva telemetría por ese componente una vez publicado el corte.
- `vercel.json`: `git.deploymentEnabled=false`, configuración documentada para
  impedir nuevas publicaciones automáticas desde Git en todas las ramas.
- No se han borrado previews históricos, cancelado cuentas o cambiado planes.
  La medida actúa al incorporarse/ser leída la configuración; no prueba retiro
  completo de todos los datos existentes en Vercel.
- GitHub conserva el ruleset observado con `Tipos y pruebas` obligatorio y ramas
  actualizadas. No se cambia IAM, Rules, CI obligatorio ni rollouts App Hosting.
- El primer build identificó un bloqueo de seguridad de Next.js 16.4.1.
  `npm audit` confirmó siete avisos moderate, rango afectado hasta 16.4.4.
  Se actualiza solo el parche a 16.4.6, dentro de la misma serie.
  [Release de seguridad 16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5)
  y [parche 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6).

Rollback del retiro: reintroducir Analytics únicamente tras resolver su fundamento
contractual y tratamiento; no bajar Next a la versión vulnerable como rollback.
El rollback de configuración Vercel requeriría evaluar nuevamente uso comercial.

## Herramientas implementadas

`scripts/legal/` contiene módulos internos, sin rutas web ni ejecución remota
automática al importarlos:

- `tenant-export.mjs`: núcleo read-only con snapshot, paginación estable,
  presupuestos, autorización por lote, subcolecciones, hashes y archivos versionados.
- `export-schema.mjs`: allowlists versionadas; campos/tipos no reconocidos detienen
  el proceso. No hay dump genérico, tolerancia silenciosa o eliminación por denylist.
- `operator-authority.mjs`: verificación de ID token con revocación, audiencia,
  operador actual y facultad de conservación, además de petición verificada.
  La verificación de la petición es una dependencia obligatoria, sin default permisivo.
- `firestore-source.mjs`: transporte REST de lectura; obtiene el `readTime` del
  servidor con una consulta exacta aleatoria sin resultados y reutiliza ese
  snapshot en las páginas. El preflight de producción de 2026-11-26 recibió el
  `readTime` y cero documentos.
  No ofrece `commit`, `delete` o mutaciones.
- `storage-source.mjs`: lista solo prefijo tenant y pide generación exacta con
  precondición. No utiliza ni entrega tokens públicos de descarga.
- Las URLs de Firebase Storage tokenizadas de imágenes del catálogo, eventos y
  branding se resuelven contra ese inventario antes de leer documentos: el
  paquete sustituye cada URL por una referencia al asset cifrado y generación
  exacta. El manifiesto incluye el conteo de Storage; un archivo no encontrado
  detiene la exportación. Las URLs HTTPS externas limpias se conservan como
  referencia, no se descargan ni se declaran como archivos del bundle.
- `encrypted-bundle.mjs` y `private-output.mjs`: AES-256-GCM autenticado; escritura
  de ciphertext en directorio nuevo y restringido, fuera de Git/Downloads/Codex.
  La clave de 32 bytes la aporta un canal seguro del llamador y no se escribe
  junto al paquete. El CLI no imprime documentos ni secretos.
- `retention-plan.mjs`: planificador sin mutaciones; siempre `PREVIEW_ONLY` y
  `executable=false`, con bloqueos por conservación, hold, identidad compartida,
  referencias no verificadas y entrega pendiente.
- `tenant-export-runner.mjs`: valida el directorio privado antes de leer payloads,
  revalida la autoridad durante el recorrido y verifica el round-trip del bundle
  cifrado; solo devuelve metadatos.
- `tenant-export-cli.mjs`: candidato local de solo lectura, limitado en producción
  al tenant `distribuidora-las-jimenez`; deriva el bucket del proyecto y requiere
  una referencia externa de autorización verificada, operador con
  `CONSERVACION_GOBERNAR`, credenciales de lectura existentes y confirmación
  interactiva. No requiere cuenta ni sesión del tenant.

El ejecutable `coverage-cli.mjs` enumera metadatos; no exporta payloads. El nuevo
runner/CLI está implementado en la rama de trabajo, pero todavía no se ha
ejecutado con datos reales. La referencia se verifica por atestación interactiva
del operador frente al soporte externo; el CLI no consulta un expediente de
autorización en Firestore. La declaración reportada de autorización de Diana no
se convierte por sí sola en una referencia verificable. No usar
`coverage-cli.mjs` como si certificara una entrega integral.

## Límite material antes de usar datos reales

**El núcleo no está certificado todavía como exportador integral de producción.**
`PENDING_ROOTS` conserva una guardia histórica fail-closed: rechaza una raíz de esa
lista únicamente si no existe un esquema explícito en `SCHEMAS`. En el candidato
actual las seis raíces de esa lista (`agendas`, `auditoria_logs`,
`comandas_cocina`, `eventos_operativos`, `reservas` y `numeraciones`) ya tienen
allowlists; por eso no bloquean hoy la exportación por `EXPORT_ADAPTER_REQUIRED`.
El preflight de metadatos de 2026-11-25 clasificó las 48 raíces observadas como
`ADAPTER_DEFINED` o `EXCLUDED_INTERNAL`. Esto solo verifica nombres de raíces,
no todos los payloads reales, campos históricos, subcolecciones o referencias.
No consultar por empresaId un singleton que puede no tener ese campo para fingir
que está vacío.

Los adaptadores definidos tampoco autorizan versiones futuras desconocidas. Antes
de ejecutar con datos reales, comparar cada forma de documento y subcolección con
las allowlists mediante fixtures representativos, vincular una petición verificada
y probar consistencia del API real en un entorno aislado. Las pruebas unitarias
con respuestas sintéticas no acreditan readTime/restore en Cloud.

Una fuente nueva debe clasificarse: nunca convertir un rechazo en bypass o ampliar
campos automáticamente usando payloads reales. No cambiar `PENDING_ROOTS` por
vacío para conseguir un estado COMPLETE. El estado del manifiesto es
`COMPLETE_DECLARED_SCOPE`, no certificación legal o fiscal.

Existe un ejecutor exclusivamente sintético en `emulator-erasure.mjs`, limitado
a `demo-dusema-erasure`, `127.0.0.1` y fixtures marcados. No admite colecciones
comerciales, Auth ni Storage. Revalida autorización por etapa, bloquea holds,
identidades compartidas, ledger, evidencia contractual, referencias sin comprobar
y entrega pendiente. Usa precondiciones updateTime y un comprobante atómico sin
payloads personales; la repetición verifica ausencia y detecta recreación.
No constituye un ejecutor productivo ni prueba eliminación física de backups.
Un preview sin bloqueos sigue sin autorizar borrado real. El flujo de aceptación
ADR-SAAS-099 está implementado en PR #706; su bundle permanece en `PREPARACION`.
Las Functions y Rules se desplegaron en staging y producción el 2026-11-24, pero
el PR no se ha integrado ni App Hosting ha recibido el candidato. No se ejecutó
smoke autenticado ni se registraron aceptaciones durante ese corte.

El inventario de metadatos de `micafe-pos` a las 19:37 UTC del 2026-11-23
identificó 48 raíces y las 48 tienen clasificación: adaptador cerrado o fuente
interna excluida. `operaciones_auditoria` tiene una proyección cerrada para las
formas conocidas de finanzas, inventario, reservas, salón y turnos. Un campo o
resultado histórico que no coincida detiene la exportación; no se usa un volcado
genérico.
`configuracion/general` es un archivo histórico global y está excluido del paquete
de un tenant; la configuración vigente viaja desde `configuraciones/{empresaId}`.
`rootAdaptersComplete=true` solo significa que cada nombre de raíz está
clasificado. `productionExportCertified=false`: no se leyeron payloads de tenants
ni se comprobó cada documento legado, subcolección, campo/versionado o referencia
contra un paquete real. El primer uso requiere ensayos de esquema completos con
fixtures representativos y corroborar el comportamiento de `readTime` de la API.

La exportación limita `maxBytes` al tamaño exacto del artefacto cifrado (JSON,
escapes, expansión Base64 y envoltura AES-GCM), además de detener entradas que ya
superan ese presupuesto. `totalBytes` en el manifiesto sigue contando bytes de
fuente antes de codificación. La CLI calcula `sourceSha` solo si el checkout está
limpio, incluidas las rutas sin seguimiento; así el manifiesto no atribuye a un
commit contenido local distinto.

La subcolección privada `clientes/{id}/anotaciones_privacidad` se descubre y se
clasifica en el manifiesto como `PRIVATE_PRIVACY_CASE_DATA`, pero no se recorren
sus documentos ni se entregan sus motivos en la salida comercial ordinaria. El
expediente restringido de reclamos queda separado de la exportación tenant-wide.

## Validación reproducible

```powershell
node --test scripts/legal/legal-tools.test.mjs scripts/legal/tenant-export-cli.test.mjs
npx firebase --project demo-dusema-export emulators:exec --only firestore "node --test scripts/legal/emulator-export.test.mjs"
npx firebase --project demo-dusema-erasure emulators:exec --only firestore "node --test scripts/legal/emulator-erasure.test.mjs"
npx tsc --noEmit
npm run build
```

Las pruebas de herramientas se conectaron a CI. Incluyen dos tenants sintéticos,
abonos, cambios de autoridad, versión/campo desconocido, paginación, presupuesto,
snapshot vencido, generación/ruta de archivo, cifrado, clave errónea, alteración
de contenido y salida privada en Windows. No se ejecutó exportación real ni
supresión contra Firebase.

Resultado local del 2026-11-23: 19 pruebas del núcleo de salida aprobadas,
TypeScript aprobado y dos pruebas de supresión aprobadas con Firestore Emulator
real y JDK 21 (ninguna omitida). El ensayo verificó tenant vecino, holds, identidad
compartida, ledger/contrato, referencias, entrega, plazo, subcolecciones,
revocación, conflicto updateTime, atomicidad, repetición y recreación.
El preflight de metadatos clasificó 48/48 raíces actuales.
No se desplegaron herramientas ni se borraron datos reales. El ensayo usa una
colección sintética específica: no acredita aún adaptadores de destrucción de
documentos operativos, Auth, Storage o restauración de backups.
