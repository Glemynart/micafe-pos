# Revisión documental v0.8 — 2026-11-28

**Goal:** `G-SAAS-02 → M2 → E2.2`

**Bundle:** `dusema-pos-2026-11-v0.8` — `PREPARACION`
**Estado de documentos:** cuatro documentos `BORRADOR`; no vigentes ni exigibles.

## Motivo del cambio

ADR-SAAS-110 fue aprobado por el responsable el 2026-11-28, alternativa A.
Para reclamos nuevos, el cómputo de quince días hábiles se inicia desde el día
siguiente a la recepción verificable del reclamo completo. El requerimiento de
subsanación conserva los cinco días desde la recepción inicial. Los expedientes
históricos sin `plazoRespuestaVersion` mantienen la regla anterior y sus
vencimientos persistidos. Cuando existe subsanación, el servidor exige que la
fecha efectiva de completitud coincida con la recepción documentada de la
información faltante.

La lectura parte del artículo 15 de la Ley 1581 de 2012. Requiere validación
jurídica colombiana antes de publicar una política vigente o activar el flujo
con casos reales; este cambio técnico no es concepto jurídico.

## Versionado y hashes

Se creó v0.8 porque v0.7 ya había sido desplegada en staging. Los cuatro assets
v0.7 se preservan sin cambios; v0.8 contiene copias exactas de las fuentes
`docs/legal` y se mantiene en `BORRADOR`.

| Documento | SHA-256 UTF-8/LF |
| --- | --- |
| Términos | `efcd8eb2365386b8a4277fd7dd731895139fb0861fcc6dd2092fdcb2139d850b` |
| Política de tratamiento | `31392c1b77adf5431e9c80a4b1c6619b893caaac8ebe96f6b85fab9965a1c802` |
| Aviso de autorización | `5ab4a8e97dde0ee5d2b147d319c1a6d4de33a011615f8104f930d39d0144f47c` |
| Anexo por tenant | `7b5b7107e7d1a0e0e77b8da5057eaf56bce0c0b0e02ffba2425be0f12396138b` |

## Validación local

- `npm --prefix functions-legal run build`: aprobado.
- `npm --prefix functions-legal test`: 35 aprobadas, 5 omitidas por requerir Emulator; 0 fallidas.
- `npm --prefix functions-legal run test:emulator`: 6/6 aprobadas, incluyendo reclamo incompleto que se completa 30 días después y preservación de compatibilidad histórica.
- `npm run test:legal-bundle`: 2/2 aprobadas; verifica hashes y conserva v0.7.
- `npm run build:functions`, `npx tsc --noEmit` y `npm run build`: aprobados.
- CI del nuevo HEAD debe confirmarse por separado después del push.

## Límites operativos

- No se desplegó v0.8 a staging ni producción ni se habilitó aceptación.
- Staging conserva el bundle v0.7 anterior.
- Producción no cambió: `/terminos` sigue con contenido heredado de Café Atrato; las otras tres rutas legales continúan en 404.
- No se generó ni entregó una exportación real, no se suprimieron datos y no se cambió IAM productivo.
- Continúan pendientes la aprobación factual/jurídica, la verificación de canales y proveedores, la autorización verificable de exportación, la certificación de supresión/conservación y la auditoría final del PR #706.
