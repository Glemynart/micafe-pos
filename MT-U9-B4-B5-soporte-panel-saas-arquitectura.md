# MT-U9 — U9-B4 y U9-B5: soporte, impersonación y Panel SaaS

> **Estado:** especificación arquitectónica aprobada.
> **Alcance:** U9-B4, soporte e impersonación; U9-B5, Panel SaaS.  
> **Precondición:** U9-B0, U9-B1, U9-B2 y U9-B3 aprobados. Este documento solo los aplica.  
> **Fuera de alcance:** U9-B6, MT-U10, MT-U11, MT-U12 y toda implementación.

---

# Parte I — U9-B4: soporte e impersonación

## B4.1 Propósito y límite

U9-B4 define la excepción controlada por la cual una persona de plataforma puede asistir a una Empresa sin convertirse en miembro tenant ni recibir acceso operativo permanente. Esta excepción existe porque el Maestro permite operar un restaurante solo mediante membresía explícita o impersonación separada y auditada.

B4 no crea una facultad permanente adicional, un nuevo tipo de operador, un rol tenant, un cambio de tenant activo, una Membresía, un claim tenant ordinario ni una vía de administración directa. La autorización de soporte es una concesión excepcional, limitada a una solicitud y objetivo concretos, y no modifica las facultades B0/B1 del operador.

## B4.2 Modelo conceptual de soporte

El soporte se compone de tres elementos conceptuales, ninguno de los cuales sustituye una autoridad existente:

| Elemento | Propósito | Límite |
|---|---|---|
| Solicitud de soporte | Expone una necesidad concreta asociada a una Empresa y su justificación. | No concede acceso ni crea contexto tenant. |
| Autorización de soporte | Acepta o rechaza de forma explícita una solicitud, con alcance y duración acotados. | No es una facultad B0/B1, Membresía ni permiso reusable. |
| Sesión de soporte | Materializa temporalmente la autorización aprobada para el único objetivo permitido. | No se convierte en sesión tenant ordinaria, no persiste al vencer/revocar y no habilita operación POS. |

La sesión de soporte conserva dos atribuciones conceptuales: el operador de plataforma que actúa y la Empresa objetivo. No simula que el operador sea el usuario tenant ni oculta su identidad de plataforma.

## B4.3 Principios de impersonación

La impersonación es una forma de sesión de soporte temporal que permite observar el contexto autorizado de una Empresa para diagnosticar una incidencia. No es una membresía encubierta ni un mecanismo de cambio de tenant del usuario.

1. **Separada:** existe fuera de claims tenant ordinarios y fuera de `membresias/{empresaId}_{uid}`.
2. **Explícita:** requiere solicitud, autorización, motivo, alcance, Empresa objetivo y duración definidos antes de empezar.
3. **Mínima:** el alcance inicial es diagnóstico de solo lectura, limitado a los datos necesarios para la incidencia autorizada.
4. **Temporal y revocable:** finaliza al vencer el alcance, completarse el objetivo o revocarse la autorización; no puede renovarse silenciosamente.
5. **Atribuible:** toda acción o consulta cubierta conserva el actor de plataforma y la relación con la autorización de soporte; nunca se atribuye falsamente a un cajero, admin u otro usuario tenant.
6. **No operativa por defecto:** ventas, caja, inventario, fiscalidad, configuración, membresías tenant, lifecycle tenant, comandos POS y modificaciones operativas quedan prohibidos dentro de la impersonación.

Si una intervención requiere operar un restaurante o modificar datos tenant, el operador debe tener la Membresía tenant explícita que ya exige el Maestro, y actuar bajo la autorización tenant/lifecycle aplicable. B4 no ofrece un atajo a esa condición.

## B4.4 Fronteras plataforma ↔ tenant y operador ↔ soporte

### Plataforma ↔ tenant

- El `empresaId` de una solicitud identifica el objetivo de soporte; no crea un tenant activo libre ni permite navegar a otras Empresas.
- La sesión se limita a una única Empresa y a un alcance explícito. No autoriza consultas transversales ni acceso a colecciones no necesarias.
- Los datos tenant conservan el aislamiento de ADR-SAAS-001. El soporte no transforma datos tenant en datos globales de plataforma.
- Soporte no puede acceder a una Empresa distinta por similitud de incidente, pertenencia del usuario o rol de plataforma.

### Operador ↔ soporte

- Ser operador no inicia, renueva ni amplía una sesión de soporte.
- Una autorización de soporte no asigna ni modifica facultades B0/B1 del operador.
- El operador sigue sujeto a las restricciones de su perfil B1 durante soporte; soporte no crea un “superadmin”.
- El soporte no se usa para cumplir una operación administrativa B2 que ya puede resolverse mediante su comando canónico, ni un comando B2 se usa para obtener soporte implícito.

## B4.5 Requisitos de autorización y consentimiento

Una sesión de soporte solo es admisible si concurren todas estas condiciones:

1. el solicitante y la Empresa objetivo están identificados de manera verificable;
2. el operador posee identidad Auth y pertenencia canónica de plataforma activa;
3. la necesidad no puede resolverse por una consulta mínima de plataforma o por un comando B2 sin acceso tenant;
4. la autorización identifica una sola Empresa, motivo, alcance de datos, tiempo de inicio y expiración, y condición de revocación;
5. el lifecycle de la Empresa admite el acceso solicitado; y
6. existe una base de autorización documentada.

La base de autorización puede ser consentimiento explícito del responsable tenant cuando éste corresponda por la relación con el cliente, la política aplicable o la naturaleza de la solicitud. Cuando el consentimiento sea la base, debe ser específico para la Empresa, alcance y duración, y puede revocarse antes o durante la sesión. B4 no fija una política legal universal ni presume consentimiento para soporte.

Una autorización por plataforma motivada por seguridad, conservación legal o lifecycle no elimina los límites de alcance, necesidad, duración, atribución y auditoría; su base debe quedar igualmente documentada. B4 no decide qué políticas legales o comerciales permiten tales casos.

## B4.6 Restricciones de acceso y operaciones

### Permitidas dentro de una sesión autorizada

- Diagnóstico de solo lectura sobre el mínimo contexto tenant incluido explícitamente en el alcance.
- Verificación de estado canónico, lifecycle, configuración de acceso y evidencia necesaria para resolver la incidencia, sin reconstruir ni modificar hechos históricos.
- Finalización o revocación de la sesión antes de la expiración.

### Prohibidas dentro de una sesión autorizada

- Crear, modificar o desactivar Membresías, incorporaciones, credenciales, PIN, Firebase Auth o claims tenant.
- Crear o cambiar Empresa, Plan, Suscripción, configuración tenant, espacios, numeraciones o asignaciones.
- Confirmar, anular, reimprimir o modificar ventas; consumir numeración; editar snapshots; modificar inventario, ledger, tesorería, turnos, caja, reservas o pedidos.
- Ejecutar comandos administrativos B2 en nombre del tenant, o utilizar B2 para ampliar el alcance de soporte.
- Cambiar a otra Empresa, delegar la sesión, compartirla, reusarla para otro incidente o prolongarla sin una nueva autorización explícita.
- Acceder a secretos, tokens, PIN, credenciales fiscales, datos de pago o PII que no sea indispensable para el diagnóstico autorizado.

La exportación de una Empresa cancelada sigue siendo una operación controlada de conservación B2; no se convierte en acceso de soporte ni en lectura general por esta sesión.

## B4.7 Lifecycle y datos históricos

- En `trial` o `activa`, soporte puede existir solo bajo el alcance B4 y conserva la prohibición de escritura operativa.
- En `suspendida`, B4 no amplía la lectura administrativa propia de owner/admin ni habilita POS; una sesión de soporte sigue necesitando autorización separada.
- En `cancelada`, no existe acceso interactivo ordinario. B4 no convierte soporte en excepción a esa regla; cualquier necesidad legítima sigue el flujo controlado de exportación/conservación que corresponda.
- En `archivada`, el Maestro reserva acceso a plataforma o soporte autorizado. B4 define la ruta de soporte autorizada, manteniendo necesidad, alcance, duración y evidencia; no habilita operación tenant.
- En `eliminada`, no hay sesión de soporte ni acceso a datos.

Soporte nunca altera lifecycle, Suscripción, Bootstrap, Snapshot fiscal, estado operativo, ledger o cualquier evidencia histórica. El estado de la Empresa y las reglas de retención continúan siendo autoridad.

## B4.8 Trazabilidad y relación con B3

B4 utiliza el modelo global, append-only y no autorizante de B3; no define un segundo sistema de auditoría. Los hechos de soporte que deben producir evidencia B3 son:

- solicitud creada, rechazada, autorizada, revocada, expirada, iniciada y finalizada;
- alcance aprobado, cambio de alcance rechazado y acceso fuera de alcance denegado;
- base de autorización declarada, incluida la referencia mínima al consentimiento cuando sea aplicable;
- consultas o acciones diagnósticas de alto riesgo dentro del alcance, sin registrar payloads tenant completos.

Cada evidencia conserva la relación entre operador, Empresa referenciada, autorización de soporte, sesión, motivo, alcance, tiempo servidor y resultado. La evidencia no es la autorización de soporte, no mantiene una sesión revocada ni concede posterior acceso tenant.

## B4.9 Riesgos arquitectónicos

| Riesgo | Consecuencia | Control B4 |
|---|---|---|
| Impersonación tratada como Membresía. | Escalamiento permanente u operación tenant no atribuible. | B4.1, B4.2 y B4.3. |
| Operador abre soporte sin autorización concreta. | Acceso cross-tenant o abuso de privilegio. | B4.4 y B4.5. |
| Sesión se prolonga o reutiliza. | Acceso persistente fuera de necesidad. | B4.3, B4.5 y B4.6. |
| Soporte modifica fiscalidad u operación. | Ruptura de snapshots, ledger y evidencia histórica. | B4.3, B4.6 y B4.7. |
| Consentimiento supuesto o demasiado amplio. | Acceso no justificado a datos tenant. | B4.5. |
| Auditoría usada como token de soporte. | Revocación inefectiva o acceso persistente. | B4.8 y B3.8. |
| Soporte usado para empresa cancelada/eliminada. | Violación de lifecycle y conservación. | B4.7. |

## B4.10 Criterios de aceptación

U9-B4 está completo solo si:

1. Soporte e impersonación son temporales, explícitos, mínimos, revocables y separados de Membresías, claims tenant y facultades permanentes.
2. Toda sesión identifica una Empresa única, necesidad, alcance, duración y base de autorización; no existe consentimiento implícito.
3. La impersonación solo permite diagnóstico de lectura bajo alcance autorizado; las acciones operativas requieren Membresía tenant explícita y sus controles ordinarios.
4. Ninguna sesión modifica lifecycle, comercial, Bootstrap, fiscalidad, snapshots, ledger, tesorería ni estado operativo.
5. Las restricciones respetan la matriz de lifecycle y no convierten cancelación, archivo o exportación en acceso tenant general.
6. Los hechos de soporte usan la evidencia B3 sin convertir auditoría en autorización ni registrar secretos/PII innecesaria.
7. B4 no crea operadores, facultades, comandos administrativos, panel, consumo/límites, cambio de tenant o Electron.

**Cierre de B4:** con el soporte separado del modelo tenant y de las facultades permanentes, B5 puede exponer sus estados y solicitudes como proyección, sin ser una autoridad de soporte ni de dominio.

---

# Parte II — U9-B5: Panel SaaS

## B5.1 Propósito y límite

El Panel SaaS es la superficie conceptual del plano plataforma que presenta contexto, solicita operaciones autorizadas y muestra sus resultados/evidencias. No es un agregado de dominio, no almacena autoridad, no evalúa decisiones finales y no reemplaza Firebase Auth, `saas_operadores`, Empresa, Plan, Suscripción, lifecycle, B2, B3 ni B4.

El Panel aplica el principio de seguridad del Maestro: la interfaz comunica y reduce acciones inválidas, pero no es una barrera de seguridad. Toda autorización y mutación se resuelven fuera de la superficie, mediante los contratos canónicos ya establecidos.

## B5.2 Responsabilidades del Panel SaaS

| Responsabilidad | Relación canónica | Límite |
|---|---|---|
| Resolver contexto de plataforma | Identidad Auth y pertenencia/facultades canónicas del Operador. | No deriva facultades desde UI, rol tenant o datos visibles. |
| Presentar estado de plataforma | Planes, Operadores, evidencias B3 y estado mínimo de Empresa/Suscripción necesario para una facultad. | No transforma datos tenant en datos globales ni crea acceso operativo. |
| Solicitar comandos administrativos | B2 y el agregado canónico correspondiente. | No confirma, reintenta con otra intención ni escribe directamente agregados. |
| Presentar evidencia y resultado | B3, estado resultante y correlación del comando. | No usa auditoría como autorización ni reconstituye estado desde eventos. |
| Gestionar solicitudes/sesiones de soporte como proyección | B4 y evidencia B3. | No concede soporte, cambia alcance, prolonga sesión ni crea contexto tenant. |
| Comunicar restricciones de lifecycle/comercial | `Empresa.estado`, Suscripción y sus contratos. | No decide transiciones ni regulariza acceso por interfaz. |

## B5.3 Capacidades permitidas

El Panel puede, según la facultad B0/B1 canónica del operador:

- exponer los recursos globales de plataforma necesarios para la facultad asignada;
- mostrar el estado canónico mínimo de Empresa, Plan, Suscripción, lifecycle y conservación necesario para preparar una intención B2;
- solicitar comandos B2 válidos y mostrar su resultado, conflicto, rechazo o estado durable;
- mostrar evidencia B3 correlacionada con acciones de plataforma, sin usarla como fuente de estado;
- presentar solicitudes, autorizaciones y sesiones B4 dentro de las restricciones ya aprobadas;
- reflejar que una acción no está disponible por falta de facultad, estado empresarial, revisión, retención o condición comercial.

Estas capacidades no implican diseño de rutas, pantallas, componentes, datos de presentación ni implementación de la interfaz.

## B5.4 Capacidades prohibidas

El Panel no puede:

- asignar facultades, ejecutar lifecycle, mutar Plan/Suscripción, conservar/eliminar datos o iniciar soporte por decisión propia; solo puede solicitar el proceso canónico aplicable;
- tratar una facultad visible, un claim, una evidencia o una respuesta previa como autorización final;
- crear una Membresía, seleccionar Empresa activa, cambiar tenant, abrir POS o actuar como usuario operativo;
- permitir edición de Configuración, fiscalidad, Numeraciones, Asignaciones, ventas, snapshots, ledger, tesorería, inventario, caja, turnos, reservas, pedidos o datos históricos tenant;
- habilitar soporte/impersonación sin autorización B4 o ampliar una sesión B4 desde la superficie;
- presentar datos de consumo/límites, multiempresa de usuario o Electron como capacidades de MT-U9;
- retener secretos, tokens, PIN, credenciales fiscales o PII innecesaria en sus proyecciones.

## B5.5 Relación con operadores y autorización

El Panel es consumidor de la decisión B1.5:

```text
identidad técnica + pertenencia canónica de operador + facultad explícita
        + alcance B0/B1 + operación admisible del agregado
        = decisión externa al Panel
```

El Panel no amplía perfiles, no combina facultades para crear un superadmin, no reemplaza una revocación canónica ni usa un claim de plataforma como única fuente de verdad. Una sesión de operador sin facultad, una membresía tenant o un `ownerUid` no habilitan capacidades del Panel.

## B5.6 Relación con comandos, auditoría y soporte

### Comandos B2

El Panel prepara y solicita una intención B2, pero el comando conserva identidad, idempotencia, revisión esperada, actor, motivo y correlación. El Panel no reescribe la carga, no realiza last-write-wins, no fusiona comandos comercial/lifecycle y no ejecuta comandos fiscales u operativos.

### Auditoría B3

El Panel puede proyectar evidencia B3, siempre como prueba posterior al hecho. No puede crear evidencia anticipada, editarla, borrarla, usarla para resolver permisos ni ocultar que un comando fue rechazado, entró en conflicto o fue revocado.

### Soporte B4

El Panel puede presentar el estado de una solicitud o sesión B4 y remitir una intención al proceso B4. No es la autorización de soporte, no mantiene la sesión, no crea el contexto tenant ni reemplaza la expiración, revocación, consentimiento o alcance definidos en B4.

## B5.7 Relación con lifecycle y comercial

- El Panel lee `Empresa.estado` y Suscripción como autoridades distintas; nunca deduce acceso empresarial desde el estado comercial.
- Las transiciones de lifecycle se solicitan únicamente mediante B2 y se confirman en el servicio canónico; el Panel no modifica la matriz de `trial`, `activa`, `suspendida`, `cancelada`, `archivada` o `eliminada`.
- La vista de Plan/Suscripción respeta inmutabilidad de versiones, grandfathering, trial, período, gracia y cancelación, sin definir precios, pasarela, consumo o límites.
- Archivo, restauración, eliminación y exportación se presentan solo como operaciones B2 de conservación; el Panel no las convierte en acceso interactivo o soporte.

## B5.8 Fronteras con el plano tenant

El Panel opera en el plano plataforma. Cuando muestra una Empresa o su Suscripción, lo hace como agregado objetivo de plataforma; no adquiere el contexto de sesión de esa Empresa.

- Los datos tenant siguen filtrados, aislados y gobernados por `empresaId`; el Panel no omite ni reemplaza esa frontera.
- La referencia a Empresa en una vista de plataforma no habilita lectura de sus ventas, fiscalidad, operación o datos personales.
- El Panel no muestra ni controla Branding, colores, POS o configuración visual de una Empresa como autoridad de plataforma; esos elementos permanecen en su Configuración tenant.
- Las únicas excepciones de consulta tenant son las mínimas y explícitamente autorizadas por B4 para diagnóstico; el Panel solo proyecta su estado, no concede la excepción.

## B5.9 Riesgos arquitectónicos

| Riesgo | Consecuencia | Control B5 |
|---|---|---|
| Panel tratado como autoridad. | Bypass de dominio, lifecycle o autorización. | B5.1, B5.2 y B5.5. |
| Vista de plataforma interpretada como acceso tenant. | Fuga cross-tenant o operación indebida. | B5.4 y B5.8. |
| UI interpreta Suscripción como acceso. | Reactivación o escritura fuera de lifecycle. | B5.7 y PLT-B0-04. |
| Panel inicia soporte sin B4. | Impersonación implícita o acceso no trazable. | B5.4 y B5.6. |
| Evidencia B3 se usa para permisos o estado actual. | Privilegios obsoletos o hechos mal reconstruidos. | B5.6 y B3.8. |
| Panel expone PII, secretos o evidencia fiscal. | Divulgación de información sensible. | B5.4, B5.8 y límites B0.3.4. |
| Panel adelanta U10–U12. | Expansión de alcance y nuevas autoridades. | B5.4 y B5.7. |

## B5.10 Criterios de aceptación

U9-B5 está completo solo si:

1. El Panel se define únicamente como consumidor/proyección y no como autoridad de dominio, autorización o tenant.
2. Toda capacidad visible depende de una decisión canónica B1 y toda mutación se solicita exclusivamente mediante B2.
3. B3 se presenta como evidencia posterior y B4 como estado/proceso separado; ninguno se convierte en permiso, sesión tenant o bypass de lifecycle.
4. El Panel conserva la separación entre plataforma, Empresa, Suscripción y datos operativos/fiscales tenant.
5. No habilita acceso POS, cambio de tenant, soporte implícito, edición de datos tenant, consumo/límites, multiempresa de usuario o Electron.
6. Lifecycle, comercial, conservación y retención se muestran y solicitan conforme a sus autoridades canónicas, sin interpretación propia del Panel.
7. La superficie no retiene ni expone secretos, tokens, PIN, credenciales fiscales o PII innecesaria.

**Cierre de B5:** con B4 y B5 aprobados, el único bloque pendiente de MT-U9 es B6 de certificación; B5 no adelanta esa certificación ni ninguna unidad posterior.
