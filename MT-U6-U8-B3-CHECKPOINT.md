# Checkpoint Arquitectónico — B3: Suscripción y Lifecycle Mínimo

> **Estado:** ✅ CERTIFICADO Y CERRADO  
> **Fecha:** 22/07/2026  
> **Programa:** MT-U6→MT-U8 (Ciclo de Vida Empresarial SaaS)  
> **Rama:** `feat/mt-u6-u8-b3-b4-b5-subscription-enforcement-bootstrap`  
> **Base probada:** Suite de pruebas `functions` (45 tests PASS, 0 FAIL)

---

## 1. Declaración de Certificación

El Bloque **B3 (Suscripción y Lifecycle Mínimo)** ha sido auditado de forma exhaustiva, corregido y formalmente **CERTIFICADO**. No existen observaciones pendientes ni deudas técnicas abiertas en este bloque.

El sistema cuenta con una base comercial y de ciclo de vida limpia, determinista, inmutable e idempotente, lista para servir de cimiento a **B4 (Enforcement)** y **B5 (Bootstrap Empresarial)**.

---

## 2. Invariantes Certificados para B4

Cualquier comportamiento detectado en bloques posteriores (B4, B5, B6...) que contradiga estos puntos será tratado como una regresión introducida en dichos bloques y no como un defecto preexistente de B3:

- ✅ **Empresa.estado como Única Autoridad de Lifecycle (ADR-SAAS-009):** `Empresa.estado` (`trial` | `activa` | `suspendida` | `cancelada` | `archivada` | `eliminada`) gobierna autoritativamente el acceso interactivo y la conservación de datos.
- ✅ **Suscripción como Relación Comercial (ADR-SAAS-003):** La entidad `Suscripcion` (`trialing` | `active` | `past_due` | `suspended` | `canceled`) describe únicamente la relación económica. Regularizar una suscripción a `active` **NO reactiva** una empresa en estado `suspendida`.
- ✅ **Versionado Comercial Inmutable (B0 §4.5):** La entidad `Plan` publica versiones inmutables (`planes/{planId}/versiones/{planVersion}`). Se probó y certificó la creación de versiones superiores (`versionActual + 1`) mediante `crearNuevaVersionPlan` sin alteración de versiones previas.
- ✅ **Grandfathering Certificado:** Las suscripciones contratadas bajo versiones anteriores del plan conservan su snapshot e inmutabilidad sin sufrir reajustes retroactivos ante la publicación de versiones superiores del plan.
- ✅ **Trial Certificado:** Primitiva `crearSuscripcionTrialEnTransaccion` certificada como operación atómica idempotente lista para ser compuesta por la saga de Bootstrap en B5.
- ✅ **Readiness Comercial Homologada:** Evaluación inclusiva (`hoy <= periodoFin` / `hoy <= trialFin` / `hoy <= graceFin`) garantizando validez comercial durante todo el último día contratado en fecha de negocio UTC.
- ✅ **Limpieza de Residuos de Estado:** Limpieza explícita con `FieldValue.delete()` de `graceFin` al salir del estado `past_due`.
- ✅ **Nomenclatura Canónica de Eventos:** Emisión estandarizada en PascalCase (`EmpresaActiva`, `SuscripcionActive`, `SuscripcionPastDue`, `VersionPlanCreada`, etc.).
- ✅ **Idempotencia y Concurrencia (B1 / B0 §3.5):** Deduplicación por `commandId` (usando el índice global `configuracion_command_ids`), `idempotencyKey` + `fingerprint`, y control de concurrencia optimista mediante `expectedRevision`.

---

## 3. Matriz de Autoridad Vigente

| Dominio | Entidad / Campo Canónico | Responsabilidad Exclusiva |
|---|---|---|
| **Lifecycle y Acceso** | `empresas/{empresaId}.estado` | Acceso interactivo, escrituras operativas y conservación. |
| **Relación Comercial** | `suscripciones/{empresaId}.estado` | Estado de cobro, trial, período activo y gracia. |
| **Oferta Comercial** | `planes/{planId}/versiones/{v}` | Oferta inmutable de capacidades y límites. |
| **Deduplicación Global** | `configuracion_command_ids` | Unicidad de `commandId` entre B1, B2 y B3. |

---

## 4. Archivos Certificados en B3

- [`lib/suscripciones/contrato.ts`](file:///c:/Users/seguc/Downloads/PROYECTOS%20POS/PROYECTO%20CAFE/lib/suscripciones/contrato.ts)
- [`functions/src/suscripciones/service.ts`](file:///c:/Users/seguc/Downloads/PROYECTOS%20POS/PROYECTO%20CAFE/functions/src/suscripciones/service.ts)
- [`functions/src/suscripciones/service.test.ts`](file:///c:/Users/seguc/Downloads/PROYECTOS%20POS/PROYECTO%20CAFE/functions/src/suscripciones/service.test.ts)

---

## 5. Autorización de Transición

Con este checkpoint, el Bloque B3 queda oficialmente **CERRADO** y se autoriza el paso al **Bloque B4 (Enforcement)**.
