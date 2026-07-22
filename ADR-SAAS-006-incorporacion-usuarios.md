# ADR-SAAS-006 - Incorporacion de usuarios en empresas existentes

## Estado

Aceptado. Amplia MT-U5B sin alterar la estrategia de tenancy de ADR-SAAS-001, la
identidad de dos capas de ADR-SAAS-002 ni la autoridad exclusiva de `membresias`.

## Contexto

Una cafeteria incorpora tanto personal operativo que puede no tener email como usuarios
con email real. El contrato inicial de MT-U5B describia solo la invitacion por correo.
La creacion directa no puede reutilizar el alta legacy basada en email interno, porque
ese mecanismo no es una identidad SaaS reutilizable y esta programado para desaparecer.

MT-U5B es responsable del ciclo tecnico de incorporacion en una empresa ya existente.
MT-U7 crea empresa, owner, configuracion, primer espacio y wizard; solo puede orquestar
este contrato despues de crear la empresa.

## Decision

Se adopta el registro tenant `incorporaciones/{id}` con `empresaId` y dos mecanismos:

1. `DIRECTA`: el administrador incorpora a personal operativo sin email con una
   credencial temporal operativa. La persona debe sustituirla antes de recibir acceso
   operativo. La credencial permanente conserva la politica operativa de la empresa;
   el mecanismo predeterminado vigente es codigo + PIN.
2. `EMAIL`: el administrador emite una invitacion para un email real. El destinatario
   acepta la invitacion y crea o reutiliza su identidad Firebase Auth.

Ambos mecanismos convergen obligatoriamente en:

```
Firebase Auth principal
        |
usuarios/{uid} - perfil global, sin autoridad
        |
membresias/{empresaId}_{uid} - rol, permisos efectivos y estado
        |
claims { empresaId, rol }
        |
autorizacion tenant
```

## Estados de incorporacion

| Estado | Mecanismo | Autorizacion | Transiciones |
|---|---|---|---|
| `INVITED` | `EMAIL` | No existe membresia activa ni claims tenant. | `ACTIVE`, `CANCELLED`, `EXPIRED` |
| `TEMP_CREDENTIAL` | `DIRECTA` | No existe membresia activa ni claims tenant. | `ACTIVE`, `CANCELLED`, `EXPIRED` |
| `ACTIVE` | Ambos | La membresia se crea o activa; claims emitidos o actualizados. | El acceso posterior lo gobierna la membresia. |
| `CANCELLED` | Ambos | No hay membresia activa derivada de esta incorporacion. | Terminal. |
| `EXPIRED` | Ambos al vencer su plazo | Igual que `CANCELLED`. | Terminal. |

`DISABLED` no es un estado de incorporacion. Tras `ACTIVE`, el acceso se deshabilita
unicamente mediante `membresias.estado = inactiva`. Duplicar ese estado en el registro
de incorporacion crearia una segunda fuente de autoridad.

La membresia pasa a activa exclusivamente en la transicion a `ACTIVE`. Antes de ella
pueden existir el principal Firebase Auth y `usuarios/{uid}`, pero no autorizan acceso
tenant. Solo despues de activar la membresia el backend privilegiado emite o actualiza
los claims y fuerza la renovacion de sesion cuando corresponda.

## Reglas de identidad y credenciales

- El backend resuelve si la identidad Firebase Auth ya existe antes de crear una nueva.
- Un administrador tenant nunca sustituye la contrasena, PIN u otra credencial de una
  identidad global existente.
- Una identidad puede tener membresias en varias empresas. La incorporacion solo afecta
  la membresia de la empresa objetivo.
- La credencial temporal `DIRECTA` no es una contrasena Firebase Email/Password ni crea
  un email ficticio. Es una credencial operativa temporal, separada de la contrasena
  Firebase conforme a ADR-SAAS-002 y MT-U5A.
- `EMAIL` nunca modifica la contrasena de una identidad existente. Una identidad nueva
  establece su propia credencial de email real al aceptar.
- Cada `EMAIL` es de uso unico. Cancelacion, expiracion y reenvio invalidan la prueba
  anterior de forma trazable.

## Limites de responsabilidad

### MT-U5B

Posee la creacion directa, invitacion por email, aceptacion, expiracion, cancelacion,
reenvio, uso unico, identidad global, membresia, claims, auditoria y aislamiento tenant.

### MT-U7

Posee empresa, owner, configuracion inicial, primer espacio, wizard y entrada al POS.
Puede invocar cualquiera de los mecanismos de MT-U5B para empleados, sin redefinir el
registro, estados, reglas, credenciales ni tokens.

## Consecuencias

- `membresias` sigue siendo la unica fuente de rol, permisos efectivos y estado.
- `usuarios` sigue siendo perfil global y no contiene autoridad tenant.
- Las plantillas `permisos_roles` solo son base de alta; nunca autorizan runtime.
- Las Functions privilegiadas existentes son la frontera para Firebase Auth, membresias
  y claims. El cliente no escribe esos recursos.
- Electron queda fuera del ciclo hasta MT-U12.

## Decisiones abiertas antes de implementar

1. Duracion exacta de `INVITED` y `TEMP_CREDENTIAL`, incluido el reenvio tras expirar.
2. Canal seguro de entrega de la credencial temporal directa y proveedor/remitente de
   correo transaccional para `EMAIL`.
3. Prueba de posesion para asociar a una segunda empresa una identidad existente sin
   email; no se puede resolver cambiando su credencial.
4. Recuperacion y auditoria cuando Firebase Auth se crea pero la incorporacion no llega
   a `ACTIVE`, incluida la retencion de estados terminales.

## Relaciones

- MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md, seccion 7 y roadmap MT-U5B.
- MT-U5-CAPA0-preflight-arquitectonico.md, seccion 6 y Capa 5.
- ADR-SAAS-001-tenancy.md.
- ADR-SAAS-002-identidad.md.
- ADR-SAAS-004-modelo-empresarial.md.
- ADR-SAAS-007-bootstrap-empresarial.md, que crea el owner y delimita cuándo el
  onboarding puede invocar este contrato para empleados.
