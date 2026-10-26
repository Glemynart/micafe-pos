# ADR-SAAS-088 — Diferir el perfil comercial inicial de Distribuidora Las Jiménez

## Estado

**ACEPTADO — 2026-10-25 por instrucción expresa del responsable del producto.**

- **Goal / Milestone / Epic:** `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 — Configuración inicial`.
- **Alcance:** solo `empresaId=distribuidora-las-jimenez`, vertical `BODEGA_MVP1`, para permitir trabajo administrativo en DEMO antes de que Diana complete sus datos.
- **Supersede:** únicamente el requisito de que el perfil comercial completo sea condición para entrar al panel en ADR-SAAS-073. No modifica los campos canónicos, la callable de guardado, la validación server-side, la privacidad ni la separación entre DEMO y readiness fiscal.
- **Autorización:** el responsable pidió expresamente diferir el formulario para este tenant y confirmó que los datos se completarán posteriormente.
- **Límite operativo:** esta decisión no autoriza una escritura remota, despliegue, activación fiscal ni falsificación de datos.

## Contexto

ADR-SAAS-073 exige completar el perfil comercial básico antes de acceder al panel de Bodega. La aplicación ya permite continuar en DEMO sin completar el wizard fiscal; el gate que impide llegar al panel es el perfil comercial, que es un flujo distinto. Para el trabajo inicial de Distribuidora Las Jiménez, el responsable pidió posponer ese formulario y dejarlo para Diana.

El perfil comercial conserva valores declarados por el negocio. No constituye verificación ante DIAN. La readiness fiscal sigue dependiendo de sus requisitos propios y no debe cambiar por omitir el perfil.

La pantalla actual también exige escribir manualmente códigos DIVIPOLA. El contrato vigente conserva códigos y nombres de departamento y municipio; la persona no necesita conocer ni editar el código para elegir su ubicación.

## Decisión

1. La interfaz puede omitir el gate de primer acceso únicamente cuando el tenant autenticado sea exactamente `distribuidora-las-jimenez`, su vertical sea `BODEGA_MVP1` y la sesión corresponda a un administrador activo verificado. La identidad se toma de `empresaId` resuelto por la aplicación; nunca de un campo editable del cliente.
2. La omisión es solo de navegación de interfaz y no escribe ni marca como completo el perfil. El panel continúa sujeto a sus controles server-side actuales. La excepción no habilita operaciones fiscales ni cambia readiness.
3. El acceso diferido se mantiene en memoria del componente durante la sesión del panel. No se persiste en Firestore, `localStorage` ni `sessionStorage`. Al recargar la aplicación, el formulario vuelve a aparecer si el perfil sigue incompleto, para que Diana pueda completarlo después.
4. Para los demás tenants, el comportamiento obligatorio de ADR-SAAS-073 permanece igual.
5. Cuando se complete el formulario, departamento y municipio se eligen por nombre mediante listas filtrables alimentadas por una instantánea versionada del catálogo DIVIPOLA oficial. La selección llena internamente los códigos existentes; los códigos no se muestran como campos editables.
6. El código postal, si la interfaz lo conserva, es opcional e independiente. No se calcula a partir de DIVIPOLA ni de la ciudad.

## Alternativas consideradas

| Alternativa | Evaluación |
| --- | --- |
| Mantener el gate sin excepción | Rechazada para este caso por instrucción del responsable; obliga a capturar ahora datos que Diana completará más adelante. |
| Hacer opcional el perfil para todos los tenants | Rechazada: amplía el cambio más allá de Distribuidora Las Jiménez y de la autorización recibida. |
| Guardar un indicador persistente de omisión en Firestore | Rechazada: añade estado remoto y una operación de escritura sin necesidad; la omisión requerida es temporal y de navegación. |
| Excepción de interfaz limitada al `empresaId` aprobado y a la sesión actual | Aceptada: satisface el trabajo inmediato, no crea estado, no altera el backend ni cambia a otros tenants. |

## Seguridad y datos

- El gate no es una frontera de autorización. La callable `registrarPerfilComercialBodegaV1` conserva autenticación, membresía, rol, validación, idempotencia, revisión, aislamiento y auditoría.
- La excepción no produce perfil completo, readiness fiscal, numeración POS, documento tributario ni cambios al Trial, plan o capacidades.
- No se inventa ni se prellena ningún dato legal, territorial o de contacto.
- Se conserva el código DIVIPOLA canónico en el contrato existente y se valida la pareja municipio/departamento en backend.
- El catálogo geográfico se versiona con procedencia y fecha de descarga desde el conjunto oficial del DANE publicado en Datos Abiertos Colombia. La interfaz no deriva ni inventa códigos postales.

## Pruebas requeridas

1. `distribuidora-las-jimenez` con admin activo y perfil incompleto puede diferir el formulario solo en la sesión montada; no se realiza ninguna escritura.
2. Tras recarga, el formulario reaparece si sigue incompleto; al completar el perfil, el gate desaparece conforme al comportamiento existente.
3. Un tenant diferente, un usuario no admin o una membresía inactiva no recibe la excepción.
4. Omitir el perfil no cambia la configuración, la readiness fiscal ni los permisos de ninguna operación.
5. El selector filtra municipios por departamento, conserva ceros iniciales, guarda códigos/nombres canónicos y rechaza texto no seleccionado o una pareja inválida.
6. Un perfil existente completo no vuelve a solicitar datos.

## Consecuencias

- Diana puede recibir acceso al panel administrativo DEMO antes de completar los datos comerciales.
- La información del negocio continuará pendiente y deberá recopilarse antes de cualquier operación que la requiera.
- Si el panel se recarga antes de completar el perfil, volverá a aparecer el formulario; la excepción no es permanente.
- La ubicación sigue usando DIVIPOLA internamente, pero la persona busca por nombres familiares.
- El catálogo fuente se debe refrescar mediante un cambio de código versionado, no mediante una llamada remota en cada inicio.

## Rollback y gates

El rollback consiste en retirar la excepción de interfaz; no hay datos que revertir. Los valores territorialmente válidos guardados se conservan. Las pruebas deben pasar antes de solicitar el PR de implementación. Esta ADR no autoriza despliegues ni cambios remotos.

## Referencias

- [ADR-SAAS-073 — Perfil comercial del primer acceso Bodega](ADR-SAAS-073-perfil-comercial-primer-acceso-bodega.md).
- [Goal G-SAAS-02](docs/goals/GOAL-MVP-COMERCIAL.md).
- [DIVIPOLA — Códigos municipios, DANE / Datos Abiertos Colombia](https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w).
