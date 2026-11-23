# Implementación controlada de salida — estado real

Fecha: 2026-11-23. `G-SAAS-02 / M2 / E2.2`.
ADR-SAAS-100 aceptado para implementar por la orden posterior «ok resuelve eso».
ADR-SAAS-101 aceptado expresamente para pruebas locales; ADR-SAAS-099 sigue Propuesto. No hay aceptación legal real
del cliente ni cambios en producción atribuibles a estos archivos.

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
- `firestore-source.mjs`: transporte REST de lectura; filtros tenant y `readTime`.
  No ofrece `commit`, `delete` o mutaciones.
- `storage-source.mjs`: lista solo prefijo tenant y pide generación exacta con
  precondición. No utiliza ni entrega tokens públicos de descarga.
- `encrypted-bundle.mjs` y `private-output.mjs`: AES-256-GCM autenticado; escritura
  de ciphertext en directorio nuevo y restringido, fuera de Git/Downloads/Codex.
  La clave de 32 bytes la aporta un canal seguro del llamador y no se escribe
  junto al paquete. No hay CLI para imprimir documentos o secretos.
- `retention-plan.mjs`: planificador sin mutaciones; siempre `PREVIEW_ONLY` y
  `executable=false`, con bloqueos por conservación, hold, identidad compartida,
  referencias no verificadas y entrega pendiente.

## Límite material antes de usar datos reales

**El núcleo no es todavía un exportador integral de producción.** La lista
`PENDING_ROOTS` identifica dominios operativos y de auditoría sin adaptador
completo. Si aparecen entre las colecciones raíz, se rechaza la exportación con
`EXPORT_ADAPTER_REQUIRED` antes de generar un paquete. No consultar por empresaId
un singleton que puede no tener ese campo para fingir que está vacío.

Los adaptadores ya definidos tampoco autorizan versiones futuras desconocidas.
Antes de ejecutar, completar los de dominio/campos canónicos, vincular una petición
verificada y probar consistencia del API real en un entorno aislado. Las pruebas
unitarias con respuestas sintéticas no acreditan readTime/restore en Cloud.

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
Un preview sin bloqueos sigue sin autorizar borrado real. Tampoco está
implementado el flujo de aceptación ADR-SAAS-099.

El inventario de metadatos identificó 48 raíces; nueve requieren aún adaptador:
`agendas`, `auditoria_logs`, `comandas_cocina`, `configuracion`, `eventos_dominio`,
`numeraciones`, `operaciones_auditoria`, `pedidos_activos`, `reservas`.
Los adaptadores de configuración canónica y contratos ya tienen esquemas cerrados;
esto no acredita cobertura de todos los documentos históricos.

## Validación reproducible

```powershell
node --test scripts/legal/legal-tools.test.mjs
npx firebase --project demo-dusema-erasure emulators:exec --only firestore "node --test scripts/legal/emulator-erasure.test.mjs"
npx tsc --noEmit
npm run build
```

Las pruebas de herramientas se conectaron a CI. Incluyen dos tenants sintéticos,
abonos, cambios de autoridad, versión/campo desconocido, paginación, presupuesto,
snapshot vencido, generación/ruta de archivo, cifrado, clave errónea, alteración
de contenido y salida privada en Windows. No se ejecutó exportación real ni
supresión contra Firebase.

Resultado local del 2026-11-23: 18 pruebas del núcleo de salida aprobadas,
TypeScript aprobado y dos pruebas de supresión aprobadas con Firestore Emulator
real y JDK 21 (ninguna omitida). El ensayo verificó tenant vecino, holds, identidad
compartida, ledger/contrato, referencias, entrega, plazo, subcolecciones,
revocación, conflicto updateTime, atomicidad, repetición y recreación.
No se desplegaron herramientas ni se borraron datos reales. El ensayo usa una
colección sintética específica: no acredita aún adaptadores de destrucción de
documentos operativos, Auth, Storage o restauración de backups.
