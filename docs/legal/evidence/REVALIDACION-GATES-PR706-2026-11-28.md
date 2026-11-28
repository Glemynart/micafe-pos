# Revalidación de gates del PR #706 — 2026-11-28

**Goal / Milestone / Epic:** `G-SAAS-02 → M2 → E2.2`
**Alcance:** revalidación read-only de producción, despliegue controlado a staging,
smoke sintético autenticado y estado del PR. No es dictamen jurídico ni
autorización de release productivo.

## PR y CI

- PR #706: `OPEN/DRAFT`, base `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`,
  HEAD `f5f4a6411056f237bcf5284815052ce3a45af94b`; `mergeState=CLEAN`, sin
  revisión humana.
- CI [run 46096038797](https://github.com/Glemynart/micafe-pos/actions/runs/46096038797)
  terminó `success` para el HEAD exacto: 129/129 pasos exitosos, cero fallidos,
  pendientes u omitidos. Los E2E de Bodega U4-U5, agenda/reservas/aislamiento,
  Operator Portal y E4.1 terminaron correctamente.
- El mismo CI pasó exportación sintética de Firestore Emulator (2/2) y
  supresión/conservación sintética (2/2). No ejecutó exportación, borrado o
  restauración con datos reales.
- Pruebas focalizadas locales: `npm run test:legal-bundle` 2/2 y
  `npm run test:g-saas-02:recovery` 14/14.

## Staging

- Se creó manualmente solo el rollout de App Hosting del commit exacto
  `f5f4a6411056f237bcf5284815052ce3a45af94b` en el backend
  `micafe-pos-staging/us-central1/micafe-pos`. Rollout
  `build-2026-11-28-001`: `SUCCEEDED`; Build: `READY`; Cloud Run enruta 100 % del
  tráfico de staging a esa revisión.
- GET de las cuatro páginas `/terminos`, `/privacidad`, `/aviso-autorizacion` y
  `/anexo-tratamiento`: HTTP 200, marca Dusema POS y `BORRADOR`, sin contenido
  Café Atrato.
- GET de los cuatro assets `/legal/v0.7/*.md`: HTTP 200, marcados como
  `BORRADOR/PREPARACION`.
- Después del rollout, `npm run e2e:privacy:staging` pasó 2/2 en 26.9 s. Usó
  operadores, tenants, clientes y un reclamo sintéticos; verificó login,
  registro/consulta/respuesta/cierre, aislamiento A/B, rechazo 403 sin facultad
  y limpieza de todos los fixtures Auth/Firestore.
- No se usó la cuenta de Diana ni se contactó a personas. No se desplegaron
  Functions o Rules y no se cambió IAM.

## Producción e IAM

- App Hosting `micafe-pos` conserva `micafe-pos-build-2026-11-24-002`, `READY`,
  con 100 % del tráfico; no se inició rollout productivo.
- GET read-only productivo: `/terminos` HTTP 200 con título/contenido heredado
  Café Atrato; `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` HTTP
  404.
- Lectura actual de `gcloud functions list --v2`: 117/117 Functions productivas
  activas en `us-central1` usan `882525811433-compute@developer.gserviceaccount.com`.
  La política del proyecto mantiene `roles/editor` para esa identidad, para
  `882525811433@cloudservices.gserviceaccount.com` y para
  `micafe-pos@appspot.gserviceaccount.com`. No se modificó IAM.
- Las cuatro Functions legales observadas en staging están `ACTIVE` con
  `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`, vinculada al
  rol personalizado del piloto. Esto no certifica mínimo privilegio productivo.
- Backups, Storage y Logging: la última lectura de metadatos disponible es del
  2026-11-27. No se comprobó purga por vencimiento ni se restauró una copia.

## Dictámenes

### A. Revisión técnica del PR

**NO APROBADO PARA MERGE.** La CI y los E2E están verdes; sin embargo, el PR
abarca 160 archivos, continúa en draft y no tiene revisión humana. La revisión
integral del diff no está cerrada. ADR-SAAS-109 permanece `Propuesto`; no se
implementa la nueva facultad de plataforma antes de su aprobación explícita
según `AGENTS.md`.

### B. Release legal a producción

**NO LISTO / NO AUTORIZADO.** Los cuatro documentos v0.7 siguen
`BORRADOR/PREPARACION`, sin aprobación factual/jurídica. Las rutas productivas
continúan incorrectas. No están verificados el contacto representante, el
canal ni la instrucción para exportar; no hay certificación de exportación
integral entregada/recibida, supresión/conservación en Auth/Storage/backups ni
restauración real. El IAM productivo conserva el riesgo de identidad compartida
con `roles/editor`, y Vercel mantiene los pendientes contractuales/de
retención documentados.

No se leyeron expedientes u objetos de clientes. Los únicos cambios remotos de
este checkpoint fueron el rollout manual de App Hosting en staging y los
fixtures sintéticos del smoke, cuya limpieza se verificó. Producción permaneció
sin cambios.
