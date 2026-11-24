# Cierre de comprobaciones accesibles — 2026-11-23

Estado: **COMPROBACIONES DE LECTURA REALIZADAS; NO LISTO PARA EXIGIBILIDAD**.
No es dictamen jurídico integral. No se ejecutó exportación de datos, borrado,
despliegue, aceptación de acuerdos o cambio de plan.

## 1. Contratos aplicables: resultados

El prestador declaró en este chat: **Gmail personal** y **términos online de
Google/Firebase, sin contrato firmado aparte**. Son declaraciones del titular,
no fechas de aceptación certificadas por API. No exigir una firma manuscrita
para reconocer un acuerdo online ni fingir que se leyó un contrato privado.

| Servicio usado | Marco online identificado | Resultado |
|---|---|---|
| Firestore, Functions, Storage, App Hosting y Authentication | Términos Firebase remiten a Google Cloud Terms y términos específicos; Cloud DPA incorporado | Régimen identificado mediante tabla oficial vigente consultada y declaración del prestador. No usar el DPA Firebase como único instrumento para estos servicios. |
| Cloud Messaging | Términos Google APIs y Firebase Data Processing and Security Terms según tabla oficial | Régimen identificado; no equipararlo automáticamente con Auth o ubicación de Firestore. |
| Gmail personal | Términos generales, condiciones del servicio y política Google aplicables al país/cuenta | Tipo de cuenta confirmado. No hay evidencia de DPA Workspace contratado. No declarar ilegal su uso por ser Gmail, ni ofrecer las garantías de Workspace. Revisar finalidad/rol de cada envío y minimizar datos. |
| Vercel | Equipo Hobby; DPA publicado con alcance Pro/Enterprise | Incompatibilidad pendiente de resolver para uso comercial y cobertura pretendida. No se resuelve escribiendo una cláusula del cliente. |
| GitHub | Repositorio público, titular tipo User; instrumento público DPA identificado | No introducir expedientes o exportaciones de clientes en Git. La existencia del DPA público no acredita por sí sola cobertura de la cuenta/productos. |

Fuentes oficiales consultadas:

- [Términos Firebase](https://firebase.google.com/terms), versión publicada
  2026-09-24: tabla por servicio. [Privacidad Firebase](https://firebase.google.com/support/privacy),
  actualizada 2026-11-16, confirma distinción entre términos de tratamiento.
- [Google Cloud Terms](https://cloud.google.com/terms/), protección de datos y
  términos incorporados; [Cloud DPA](https://cloud.google.com/terms/data-processing-addendum).
- [FAQ Firebase](https://firebase.google.com/support/faq#projects-accounts): la
  aceptación es por cuenta Google, no por proyecto; la consola es el mecanismo
  documentado de aceptación. No afirmar que el billing o un recurso prueban fecha
  y versión. Si hace falta constancia adicional, observar la consola con la cuenta
  del titular sin aceptar nuevos términos en esta auditoría.
- [Google Privacy](https://policies.google.com/privacy?hl=es): versión consultada
  2026-10-16. La apertura de los términos generales seleccionó Brasil por ubicación
  de la consulta; el intento de forzar Colombia no fue accesible. No se certifican
  con esa página las condiciones regionales de la cuenta colombiana.
- [Vercel DPA](https://vercel.com/legal/dpa) y [Terms](https://vercel.com/legal/terms).

**Recomendación:** mantener Google/App Hosting; limitar Gmail a recepción de
solicitudes y comunicaciones mínimas, sin dumps o credenciales. No contratar
Workspace por inferencia. Preparar retiro de Analytics/Vercel comercial antes de
dar ese proveedor por resuelto. Las obligaciones colombianas responsable/encargado
y la circulación internacional se revisan por tratamiento; no se certifican solo
por usar un proveedor conocido.

## 2. Conservación efectiva: consultas remotas de metadatos

| Recurso | Configuración observada | Consecuencia para los textos |
|---|---|---|
| Backup Firestore | Diario, 35 días; snapshots recientes READY, ya documentados | Solo cubre esos backups. No es plazo de purga de todos los sistemas. |
| TTL Firestore `(default)` | Lista de políticas vacía | No prometer vencimiento automático de documentos por TTL. No prueba ausencia de todo borrado manual o de aplicación. |
| Storage `micafe-pos.firebasestorage.app` | Soft delete 604800 segundos (7 días) | Un objeto borrado puede seguir recuperable durante ese periodo. No equivale a borrado físico inmediato. |
| Storage, respuesta raw | No se devolvieron `versioning`, `lifecycle` o `retentionPolicy` | No se observó política de ciclo de vida ni retención en esa respuesta. Registrar ausencia de configuración, no inventar borrado programado. |
| Logging global `_Default` | 30 días | El plazo de 90 días propuesto no es configuración actual. |
| Logging global `_Required` | 400 días | Tratar aparte los logs obligatorios del proveedor. No prometer 90 días para todos los logs. |

Las consultas de Logging se limitaron a `global`; no certifican todos los buckets,
sinks, destinos regionales o copias posibles del proyecto. Las regiones y ciclos
de almacenamiento no determinan por sí solos todas las transmisiones internacionales.
Las cláusulas de eliminación de Google describen otros ciclos internos bajo sus
supuestos; no convertir el schedule Firestore en promesa global.

## 3. Eliminación en código y navegador

- `transicionarEmpresa`, en `functions/src/suscripciones/service.ts`, cambia
  estado/revisión y revoca sesiones en los casos previstos; no borra físicamente
  el árbol del negocio. Estado `eliminada` no prueba supresión de datos.
- `lib/clientes-service.ts` y `lib/productos-service.ts`: «eliminar» desactiva.
  Tampoco acredita una supresión solicitada por un titular.
- `lib/firebase.ts`: caché persistente. `lib/auth-service.ts`: logout cierra
  Firebase y retira token FCM de forma best-effort; no ejecuta una limpieza
  explícita de IndexedDB en la implementación inspeccionada.
- Los schedules inspeccionados en `functions/src/index.ts` reconcilian soporte,
  claims, auditoría, ventas y vencimientos; no se verificó aquí una purga integral
  del tenant. No inferirla por nombres de lifecycle.

**Resultado:** no se puede prometer todavía supresión integral en 60 días como
capacidad ejecutable. Hace falta procedimiento de clasificación/conservación,
ejecución autorizada por dominio y verificación, sin romper ledger y evidencias
legales. La política propuesta no modifica esas invariantes ni las supersede.

## 4. Cobertura de exportación: comprobación real

Se consultó únicamente `documents:listCollectionIds`, operación de metadatos de
lectura aunque use POST. Paginación agotada; se observaron **48 colecciones raíz**.
No se leyó contenido de clientes ni se descargaron archivos.

La lista histórica MT-U3 cubre 25 colecciones y no es un exportador. Entre las
raíces reales adicionales están `presentaciones_producto`, `configuraciones`,
`empresas`, `membresias`, `suscripciones`, `ofertas_comerciales_tenant` y datos
internos que no deben entregarse indiscriminadamente.

Exclusiones obligatorias observables por nombre/dominio: `credenciales_operativas`,
`restablecimientos_credencial`, `reservas_codigos_operativos`,
`bootstrap_identidades_owner`, `saas_operadores` y metadatos de idempotencia.
Una lista de exclusión no sustituye allowlists de campos y autorización.

Las raíces FIFO/control y `proveedores` no figuraron en esa respuesta. Eso no
certifica que no haya información relacionada en otras rutas, snapshots o
subcolecciones; tampoco autoriza decir que todos los módulos se han usado.
La lectura no inspeccionó subcolecciones de cada tenant. El código confirma
abonos/compromisos bajo ventas y agenda/pedidos bajo empresas, por lo que exportar
solo raíces perdería información.

**Resultado:** alcance de ADR-SAAS-100 fundamentado; no existe evidencia de una
exportación integral ejecutable y validada. Antes de crear una promesa de entrega,
implementar bajo diseño aprobado y validar con dos tenants sintéticos, schemas,
referencias, readTime, generaciones de objetos y exclusión de secretos. No se
necesita extraer datos de Diana para realizar esas primeras pruebas.

## 5. Decisión operativa resultante

Las comprobaciones ya no dependen de una duda genérica sobre proveedores:

1. Google online y Gmail personal están identificados por declaración y fuentes.
2. Vercel Hobby es un problema concreto de uso/contrato a resolver.
3. Exportación y supresión integral son capacidades pendientes de implementación
   y validación, no hechos que otra auditoría documental pueda demostrar.
4. Plazos comerciales de soporte/salida y matriz de conservación siguen propuestos;
   aprobarlos no equivale a que su ejecución esté implementada.

No repetir una auditoría general ni exigir una aceptación ficticia del cliente.
El siguiente corte debe resolver Vercel y aprobar explícitamente el diseño de
exportación/aceptación antes de implementarlo; sus pruebas preceden publicación
y exigibilidad. La revisión jurídica final debe contrastar los textos finales y
el tratamiento efectivo. Ningún resultado de este informe acredita legalidad
integral, aceptación de Diana ni un consentimiento retroactivo.
