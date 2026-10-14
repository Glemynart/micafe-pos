# G-SAAS-02 / M2 / E2.2 — Aceptación ADR-SAAS-079

**Fecha:** 2026-10-14
**Resultado:** ADR aceptado para implementación del guard; Gate I sigue `INCOMPLETE`.

## Decisión aceptada

El propietario aprobó ADR-SAAS-079 y la indisponibilidad temporal de emisión DIAN
para estas dos empresas, identificadas en la lectura read-only de Gate I del
2026-10-14:

| Empresa | `empresaId` | Estado observado |
|---|---|---|
| Cafe Atrato | `1ae0rD9H8t3ZFSBKrrHR` | `activa` |
| Prueba | `Prueba` | `trial` |

La indisponibilidad es exclusiva de esos IDs. No se extiende a empresas nuevas,
otros tenants presentes ni a todos los clientes de Factus.

## Alcance técnico autorizado

Implementar en el cliente un guard tenant-aware antes de las invocaciones a
Factus para emisión individual, por lote, nota débito y nota crédito; explicar
la pausa en la interfaz; conservar sin eliminar ni reimplementar la integración
actual de Factus. La futura reactivación queda condicionada a una migración
fiscal server-side verificada y a un cambio aprobado posterior.

El guard no cambia ventas, inventario, caja ni otros flujos no fiscales; no crea
excepciones para Rules. Debe verificarse aislamiento de tenant y ausencia de
efectos fiscales parciales para los dos IDs, además de que otro tenant no sea
bloqueado.

## Límites independientes

Esta aceptación y autorización de código/PR no autorizan:

- desplegar Firestore Rules, Functions o Vercel en producción;
- invocar Factus contra producción, alterar datos, IAM o Secrets;
- ejecutar smoke productivo autenticado sin identidad y alcance autorizados;
- iniciar el Trial de Diana ni asignarle fecha nueva.

Gate I no se declara `PASS`. Los checks, auditoría, preflight y demás atestaciones
de release permanecen pendientes según su propia evidencia.
