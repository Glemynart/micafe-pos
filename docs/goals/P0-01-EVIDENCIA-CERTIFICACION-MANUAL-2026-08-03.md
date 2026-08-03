# Evidencia de certificación manual P0-01 — Café Atrato

## Trazabilidad

- Goal: `G-MVP-01`
- Milestone: `M1 — Tenant y fiscalidad listos para operar`
- Epic: `E1.1 — Tenant operativo`
- Tenant: `1ae0rD9H8t3ZFSBKrrHR`
- Proyecto: `micafe-pos`
- Commit de aplicación validado: `22ba0093b6b05bc6d5822e11e1d1fa83156e926c`
- PR de certificación: `P0-01 / E1.1`

## Evidencia productiva automatizada

El verificador `scripts/p0-01/verify-tenant.ts` se ejecutó contra producción en modo estrictamente `READ_ONLY`.

- Run ID: `1785779049884`
- Resultado automatizado: `PASS`
- Criterios automatizados: `12/12 PASS`
- Hash del reporte: `32bc903ed4771ef5c138d4d5968b8629089393594ee6d6955e070e82c7677515`
- No se ejecutó `--execute` ni se realizaron escrituras en Firebase.

Los criterios cubiertos fueron tenant/lifecycle, administrador, membresía, claims, credencial operativa, suscripción Trial, plan publicado, configuración B1, readiness B1, capacidades del Plan, espacios tenant-scoped y categorías tenant-scoped.

## Evidencia manual

El responsable confirmó que:

1. inició sesión en el tenant productivo de Café Atrato;
2. navegó por todos los módulos aprobados;
3. no observó errores en la consola del navegador.

La captura recibida muestra el nombre `Café Atrato`, el espacio `Cafetería`, el rol de administrador y los siete módulos aprobados: Vender, Reservas Web, Clientes, Inventario, Compras, Finanzas y Mermas.

Referencia de la captura recibida en la conversación:

- archivo: `codex-clipboard-c93d78a6-cc05-4e97-a7c1-43b443c15239.png`
- SHA-256: `FAF3767218341E047526D9CECDB6E1070D8E97063431728F4F6EC798CDB5AA21`

## Límites de la certificación

- No certifica la identidad fiscal definitiva ni la finalización de P0-02.
- No crea categorías comerciales nuevas ni altera los espacios existentes.
- No modifica Rules, Bootstrap, planes, suscripciones ni datos productivos.
- La identidad fiscal definitiva continúa bajo responsabilidad del administrador del tenant.

## Resultado provisional

Con la evidencia automatizada y manual disponible, P0-01 queda **APTO PARA REVISIÓN**. El estado `APROBADO` depende de la auditoría del PR y de su integración en `main`.
