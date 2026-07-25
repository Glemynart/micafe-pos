# MT-U9 — U9-B6: certificación arquitectónica

> **Estado:** gate arquitectónico de cierre aprobado.
> **Precondición:** U9-B0, U9-B1, U9-B2, U9-B3, U9-B4 y U9-B5 aprobados.  
> **Naturaleza:** consolidación y verificación documental. No introduce autoridades, facultades, perfiles, comandos, procesos, agregados, flujos ni implementación.

## B6.1 Objetivo de la certificación

U9-B6 certifica que la arquitectura de MT-U9 puede avanzar a implementación sin contradicción interna ni desviación frente al Documento Maestro, ADR-SAAS-001→010, `MASTER-SECURITY-PLAN` y los contratos aprobados de B0–B5.

La certificación no confirma que exista una implementación, no diseña su forma ni sustituye sus validaciones futuras. Su resultado es una decisión documental: la arquitectura de plataforma, operadores, comandos, auditoría, soporte y Panel SaaS conserva las autoridades y fronteras aprobadas.

## B6.2 Alcance certificado

| Componente | Qué certifica B6 | Qué no certifica |
|---|---|---|
| B0 — Contratos e invariantes | Autoridades, facultades abstractas, fronteras y clasificación de datos. | Nuevos contratos o facultades. |
| B1 — Operadores | Perfiles, delegación, separación de funciones y decisión de autorización de plataforma. | Identidad tenant, nuevos roles o mecanismo técnico de sesión. |
| B2 — Comandos administrativos | Intenciones permitidas, pre/postcondiciones, idempotencia y límites de agregados. | Endpoints, Functions, APIs o transacciones. |
| B3 — Auditoría | Evidencia global, integridad, correlación, retención conceptual y separación de autorización. | Logs físicos, alertas, índices o reglas. |
| B4 — Soporte e impersonación | Excepción temporal, mínima, atribuible y separada de la Membresía. | Soporte operativo, UI, mecanismo de sesión o política legal nueva. |
| B5 — Panel SaaS | Panel como consumidor/proyección sin autoridad de dominio. | UI/UX, componentes, rutas, estado de frontend o rendimiento. |

Quedan expresamente fuera: implementación, pruebas funcionales, optimización, rendimiento, UI/UX, MT-U10, MT-U11 y MT-U12.

## B6.3 Componentes y dependencias certificadas

| Dependencia | Condición certificada para MT-U9 |
|---|---|
| Documento Maestro §§3–6 | Empresa es frontera de seguridad; claims, Rules, helper y consultas siguen siendo defensa en profundidad; los tres planos permanecen separados. |
| Documento Maestro §§10–12 | `Empresa.estado` gobierna acceso/conservación; Suscripción es comercial; la administración SaaS usa identidad y auditoría separadas. |
| ADR-SAAS-001 y 004 | Colecciones globales de plataforma no se confunden con datos tenant; recursos tenant mantienen `empresaId` y la empresa sigue siendo límite de aislamiento. |
| ADR-SAAS-002, 005 y 006 | Operador no es rol tenant, supervisor, usuario operativo ni Membresía; identidad y membresías no se reescriben desde plataforma. |
| ADR-SAAS-003 y 009 | Comercial y lifecycle son ciclos separados; las transiciones pasan por la autoridad y servicio canónicos. |
| ADR-SAAS-007 | B2/B4/B5 no crean Empresa fuera de Bootstrap ni cambian progreso de provisionamiento. |
| ADR-SAAS-008 y 010 | MT-U9 no modifica numeraciones, asignaciones, ventas, snapshots, estado operativo, ledger ni tesorería. |
| MASTER-SECURITY-PLAN | Autoridad servidor, deny-by-default, mínimo privilegio, auditoría sin secretos/PII, y cumplimiento/retención permanecen como límites. |
| B0–B5 | B6 no reabre autoridades, facultades, perfiles, comandos, evidencia, soporte o rol del Panel. |

## B6.4 Invariantes obligatorias de MT-U9

La implementación solo es arquitectónicamente conforme si preserva, como mínimo, estas invariantes ya aprobadas:

| Área | Invariantes que deben preservarse |
|---|---|
| Plataforma ↔ tenant | PLT-B0-01, PLT-B0-02, PLT-B0-05, PLT-B0-08 y PLT-B0-09. |
| Lifecycle y comercial | PLT-B0-03, PLT-B0-04, OPR-B1-05 y OPR-B1-06. |
| Operadores | OPR-B1-01 a OPR-B1-04, OPR-B1-07 a OPR-B1-09. |
| Comandos | Precondiciones B2.3; idempotencia/concurrencia B2.6; restricciones B2.7–B2.9. |
| Auditoría | B3.5–B3.9: evidencia posterior, append-only, no autorizante y sin secretos/PII innecesaria. |
| Soporte e impersonación | B4.3–B4.8: excepcional, temporal, revocable, de alcance mínimo y no operativo por defecto. |
| Panel SaaS | B5.1, B5.4–B5.8: consumidor/proyección, sin autoridad, acceso tenant implícito ni mutación directa. |
| Fiscalidad y operación | PLT-B0-06, B2.9, B4.6/B4.7 y B5.4/B5.8. |
| Límites de programa | PLT-B0-11, OPR-B1-10 y las exclusiones B2–B5 de MT-U10, MT-U11, MT-U12 y B6. |

## B6.5 Fronteras arquitectónicas que la implementación debe preservar

1. **Plataforma ↔ tenant:** una facultad o vista de plataforma no crea tenant activo, Membresía ni acceso operativo. Una referencia a Empresa sirve para identificar un agregado objetivo, no para eludir aislamiento.
2. **Operador ↔ autoridad:** Auth, `saas_operadores`, perfil B1, claim proyectado y evidencia B3 no son intercambiables; cada uno conserva su responsabilidad.
3. **Comercial ↔ lifecycle:** Suscripción no autoriza acceso y no reactiva Empresa automáticamente; el lifecycle mantiene su máquina y servicio canónicos.
4. **Comando ↔ agregado:** el comando expresa intención; el agregado y proceso canónico confirman el estado. No existe escritura administrativa paralela.
5. **Auditoría ↔ autorización:** evidencia no concede, mantiene ni revoca facultades, ni sustituye estados canónicos.
6. **Soporte ↔ Membresía:** soporte es excepcional y temporal; no es una vía para operar tenant. Operación tenant requiere Membresía explícita y controles ordinarios.
7. **Panel ↔ dominio:** el Panel solicita y proyecta; no decide, confirma, persiste autoridad ni reconstituye estado desde evidencia.
8. **Plataforma ↔ fiscalidad/operación:** MT-U9 no altera numeraciones, asignaciones, ventas, snapshots, estado operativo, ledger, tesorería ni hechos históricos.
9. **MT-U9 ↔ unidades posteriores:** consumo/límites, multiempresa de usuario y Electron quedan fuera, respectivamente, en MT-U10, MT-U11 y MT-U12.

## B6.6 Requisitos mínimos de conformidad arquitectónica

Una propuesta de implementación de MT-U9 es conforme solo si entrega evidencia documental trazable de que:

- cada capacidad de plataforma se vincula a una facultad B0 y a un perfil B1 admisible;
- toda intención mutante se clasifica en B2 y llega al agregado/proceso canónico sin acceso directo alternativo;
- toda acción sensible tiene una evidencia B3 posterior al hecho y no autorizante;
- soporte/impersonación cumple B4 o permanece ausente; no puede aparecer como consecuencia de un rol, pantalla o claim ordinario;
- el Panel cumple B5 como proyección/solicitud y no como autoridad;
- el acceso y las transiciones respetan lifecycle, comercial, Bootstrap, fiscalidad, snapshots y estado operativo existentes;
- no se exponen secretos, PIN, tokens, credenciales fiscales ni PII innecesaria en solicitudes, evidencia, soporte o proyecciones;
- no se introduce un agregado, autoridad, facultad, perfil, comando o flujo fuera de B0–B5 sin una revisión arquitectónica previa.

La evidencia de conformidad es de arquitectura: matriz de trazabilidad entre artefactos implementados y contratos aprobados, y declaración de las exclusiones preservadas. B6 no prescribe suites, emuladores, pruebas funcionales, métricas de rendimiento ni validación de UI.

## B6.7 Condiciones de aprobación de una implementación

La implementación queda apta para aprobación arquitectónica cuando se demuestre que:

1. no modifica las fuentes de autoridad canónicas ni crea duplicados;
2. no transforma datos tenant en globales ni permite a un operador elegir libremente un tenant;
3. no convierte al operador, Panel, auditoría o soporte en superusuario tenant;
4. no altera la separación Empresa/Suscripción ni las transiciones existentes;
5. no introduce comandos fiscales u operativos, ni mutaciones directas de los agregados protegidos;
6. no permite que evidencia B3 sea permiso, estado o token de soporte;
7. no habilita soporte sin las condiciones B4, ni permite impersonación operativa por defecto;
8. no usa el Panel como control de seguridad definitivo;
9. no cruza los límites de MT-U10, MT-U11, MT-U12 o B6; y
10. mantiene las exclusiones, riesgos y dependencias declarados en B0–B5.

Esta aprobación es estrictamente arquitectónica. No certifica que el software esté desplegado, sea completo, tenga determinada experiencia visual o cumpla objetivos de rendimiento.

## B6.8 Criterios de rechazo de una implementación

Debe rechazarse arquitectónicamente cualquier implementación que incurra en al menos una de estas condiciones:

| Criterio de rechazo | Motivo |
|---|---|
| Agrega un rol/plataforma dentro de Membresías o deriva facultad plataforma desde `admin`, `supervisor`, `ownerUid`, `usuarios` o claim tenant. | Duplica autoridad y rompe separación plataforma↔tenant. |
| Permite a un operador o Panel usar `empresaId` como contexto tenant libre, o acceder a datos tenant por el rol de plataforma. | Viola tenancy de ADR-SAAS-001. |
| Escribe `Empresa.estado`, Plan, Suscripción o conservación sin respetar su agregado, revisión, transición e idempotencia. | Elude lifecycle/comercial canónicos. |
| Permite que Suscripción active/reactive acceso empresarial automáticamente. | Confunde relación comercial con lifecycle. |
| Crea/modifica configuración, fiscalidad, numeraciones, ventas, snapshots, estado operativo, ledger o tesorería desde MT-U9. | Invade autoridades fiscales/operativas e incumple ADR-SAAS-008/010. |
| Trata la auditoría como permiso, como fuente de estado o como evidencia editable/anticipada. | Rompe B3 y seguridad de trazabilidad. |
| Habilita soporte/impersonación permanente, reutilizable, sin alcance/expiración/revocación o con capacidad operativa por defecto. | Elude B4 y permite escalamiento. |
| Convierte el Panel en autoridad final, almacenamiento de permisos o canal directo de mutación. | Elude B1/B2/B5 y el principio de autoridad servidor. |
| Añade consumo/límites, selector multiempresa o convergencia Electron. | Amplía MT-U9 hacia MT-U10, MT-U11 o MT-U12. |
| Registra secretos, tokens, PIN, credenciales fiscales, payloads completos o PII innecesaria en auditoría/soporte/panel. | Incumple límites de seguridad y SEC-024. |

## B6.9 Riesgos arquitectónicos finales

| Riesgo residual | Límite de MT-U9 | Condición de preservación |
|---|---|---|
| Privilegio excesivo de plataforma | Perfiles/facultades explícitos y sin tenant implícito. | Mantener B0/B1/B6.4. |
| Fuga cross-tenant por soporte o Panel | B4 temporal y B5 no autoritativo. | No crear contexto tenant ni lectura transversal. |
| Carrera o duplicación administrativa | B2 usa idempotencia, revisión y estados canónicos. | No añadir atajos ni last-write-wins. |
| Repudio o evidencia incompleta | B3 conserva correlación e inmutabilidad. | Evidencia posterior, mínima y no autorizante. |
| Exposición de datos sensibles | Límites B0.3.4, B3.9, B4.6 y B5.4. | Minimización, sin secretos/PII innecesaria. |
| Cambios futuros de consumo, multiempresa o Electron | Están fuera de MT-U9. | No anticipar MT-U10–U12. |
| Políticas legales, retención y consentimiento concretos | MT-U9 no las define. | Requerir base documentada sin inventar plazos o jurisdicciones. |

## B6.10 Checklist de certificación

La siguiente lista es un checklist de conformidad arquitectónica, no un plan de pruebas ni de implementación.

- [ ] Se conserva la Empresa como frontera de seguridad y no existe tenant activo implícito para operadores.
- [ ] `saas_operadores` es la fuente canónica de pertenencia/facultades de plataforma; no reemplaza Membresías.
- [ ] Los perfiles B1 no crean superadmin, soporte permanente ni facultad residual.
- [ ] Toda delegación evita autoescalamiento y no modifica autoridad tenant.
- [ ] Cada comando B2 tiene facultad, agregado, estado, revisión, idempotencia y límite de alcance verificables.
- [ ] Comercial y lifecycle continúan separados; una Suscripción no altera acceso por sí sola.
- [ ] No hay comandos MT-U9 sobre fiscalidad, snapshots, ventas, estado operativo, ledger o tesorería.
- [ ] `saas_auditoria` conserva evidencia global posterior, append-only y no autorizante.
- [ ] Auditoría, soporte y Panel no registran ni exponen secretos, PIN, tokens, credenciales fiscales o PII innecesaria.
- [ ] Soporte/impersonación, si existe, cumple necesidad, Empresa única, alcance mínimo, expiración, revocación y atribución doble.
- [ ] Soporte no habilita operación tenant; las acciones operativas requieren Membresía explícita.
- [ ] El Panel solicita/proyecta; no decide autorización ni confirma mutaciones.
- [ ] Archivo, restauración, eliminación y exportación respetan lifecycle, retención y conservación sin convertirse en soporte.
- [ ] No se añaden consumo/límites, multiempresa de usuario, cambio de tenant ni Electron.
- [ ] No se introducen autoridades, facultades, perfiles, comandos, agregados o flujos no definidos en B0–B5.

## B6.11 Criterios de aceptación de B6

U9-B6 está completo cuando:

1. consolida B0–B5 sin reabrir ninguna decisión aprobada;
2. cubre explícitamente plataforma↔tenant, operadores, facultades, autorización, comandos, auditoría, soporte, Panel, lifecycle, comercial, conservación, protección de datos y seguridad;
3. distingue claramente conformidad arquitectónica de implementación, pruebas funcionales, rendimiento y UI/UX;
4. establece condiciones objetivas de aprobación y rechazo sin crear mecanismos nuevos; y
5. deja MT-U9 formalmente cerrado para una implementación que respete la matriz de conformidad y todos los límites certificados.

**Cierre formal de MT-U9:** B6 certifica la coherencia arquitectónica de los bloques B0–B5. Cualquier implementación posterior que contradiga esta certificación requiere revisión arquitectónica antes de continuar; B6 no amplía el alcance hacia unidades posteriores.
