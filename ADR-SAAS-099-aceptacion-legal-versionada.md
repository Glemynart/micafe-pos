# ADR-SAAS-099 — Aceptación legal versionada del negocio

## Estado

**Aceptado para implementación**, 2026-11-23, por aprobación expresa del responsable en este hilo.
Goal: `G-SAAS-02 → M2 → E2.2`.
La aprobación comprende la arquitectura y su implementación/pruebas. No aprueba
como definitivos los borradores legales, no activa exigibilidad, no acredita
aceptaciones reales ni autoriza despliegue o escrituras productivas.

## Problema

El login no identifica la versión contractual aceptada. El contenido público de
`/terminos` pertenece al negocio histórico de coworking. Hace falta distinguir
información previa, aceptación del representante y autorización de cada titular.
Se preservan ADR-SAAS-028/029 y snapshots comerciales existentes.

## Alternativas

A. **Documentos públicos antes del login y aceptación autenticada después**.
Permite vincular identidad, tenant y versión. Requiere autoridad server-side,
archivo de versiones y control explícito de representación. Recomendada.

B. Casilla obligatoria antes del login. Puede informar o expresar autorización
personal apropiada, pero no demuestra por sí sola quién representa al negocio.
No se recomienda como única evidencia contractual.

C. Acuerdo externo firmado y registrado por soporte. Válido como proceso distinto
si se verifica y conserva, pero no fingir que es una aceptación interactiva del
cliente. Dejar esta vía fuera del primer corte técnico.

## Diseño aceptado

1. Rutas públicas `/terminos`, `/privacidad` y `/anexo-tratamiento`, sin sesión,
   con versión, vigencia y descarga del contenido exacto. Solo documentos finales
   aprobados pueden ser exigibles. El aviso del formulario está visible antes de
   introducir credenciales; la autorización personal que legalmente proceda se
   recoge antes del tratamiento afectado, no retroactivamente tras el login.
2. Después de autenticar y completar activación de credencial, resolver contexto
   tenant y contrato vigente. No usar PIN temporal como evidencia de aceptación.
3. Ofrecer al admin una pantalla específica con negocio, documento/versión,
   condiciones comerciales vigentes y declaración de facultad para representarlo.
   Ser admin es condición técnica necesaria, no prueba automática de facultad
   legal. Si declara no tenerla, permitir salir o contactar soporte, sin aceptar.
4. Vendedores y marketing no aceptan el contrato empresarial. Su información y
   autorizaciones personales siguen proceso propio. Operadores SaaS no aceptan
   por el cliente ni crean aceptaciones desde backoffice.
5. Acción afirmativa con casillas sin preselección y botón explícito. Términos y
   anexo se identifican como contrato; privacidad/autorización personal se separan.
   No incluir publicidad obligatoria ni inferir aceptación del uso del sistema.

## Autoridad y modelo aceptados

Nueva frontera dedicada `saas-legal`, sin ampliar exports de `saas-commercial`
ni facultades de operadores. Dos callables: `consultarEstadoLegalTenant`
y `aceptarDocumentosLegalesTenant`. Ambas exigen sesión válida y contexto tenant
revalidado; la aceptación exige membresía admin activa y representación declarada.
Reutilizar el verificador canónico de sesión/credencial y su revocación vigente.

Persistencia separada del snapshot, bajo:
`empresas/{empresaId}/aceptacionesLegales/{aceptacionId}`.
Registro append-only con `schemaVersion`, tenant, UID, relación contractual,
declaración de representación, bundle y versiones/hashes de documentos,
`aceptadoEn` de servidor y correlación. ID determinista por tenant, relación,
UID y bundle; un retry idéntico devuelve el mismo recibo. Una aceptación de otro
admin genera evidencia propia. No sobrescribir el historial ni aceptar versiones
desconocidas u obsoletas. Autorizaciones personales usan registros distintos
vinculados al titular y finalidades, con revocaciones registradas por separado.

Catálogo legal aprobado empaquetado y versionado en el servidor; SHA-256 de bytes
UTF-8 con LF, generados desde una única fuente y sin reconstruir textos desde HTML.
El cliente envía identificadores, no contenido, hashes o fecha autoritativos.
La transacción revalida relación, autoridad y bundle antes de guardar y emitir
recibo descargable. Aceptar no modifica plan, importe, Trial o vencimientos.

Rules deniegan lectura/escritura directa de registros legales; consulta mediante
callable limitada a lo necesario. Admin SDK exige los controles propios porque
omite Rules. Nunca almacenar PIN, tokens o contraseñas en evidencia. No recolectar
IP/UA por defecto: justificar por finalidad y retención si se propone después.

## Exigibilidad y clientes existentes

Separar `PUBLICADO` de `EXIGIBLE`; no inferir ninguno de estar en Git. Primero
desplegar backend compatible y documentos. Activar exigibilidad en operación
posterior autorizada con versiones, población afectada y fecha identificadas.

Para altas nuevas, aceptación previa a habilitar operaciones de negocio. En
clientes existentes, comunicar antes y acordar fecha/transición; no bloquear
silenciosamente a Diana ni marcar aceptación por ella. La pantalla de rechazo
mantiene consulta de documentos, soporte, cierre de sesión y solicitud de salida.
El rechazo no cancela automáticamente la suscripción ni elimina información.

Un guard React orienta el flujo, pero no es la autoridad: el enforcement debe
comprobarse en los comandos y lecturas protegidas y Rules según el alcance que
se declare exigible. No activar un bloqueo global con protección solo visual.
Antes de exigirlo, inventariar todos los consumidores y demostrar que no hay
acceso alternativo; no ampliar esta regla a otro dominio por accidente.

## Pruebas y aceptación

- Documentos públicos accesibles, legibles en móvil/PC y descargables sin login;
  versión/huella corresponden exactamente con la fuente archivada.
- Denegar anónimo, vendedor, marketing, operador plataforma, sesión revocada,
  tenant distinto y membresía inactiva; nunca usar empresa o UID del payload
  como autoridad.
- Validar tamaño/esquema, representación afirmativa, bundle y relación vigentes;
  probar carreras de versión/contrato y retry concurrente sin duplicación.
- Fechas de servidor, historial inmutable, Rules denegatorias y recibo verificable.
- Login, activación, recuperación, logout, soporte y consulta pública no entran en
  bucles. Probar error de red, nueva versión y rechazo sin aceptación falsa.
- Compatibilidad: cero cambios en contrato, Trial, datos comerciales y permisos.
- Publicación sin enforcement no certifica aceptación; enforcement requiere su
  inventario completo, pruebas Emulator y smoke con identidad autorizada.

## Dependencias, riesgos y recuperación

Textos finales, representación, conservación, inventario de proveedores y proceso
de salida deben resolverse antes de exigirlos. El nuevo codebase y Rules requieren
PR, preflight y autorización operativa; este ADR no los despliega.
La evidencia contiene datos personales: aprobar retención y acceso antes de crearla.

La [propuesta operativa](docs/legal/OPERACION-Y-CONSERVACION.md) documenta el backup
real de 35 días, regiones y mecanismos comprobados. Identifica como dependencia
no implementada la exportación completa de tenant y no la absorbe en este ADR.
La aceptación de esta arquitectura no convierte los textos en versión final.
Las condiciones materiales pendientes se conservan. No se promete que una huella
o UID demuestre por sí solo validez jurídica plena.

Rollback: desactivar únicamente exigibilidad mediante mecanismo autorizado,
mantener documentos, recibos y lectores compatibles. No borrar aceptaciones ni
reabrir escrituras directas. Conservar los contratos previos sin alteración.

Referencias: [revisión normativa](docs/legal/REVISION-2026-11.md),
[borradores](docs/legal/README.md), ADR-SAAS-028/029.
