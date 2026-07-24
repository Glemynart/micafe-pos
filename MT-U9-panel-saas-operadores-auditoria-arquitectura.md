# MT-U9 — Panel SaaS, operadores y auditoría de plataforma

> **Estado:** aprobado.
> **Alcance:** solo arquitectura y contratos; no autoriza UI, componentes, Functions, Rules, APIs, migraciones ni cambios de código.  
> **Jerarquía:** ADR SaaS aceptados → `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` → este documento.  
> **Fuentes revisadas:** Maestro SaaS; ADR-SAAS-001 a ADR-SAAS-010; `MASTER-SECURITY-PLAN.md`; contratos B0 y especificaciones/checkpoint B1–B3; documentación U1–U5B relevante para tenancy, claims, membresías y Rules.

## 1. Alcance exacto

Según el Maestro (§12 y §13.3), **MT-U9 es “Panel SaaS, operadores y auditoría de plataforma”**. Es la primera unidad que organiza explícitamente el plano de plataforma ya reservado por el modelo: `saas_operadores`, `saas_auditoria`, planes, suscripciones, soporte y la administración de empresas.

MT-U9 debe cerrar la arquitectura que permite a la plataforma observar y ejecutar, de forma controlada y trazable, las facultades ya definidas para el plano SaaS: gestión de empresas y sus transiciones, planes y suscripciones, soporte, archivo/restauración/eliminación conforme a retención y auditoría global. El “panel” nombra la superficie administrativa de ese plano; no prescribe su tecnología, rutas, diseño ni interfaz.

Quedan fuera:

- límites y métricas de consumo (MT-U10);
- multiempresa para un usuario operativo y cambio ordinario de tenant (MT-U11);
- convergencia de Electron con sesión SaaS (MT-U12);
- monetización concreta, precios, pasarela de pago y política de consumo;
- cambio de las autoridades ya consolidadas en U1–U8;
- implementación de soporte o impersonación antes de que su contrato se apruebe.

## 2. Separación de responsabilidades

| Pertenece al Panel SaaS | No pertenece al Panel SaaS |
|---|---|
| Administrar el plano plataforma y sus operadores. | Operar un restaurante por el mero hecho de ser operador. |
| Consultar el estado canónico, suscripción y trazabilidad de una empresa dentro de una facultad explícita. | Cambiar directamente datos operativos, fiscales o financieros tenant. |
| Solicitar/ejecutar los comandos ya autorizados de lifecycle, plan y suscripción, con control de revisión y auditoría. | Inventar transiciones o usar `Suscripcion.estado` como autoridad de acceso. |
| Gestionar planes y versiones bajo su contrato inmutable. | Alterar retrospectivamente una versión publicada o una suscripción grandfathered. |
| Soporte bajo una vía separada, explícita y auditable. | Obtener acceso implícito mediante `ownerUid`, claim tenant, rol tenant o lectura administrativa. |
| Auditoría global de acciones de plataforma y de sus comandos autorizados. | Sustituir los registros canónicos, snapshots fiscales o auditoría propia del tenant. |
| Orquestar archivo, restauración, eliminación y exportación únicamente según lifecycle, retención y autorización de plataforma. | Borrar datos por conveniencia, saltar retención fiscal o convertir una acción de UI en autoridad. |

El Panel SaaS es un consumidor y una frontera de mando del dominio existente: no se convierte en fuente alternativa de Empresa, Membresía, Configuración, Numeración, Asignación, Suscripción, Bootstrap ni Snapshot fiscal.

## 3. Significado de “operadores” y “auditoría de plataforma”

**Operador SaaS** es un principal de plataforma registrado separadamente de los usuarios y membresías tenant. Su pertenencia al plano plataforma debe vivir en `saas_operadores/{uid}`; no es un sexto rol de `membresias`, no es `supervisor`, no es `admin` de restaurante y no obtiene un `empresaId` activo por defecto. Su autoridad debe ser limitada por facultades de plataforma aún por especificar, no inferida desde un booleano ni desde la presencia del documento.

**Auditoría de plataforma** es el registro global de hechos de control y soporte ejecutados desde la autoridad SaaS: quién actuó, qué facultad usó, sobre qué agregado/empresa, qué comando o transición confirmó, por qué, cuándo, con qué correlación y cuál fue el resultado. No es un log de depuración, no contiene secretos ni PII innecesaria y no reemplaza `ultimaMutacion`, eventos de dominio, `auditoria_logs` tenant ni `ventas.snapshotFiscal`.

La auditoría debe permitir reconstruir decisiones de plataforma sin convertir eventos en permisos ni crear event sourcing. Los eventos solo pueden existir después del hecho durable que representan, conforme a CON-04 y CON-05 de B0.

## 4. Autoridades y límites de confianza

### 4.1 Autoridades nuevas que MT-U9 debe formalizar

| Autoridad | Fuente canónica propuesta a formalizar | Límite estricto |
|---|---|---|
| Pertenencia/facultades de plataforma | `saas_operadores/{uid}` | No autoriza acceso tenant ordinario. |
| Evidencia de acción de plataforma | `saas_auditoria/{id}` append-only | No decide permisos ni cambia el dominio. |
| Sesión de soporte, si se aprueba | Contrato separado, de duración y alcance explícitos | No equivale a membresía ni muta claims tenant ordinarios. |

No aparecen nuevas autoridades sobre lifecycle, comercial, identidad tenant, configuración o fiscalidad: se conservan las de B0. La plataforma puede ser actor autorizado de comandos existentes, pero el comando sigue validando la autoridad de su agregado, la transición admisible, `expectedRevision`, idempotencia, reloj servidor y gates aplicables.

### 4.2 Límites de confianza que cambian

1. Se introduce la frontera **plataforma ↔ tenant**: las colecciones globales de plataforma (`planes`, `saas_operadores`, `saas_auditoria`) no llevan `empresaId`; los recursos internos de plataforma asociados a una empresa pueden incorporarlo en su identidad —por ejemplo, `consumo/{empresaId}_{periodo}`, reservado a MT-U10— y no se confunden con datos tenant. Los datos tenant nunca deben quedar accesibles por una facultad de plataforma implícita.
2. Se introduce la frontera **operador ↔ soporte**: un operador no hereda contexto de empresa. Si existe soporte con acceso al tenant, debe ser una sesión distinta, mínima, temporal, revocable y auditada de extremo a extremo.
3. Se introduce la frontera **acción autorizada ↔ observación**: consultar o auditar no permite mutar; mutar exige un comando de dominio permitido.
4. Se introduce la frontera **auditoría ↔ secreto/PII**: la trazabilidad debe usar IDs, metadatos mínimos y redacción; no credenciales, tokens, PIN, payloads fiscales completos ni datos de pago innecesarios.
5. Admin SDK, backend y cualquier futura superficie de plataforma son de máxima confianza técnica, pero no de autorización automática: deben verificar identidad y facultad de plataforma y registrar la acción. Esto responde a SEC-017 y SEC-024.

## 5. Riesgos de MT-U9 y controles arquitectónicos

| Riesgo | Control requerido antes de implementación |
|---|---|
| Escalada de operador a tenant o lectura cross-tenant. | Separar identidad/facultades de plataforma, tenant y soporte; deny-by-default; ningún `empresaId` libre ni autoridad por `ownerUid`. |
| “Superadmin” omnipotente sin alcance verificable. | Catálogo explícito de facultades y comandos permitidos; mínimo privilegio; no inferencia por rol genérico. |
| Impersonación silenciosa o persistente. | ADR y contrato específicos; consentimiento/política si aplica, alcance, duración, motivo, correlación, revocación y auditoría inmutable. |
| Manipular lifecycle o suscripción fuera de la máquina de estados. | Reutilizar exclusivamente comandos B0 y el servicio único de lifecycle; revisión esperada e idempotencia. |
| Alterar evidencia fiscal, ventas, ledger o contabilidad durante soporte. | Prohibición explícita; conservar append-only, Snapshot y contratos OPE/FIS. |
| Auditoría incompleta, mutable o con PII/secretos. | Contrato append-only, esquema mínimo, redacción, cobertura de comandos y alertas/runbook alineados con SEC-024. |
| Tokens o claims de plataforma obsoletos. | Estado/facultad canónicos verificados por backend; revocación/renovación como propagación, no única barrera. |
| Confundir observabilidad con autoridad o eventos con comandos. | Separar registro, proyección y comando; evento posterior al commit. |
| Eliminar/archivar sin retención legal. | `EliminarEmpresa` sigue siendo exclusivo de plataforma, posterior a retención y con trazabilidad; no se diseña la política legal nueva en U9. |

## 6. Dependencias MT-U1→MT-U8

| Base | Dependencia de MT-U9 |
|---|---|
| U1 | Empresa y Membresía, `empresaId` opaco y plano global separado. |
| U2 | Identidad Firebase y claims como contexto de sesión, no como estado canónico. |
| U3 | Aislamiento operacional por `empresaId`; el panel no puede eludir el helper ni aceptar tenant libre. |
| U4 | Rules tenant-aware y deny-by-default como referencia de seguridad; U9 no las modifica en esta fase. |
| U5A/U5B | Identidad de dos capas e incorporación; `membresias` es la única autoridad tenant de rol/permisos/estado. El rol `supervisor` sigue siendo exclusivamente tenant. |
| U6–U8 B0/B1/B2 | Mapa de autoridades, comandos, eventos, revisiones, gates, configuración y fiscalidad/snapshot. |
| U6–U8 B3/B4/B5/B6/B7 | Planes/suscripciones, lifecycle, enforcement, bootstrap, onboarding y cutover certificados o en su secuencia aprobada. MT-U9 los consume; no los reabre. |
| ADR-SAAS-010 | La operación fiscal y sus efectos operativos siguen sus estados e invariantes; auditoría de plataforma no puede modificar esas transiciones. |

## 7. Elementos que MT-U9 no debe modificar

- `Empresa.estado` como autoridad única de acceso y conservación, ni la matriz de ADR-SAAS-009.
- La autoridad tenant de `membresias`, el perfil global `usuarios` y el modelo de claims de U2/U5B.
- Tenancy por colecciones planas + `empresaId`, helpers, consultas e índices de U3.
- Las 25 colecciones operativas, POS, reservas, KDS, inventario, tesorería, ventas y su comportamiento.
- Configuración tenant, numeraciones, asignaciones, `snapshotFiscal`, `estadoOperativo` y contratos de fiscalidad/inventario.
- Bootstrap, onboarding e incorporaciones, salvo consumir su evidencia para consulta autorizada.
- Electron y SQLite local; su convergencia continúa reservada para MT-U12.
- Reglas, Functions, UI, React, APIs, migraciones y cualquier pasarela de pago: están fuera del presente documento.

## 8. Contratos arquitectónicos nuevos necesarios

Antes de implementar MT-U9 deben aprobarse, como mínimo, estos contratos. Sus nombres son de dominio, no nombres de colecciones, endpoints ni componentes.

1. **Operador de plataforma y facultades:** identidad, estado, facultades explícitas, asignación/revocación, separación de roles tenant, mínimo privilegio y regla de que el operador no obtiene tenant activo.
2. **Comando de plataforma:** cómo un actor de plataforma invoca los comandos ya definidos sin bypassar sus validaciones; incluye `commandId`, idempotencia, `expectedRevision`, motivo, correlación, causación, actor/origen `PLATFORM` y resultado durable.
3. **Evento y auditoría de plataforma:** esquema mínimo append-only, retención aplicable, redacción de secretos/PII, integridad, correlación con comando/agregado/empresa y cobertura obligatoria de acciones sensibles.
4. **Acceso de soporte e impersonación (decisión-gate):** debe decidirse si MT-U9 solo prepara la auditoría o habilita una sesión de soporte. Si se habilita, el contrato debe definir autorización, alcance, duración, revocación, visibilidad y auditoría. No puede quedar como acceso administrativo implícito.
5. **Lectura de plataforma y minimización de datos:** clasificación de vistas/consultas por facultad, datos mínimos, filtrado y prohibición de usar auditoría como exportación masiva o de exponer PII no necesaria.
6. **Retención y acciones terminales:** la interfaz de plataforma solo puede ejecutar el contrato vigente de archivo/restauración/eliminación; si faltan plazos o condiciones legales, debe quedar como precondición externa, no inventarse en U9.

## 9. ADR necesarios

Sí aplican ADR nuevos antes de implementación, porque el Maestro reserva las colecciones y responsabilidades pero no define el modelo de autorización ni de evidencia del plano plataforma.

- **ADR-SAAS-011 — Operadores SaaS, facultades y frontera de soporte.** Debe fijar la autoridad de `saas_operadores`, el catálogo de facultades, separación con membresías, acceso de soporte/impersonación o su exclusión explícita, y revocación.
- **ADR-SAAS-012 — Auditoría de plataforma y no repudio operativo.** Debe fijar el contrato append-only de `saas_auditoria`, hechos obligatorios, correlación, redacción, retención e integridad, sin reemplazar la auditoría fiscal/tenant existente.

No se requiere ADR para límites medidos, selector multiempresa ni Electron: pertenecen expresamente a MT-U10, MT-U11 y MT-U12.

## 10. Plan por bloques, independiente, auditable y mergeable

Se adopta la metodología U6→U8: bloques pequeños con autoridad heredada, exclusiones explícitas, riesgos, evidencia y gate de aprobación. Ningún bloque activa capacidades fuera de contrato ni adelanta otro bloque.

| Bloque | Alcance documental independiente | Depende de | Gate de cierre |
|---|---|---|---|
| **U9-B0 — Contratos e invariantes de plataforma** | Mapa de autoridades, operador/facultades, límites plataforma-tenant, comandos permitidos, eventos/auditoría, invariantes, clasificación de datos y exclusiones. | Maestro, ADR 001–010, B0 U6–U8. | ADR-011/012 aprobados y matriz de autoridad sin contradicciones. |
| **U9-B1 — Modelo de operador y autorización de plataforma** | Especificación del agregado Operador, estados, facultades, asignación/revocación, sesiones y separación de tenant. Sin UI ni claims concretos. | U9-B0. | Pruebas de diseño de mínimo privilegio y revocación trazadas a invariantes. |
| **U9-B2 — Comandos de administración SaaS** | Matriz actor→facultad→comando existente: empresas/lifecycle, planes y suscripciones; precondiciones, concurrencia, idempotencia y resultado/auditoría. | U9-B0, B3/B4 U6–U8. | Cada acción de plataforma reutiliza un comando de dominio; cero bypasses. |
| **U9-B3 — Auditoría de plataforma** | Contrato de `saas_auditoria`, taxonomía de hechos, retención, redacción, correlación, integridad, consulta mínima y alertas/runbook requeridos por SEC-024. | U9-B0, U9-B2. | Cobertura documental completa de acciones sensibles y prohibición de secretos/PII innecesaria. |
| **U9-B4 — Soporte e impersonación: decisión y contrato** | Decisión explícita: excluirla de la primera entrega o definir el contrato separado de sesión de soporte. No se permite un estado implícito. | U9-B0, U9-B1, U9-B3. | ADR-011 satisface alcance, duración, revocación y auditoría; si se difiere, queda excluida verificablemente. |
| **U9-B5 — Especificación del Panel SaaS** | Arquitectura de superficies y límites de lectura/acción por facultad, sin UI ni componentes. Incluye estados no interactivos, vistas de evidencia y prohibición de operar tenant directamente. | U9-B1–B4. | Cada superficie se mapea a una facultad, comando o lectura mínima; ninguna introduce autoridad. |
| **U9-B6 — Certificación arquitectónica y handoff** | Matriz de invariantes, amenazas, regresiones a U1–U8, inventario de contratos/ADRs aprobados y lista cerrada de trabajo de implementación posterior. | U9-B1–B5. | Evidencia revisable de no modificación de tenancy, fiscalidad, lifecycle, Electron, U10–U12. |

### Invariantes iniciales a aprobar en U9-B0

- **PLT-01:** `saas_operadores` no es Membresía ni concede acceso tenant ordinario.
- **PLT-02:** toda acción de plataforma usa una facultad explícita y un comando de dominio permitido; nunca escritura ad hoc.
- **PLT-03:** toda acción sensible de plataforma genera auditoría posterior al commit, correlacionable e inmutable.
- **PLT-04:** soporte/impersonación, si existe, es separado, mínimo, temporal, revocable y auditable; nunca deriva de un operador por defecto.
- **PLT-05:** ninguna acción de plataforma puede reescribir snapshots fiscales, ledger, tesorería o auditoría histórica.
- **PLT-06:** la plataforma respeta las mismas transiciones, revisiones, idempotencia, gates y retención que el dominio autoritativo.
- **PLT-07:** auditoría y observabilidad no son una fuente de autorización ni un canal de secretos/PII innecesaria.

## 11. Criterio de aprobación de MT-U9

MT-U9 estará listo para pasar a una especificación de implementación solo cuando los ADR-011 y ADR-012, los contratos U9-B0 a U9-B5 y la certificación U9-B6 estén aprobados. Hasta entonces, el único resultado autorizado es esta arquitectura: ninguna superficie de panel, privilegio de operador, sesión de soporte o escritura de auditoría debe implementarse por inferencia.
