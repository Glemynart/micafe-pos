# ADR-SAAS-057 — Índice de auditoría de plataforma en staging

## Estado

**ACEPTADO — 2026-10-03.**

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 —
Configuración inicial`.

La aceptación autoriza exclusivamente versionar y publicar, mediante un gate
posterior, el índice compuesto definido aquí. No autoriza cambios de Function,
Rules, Auth, IAM, Secrets, fixture, Bootstrap, Activation ni producción.

## Contexto

ADR-SAAS-056 materializó en staging la proyección read-only
`consultarAuditoriaPlataformaSaas`. El Backoffice autorizado llega a la
callable, revalida `PLATAFORMA_CONSULTAR`, pero su filtro por agregado falla
con `FAILED_PRECONDITION`: Firestore exige un índice para la colección global
`saas_auditoria`.

La evidencia remota del 2026-10-03 identifica exactamente:

```text
collectionGroup: saas_auditoria
agregado.id ASC
agregado.tipo ASC
registradoEn DESC
__name__ DESC (implícito de Firestore)
```

`firestore.indexes.json` tenía los dos campos de agregado en el orden inverso.
Esa variante no satisface el plan de consulta observable. El fallo no es CORS,
autorización, Rules ni un motivo para leer Firestore desde el cliente.

## Decisión

Se corrige la entrada versionada de `saas_auditoria` para declarar exactamente
el índice requerido por `consultarAuditoriaPlataforma`:

```json
{
  "collectionGroup": "saas_auditoria",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "agregado.id", "order": "ASCENDING" },
    { "fieldPath": "agregado.tipo", "order": "ASCENDING" },
    { "fieldPath": "registradoEn", "order": "DESCENDING" }
  ]
}
```

El índice es una estructura de lectura: no modifica evidencia append-only,
Empresa, membresías, credenciales, inventario, finanzas ni autoridad. No se
modifica la callable, sus filtros, paginación, DTO ni códigos de error.

## Alternativas descartadas

| Alternativa | Resultado |
| --- | --- |
| Cambiar la callable o relajar filtros | Rechazada: altera ADR-SAAS-012/056 y puede ampliar la lectura. |
| Leer `saas_auditoria` desde el cliente | Rechazada: contradice backend-only y Rules deny-by-default. |
| Desplegar todos los índices sin plan | Rechazada: no demuestra una mutación limitada. |
| Crear exactamente el índice requerido | **Aceptada:** satisface la consulta existente con alcance aditivo mínimo. |

## Gates posteriores

1. PR de configuración/documentación, CI, auditoría y merge.
2. Preflight read-only que confirme proyecto `micafe-pos-staging`, ausencia del
   índice objetivo y cero deletes/replacements.
3. Creación dirigida de solo ese índice, con estado remoto `READY`.
4. Reintento del panel Historial y reanudación de Gate F.

El rollback no borra automáticamente el índice ni evidencia; si el índice
debiera retirarse, requerirá un gate explícito posterior. Producción y
Distribuidora Las Jiménez permanecen fuera de alcance.

## Reconciliación posterior

El índice fue creado exclusivamente en `micafe-pos-staging` y alcanzó estado
`READY` como `CICAgJiUpoMK`. El panel Historial del Backoffice reintentó la
consulta sobre `E2_2-BODEGA-STAGING-FIXTURE` y mostró cuatro eventos
`CONFIRMADO`; los logs registraron HTTP `200`. La llamada sin Auth devolvió
`401`. No se modificaron documentos del fixture ni otros recursos.

Este resultado cierra únicamente el subgate de auditoría de Gate F. La matriz
funcional completa, el rehearsal, la certificación y los gates posteriores
siguen pendientes.

## Compatibilidad

Preserva ADR-SAAS-012 (auditoría append-only y backend-only), ADR-SAAS-048
(superficie staging limitada) y ADR-SAAS-056 (consulta read-only aislada). No
reabre fronteras ni despliegues de `saas-auth`.
