# MT-U3 — Capa 6: cierre técnico

> **Estado:** implementación completa (Capas 0–5), cada una auditada y aprobada de forma
> independiente. Este documento es el "informe de cierre" que exige §9 Capa 6 del diseño
> (`MT-U3-helper-tenant-diseno.md`).
> **Rama:** `feature/saas-mt-u3`. **Nada se ha commiteado** — todo el trabajo de MT-U3 (Capas
> 0 a 6) permanece en el árbol de trabajo, sin `commit`/`push`/`PR`/`merge`.

---

## 1. Qué es esta capa y qué no es

§9 Capa 6 define su alcance como "regresión manual completa + verificación en navegador
real; informe de cierre", con aceptación "informe sin hallazgos bloqueantes; PR sin tocar
`firestore.rules`, ni autorización de rol, ni `configuracion`".

**La regresión manual en navegador real no se puede ejecutar todavía**: MT-U3 no se ha
activado en ningún entorno (ni real ni de pruebas) — activar significa correr el backfill
`--execute` y desplegar el código, y ninguna de las dos cosas ha ocurrido (prohibido
explícitamente en Capas 5 y 6 de esta sesión). Por tanto, esa parte del alcance de Capa 6
se traslada, tal cual, al momento real de activación — es exactamente el checklist §5.2
de `MT-U3-CAPA5-runbook-activacion.md` ("Regresión manual del POS"), que ya existe y no se
duplica aquí.

Lo que **sí** corresponde a esta sesión, y es lo que se hizo:
- Verificar que el estado final del código coincide con lo que la arquitectura definió.
- Verificar consistencia documental entre todos los documentos de MT-U3.
- Confirmar los tres criterios de aceptación que **sí** son verificables ahora mismo (sin
  necesidad de un entorno activado): cero cambios en `firestore.rules`, cero cambios en
  autorización de rol, cero cambios en `configuracion`.
- Dejar constancia formal de cierre.

---

## 2. Estado final por capa

| Capa | Objetivo | Estado |
|---|---|---|
| 0 | Reconciliación de colecciones, índices base, scripts de backfill/rollback (dry-run) | ✅ Aprobada |
| 1 | `lib/tenant.ts` + `lib/tenant-context.ts`, refactor aditivo de `SaaSContext` | ✅ Aprobada |
| 2 | Ledger: elimina `empresaId:"default"`, kardex filtra | ✅ Aprobada |
| 3 | 22 servicios (`lib/*-service.ts`) estampan/filtran; IMP-13 cerrado en `ventas-service` | ✅ Aprobada |
| 4 | Webhook Wompi deriva/propaga `empresaId`; rutas Admin SDK para reservas públicas (§4.5) | ✅ Aprobada |
| 5 | Script de verificación pre/post-activación + runbook de despliegue | ✅ Aprobada |
| 6 | Este cierre | En curso — cierra con este documento |

Detalle de decisiones y hallazgos de cada capa: ver el propio `MT-U3-helper-tenant-diseno.md`
(§1–§14) y `MT-U3-CAPA5-runbook-activacion.md`. No se repiten aquí.

---

## 3. Consistencia documental — verificación y correcciones

Se releyó `MT-U3-helper-tenant-diseno.md` completo (§1–§14), `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
(secciones que referencian MT-U3), `MT-U1-empresas-membresias-diseno.md` (nota de
reconciliación), `MT-U3-CAPA0-operacion-scripts.md` y `MT-U3-CAPA5-runbook-activacion.md`,
buscando contradicciones y referencias obsoletas.

**Correcciones aplicadas** (solo documentación, ningún archivo de código):

1. **`MT-U3-helper-tenant-diseno.md`, cabecera:** decía "Diseño definitivo, listo para
   congelar e iniciar la implementación por capas" — desactualizado desde hace varias
   capas. Corregido a reflejar que la implementación (Capa 0–5) ya está completa y
   aprobada.
2. **`MT-U3-helper-tenant-diseno.md` §13:** decía que el set de índices se cerraría
   "en Capa 1" — incorrecto: los servicios (y por tanto sus queries finales) no existían
   todavía en Capa 1. Se cerró en **Capa 3**. Corregido, con el resultado final (22
   índices, auditados sin duplicados).
3. **`MT-U3-helper-tenant-diseno.md` §14:** el "siguiente paso" decía "iniciar la Capa 0"
   — obsoleto. Reemplazado por el estado real: implementación completa, siguiente paso es
   la activación real (Capa 6 / runbook), nada commiteado todavía.

**Verificado sin necesidad de corrección** (consistentes):
- La lista de 25 colecciones oficiales (§7.1) coincide exactamente entre
  `MT-U3-helper-tenant-diseno.md`, `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (nota de
  reconciliación), `MT-U1-empresas-membresias-diseno.md` (nota de reconciliación) y
  `scripts/mt-u3-colecciones-oficiales.ts` (el código).
- `MT-U3-CAPA0-operacion-scripts.md` sigue siendo exacto: ninguno de los scripts que
  describe se ha ejecutado contra datos reales — afirmación todavía cierta.
- §4.5/§4.6 (prerrequisito de reservas públicas y su resolución) están correctamente
  enlazados desde §9 Capa 4/5 y desde la matriz de riesgos (R13).
- `MT-U3-CAPA5-runbook-activacion.md` referencia correctamente `verificar-activacion-mt-u3.ts`
  y el resto de scripts de Capa 0; no se encontró contradicción con el diseño.

**Observación fuera de alcance (no corregida, no es un documento de MT-U3):**
`G1-IMP5-agendas-firestore-rules-diseno.md` es un documento de investigación de un
alcance distinto (endurecimiento de `firestore.rules`, previo a MT-U3 y no parte de su
arquitectura). Su tabla §2.4 ("Código que escribe en `agendas`") describe
`crearReservaConHold()`/`getBloquesOcupados()` como escritura "Público (`/reservar`)"
directa contra Firestore — desde la Capa 4 de MT-U3 esto ya no es así: ambas pasan por
rutas Admin SDK (`/api/reservas/hold`, `/api/reservas/disponibilidad`). No se modifica ese
documento aquí porque pertenece a una iniciativa distinta (rules) fuera del alcance
autorizado de esta capa ("no modificar reglas fuera del alcance definido"; ese documento
es sobre reglas, no sobre MT-U3). Se deja registrado para quien retome esa iniciativa.

---

## 4. Verificación de los tres criterios de aceptación de Capa 6

| Criterio | Verificación | Resultado |
|---|---|---|
| PR sin tocar `firestore.rules` | `git status --short firestore.rules` sobre todo el rango de cambios (Capas 0–6) | ✅ Sin cambios |
| PR sin tocar autorización de rol | `grep` de `esOperativo`/`esAdmin`/comparaciones de `rol` añadidas en el diff completo | ✅ Sin coincidencias |
| PR sin tocar `configuracion` | `grep` de escrituras a la colección `configuracion` buscando estampado de `empresaId` | ✅ Ninguna — sigue global, sin cambios, tal como documenta §11.5 |

---

## 5. Validaciones finales

```
npx tsc --noEmit          → sin errores
npm run test:tenant       → 6 pass, 1 skip (infra no disponible, documentado), 0 fail
npm run test:tickets      → 51 pass, 1 skip, 0 fail
npm run test:reimpresion  → 16 pass, 0 fail
```

---

## 6. Estado final de MT-U3

- **Código:** 43 archivos tocados/creados en total a través de Capas 0–5 (servicios,
  helper de tenant, webhook, rutas Admin nuevas, scripts de backfill/rollback/verificación,
  índices). Ninguno commiteado.
- **Arquitectura:** sin decisiones abiertas (§13 del diseño). Los únicos ajustes al
  documento de diseño a lo largo de la implementación fueron aditivos (§4.5, §4.6, R13) o
  correcciones de referencia (§13, cierre §14) — nunca una revisión de una decisión ya
  tomada.
- **Aislamiento:** de **aplicación** únicamente (helper + servicios). `firestore.rules`
  (MT-U4) sigue sin exigir `empresaId` — la defensa en profundidad de 4 capas del maestro
  §6 tiene hoy 1 de 4 activa a nivel de código (más los claims de MT-U2, ya en producción
  pero inertes). Esto es exactamente lo previsto por el diseño (§11.3: "MT-U3 es el
  habilitador directo de MT-U4"), no una desviación.
- **Activación:** no ejecutada. Pendiente del runbook completo (`MT-U3-CAPA5-runbook-activacion.md`):
  desplegar índices → esperar `Enabled` → backfill `--execute` → desplegar código → gate
  post-activación → regresión manual (incluida una reserva pública nueva).
- **Multi-empresa (MT-U11):** el mecanismo `esFundacional` en las rutas de reservas
  públicas y el fallback del webhook son correctos solo en modo mono-tenant (§4.6) — deben
  reemplazarse por derivación desde la mesa/espacio reservado antes de crear una segunda
  empresa.

---

## 7. Qué deberá verificarse en la auditoría final

- Que las tres correcciones documentales de la §3 sean fieles al código real (no solo
  narrativamente consistentes).
- Que no exista ninguna otra referencia obsoleta no detectada en esta pasada (esta
  revisión fue dirigida por grep + lectura completa de los documentos de MT-U3, pero no
  es exhaustiva sobre *todo* el repositorio).
- Que la decisión de no tocar `G1-IMP5-agendas-firestore-rules-diseno.md` sea la correcta
  (alternativa: sí corregirlo, si se considera que su alcance solapa lo suficiente con
  MT-U3 como para requerir actualización aunque pertenezca a otra iniciativa).
- Que el estado "nada commiteado" siga siendo cierto al momento de la auditoría (verificar
  con `git status` en vivo, no confiar en este documento si ha pasado tiempo).
