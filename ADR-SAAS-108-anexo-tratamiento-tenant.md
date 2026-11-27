# ADR-SAAS-108 — Anexo de tratamiento específico por tenant

## Estado

**Aceptado para implementación controlada**, 2026-11-27, por decisión técnica
delegada expresamente por el responsable. Se selecciona la alternativa A.
`G-SAAS-02 → M2 → E2.2`.

Esta propuesta habilitaría implementar y probar con datos sintéticos en Emulator/staging. No autoriza publicación de documentos, aceptación real, tratamiento de datos reales, exportación ni despliegue productivo.

## Contexto

El anexo v0.6 declara que cada negocio debe completar y verificar la ficha de tratamiento antes de aceptar: identidad y representación, contacto, titulares/categorías, instrucciones, módulos, subencargados y regiones, controles, y condiciones de devolución/supresión.

El servicio de aceptación actual vincula el recibo a un bundle estático y a un snapshot comercial. No captura ni versiona la ficha específica del negocio. El bundle está en `PREPARACION`, por lo que la aceptación está bloqueada hoy; publicar el bundle sin resolver esa diferencia permitiría aceptar un anexo incompleto según el propio documento.

ADR-SAAS-099 establece recibos append-only con documentos y condiciones comerciales hasheadas. Este ADR define cómo adjuntar a esa evidencia un anexo que incluya solo hechos e instrucciones verificadas. La designación de un contacto para autorizar exportaciones de ADR-SAAS-107 es una finalidad separada y no se deriva de esta aceptación.

## Decisión requerida

Definir la fuente de verdad y la evidencia inmutable del anexo de tratamiento aplicable a cada tenant en el momento de aceptarlo.

## Alternativas

### A. Snapshot tenant-específico ligado al recibo — recomendada

Antes de aceptar, el servidor genera una vista del anexo con un esquema versionado. Los valores comunes se obtienen de un registro versionado de proveedores, ubicaciones, categorías y controles de Dusema; los del tenant se obtienen de sus datos verificados y de instrucciones declaradas por un administrador activo. Campos obligatorios ausentes o sin fuente bloquean la aceptación.

El backend muestra esa proyección exacta y, al confirmar, guarda en el recibo append-only la versión y huella SHA-256 canónica del snapshot aceptado. No se guardan documentos de identidad ni copias de evidencia sensible. Una modificación posterior crea otro snapshot y exige nueva aceptación; nunca altera recibos anteriores. Rules siguen denegando acceso directo y la consulta/aceptación pasan por Functions autorizadas.

No se admite texto libre del operador como sustituto de verificación. Los módulos y el plan no se convierten automáticamente en instrucciones del responsable; el administrador debe confirmar las finalidades e instrucciones específicas cuando el esquema lo exija.

### B. Archivo de anexo firmado fuera del POS

Una persona operadora completa un documento y el recibo guarda una referencia opaca y su hash. Evita ampliar el formulario, pero añade carga, almacenamiento, control de acceso y expiración de archivos; el sistema no puede reconstruir ni validar que sus campos coinciden con el tenant o la versión de proveedores. Mantiene un paso manual difícil de auditar.

### C. Mantener un anexo estático genérico

Eliminar la ficha por tenant y conservar un documento común. Reduce cambios técnicos, pero contradice las obligaciones que el propio borrador v0.6 establece y no registra las instrucciones y alcance de cada responsable. No satisface el requisito actual.

## Recomendación y consecuencias

Se recomienda A porque preserva la aceptación electrónica dentro del POS y permite demostrar exactamente qué anexo vio y aceptó cada administrador sin almacenar documentos de identidad.

La implementación requiere definir un esquema mínimo, sus fuentes verificables y un catálogo versionado de subencargados/regiones y retención; separar valores de Dusema de instrucciones del negocio; añadir lectura/validación server-side y recibo compatible con las versiones históricas; y probar fallos cerrados, integridad, repetición e aislamiento multiempresa. Debe conservarse cualquier recibo anterior sin reinterpretarlo.

El proceso no autoriza a inferir tarifas, impuestos, representación legal, instrucciones, transferencias internacionales ni plazos de respaldo. Los hechos comerciales —incluida la inclusión de impuestos en los precios— y la revisión contractual/jurídica deben validarse por sus responsables antes de publicar el bundle.

## Validación prevista si se aprueba

Fixtures sintéticos para: perfil/fuente incompleta, contacto no verificado, instrucción faltante, subencargado o región con versión distinta, tenant equivocado, cambio del snapshot, hash alterado, reintento idempotente, aceptación anterior y aislamiento. En staging solo se prueba con tenant sintético, sin proveedor de correo real ni envío externo. Antes de cualquier publicación se requiere revisión jurídica y factual del formulario renderizado.

## Límites de la propuesta

La aprobación de este ADR habilita implementar y probar la ficha versionada y
su snapshot con datos sintéticos en Emulator/staging. No publica el bundle, no
registra una aceptación de cliente real, no habilita proveedores, no autoriza
lectura/exportación/supresión de datos reales y no permite cambios de
producción. Los hechos no verificados deben bloquear la aceptación y esos pasos
conservan sus gates independientes. La evidencia de implementación controlada
está en
[RESULTADO ADR-107/108](docs/legal/evidence/RESULTADO-ADR107-108-IMPLEMENTACION-CONTROLADA-2026-11-27.md).
