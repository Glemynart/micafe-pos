# ADR-SAAS-079 — Indisponibilidad temporal de DIAN durante el corte seguro de Gate I

## Estado

Propuesto — 2026-10-14. La aceptación operativa de la indisponibilidad consta en
la evidencia de Gate I; este ADR no se considera aceptado y no autoriza cambios
de código, Rules ni despliegues.

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

## Decisión operativa ya aceptada

Se acepta temporalmente no emitir documentos electrónicos DIAN para las dos
empresas identificadas en la evidencia de Gate I, hasta que exista la ruta
server-side. Esta aceptación no cambia datos, no elimina la integración Factus,
no habilita una publicación y no extiende la indisponibilidad a nuevas empresas.

## Propuesta técnica

Antes de publicar Rules que rechacen el writer cliente, agregar un bloqueo
reversible en el límite de la aplicación que precede a cualquier efecto Factus,
con alcance explícito a los IDs de las empresas identificadas en la evidencia.
Debe cubrir emisión individual y por lote, así como emisión de notas débito y
crédito; la interfaz debe explicar que la función fiscal está temporalmente
deshabilitada. El código de integración Factus y su lógica de emisión se
conservan sin borrarse ni reimplementarse. La futura migración server-side se
tramita en un cambio separado y su activación retira el bloqueo por un cambio
aprobado.

La prueba debe demostrar que para esos dos IDs no se invoca Factus y que las
operaciones no fiscales del POS siguen disponibles. Antes de la publicación,
un preflight debe revalidar que el conjunto `activa`/`trial` sigue siendo
exactamente el mismo; cualquier tenant adicional o cambio de identidad detiene
el corte y requiere una decisión nueva. La propuesta no concede una excepción
de escritura cliente en Rules.

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
- ADR-SAAS-079 requiere aprobación explícita antes de implementar su propuesta.
  Los despliegues de Rules, Functions y Vercel conservan autorizaciones
  independientes.

## Pruebas y rollback requeridos antes de cualquier release

- Cubrir los dos IDs: cada acción DIAN se bloquea antes de invocar Factus.
- Cubrir tenant fuera de alcance: la propuesta no le aplica; si el conjunto de
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
