# Resultado de implementación controlada ADR-SAAS-106

Fecha de corte: 2026-11-27 11:34 UTC. Rama del PR #706.

## Alcance implementado

Se añadió un servicio interno para orquestar la aprobación de exportación por
enlace de un solo uso y un adaptador transaccional de Firestore. El servicio:

- exige que una función de servidor autorice al operador para el proyecto,
  tenant y alcance fijo `DUSEMA_EXIT_V3`;
- obtiene el destino exclusivamente de un puerto de resolución de contacto
  verificado, que debe coincidir con proyecto, tenant y versión;
- guarda solo el hash SHA-256 del token, metadatos mínimos, canal y referencia
  opaca del proveedor; nunca persiste el destino ni el token en claro;
- coloca el token en el fragmento de la URL, que no forma parte de la solicitud
  HTTP del navegador, y permite revisar propósito y alcance antes de aprobar;
- valida de nuevo la versión activa del contacto dentro de la transacción que
  previsualiza o consume el enlace; el consumo cambia el expediente una sola
  vez a `APROBADA`;
- permite que un operador autorizado revoque un enlace pendiente y registra el
  UID del operador y hora del servidor; la revocación queda idempotente;
- cierra el expediente si falla la entrega y rechaza enlaces expirados, usados,
  con hash incorrecto o asociados a una versión de contacto revocada.

La URL del enlace y los puertos de autorización, contacto y entrega no tienen
una implementación de producto conectada. La prueba usa un stub de entrega y
un contacto sintético. El servicio no envía mensajes reales, no crea una
autoridad persistente de contacto y no expone endpoints públicos.

## Validaciones ejecutadas

- `node --test scripts/legal/export-approval-link.test.mjs scripts/legal/export-authorization.test.mjs` — 12/12 pasaron.
- `npx eslint scripts/legal/export-approval-link.mjs scripts/legal/export-approval-link.test.mjs scripts/legal/export-approval-link.emulator.test.mjs scripts/legal/export-authorization.mjs scripts/legal/export-authorization.test.mjs` — pasó.
- Firestore Emulator, proyecto demo `demo-dusema-export`: exportación sintética aislada, ciclo de emisión/previsualización/consumo atómico y revocación transaccional — 2/2 pasaron. Se utilizó JDK 21 solo en el proceso de prueba.

No se consultaron tenants reales ni se escribió en staging o producción. No se
exportaron datos ni archivos reales, ni se ejecutó supresión. Esta evidencia
prueba el dominio y las transacciones en Emulator, no un proveedor, un canal,
una identidad real, una UI/end-point de aprobación ni una exportación integral.

## Dependencias todavía abiertas

- ADR-SAAS-107 sigue propuesto y requiere aprobación explícita antes de crear
  la fuente persistente para designar, verificar, versionar y revocar al
  representante de un tenant.
- Falta seleccionar e integrar un proveedor de entrega y comprobarlo con una
  entrega sintética externa.
- Falta integrar los puertos con una callable/API autorizada y una página que
  muestre el alcance y envíe la aprobación. Esa integración debe revalidar los
  permisos de operador y contacto y agregar protección contra abuso.
- El PR #706 conserva sus demás gates de documentos legales, staging y
  producción. No es elegible para merge ni despliegue por esta evidencia sola.
