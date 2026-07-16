# ADR-SAAS-002 — Modelo de identidad y autenticación

## Estado

Aceptado. Deriva del documento maestro `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
(decisión D-2, §7).

## Contexto

La autenticación actual convierte un `username` en un email interno global
(`username@micafe-pos.internal`) y lo autentica contra Firebase Auth, con datos de
usuario (rol, permisos, PIN) en la colección `usuarios`. Ese namespace es global: dos
empresas no podrían tener ambas un "cajero1". Un POS necesita acceso operativo muy
rápido (entrar y salir muchas veces al día), mientras que la gestión del negocio y la
pertenencia a varias empresas requieren una identidad estable y única por persona.

## Problema

Se necesita una identidad consistente a nivel de plataforma **sin** sacrificar la
rapidez operativa del POS, y resolver la colisión del namespace global para que la
misma plataforma sirva a cientos de empresas. Además, una persona puede trabajar en
más de una empresa.

## Decisión

Se adopta un **modelo de identidad de dos capas**, ambas sobre Firebase Auth.

1. **Identidad SaaS global (email real).** La identidad persistente de una persona en
   la plataforma se ancla a un **email real** (Firebase Auth email/password). Es única
   por persona, global, y es la que recibe invitaciones y soporta pertenencia a varias
   empresas. Dirigida a propietarios, administradores y cualquiera que gestione el
   negocio o pertenezca a múltiples empresas.

2. **Pertenencia a empresas vía `Membresia`.** El par `(rol, permisos)` deja de estar
   embebido en `usuarios` y pasa a `membresias/{empresaId}_{uid}`. Un usuario tiene N
   membresías (una por empresa). El "tenant activo" es un estado del token, no del
   usuario.

3. **Autenticación operativa del POS (configurable, por defecto código + PIN).** Es un
   **mecanismo de autenticación, no una identidad nueva**. Por defecto, código de
   empleado + PIN, *namespaced por empresa* (el código es único dentro de la empresa,
   no globalmente), lo que resuelve la colisión del namespace global. Un empleado puro
   no necesita email. El mecanismo es configurable por empresa a futuro sin cambiar la
   arquitectura.

4. **Convergencia en un único principal con claims.** Cualquiera de las dos vías
   termina en un principal de Firebase Auth con claim `{empresaId, rol}`. La vía
   operativa se resuelve con un **backend privilegiado (Cloud Function)** que valida
   código + PIN contra las credenciales de esa empresa y emite un **custom token** con
   `{uid, empresaId, rol}`. Esto preserva la atribución por usuario (`cajeroId` real)
   y mantiene intactas las rules per-tenant/per-usuario de ADR-SAAS-001.

5. **Transición legacy.** Los usuarios `@micafe-pos.internal` de la empresa actual se
   migran a la "empresa por defecto" conservando acceso y quedan clasificados como
   autenticación operativa. La adopción de email real es incremental y solo necesaria
   para quienes gestionen o trabajen en varias empresas. No se descarta la
   infraestructura actual: se **reposiciona** como capa operativa.

6. **Responsabilidades de Auth.** Firebase Auth es la capa de identidad y emisión de
   token. La emisión de claims (`empresaId`, `rol`, y los de plataforma) es
   responsabilidad **exclusiva de un backend privilegiado**; el cliente nunca los
   escribe. La validación de código + PIN, su rate-limiting y su auditoría también son
   responsabilidad del backend.

## Consecuencias

- Una persona opera de forma natural en varias empresas mediante re-emisión de token.
- La superficie de la Cloud Function de código + PIN es sensible: debe ser
  rate-limited y auditada para evitar fuerza bruta del PIN.
- La descomposición `usuarios` (identidad) + `membresias` (rol/permisos) es el único
  cambio de forma en una entidad existente; es inevitable para el multi-empresa.
- El plano de plataforma tiene identidad separada (`saas_operadores`) y **no** usa
  `membresias` (ver ADR-SAAS-004 y el documento maestro §12).

## Alternativas consideradas

- **Mantener username + email interno global.** Rechazada: colisiona entre empresas y
  no soporta invitaciones por email ni multi-empresa.
- **Prefijar el username por empresa (`username@empresa`).** Menos disruptiva, pero
  limita las invitaciones por email y complica la pertenencia multi-empresa. Rechazada
  como identidad global; su idea de namespacing se conserva solo para la capa operativa.
- **Sesión de "dispositivo/estación" para el POS.** Rechazada: rompería las rules
  per-usuario y la trazabilidad por `cajeroId` de turnos y ventas.

## Relación con otros ADR

- **ADR-SAAS-001** define el mecanismo de claims/rules en el que se apoya la
  convergencia de ambas capas de identidad.
- **ADR-SAAS-004** define `Empresa`, `Membresia` y la separación de planos
  (plataforma/empresa/espacio) que este ADR asume.
- **ADR-SAAS-003** consume la identidad para atribuir acciones y para el acceso según
  estado de empresa/suscripción.
- Documento maestro: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md` (D-2, §7).
