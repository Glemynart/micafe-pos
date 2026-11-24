# Proveedores — evidencia contractual y límites

Fecha: 2026-11-24. Revisión pública de instrumentos y consultas autenticadas de
metadatos; no acredita firma por el prestador ni sustituye análisis jurídico.

Actualización: el prestador confirmó Gmail personal y contratación online Google
sin contrato aparte. La tabla por producto y las comprobaciones técnicas quedan
en [cierre de comprobaciones](CIERRE-COMPROBACIONES-2026-11.md). Esto resuelve el
tipo de cuenta/régimen declarado; no inventa fecha o versión histórica aceptada.

## Google

Los [términos Firebase](https://firebase.google.com/terms) remiten a instrumentos
según el servicio/contrato; no asignar el mismo documento a todos los productos.
Los [Firebase Data Processing and Security Terms](https://firebase.google.com/terms/data-processing-terms)
consultados indican modificación 2024-08-21 y eficacia vinculada al acuerdo de
las partes. El [Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)
está incorporado a los acuerdos allí definidos, con fecha efectiva según aceptación
o acuerdo. Debe conservarse evidencia de la cuenta y contrato realmente aplicables.

Las cláusulas de supresión contemplan hasta 180 días en sus supuestos y un
periodo de recuperación adicional al terminar la relación con Google. Terminar el
contrato de un tenant no termina automáticamente nuestra cuenta Google.
No prometer eliminación física de todas las copias en 35 o 95 días: esos números
solo describen el schedule de backups controlado y las hipótesis documentadas.
Separar supresión activa, snapshots propios y eliminación interna del proveedor.

Regiones de Firestore/Cloud Run/Storage constan en OPERACION-Y-CONSERVACION.md;
no prueban ubicación exclusiva de Auth, FCM, logs, soporte o subencargados.
Instrumento y localización por servicio deben formar parte del registro contractual.

**Pendiente concreto:** evidencia de términos aplicables desde la cuenta/contrato
del proyecto y perfil del cliente contratante. No se detectó un mecanismo CLI de
esta revisión que pruebe por sí solo quién aceptó qué versión y cuándo. Una
factura o el billing activo no son sustitutos de esa evidencia. No se solicita
compartir tokens, medios de pago ni contenido de contratos confidenciales en Git.

## Vercel

Consulta `GET /v2/teams/{id}` mediante CLI autenticada: equipo
`glemynarts-projects`, `billing.plan = hobby`, `billing.status = active`.
La lista general de equipos omitía plan; se contrastó con el recurso del equipo.
Solo se mostraron esos campos, sin información de pago.

El [DPA publicado](https://vercel.com/legal/dpa), actualizado 2026-03-17 y efectivo
2026-03-31, delimita su aplicación como encargado a clientes Enterprise/Pro.
No se acredita cobertura de ese DPA para la cuenta Hobby observada.
Los [términos, sección Hobby](https://vercel.com/legal/terms) restringen ese plan
a uso personal o no comercial. No asumir que un preview comercial queda exento.

La producción observada está en Firebase App Hosting. PR #704 se fusionó en
`main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`: retiró Analytics y configuró
`git.deploymentEnabled=false`, que detiene nuevos despliegues Git de Vercel en
todas las ramas. No deshabilitó GitHub CI ni App Hosting.

Revisión autenticada del 2026-11-24: entre los 100 despliegues más recientes
listados, el preview más reciente asociado a #706 usa el commit anterior
`ff422718a852ca9344569b6882496cbf7860cb69`; no aparece un preview del head actual
`0b60aedea15eb17af413aa802ca342764fd06aaf`. La protección del proyecto indica
SSO para `all_except_custom_domains`; el alias observado es `.vercel.app`, no un
dominio personalizado. Esto acredita que el preview listado requiere acceso SSO,
no que su contenido haya sido revisado ni que todos los despliegues históricos
estén protegidos. No se borraron ni se solicitó borrar artefactos.

La medida reduce despliegues nuevos, pero no elimina previews ni acredita borrado
de sus datos. Antes de cerrar el inventario histórico falta revisar contenido,
vigencia y protección de cada URL que se conserve. El plan Hobby sigue observado;
su compatibilidad con el uso comercial y la cobertura del DPA Pro/Enterprise no
están acreditadas. No se cambió el plan ni se modificaron despliegues.

## Correo

El prestador confirmó que el contacto es Gmail personal. No se verificaron MFA,
recepción ni configuración privada; no se consultó la bandeja de correo.

La [documentación Google de cuentas gestionadas](https://support.google.com/accounts/answer/181692?hl=es)
distingue el contrato empresarial de los términos de servicios adicionales.
No afirmar que el Cloud DPA cubre automáticamente el correo personal.

**Pendiente concreto:** comprobar recepción y protección del canal y el tratamiento
que se hará de la correspondencia. El expediente mínimo puede llevar identificador
y enlace a entrega autenticada; no adjuntar bases completas, credenciales o PIN.
Un buzón empresarial es una alternativa, no una compra autorizada en este corte.

El tipo de cuenta ya quedó confirmado como personal. La recomendación es minimizar
datos en el correo y no asumir cobertura Workspace. El plan por sí solo no decide
si cada uso es lícito o ilícito: falta contrastar finalidad, rol y salvaguardas.

## GitHub y evidencia de aceptación

Instrumento público identificado: [GitHub DPA](https://github.com/customer-terms/github-data-protection-agreement).
La URL antigua en docs redirige a un índice; no usar esa redirección como prueba
de inexistencia de DPA. Falta vincular el contrato aplicable al titular/cuenta.
La revisión no necesita enviar datos operativos a GitHub para resolverlo.

Registro recomendado por proveedor: sujeto contratante, identificador de cuenta
no secreto, productos, rol por tratamiento, instrumento/versión/fecha consultada,
fundamento de incorporación o aceptación, ubicación de evidencia restringida,
subencargados y próxima revisión. Evidencia confidencial fuera del repositorio;
en Git únicamente estado, referencia no secreta y conclusión sustentada.

## Decisiones pendientes

1. Revisar contenido, vigencia y protección de los despliegues Vercel históricos;
   #704 impide nuevos despliegues Git automáticos, no elimina los existentes.
2. Acreditar contratos Google/correo/GitHub en la cuenta; no inventar firmas ni
   aceptar nuevos acuerdos en nombre del prestador sin mandato específico.
3. ADR-SAAS-100 ya fue aceptado para implementación y pruebas controladas. Completar
   exportación sintética/local y sus gates antes de ofrecer una entrega real.
   ADR-SAAS-099 autoriza por separado la implementación de aceptación versionada;
   ninguno autoriza escrituras, extracción o exigibilidad en producción.
