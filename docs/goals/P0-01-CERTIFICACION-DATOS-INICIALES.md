# P0-01 — Runbook de certificación de datos iniciales

> **Estado del documento:** CERTIFICACIÓN DOCUMENTADA — EN REVISIÓN. La evidencia real está registrada en este documento y en el artefacto de cierre asociado; el resultado final queda sujeto a la auditoría y al merge del PR.
>
> Este documento registra la ejecución controlada del PR de certificación de P0-01. No reemplaza el acceso aprobado a Firebase, los datos corporativos aprobados ni la evidencia obtenida en el entorno real.

## 1. Trazabilidad

- **Goal:** `G-MVP-01 — MVP comercial de Café Atrato`
- **Milestone:** `M1 — Tenant y fiscalidad listos para operar`
- **Epic:** `E1.1 — Tenant operativo`
- **Backlog:** `P0-01 — Certificar el tenant real de Café Atrato`
- **Criterio de aceptación:** el administrador inicia sesión; el tenant activo es Café Atrato; `configuraciones/{empresaId}` es válida; los módulos y espacios esperados son visibles sin errores de Rules ni 404.
- **Rama de certificación:** `codex/e1-1-p0-01-certificacion-manual`

## 2. Alcance

Este runbook cubre exclusivamente la preparación y certificación de:

1. Empresa activa del tenant real.
2. Administrador operativo, membresía y claims coherentes.
3. Configuración B1 válida y legible por la ruta canónica.
4. Módulos habilitados según los datos aprobados y el Plan.
5. Espacios y categorías tenant-aware visibles desde el POS.
6. Evidencia de login, resolución de tenant y ausencia de errores de Rules o 404.

### Fuera de alcance

- Readiness fiscal completa de P0-02.
- Ventas, inventario, tesorería, cobros, turnos o impresión.
- Migraciones generales de datos operativos.
- Refactors, limpieza de seeds históricos o cambios en Rules.
- Nuevas autoridades de escritura, callables o modelos de persistencia.
- Recuperación de PIN ya activado, incluida en D-013-1 y fuera de P0-01.

## 3. Autoridades y reglas de seguridad

- `empresas/{empresaId}` es la autoridad del lifecycle del tenant.
- `membresias/{empresaId}_{uid}` es la autoridad de rol, permisos y estado de membresía.
- Los claims son una proyección emitida por backend; deben coincidir con la membresía.
- `configuraciones/{empresaId}` es la única autoridad B1 de configuración.
- El cliente lee la configuración mediante `obtenerConfiguracionEmpresa`; el acceso directo a la colección está bloqueado por Rules.
- Las consultas de espacios deben incluir `empresaId`; ningún documento global o sin tenant puede darse por certificado.
- Las credenciales, PIN temporales, tokens, service accounts y datos fiscales sensibles no se incorporan a Git ni a la evidencia.
- Cualquier escritura productiva requiere datos aprobados, ventana controlada, respaldo o punto de recuperación y registro de responsable.

ADR y documentos aplicables:

- `ADR-SAAS-001`, `ADR-SAAS-002`, `ADR-SAAS-004`, `ADR-SAAS-007` y `ADR-SAAS-013`.
- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`.
- `MT-U6-U8-B1-configuracion-empresarial.md`.
- `MASTER-SECURITY-PLAN.md`.
- `docs/governance/METODOLOGIA-GOAL.md`.

## 4. Gate de entrada

P0-01 no comienza si alguno de estos puntos está incompleto:

| Gate | Evidencia requerida | Si falla |
|---|---|---|
| Proyecto | Identificador del proyecto Firebase confirmado por el responsable | Detener; no consultar otro proyecto |
| Tenant | `empresaId` aprobado y correspondencia con Café Atrato | Detener; no descubrir ni elegir otro tenant |
| Datos | Nombre, administrador, módulos y espacios esperados aprobados | Detener; solicitar decisión de negocio |
| Acceso | Cuenta de servicio o sesión administrativa temporal con permisos mínimos | Detener; no usar credenciales improvisadas |
| Ventana | Responsable, fecha/hora y canal de comunicación definidos | Reprogramar |
| Recuperación | Export o punto de restauración identificado antes de cualquier escritura | No escribir |
| Baseline | Estado inicial capturado sin secretos ni PINs | Completar captura |
| Código | `main` y Functions desplegadas corresponden al commit que se va a validar | Detener; reconciliar versión |

La presencia de variables públicas `NEXT_PUBLIC_FIREBASE_*` no satisface el gate de acceso administrativo.

## 5. Preflight sin escrituras

El responsable debe registrar en la hoja de evidencia:

- fecha y zona horaria;
- proyecto Firebase y entorno;
- commit de aplicación y versión de Functions;
- `empresaId` aprobado;
- estado, nombre y `paisFiscal` de `empresas/{empresaId}`;
- existencia y estado de la membresía administrativa;
- UID del administrador, únicamente si el canal aprobado permite registrarlo sin exponer datos innecesarios;
- resultado de la validación B1;
- número y nombres de módulos esperados, sin incluir datos sensibles;
- número y nombres de espacios/categorías esperados;
- resultado de lectura de Rules y callable;
- responsable y aprobador de cada escritura.

No se debe copiar el contenido completo de documentos a la evidencia. Se registran únicamente campos necesarios, estados, conteos, identificadores no sensibles y hashes o referencias internas cuando sean necesarios para auditoría.

## 6. Matriz de evidencia de aceptación

| Criterio | Fuente canónica | Evidencia mínima | Resultado exigido |
|---|---|---|---|
| Empresa real | `empresas/{empresaId}` | `empresaId`, nombre aprobado, `estado` | Existe, es Café Atrato y está `trial` o `activa` según el dato aprobado |
| Administrador | Firebase Auth + `membresias/{empresaId}_{uid}` | UID redacted o referenciado, rol y estado | Identidad válida, membresía `admin` activa y coherente |
| Claims | Firebase Auth | `empresaId` y `rol`, sin token completo | Claims coinciden con empresa y membresía |
| Login | PWA/POS real | Fecha/hora, resultado y captura redactada | El administrador inicia sesión sin error |
| Tenant activo | `SaaSContext` y pantalla autenticada | Nombre/identificador mostrado | El tenant resuelto es Café Atrato; no hay fallback de otra empresa |
| Configuración B1 | Callable `obtenerConfiguracionEmpresa` + validador B1 | Existencia, `empresaId`, `schemaVersion`, `revision`, resultado de validez | Documento válido, 1:1 con la Empresa y legible por la ruta canónica |
| Módulos | `configuraciones/{empresaId}.modulos` y Plan | Lista aprobada, conteo y dependencias | Lista explícita, dentro de capacidades del Plan y sin dependencias inválidas |
| Espacios | Colección `espacios` filtrada por `empresaId` | Conteo, IDs/nombres aprobados, `activo`, presencia de `empresaId` | Todos los espacios esperados aparecen tenant-aware |
| Categorías | Colección `categorias` filtrada por `empresaId` y espacio | Conteo y correspondencia con espacios | Categorías esperadas visibles sin 404 |
| Rules | Navegación autenticada y logs de cliente/emulador si aplica | Resultado por ruta consultada | Cero denegaciones inesperadas; el bloqueo directo de B1 se considera esperado |
| UI | POS/PWA en canal representativo | Capturas o video redactados | Módulos y espacios se muestran sin pantalla vacía, 404 ni error de configuración |

Un criterio sin evidencia directa queda **NO CERTIFICADO**, aunque el código relacionado exista en `main`.

## 7. Ruta B1 y decisión de migración

La ruta existente `functions/src/configuracion/migrar-fundacional-cli.ts` admite dry-run por defecto y `--execute` explícito.

### 7.1 Si la configuración no existe

1. Ejecutar el dry-run con el proyecto y tenant previamente confirmados.
2. Revisar nombre comercial, país, empresa objetivo y resultado esperado.
3. Obtener aprobación explícita para escribir.
4. Ejecutar la migración una sola vez con `--execute`.
5. Leer nuevamente mediante `leerConfiguracionEmpresa` y registrar el resultado.
6. Continuar solo si la configuración es válida y el tenant coincide.

### 7.2 Si la configuración ya existe

1. No ejecutar una migración de reemplazo.
2. Validar identidad, país, esquema, revisión y estructura completa.
3. Si es válida, continuar con la certificación.
4. Si es inválida o inconsistente, detener el alcance y registrar la divergencia; no sobrescribir ni borrar desde este runbook.

La ruta de migración trata la existencia del documento como no-op; por eso la existencia por sí sola no es evidencia de validez.

### 7.3 Módulos y espacios

- Los módulos se deben establecer por la autoridad B1 y sus callables autorizados, usando los valores aprobados.
- Los espacios y categorías deben crearse o corregirse mediante una ruta tenant-aware autorizada.
- `scripts/seed-espacios.ts` y `scripts/fix-espacios-modulos.ts` son herramientas históricas y no deben ejecutarse contra producción sin una revisión específica de aislamiento, alcance y rollback.
- No se permite escribir directamente `configuraciones/{empresaId}` desde un script nuevo para evitar el comando B1.

### 7.4 Trial para una Empresa existente

El Trial de una Empresa ya existente se solicita mediante el comando de
plataforma `CrearSuscripcionTrial` a través de
`ejecutarComandoComercialSaas`. No se debe reutilizar Bootstrap ni escribir
directamente `suscripciones/{empresaId}`.

La entrada requiere `empresaId`, `planId`, `planVersion`, `trialDias` y el
envelope comercial. La operación comprueba Empresa operativa, Plan publicado y
ausencia de Suscripción; calcula las fechas con el reloj del servidor y delega
la transacción en la primitiva B3. La estrategia concreta del Plan se decide
antes de cualquier ejecución productiva.

## 8. Flujo de ejecución controlada

1. Confirmar todos los gates de entrada.
2. Capturar baseline y export/punto de recuperación.
3. Ejecutar únicamente los dry-runs o lecturas aprobadas.
4. Resolver primero inconsistencias de identidad, membresía o tenant.
5. Ejecutar la inicialización B1 solo si el gate de migración fue aprobado.
6. Aplicar módulos y espacios únicamente por las autoridades existentes y con datos aprobados.
7. Invalidar caché o cerrar sesión antes de validar nuevamente la UI.
8. Probar login del administrador en el canal acordado.
9. Verificar tenant, configuración, módulos y espacios.
10. Capturar evidencia redactada y registrar cualquier desviación.
11. Detenerse si aparece un error de Rules, 404, tenant cruzado, configuración inválida o dato no aprobado.

## 9. Rollback y manejo de fallos

| Tipo de cambio | Rollback permitido | Regla |
|---|---|---|
| Lectura o dry-run | No aplica | No debe producir escrituras |
| Creación B1 inicial | No borrar manualmente | Si falla la verificación, conservar la trazabilidad y detener; corregir mediante una mutación autorizada |
| Mutación B1 | Mutación inversa por callable y con auditoría | Nunca editar el documento directamente ni decrementar revisión |
| Espacio/categoría | Restaurar snapshot aprobado o revertir por la ruta tenant-aware | No eliminar datos históricos sin autorización |
| Evidencia | Corregir el documento de evidencia | No alterar datos productivos para maquillar un resultado |

Un fallo de identidad, tenant o autoridad es un bloqueo de seguridad, no una incidencia que pueda resolverse ampliando el alcance del PR.

## 10. Verificador reutilizable de P0-01

El verificador read-only está implementado en `scripts/p0-01/verify-tenant.ts` y no modifica el producto ni escribe en Firebase. Este runbook fija el contrato operativo y la evidencia que todavía debe completarse en el canal real.

### Entrada

- `categoriesPolicy` puede ser `"exact"` (predeterminado) o
  `"tenant-scoped"`. El segundo modo se usa cuando las categorias definitivas
  estan fuera de P0-01: verifica aislamiento por `empresaId` y consistencia de
  las categorias activas con los espacios aprobados, sin certificar nombres ni
  un catalogo definitivo.

- proyecto Firebase explícito;
- `empresaId` explícito y aprobado;
- credencial administrativa suministrada fuera de Git;
- archivo obligatorio de expectativas aprobado para módulos y espacios.

Ejecución:

```powershell
npx tsx scripts/p0-01/verify-tenant.ts `
  --project-id <project-id> `
  --tenant-id <empresaId> `
  --expectations <expectativas.json> `
  --output <evidencia.json>
```

También está disponible `npm run verify:p0-01 -- ...`. El archivo de expectativas no debe contener PINs, tokens, secretos, credenciales ni PII.

En PowerShell de Windows, si el wrapper `npm` local no propaga los argumentos,
usar `npm.cmd run verify:p0-01 -- ...` o ejecutar directamente `npx tsx
scripts/p0-01/verify-tenant.ts ...`.

### Comportamiento obligatorio

- Cuando el manifiesto use `categoriesPolicy: "tenant-scoped"`, el resultado
  de categorias demuestra aislamiento y consistencia, pero no aprueba el
  catalogo comercial definitivo.

- no aceptar `--execute`;
- no descubrir tenants ni seleccionar uno por defecto;
- validar `empresaId` en cada colección consultada;
- reutilizar los validadores B1 existentes;
- distinguir ausencia, invalidez, tenant cruzado y datos no aprobados;
- salir con código distinto de cero ante cualquier criterio no certificado;
- no imprimir PINs, hashes de PIN, tokens, service accounts ni documentos completos;
- crear únicamente un artefacto local de evidencia con apertura exclusiva, nunca una escritura en Firebase.

### Resultado

Debe producir un reporte estable con:

- `PASS`, `FAIL` o `BLOCKED` por criterio;
- conteos y referencias no sensibles;
- versión de código, proyecto, tenant y timestamp;
- lista de bloqueos verificables;
- `evidenceHash` SHA-256 del reporte previo a estampar su propio hash.

El resultado automatizado puede ser `PASS` aunque el resultado global sea `BLOCKED`: el segundo caso es obligatorio mientras no se haya comprobado el login real, la resolución del tenant y la visibilidad de Rules/UI en el canal representativo. El verificador no convierte esas comprobaciones manuales en un falso positivo.

La automatización no puede convertirse en una nueva autoridad de datos ni sustituir la prueba de login en el canal real.

### Smoke E2E reutilizable en emuladores

El arnés `npm run e2e:p0-01` valida el contrato observable de login operativo,
resolución de tenant, configuración B1, módulos y espacios usando únicamente
Auth, Firestore y Functions locales. La fixture es aislada por ejecución y
rechaza destinos que no sean `127.0.0.1`; el runner elimina cualquier
`GOOGLE_APPLICATION_CREDENTIALS` heredado para impedir que una prueba escriba
en producción por accidente.

La prueba genera reporte Playwright, trazas/capturas ante fallo y un registro
local de respuestas 404 y errores de consola. Este resultado demuestra que el
flujo es ejecutable contra un entorno controlado, pero no certifica los datos
reales de Café Atrato ni reemplaza el verificador read-only o los gates de
entrada de la sección 4.

## 11. Registro de cierre del PR P0-01

```text
Run ID: `1785779049884`
Proyecto / entorno: `micafe-pos` / producción
empresaId aprobado: `1ae0rD9H8t3ZFSBKrrHR`
Commit de aplicación: `22ba0093b6b05bc6d5822e11e1d1fa83156e926c`
Versión de Functions: v2, Node.js 22, `us-central1`
Fecha y zona horaria: `2026-08-03`, America/Bogota
Responsable: operador autorizado por el responsable del tenant
Aprobador de datos: responsable del tenant; la identidad fiscal definitiva permanece fuera de P0-01

Gates de entrada: PASS
Empresa y lifecycle: PASS
Administrador, membresía y claims: PASS
Login del administrador: PASS — evidencia manual recibida
Configuración B1: PASS
Módulos aprobados: PASS
Espacios y categorías: PASS — verificación tenant-scoped
Rules y 404: PASS — navegación manual sin errores observados y smoke automatizado en PASS
Evidencia redactada adjunta: SÍ

Desviaciones: ninguna. No se realizaron escrituras productivas.
Rollback aplicado o disponible: no aplica; la certificación fue read-only.
Resultado de certificación: APTO PARA REVISIÓN
```

El registro anterior se basa en la lectura productiva y en la evidencia manual recibida. El estado `APROBADO` se emitirá únicamente después de la auditoría y del merge de este PR.

### 11.1 Evidencia manual recibida

- La captura proporcionada durante la validación muestra `Café Atrato`, el espacio `Cafetería`, el rol de administrador y los siete módulos aprobados: Ventas, Reservas Web, Clientes, Inventario, Compras, Finanzas y Mermas.
- El responsable confirmó que inició sesión y navegó por todos los módulos sin errores en la consola del navegador.
- La captura se conserva como evidencia de la conversación y se identifica mediante SHA-256 `FAF3767218341E047526D9CECDB6E1070D8E97063431728F4F6EC798CDB5AA21`.
- El verificador productivo devolvió `automatedVerdict = PASS` para los doce criterios automatizables y generó el hash de evidencia `32bc903ed4771ef5c138d4d5968b8629089393594ee6d6955e070e82c7677515`.
- La producción de Vercel correspondiente al commit `22ba0093b6b05bc6d5822e11e1d1fa83156e926c` figura como `success`; el listado read-only de Functions confirma las callable relevantes desplegadas en `us-central1` como v2/Node.js 22.

## 12. Criterio de auditoría del PR

La auditoría del PR P0-01 debe limitarse a:

- trazabilidad con Goal, Milestone y Epic;
- cumplimiento de ADR y autoridades existentes;
- aislamiento tenant y seguridad de credenciales;
- persistencia y migración B1;
- compatibilidad y rollback;
- evidencia de cada criterio de aceptación;
- alcance estricto.

No debe aprobarse por la existencia de este runbook, por una prueba de emulador aislada ni por la mera presencia de documentos en Firestore.
