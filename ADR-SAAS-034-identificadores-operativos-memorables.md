# ADR-SAAS-034 — Identificadores operativos memorables

- **Estado:** ACEPTADO
- **Fecha:** 2026-08-15
- **Decision maker:** Product Owner del Goal G-SAAS-02
- **Relacionado:** ADR-SAAS-013, ADR-SAAS-017
- **Alcance:** nuevas credenciales operativas y nuevas rotaciones de recuperación

## Contexto

El formato anterior combinaba un prefijo técnico derivado del tenant con un
sufijo aleatorio, por ejemplo `1ae0rd-9gy4`. Aunque evitaba colisiones, no era
adecuado para el uso diario de cajeros y administradores, especialmente para
personas que necesitan recordar el código sin apoyo técnico.

La ruta de recuperación además derivaba el prefijo desde el `empresaId`, lo que
exponía un identificador interno en la credencial entregada.

## Decisión

Las credenciales generadas por el sistema usarán un identificador legible:

```text
<negocio>-<persona-o-rol>
```

Ejemplos:

```text
cafeatrato-admin
cafeatrato-maria
cafeatrato-juan
```

El código es un identificador, no un secreto. El PIN de seis dígitos continúa
siendo el secreto personal y la autorización efectiva continúa dependiendo de
la membresía, el rol, los permisos y el estado del tenant.

La unicidad global se conserva mediante la reserva transaccional existente. Si
el identificador ya está ocupado, se agrega un diferenciador legible (`-2`,
`-3`, etc.). No se usan cédulas ni otros datos personales como parte del código.

La entrada acepta mayúsculas y espacios alrededor del separador, pero el valor
canónico persistido permanece en minúsculas y con guiones.

## Compatibilidad y migración

- Los códigos existentes, incluido `1ae0rd-9gy4`, siguen siendo válidos.
- No se rota ninguna credencial productiva automáticamente.
- Las nuevas altas y las nuevas recuperaciones usan el formato legible.
- Una rotación explícita de una credencial existente puede producir el formato
  nuevo y deja inválido el código anterior según el flujo normal de recovery.

## Consecuencias

### Positivas

- Menor carga cognitiva para cajeros y administradores.
- El código identifica negocio y persona sin revelar el `empresaId` técnico.
- Se mantienen PIN, bloqueo, auditoría, permisos y unicidad server-side.

### Negativas

- El código es más fácil de adivinar que uno aleatorio; por eso no se trata como
  secreto y se mantienen el PIN, el rate limit, el bloqueo y la autorización
  server-side.
- Dos personas con el mismo nombre pueden necesitar un diferenciador numérico.

## Implementación

La generación legible se aplica a emisión inicial, incorporación directa y
recuperación. La normalización de login conserva compatibilidad con formatos
anteriores y acepta separadores humanos equivalentes.
