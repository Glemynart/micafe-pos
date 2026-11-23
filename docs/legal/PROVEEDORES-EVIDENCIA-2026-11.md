# Proveedores — evidencia contractual y límites

Fecha: 2026-11-23. Revisión pública de instrumentos y consultas autenticadas de
metadatos; no acredita firma por el prestador ni sustituye análisis jurídico.

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

La producción observada está en App Hosting; esto no elimina el uso de Vercel
para previews/checks ni el componente Analytics incluido en el código.

**Recomendación sin nuevo gasto:** preparar retiro de Analytics y evaluar retiro
de previews comerciales Vercel manteniendo validación GitHub y App Hosting. Antes
de desactivar integración/checks, revisar ruleset y dependencias reales para no
romper merges. Alternativa: plan apto y contrato aplicable, con autorización de
coste independiente. No se cambió plan, integración o protecciones en esta revisión.

## Correo

El contacto declarado es una dirección `@gmail.com`. No permite inferir si hay
servicio Workspace/Personal contratado, acuerdo empresarial, MFA o administración
organizacional. No se consultó su bandeja ni configuración privada.

La [documentación Google de cuentas gestionadas](https://support.google.com/accounts/answer/181692?hl=es)
distingue el contrato empresarial de los términos de servicios adicionales.
No afirmar que el Cloud DPA cubre automáticamente el correo personal.

**Pendiente concreto:** confirmar tipo de cuenta y términos aplicables; comprobar
recepción y protección del canal. El expediente mínimo puede llevar identificador
y enlace a entrega autenticada; no adjuntar bases completas, credenciales o PIN.
Un buzón empresarial es una alternativa, no una compra autorizada en este corte.

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

1. Elegir retiro de Vercel comercial o contratación apta. Recomendada retirada
   preparada con comprobación de checks; no ejecutar desactivaciones a ciegas.
2. Acreditar contratos Google/correo/GitHub en la cuenta; no inventar firmas ni
   aceptar nuevos acuerdos en nombre del prestador sin mandato específico.
3. Aprobar ADR-SAAS-100 para implementar primero exportación sintética/local.
   La aceptación legal de ADR-SAAS-099 y la exigibilidad productiva siguen separadas.
