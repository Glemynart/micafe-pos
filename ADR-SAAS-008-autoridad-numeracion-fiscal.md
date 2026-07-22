# ADR-SAAS-008 — Autoridad fiscal, selección y asignación de numeración

## Estado

Aceptado. Extiende ADR-SAAS-004. Sustituye únicamente su noción conceptual de una
numeración `activa` por la combinación explícita de **estado de numeración** y
**asignación determinista**; conserva la numeración como entidad por empresa,
sucursal/resolución y contador independiente.

## Contexto

ADR-SAAS-004 decidió extraer el consecutivo de `configuracion/general`, admitir N
numeraciones por empresa y congelar el resultado en la venta. Quedaban abiertos tres
aspectos críticos: cómo elegir una numeración sin ambigüedad, quién tiene autoridad para
incrementarla y cómo garantizar que contador y venta no diverjan bajo concurrencia.

Una consulta que tome “la primera numeración activa” no ofrece unicidad ni orden
semántico. Dos resoluciones válidas pueden coexistir, una sucursal puede requerir una
secuencia propia y dos cobros simultáneos pueden competir por el mismo número.

## Problema

La selección y emisión fiscal deben impedir:

- dos numeraciones seleccionadas para el mismo alcance y tipo;
- números duplicados o retrocesos del contador;
- ventas creadas sin que el número quede asignado;
- números consumidos por una venta que finalmente no existe;
- reimpresiones construidas con configuración o resolución actuales;
- edición retroactiva de una resolución que ya emitió documentos.

Las reglas de seguridad del cliente no bastan para convertirlo en autoridad fiscal.

## Decisión

### Numeración como autoridad de resolución y contador

`numeraciones/{empresaId}_{numeracionId}` es la única autoridad sobre resolución,
prefijo, rango, vigencia y último número asignado. El contador nunca vive en
configuración, asignaciones, ventas pendientes ni estado local.

Los estados conceptuales son:

```text
BORRADOR → HABILITADA → AGOTADA
                     → VENCIDA
                     → REVOCADA
                     → PAUSADA → HABILITADA
```

Solo `HABILITADA` puede emitir. Una numeración que ya asignó al menos un documento no
permite cambiar prefijo, resolución, rango inicial, alcance ni reducir el contador. Una
corrección fiscal requiere una nueva numeración.

### Asignación determinista

La selección vigente vive en una entidad separada de asignación, identificada de forma
determinista por empresa, scope y tipo documental. La asignación referencia una
numeración; no copia resolución ni contador.

La resolución sigue este orden:

1. asignación exacta del espacio y tipo documental;
2. asignación general de empresa para ese tipo;
3. rechazo explícito si no existe una asignación válida.

No se elige por orden de consulta ni por un booleano ambiguo. Crear, reemplazar o
retirar una asignación pasa por backend privilegiado y valida que la numeración
referenciada pertenece al tenant, admite el scope y está habilitada.

### Autoridad de emisión

El cliente solicita confirmar una venta, pero no propone el número final ni incrementa
el contador. Un backend privilegiado resuelve la asignación y ejecuta una única
transacción que:

1. lee la asignación aplicable;
2. lee y valida la numeración;
3. comprueba tenant, scope, tipo, estado, vigencia y rango;
4. determina el siguiente número;
5. actualiza el contador;
6. construye el snapshot fiscal;
7. crea la venta.

Si la transacción falla, no existe venta ni se consume número. Al detectar rango
agotado, vigencia vencida o numeración revocada, la emisión se rechaza y el estado
correspondiente se materializa de forma auditable.

### Snapshot fiscal autosuficiente

La venta congela la identidad fiscal aplicable, la revisión de configuración, la
numeración utilizada, scope, tipo, número final, prefijo, resolución, rango, vigencia,
fecha de emisión e impuestos por línea.

Reimpresión y reportes históricos leen ese snapshot. Nunca vuelven a consultar
configuración, asignación o numeración para reconstruir un documento emitido.

### Numeración inicial y cutover legacy

El bootstrap puede crear una numeración en `BORRADOR`; esto no habilita ventas. La
empresa solo emite cuando existe una asignación hacia una numeración habilitada.

La migración del tenant fundacional debe interpretar `consecutivo_actual` como dato de
origen, reconciliarlo con ventas existentes y realizar un único corte. Se prohíbe
mantener dos contadores con escrituras simultáneas.

## Consecuencias

- La selección es única, explícita y auditable por scope/tipo.
- Dos sucursales o resoluciones independientes no compiten por el mismo contador.
- Venta y número fiscal comparten frontera transaccional.
- El cierre de venta fiscal requiere backend privilegiado.
- Los tickets históricos no dependen de configuración mutable.
- Se necesitan controles de concurrencia para asignaciones y numeraciones.
- Una numeración inválida bloquea la venta en lugar de usar silenciosamente otra.
- El cutover del singleton exige una ventana controlada y reconciliación previa.

## Alternativas consideradas

- **Consultar la primera numeración con `activa == true`.** Rechazada: no garantiza
  unicidad ni selección estable por sucursal y tipo.
- **Guardar la numeración elegida dentro de configuración.** Rechazada: mezcla
  preferencias con autoridad fiscal y dificulta cambios atómicos de selección.
- **Permitir que el cliente incremente el contador.** Rechazada: amplía la superficie
  de manipulación y no centraliza validación fiscal.
- **Asignar el número antes y crear la venta después.** Rechazada: deja números
  consumidos sin venta ante fallos intermedios.
- **Consultar configuración/numeración al reimprimir.** Rechazada: altera la evidencia
  histórica cuando cambian los datos vigentes.
- **Mantener un único contador por empresa.** Rechazada en ADR-SAAS-004 por ser
  incompatible con múltiples resoluciones y sucursales.

## Relación con otros ADR

- **ADR-SAAS-001** aporta aislamiento tenant a numeraciones y asignaciones.
- **ADR-SAAS-003** condiciona la emisión al lifecycle empresarial.
- **ADR-SAAS-004** define la numeración como entidad y es extendido por este ADR.
- **ADR-SAAS-007** permite que la numeración inicial nazca en borrador.
- **ADR-SAAS-009** impide emisión cuando la empresa no admite escrituras.
- **ADR-TRIB-001** aporta el snapshot tributario por línea.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (§8, §9 y §14).

