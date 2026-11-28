# Resultado controlado ADR-SAAS-107 y ADR-SAAS-108

Fecha: 2026-11-27. Alcance limitado a `G-SAAS-02 → M2 → E2.2`, PR #706,
fixtures sintéticos y Firestore Emulator.

## Implementación

- Se añadió una autoridad privada de contacto por tenant y proyecto. Designación
  y control del canal son pruebas distintas; el desafío vence en diez minutos,
  se almacena únicamente como SHA-256, se consume atómicamente y sus eventos de
  inicio, entrega, verificación y revocación no contienen destino ni token.
- El repositorio Firestore valida tenant, proyecto, versión y TTL al consumir el
  desafío. Los registros raíz se reemplazan por el esquema canónico al verificar;
  versiones y eventos quedan en subcolecciones separadas.
- Se añadió un snapshot tenant-específico y versionado del anexo. Requiere perfil
  y representante verificados, instrucciones confirmadas por un admin, módulos
  dentro del contrato, subencargados con huella, y referencias versionadas de
  conservación y seguridad. Campos faltantes o no verificados bloquean.
- El servidor reconstruye el snapshot dentro de la transacción de aceptación y
  compara su SHA-256 con lo que revisó el admin. El recibo v2 fija el snapshot;
  la lectura histórica continúa validando recibos v1.
- La interfaz muestra la ficha concreta y pide confirmar las instrucciones. No
  permite aceptar cuando faltan fuentes verificadas.
- Firestore Rules deniega lectura y escritura directa del cliente sobre la
  autoridad, sus versiones/desafíos/eventos y las fichas de anexo.

## Validaciones ejecutadas

- `npm --prefix functions-legal run build` — pasó.
- `npm --prefix functions-legal test` — 34 pasaron, 5 omitidas porque requieren
  Emulator; no hubo fallos.
- `firebase --project demo-legal-contact emulators:exec --only firestore
  "npm --prefix functions-legal run test:emulator"` con JDK 21 — 6/6 pasaron,
  incluida aceptación concurrente/idempotente, verificación de contacto,
  rechazo de proyecto cruzado y TTL alterado, reclamos y consultas.
- `npx tsc --noEmit` — pasó.
- `npm run build:functions` — pasó.
- `npm run build` — pasó; 57 rutas estáticas/dinámicas generadas.
- ESLint focalizado en UI, servicios, handlers y pruebas — pasó.
- `npm run test:rules` con JDK 21 — 52/52 pasaron.
- `git diff --check` — pasó.

## Límites y estado

- Las pruebas usan referencias y datos ficticios. No se creó un contacto real ni
  se abrió una solicitud de exportación a un titular.
- No existe aún callable/UI para que un operador verifique y mantenga estas
  fuentes server-side. No existe proveedor real configurado ni entrega externa;
  los puertos solo se prueban con stub. Sin esos componentes, el flujo real queda
  cerrado por diseño.
- La selección del proveedor se difiere hasta verificar titularidad de cuenta,
  condiciones contractuales/de tratamiento, región, subencargados, retención,
  registros, costo y mitigación de abuso. Esta es una decisión técnica, no una
  afirmación de cumplimiento jurídico.
- No se publicaron los documentos ni se activó su aceptación con clientes. Esta
  implementación no se desplegó en staging ni en producción, no se modificó IAM
  y no se leyó, exportó, entregó o suprimió información real.
- Este resultado prueba implementación aislada y pruebas locales/Emulator. No
  certifica un smoke autenticado en staging, la identidad de un representante,
  el proveedor de entrega, la exportación integral, la supresión real ni la
  aprobación legal final. PR #706 continúa en draft; auditoría final y merge
  siguen bloqueados por los gates factuales, jurídicos y operativos restantes.
