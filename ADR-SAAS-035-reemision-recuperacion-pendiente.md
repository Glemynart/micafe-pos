# ADR-SAAS-035 — Reemisión segura de una recuperación pendiente

- **Estado:** ACEPTADO
- **Fecha:** 2026-08-15
- **Decision maker:** Product Owner del Goal G-SAAS-02
- **Relacionado:** ADR-SAAS-012, ADR-SAAS-017, ADR-SAAS-034
- **Alcance:** recuperación `PLATAFORMA_ADMIN` del administrador de un tenant

## Contexto

`RestablecerCredencialAdministradorTenantSaas` entrega el código y el PIN
temporal una sola vez. Si la transacción termina y el operador pierde la
respuesta antes de copiar los secretos, la credencial queda en
`PENDIENTE_ACTIVACION` y un segundo intento devuelve
`CREDENCIAL_RESTABLECIMIENTO_PENDIENTE`. El PIN no puede recuperarse porque
solo se persiste su hash.

El TTL de 72 horas no es una solución operativa suficiente: una recuperación
pendiente expirada sigue dejando una credencial activa con
`requiereCambio=true`, y la operación original no debe reutilizarse para
rotar silenciosamente una credencial ya emitida.

## Decisión

Se añade una operación explícita y separada:

`ReemitirRestablecimientoCredencialAdministradorTenantSaas`

Solo la puede ejecutar un operador SaaS autorizado con `ACCESO_RESTABLECER` y
la misma evidencia fuera de banda exigida por ADR-SAAS-017. Dentro de una única
transacción Firestore debe:

1. confirmar que la única credencial activa del `ownerUid` tiene una recuperación
   pendiente coherente;
2. marcar el reset anterior como `CANCELADO` y su credencial como inactiva;
3. generar y reservar un nuevo código operativo y PIN temporal;
4. crear un nuevo reset `PENDIENTE_ACTIVACION` ligado a la credencial nueva;
5. registrar la cancelación y la nueva solicitud en auditoría sin secretos.

La operación conserva la idempotencia por `commandId`/`idempotencyKey`. Un
reintento del mismo comando no vuelve a revelar el PIN; una nueva confirmación
consciente genera una nueva rotación completa. La UI muestra la acción solo
cuando la proyección backend detecta una recuperación pendiente.

## Invariantes

- Nunca existen dos credenciales activas para el mismo `(empresaId, uid)`.
- El reset cancelado no puede autenticarse ni activarse.
- El código y PIN solo aparecen en la respuesta de la nueva emisión.
- No se modifican owner, membresía, rol, permisos, Empresa, Suscripción,
  configuración ni Rules.
- La nueva recuperación usa el formato de código vigente de ADR-SAAS-034.
- La operación no escribe directamente desde el cliente ni reutiliza el PIN
  anterior.

## Consecuencias

### Positivas

- Una interrupción de energía, pestaña o red puede resolverse sin intervención
  manual sobre Firestore.
- La rotación perdida queda trazable como `CANCELADO` y la nueva emisión queda
  auditada.
- El procedimiento funciona también si el reset anterior ya expiró.

### Negativas

- Cada reemisión invalida inmediatamente la entrega anterior.
- El operador SaaS debe volver a confirmar la evidencia fuera de banda.
- Un fallo posterior a la transacción puede requerir otra reemisión, porque el
  PIN no se puede recuperar.

## Fuera de alcance

- Recuperación por correo o SMS.
- Lectura administrativa de PIN, hash o código histórico.
- Cancelación arbitraria de credenciales activas que no estén en recovery.
- Cambios en Rules, Bootstrap o en el modelo de permisos.
