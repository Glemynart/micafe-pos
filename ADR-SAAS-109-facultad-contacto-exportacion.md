# ADR-SAAS-109 — Facultad para administrar el contacto de exportación

## Estado

**Aceptado para implementación controlada y validación sintética**, 2026-11-28,
por decisión técnica delegada expresamente por el responsable en la misión de
cierre legal. Se selecciona la alternativa A.
`G-SAAS-02 → M2 → E2.2`.

Este ADR desarrolla el gate de facultades de ADR-SAAS-107. No autoriza registrar
contactos reales, emitir enlaces reales, elegir un proveedor, exportar datos,
desplegar en staging ni producción, ni cambiar IAM.

## Contexto

ADR-SAAS-106 y ADR-SAAS-107 aceptaron de forma controlada una autoridad del
representante versionada y una aprobación de exportación de un solo uso. El
dominio y el repositorio de la autoridad de contacto ya existen y tienen pruebas
synthetic/Emulator. `functions-legal` todavía no expone operaciones para
designar, verificar, consultar o revocar el contacto, y Backoffice no tiene la
pantalla operativa.

La autorización de exportación requiere `CONSERVACION_GOBERNAR`; esa facultad
también controla archivo, restauración y eliminación de tenants. Por separado,
`PRIVACIDAD_CONSULTAS_TRAMITAR` y `PRIVACIDAD_RECLAMOS_TRAMITAR` atienden
expedientes de titulares. Reutilizar cualquiera para administrar el contacto de
exportación ampliaría silenciosamente su significado.

Sin una facultad definida, no se debe añadir una callable que acepte evidencia
libre o una dirección seleccionada por el operador. El flujo real debe continuar
fail-closed.

## Decisión

Definir el permiso mínimo, su auditoría y las condiciones de acceso para que
operadores de plataforma administren la autoridad de contacto exigida por
ADR-SAAS-107, sin conferirles por ello autorización para ejecutar una
exportación o suprimir datos.

## Alternativas

### A. Facultad dedicada `EXPORTACION_CONTACTO_GOBERNAR` — recomendada

Agregar una facultad de plataforma independiente para iniciar la designación,
consultar su estado y revocarla. La verificación del canal ocurre solo mediante
un desafío de un solo uso. La facultad no se añade al conjunto de permisos
predeterminado; requiere asignación explícita, versiona sus claims y se revalida
en cada operación. Ejecutar una exportación continúa requiriendo
`CONSERVACION_GOBERNAR` y una autorización de exportación aprobada vigente, según
ADR-SAAS-106.

Ventaja: separa mantenimiento del contacto, gestión de expedientes y poder sobre
ciclo de vida/supresión. Coste: nueva facultad que debe añadirse a los contratos
de operadores, auditoría, Backoffice y pruebas de revocación.

### B. Reutilizar `CONSERVACION_GOBERNAR`

No agrega una facultad. Sin embargo, cualquier operador autorizado a archivar,
restaurar o eliminar tenants también podría cambiar la identidad que recibe
enlaces de exportación. La capacidad de administrar contactos se acopla al ciclo
de vida y supresión.

### C. Reutilizar facultades de consultas o reclamos de privacidad

Evita una facultad nueva, pero mezcla la administración de una autorización de
salida del negocio con expedientes de derechos individuales. Los operadores que
solo tramitan consultas o reclamos obtendrían autoridad para definir quién
puede recibir una exportación integral del tenant.

## Recomendación

Se adopta **A**. La separación reduce el alcance de cada facultad y mantiene
independientes la designación del representante, el tratamiento de casos de
titulares y la ejecución de exportaciones.

## Invariantes propuestas

- Solo un operador autenticado, activo y con
  `EXPORTACION_CONTACTO_GOBERNAR` vigente puede iniciar una designación o
  revocación; permisos de reclamos, consultas o ciclo de vida no bastan.
- El servidor determina proyecto y tenant; la UI no puede trasladar la operación
  a otro tenant.
- La designación se resuelve desde una referencia verificable del negocio; no
  se aceptan correo, teléfono, nombre o identidad como prueba solo porque un
  operador los escribió.
- La activación exige prueba de control del canal con desafío aleatorio de un
  solo uso, hash en persistencia, expiración máxima de diez minutos, consumo
  atómico y revocación/versionado.
- Destino, token, documento de identidad y contenido de la instrucción no se
  almacenan en los registros de auditoría. Los registros de autoridad y eventos
  son append-only según ADR-SAAS-107.
- La nueva facultad no se incorpora a `FACULTADES_BOOTSTRAP_POR_DEFECTO`.
- El adaptador de entrega continúa como stub sintético hasta aprobar y validar
  por separado un proveedor real.
- El exportador exige además `CONSERVACION_GOBERNAR`, la instrucción y la
  aprobación de un solo uso de ADR-SAAS-106. Administrar el contacto no equivale
  a aprobar una exportación.
- Pruebas cubren permiso ausente/revocado, tenant o proyecto incorrecto,
  referencia no verificable, expiración, replay, doble consumo, reemplazo de
  versión, revocación, aislamiento y ausencia de PII/token en logs.

## Alcance aceptado

La aceptación permite implementar la facultad, las callables y la pantalla de
Backoffice con fixtures sintéticos, stub de entrega y pruebas Emulator. No
habilita contacto real, envío real, exportación, supresión, cambio IAM ni
producción. Cualquier despliegue en staging requiere preflight y autorización
operativa específica.

## Referencias

- [ADR-SAAS-106 — autorización de exportación por tenant](ADR-SAAS-106-autorizacion-exportacion-tenant.md).
- [ADR-SAAS-107 — fuente verificable del representante](ADR-SAAS-107-contacto-representante-tenant.md).
- `functions/src/legal/contact-authority.ts`.
- `functions/src/platform/contracts.ts`.
