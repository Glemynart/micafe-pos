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
- **GREEN focalizado:** las pruebas unitarias inyectadas del contrato pasaron 6/6.

## Evidencia ejecutada

| Garantía | Validación | Resultado |
|---|---|---|
| Contrato callable con Firestore local, autorización, errores de entrada y aislamiento de lectura | `npx firebase --project demo-e2-2-commercial-callable emulators:exec --only firestore "npm --prefix functions run test:commercial-offer-callable:emulator"` | PASS (10/10; loopback, proyecto `demo-*`) |
| Orden de autenticación/autorización, validación estricta y sanitización de errores | Pruebas unitarias de `commercial-offer-callable-contract.test.ts` | PASS (6/6) |
| Regresión de la suite `test:auth-foundation` | `npm run test:auth-foundation` | PASS (494 aprobadas, 0 fallidas, 25 omitidas) |
| Integridad del diff | `git diff --check` | PASS |

## Validaciones pendientes y límites

- El build local de Functions no terminó: esta worktree no tenía instaladas las dependencias raíz (`dotenv` y módulos `firebase/*`).
- No se pudo instalar `functions-commercial` localmente: npm informó `ECONNRESET` y la repetición sin red no encontró `google-auth-library@10.9.1` en caché. Por eso, su build y `test:discovery` quedan a cargo de CI para el nuevo head; no se afirman como aprobados.
- No se midió cobertura.
- CI verde, conformidad arquitectónica y autorización de despliegue son estados distintos. La ejecución local en Emulator prueba el contrato de este código; no prueba staging ni producción. ADR-SAAS-086 requiere quedar integrado según su PR dependiente antes de considerar este código para merge; ningún resultado aquí autoriza desplegar `saas-commercial`.
- No se ejecutaron operaciones comerciales, Bootstrap, escrituras remotas ni despliegues. Las escrituras de fixtures ocurrieron solo en el Firestore Emulator local `demo-e2-2-commercial-callable`.
