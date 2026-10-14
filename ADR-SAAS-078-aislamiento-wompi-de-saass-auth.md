# ADR-SAAS-078 — Aislamiento de webhook Wompi respecto de `saas-auth`

## Estado

**ACEPTADO — opción 1; diferir la exportación de Wompi.**

- **Fecha de propuesta:** 2026-10-14.
- **Fecha de decisión:** 2026-10-14.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2` / Gate I.
- **Relacionado:** ADR-SAAS-031, ADR-SAAS-049, ADR-SAAS-054, ADR-SAAS-071,
  ADR-SAAS-075 y ADR-SAAS-077.
- **Límite:** la aceptación fija la decisión de arquitectura; no autoriza
  Secrets, Functions, Rules ni producción. La implementación sigue sujeta a
  pruebas y preflight de delta exacto.

## Contexto y evidencia

Gate I necesita actualizar `registrarCompraOperativaV1` con el guard de
ADR-SAAS-075 para impedir que Bodega use la callable legacy, tanto en la
operación inicial como en replay. La función está activa en producción con un
hash anterior al código aprobado en `main`.

La función pertenece al codebase `saas-auth`, cuyo `index.ts` también exporta
`wompiReservasWebhookV1`. Ese webhook declara el secreto
`WOMPI_EVENTS_SECRET`; el secreto no existe en el proyecto productivo
consultado. El preflight exacto de `registrarCompraOperativaV1` se detuvo antes
de desplegar porque Firebase CLI exige resolver esa dependencia durante el
análisis de `saas-auth`. No se creó ni consultó el valor de ningún secreto.

En la relectura productiva, el inventario de 104 Functions no incluye
`wompiReservasWebhookV1`. El Goal vigente excluye reservas públicas y Wompi de
este Trial. Por tanto, no hay evidencia de que el webhook esté activo en
producción ni de que sea necesario para el primer cliente.

## Problema

¿Cómo publicar el guard ya aprobado de la callable legacy sin inventar o
aprovisionar una credencial Wompi que no existe y sin ampliar el despliegue a
una integración fuera del alcance actual?

## Impulsores

- No usar valores ficticios ni crear un secreto sin credencial real del
  proveedor y alcance de producto aprobado.
- Mantener el despliegue de `registrarCompraOperativaV1` aislable y verificable.
- No cambiar el comportamiento de Functions activas de otros verticales.
- No activar Wompi ni reservas públicas como efecto colateral de Gate I.
- Preservar el módulo y las pruebas de Wompi para una decisión futura, si es
  posible.

## Opciones

### Opción 1 — Diferir la exportación del webhook hasta que Wompi vuelva al alcance (recomendada)

Retirar únicamente la exportación de `wompiReservasWebhookV1` desde el índice
de `saas-auth`, manteniendo su implementación y pruebas en el repositorio. El
webhook solo volvería a exportarse cuando el Goal incluya reservas públicas,
exista una credencial legítima y se apruebe un codebase/deploy compatible.
Antes de aplicar el cambio, Gate C debe volver a verificar que el endpoint
remoto no exista; si aparece una Function remota con ese ID, el preflight se
detiene para evitar una eliminación accidental.

**Ventajas:** respeta que Wompi está fuera del Goal, no requiere una credencial
ni un nuevo codebase y deja el módulo fuente disponible para una futura
reactivación. La lectura actual no muestra una Function remota que requiera
preservarse.

**Costes:** cambia el manifiesto de exports de `saas-auth`; requiere validar
build, discovery, ausencia de eliminaciones inesperadas y comportamiento de
las demás Functions antes de desplegar el guard.

### Opción 2 — Crear un codebase independiente para integraciones públicas

Mover el export operativo de Wompi a un codebase separado, conservando la
integración como capacidad aislada de `saas-auth`. La publicación del guard no
incluiría ese codebase y la integración no se desplegaría hasta contar con su
secreto y gate propio.

**Ventajas:** separa de manera duradera secretos e integraciones opcionales del
codebase de autenticación y conserva un boundary de despliegue explícito.

**Costes:** crea un codebase, configuración de build/paquete, gestión de
dependencias compartidas y gates adicionales para una función excluida del
Trial actual. No resuelve la activación futura sin una credencial legítima.

### Opción 3 — Mantener `saas-auth` intacto y aplazar el guard

No cambiar exports ni arquitectura. Mantener Gate I bloqueado hasta que exista
una credencial Wompi real y la autoridad del producto incluya desplegar esa
integración dentro de `saas-auth`.

**Ventajas:** no altera el manifiesto ni requiere migración de codebase.

**Costes:** la callable legacy continúa desplegada sin el guard ADR-SAAS-075 y
no se puede aplicar el cierre de `/compras` para Bodega.

## Recomendación

Se recomienda **Opción 1** para E2.2: reservas públicas/Wompi están fuera del
Goal, y el endpoint no aparece entre las 104 Functions activas observadas. La
exportación del webhook puede diferirse sin borrar su módulo fuente, siempre
que el nuevo preflight confirme antes que no existe Function remota ni delta
de eliminación. Si el producto decide incluir Wompi, Opción 2 da mejor
aislamiento a largo plazo, pero es una iniciativa separada.

## Consecuencias de la recomendación

- El cambio no configura ni inventa `WOMPI_EVENTS_SECRET`.
- La opción 1 está aceptada; su implementación y despliegue siguen sujetos a
  las validaciones y gates enumerados aquí.
- La PR de implementación debe probar discovery y demostrar que no quita,
  reemplaza o modifica Functions fuera del guard de ADR-SAAS-075.
- Un preflight con Function remota inesperada, secretos adicionales o delta
  distinto al aprobado se detiene.
- La aprobación de la ADR no equivale a autorización de deploy. El deploy
  productivo seguirá sujeto a Gate C, CI verde, hashes, rollback, Rules/Vercel y
  smoke en el orden de Gate I.

## Validación y rollback propuestos

1. Añadir prueba de manifiesto/export que demuestre que el webhook no participa
   en la discovery de `saas-auth` y que `registrarCompraOperativaV1` conserva
   guard para operación nueva y replay.
2. Ejecutar pruebas de compras y build de `saas-auth`.
3. Ejecutar preflight en la carpeta productiva aislada y `--project micafe-pos`;
   detener si aparece cualquier Function remota que el cambio vaya a borrar.
4. Verificar que el único cambio de comportamiento es el guard Bodega aceptado
   en ADR-SAAS-075 y que otros verticales conservan el flujo.
5. Si la PR no se despliega, revertir el cambio de export. Si ya se publicó, no
   reexportar el webhook hasta que un plan aprobado confirme secreto y
   propiedad del endpoint; el guard de compra se revierte solo con una
   autorización y preflight de seguridad correspondientes.

## Decisión

Se acepta la **Opción 1**. La decisión la tomó el Lead Engineer bajo la
autorización explícita del responsable para continuar de forma autónoma y
aceptar o rechazar decisiones durante Gate I. Se difiere únicamente la
exportación pública de `wompiReservasWebhookV1` desde `saas-auth`; se conservan
su módulo fuente y sus pruebas. La decisión no habilita Wompi ni reservas
públicas, no crea un secreto y no autoriza deploy por sí sola.

Antes de implementar o desplegar, el preflight productivo debe volver a
confirmar que el endpoint remoto no existe y que el único delta funcional
adicional al guard aprobado es la exclusión de ese endpoint ausente. Si aparece
en remoto o el delta incluye otra Function, se detiene el corte.
