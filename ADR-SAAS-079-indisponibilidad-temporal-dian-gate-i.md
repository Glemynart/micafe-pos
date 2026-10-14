# ADR-SAAS-079 — Indisponibilidad temporal de DIAN durante el corte seguro de Gate I

## Estado

Aceptado — 2026-10-14. El propietario aprobó explícitamente implementar el
bloqueo reversible antes de Factus, acotado a las dos empresas enumeradas en
esta decisión. La aceptación habilita preparación de código y PR; no autoriza
despliegues ni cambios productivos.

## Contexto

El propietario acepta que la facturación electrónica permanezca temporalmente
indisponible para las empresas actuales que comienzan operaciones, mientras se
migra la escritura fiscal a una autoridad de servidor. La decisión es acotada a
las dos empresas `activa`/`trial` observadas en la lectura productiva de
2026-10-14; antes de un corte debe repetirse la lectura y detenerse si cambia el
conjunto.

La matriz de Gate I observa que las Rules remotas todavía permiten una transición
limitada de `/ventas/{id}`, mientras `main @ f604a0a` deniega todas las escrituras
cliente. El recurso de Rules se publica como release de proyecto, no por empresa.
El cliente actual llama a Factus para emitir factura/nota antes de guardar los
metadatos DIAN mediante `guardarMetadatosDian()` (`setDoc` cliente). Publicar solo
las Rules puede dejar un efecto externo emitido sin persistencia local.

En la instantánea consultada no se observaron ventas con `dian.emitidoEn`, y las
dos empresas actuales tienen readiness fiscal incompleto. Es evidencia puntual;
no prueba que no haya solicitudes futuras ni que el mismo alcance aplique a
empresas creadas después.

## Decisión operativa aceptada

Se acepta temporalmente no emitir documentos electrónicos DIAN exclusivamente
para:

| Empresa | `empresaId` | Estado observado |
|---|---|---|
| Cafe Atrato | `1ae0rD9H8t3ZFSBKrrHR` | `activa` |
| Prueba | `Prueba` | `trial` |

La evidencia de origen es la lectura read-only productiva de Gate I del
2026-10-14. No cambia datos, no elimina la integración Factus, no habilita una
publicación y no extiende la indisponibilidad a otras empresas presentes o
futuras. Si la lista de empresas activas/trial cambia, el preflight debe
detenerse y solicitar una decisión nueva antes de cualquier corte.

## Decisión técnica aceptada

Se implementará en el cliente un guard tenant-aware inmediatamente antes de
cualquier invocación a Factus desde Historial. Cubre emisión de factura
individual, lote, nota débito y nota crédito, y compara únicamente el
`empresaId` del contexto activo con los dos IDs aprobados. La interfaz explicará
que la emisión fiscal está temporalmente deshabilitada para esta empresa. El
guard no cambia checkout ni el procesamiento no fiscal de venta, inventario o
caja.

Se conserva íntegra la implementación y lógica de Factus. El guard es una
medida temporal de compatibilidad en el límite UI, no una nueva autoridad ni
un reemplazo de Rules o del backend. La reactivación solo se prepara en un
cambio posterior a la migración fiscal server-side correspondiente y requiere
verificar su operación; no se retirará este guard automáticamente.

La prueba debe demostrar que para esos dos IDs no se invoca Factus ni se intenta
persistir metadatos DIAN y que las operaciones no fiscales del POS siguen
disponibles. La decisión no concede una excepción de escritura cliente en
Rules. Todo despliegue conserva su autorización independiente.

## Alternativas

1. **Bloqueo previo a Factus, solo en las empresas aceptadas (recomendada):**
   evita el efecto externo sin persistencia, mantiene la integración y acota la
   interrupción operativa.
2. **Publicar únicamente Rules:** rechazada como suficiente; el cliente puede
   llamar a Factus antes de recibir el rechazo de Firestore.
3. **Deshabilitar DIAN para todo tenant presente o futuro:** rechazada por
   exceder la aceptación operativa, que solo cubre las empresas identificadas.
4. **Restaurar o mantener permiso de escritura cliente:** rechazada; convertiría
   al cliente en autoridad fiscal y contradice el corte server-authoritative.

## Consecuencias y límites

- Ventas, inventario, caja y flujos no fiscales deben conservar su autoridad y
  comportamiento actuales; la prueba local Emulator/E2E es evidencia de
  regresión, no un smoke productivo autenticado.
- Temporalmente no se emitirán facturas, lotes ni notas DIAN para las dos
  empresas indicadas. La persistencia `guardarMetadatosDian()` tampoco se
  considerará operativa hasta migrarla al servidor.
- Lectura e impresión de documentos fiscales históricos no se declaran
  interrumpidas por esta decisión; deben comprobarse por separado si existen
  documentos aplicables.
- La aceptación habilita esta implementación y su PR, no el despliegue de
  Rules, Functions o Vercel; cada publicación conserva su autorización
  independiente.

## Pruebas y rollback requeridos antes de cualquier release

- Cubrir los dos IDs: cada acción DIAN se bloquea antes de invocar Factus.
- Cubrir tenant fuera de alcance: la decisión no le aplica; si el conjunto de
  tenants cambió, detenerse y replantear antes de desplegar Rules.
- Ejecutar Rules Emulator, aislamiento multi-tenant y regresión de venta,
  inventario, caja y Bodega.
- Publicar primero el cliente con el bloqueo y verificar su SHA; después de
  preflight exacto, Rules se despliega solo con autorización explícita.
- Ante una degradación, preferir forward-fix. No restaurar Rules antiguas sin
  congelar las operaciones de compra protegidas por ADR-SAAS-072 y sin
  autorización: el ruleset anterior reabre escrituras directas. Revertir el
  bloqueo DIAN solo después de verificar la ruta server-side en producción y
  con autorización separada.
