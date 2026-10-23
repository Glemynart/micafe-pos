# Evidencia TDD — Contrato de consulta de oferta comercial

**Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`
**Dependencia documental:** PR #634 (`ADR-SAAS-086`); este PR no adelanta su merge ni autoriza un despliegue.
**Alcance:** endurecer la entrada y la respuesta de error de `consultarOfertaComercialTenantSaas`, conservando autenticación, autorización de plataforma y lectura server-side de oferta. No cambia Rules, IAM ni recursos remotos.

## Journey y garantías

- Una solicitud no autenticada se rechaza antes de acceder a las dependencias.
- Un operador se autoriza con `COMERCIAL_GOBERNAR` antes de leer la oferta; si falla la evidencia de denegación, el acceso permanece cerrado.
- La solicitud admite únicamente `codigoAprobacion`, como cadena ASCII no vacía de hasta 64 caracteres. El tenant, la oferta y sus términos continúan resolviéndose desde la aprobación server-side.
- Los errores de dominio conocidos conservan códigos y mensajes públicos estables sin `details`; los errores inesperados no revelan rutas, datos ni detalles internos.
- La lectura de oferta devuelve una proyección fija y no realiza escrituras comerciales.

## RED / GREEN

- **RED:** con la implementación previa y los nuevos casos del Emulator, 9/10 pruebas pasaron y la prueba de rechazo de propiedades extra falló (`Missing expected rejection`). La evidencia reproduce la brecha que corrige este cambio.
- **GREEN:** con la validación estricta y la normalización de errores, la suite de `consultarOfertaComercialTenantSaas` en Firestore Emulator pasó 10/10.
- **GREEN focalizado tras revisión:** las pruebas del contrato y la lectura de oferta pasaron 19/19 (8 de la callable y 11 del dominio/lectura). Incluyen corrupción de precio persistido como `failed-precondition`, validación de nueva entrada como `invalid-argument`, y rechazo de filtrar un `invalid-argument` de corrupción como error público de cliente.

## Evidencia ejecutada

| Garantía | Validación | Resultado |
|---|---|---|
| Contrato callable con Firestore local, autorización, errores de entrada y aislamiento de lectura | `npx firebase --project demo-e2-2-commercial-callable emulators:exec --only firestore "npm --prefix functions run test:commercial-offer-callable:emulator"` | PASS (10/10; loopback, proyecto `demo-*`) |
| Orden de autenticación/autorización, validación estricta y sanitización de errores | `commercial-offer-callable-contract.test.ts` | PASS (8/8) |
| Clasificación de entradas nuevas frente a estado persistido inconsistente | `commercial-offer-read.test.ts` | PASS (11/11) |

Las 19 pruebas focalizadas se ejecutaron en la rama `codex/e2-2-commercial-callable-tests`, dentro de `functions/`, sobre el código del commit `293a2c24f23fedcd59e5b0f213566e6bfe5f5711`, con este comando:

```powershell
npx --no-install tsx --test src/platform/commercial-offer-read.test.ts src/platform/commercial-offer-callable-contract.test.ts
```
| Regresión de la suite `test:auth-foundation` | `npm run test:auth-foundation` | PASS (494 aprobadas, 0 fallidas, 25 omitidas) |
| Integridad del diff | `git diff --check` | PASS |

## Validaciones locales no disponibles y resultado de CI

- El build local de Functions no terminó: esta worktree no tenía instaladas las dependencias raíz (`dotenv` y módulos `firebase/*`).
- La repetición post-corrección del Emulator no pudo arrancar: el entorno tiene OpenJDK 17.0.20.1 y firebase-tools requiere JDK 21 o superior; ese intento no ejecutó pruebas de Emulator.
- No se pudo instalar `functions-commercial` localmente: npm informó `ECONNRESET` y la repetición sin red no encontró `google-auth-library@10.9.1` en caché.
- CI completo del head de código `e4d89138622ca236f6c97a04ead2fe5af33d344d` terminó en PASS en la ejecución `39977095422` (2026-10-23 15:49:43 UTC). Para ese SHA pasaron `Build de Functions`, `Build del codebase Commercial`, `Discovery secret-free del codebase Commercial`, `Prueba integrada de consulta comercial en Firestore Emulator`, el workflow completo y la auditoría automática E4.2. El resultado del build/discovery queda respaldado por CI, no por una ejecución local.
- No se midió cobertura.
- CI verde, conformidad arquitectónica y autorización de despliegue son estados distintos. La ejecución local en Emulator prueba el contrato de este código; no prueba staging ni producción. ADR-SAAS-086 requiere quedar integrado según su PR dependiente antes de considerar este código para merge; ningún resultado aquí autoriza desplegar `saas-commercial`.
- No se ejecutaron operaciones comerciales, Bootstrap, escrituras remotas ni despliegues. Las escrituras de fixtures ocurrieron solo en el Firestore Emulator local `demo-e2-2-commercial-callable`.
