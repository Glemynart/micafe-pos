# Proveedores — evidencia contractual y límites

Fecha: 2026-11-25. Revisión pública de instrumentos y consultas autenticadas de
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
listados, el preview más reciente asociado a #706 usaba un commit anterior al head
de entonces. En el corte del 2026-11-25 se recorrieron las páginas de la lista:
110 despliegues en total, 106 previews y 4 de producción, desde el 2026-09-14
hasta el 2026-11-24. El preview más reciente se creó el 2026-11-24 a las
05:12:06 UTC, antes del merge de #704 a las 05:20:32 UTC; no apareció un preview
posterior. La configuración `git.deploymentEnabled=false` sigue en `main`.

La protección SSO continúa configurada como `all_except_custom_domains`. Tres
URLs de preview consultadas sin sesión respondieron HTTP 302; esas muestras
requieren SSO, pero no sustituyen una inspección individual del contenido de los
106 previews. No se borraron previews: están restringidos en las muestras y
conservan evidencia de PRs anteriores.

Hallazgo distinto: los cuatro despliegues de producción siguen `READY`. El alias
estable `cafeatrato.vercel.app` responde HTTP 200; las otras dos variantes de
alias verificadas redirigen a SSO. El alias estable está excluido por la
configuración `all_except_custom_domains`, por lo que su contenido permanece
público. No se inspeccionó el cuerpo para evitar registrar datos de la página y
no se pausó el sitio, porque esa acción interrumpiría una URL de producción. Esto
deja pendiente decidir su retiro o restricción.

El equipo Hobby activo ya había sido observado mediante la API del equipo. Los
términos vigentes desde el 2026-10-19 limitan Hobby a uso personal o no comercial;
el DPA de Vercel publicado aplica a clientes Pro/Enterprise. Por eso no queda
acreditada la aptitud contractual del alias productivo para el uso comercial de
Dusema POS. No se cambió el plan ni se incurrió en cargos. La configuración
actual reduce nuevas publicaciones Git, pero no elimina despliegues ni resuelve
el uso comercial del alias estable.

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

## Integraciones adicionales detectadas en el código

Revisión de código: 2026-11-25. Estas integraciones aparecen en rutas o módulos
heredados; su presencia en el repositorio no demuestra que estén activas en cada
entorno. No se verificó la configuración runtime de sus variables ni los acuerdos
aplicables. Deben quedar en la política solo con alcance condicional y confirmarse
antes de habilitar esas funciones comercialmente.

| Servicio | Flujo observado | Datos que el código envía o conserva | Estado/evidencia pendiente |
|---|---|---|---|
| Wompi | Widget `checkout.wompi.co` en `/reservar`; callable de reserva crea la reserva y una intención de pago, y el webhook confirma el resultado | El formulario conserva nombre, correo, teléfono, sala/espacio, bloques y fecha en Firestore. Al widget se pasan moneda, importe, referencia, firma de integridad y llave pública; el código revisado no le pasa esos tres datos de contacto en la configuración del widget. | `RESERVAS_PUBLICAS_ENABLED` y llaves no se comprobaron en runtime. Verificar productos, contrato y política de Wompi, campos que el widget recopila y si la ruta heredada se ofrece a clientes de Dusema. |
| Make.com | `lib/eventos-service.ts` hace POST a `NEXT_PUBLIC_MAKE_WEBHOOK_URL` cuando se crea un evento y la variable existe | ID del evento, `empresaId`, título, descripción, fecha, hora, URL de imagen y categoría. La variable tiene prefijo `NEXT_PUBLIC_`; si se configura, su URL queda disponible al cliente. | No se comprobó si la variable está configurada ni quién controla el escenario destino. Confirmar finalidad, minimización, contrato/subencargados y controles contra invocaciones no autorizadas antes de habilitarlo. |
| Google Maps Platform | La landing heredada renderiza el mapa de Café Atrato con `@vis.gl/react-google-maps` | Solicitudes del navegador al servicio de mapas y coordenadas estáticas de Café Atrato; el componente revisado no entrega datos del POS al mapa. | La llave runtime y restricciones no se inspeccionaron. La página/alias público heredado sigue siendo una superficie separada que debe clasificarse. |
| Google Fonts | La landing heredada solicita Pacifico desde `fonts.googleapis.com` | Solicitud del navegador al proveedor; no se observó envío explícito de datos del tenant desde el código. | Confirmar si la landing sigue publicada y si se conserva la dependencia externa antes de describirla como activa. |
| DIAN, catálogo de documentos | El generador de tiquete construye un enlace de consulta QR cuando hay CUFE | El CUFE se incluye como `documentKey` en la URL de consulta que abre el navegador. | Es un enlace de validación documental, no un subencargado de Dusema por esta sola integración. Verificar el proveedor/flujo de facturación usado y la semántica actual del endpoint antes de afirmar que este enlace constituye una factura electrónica. |

FCM forma parte del stack Google/Firebase ya inventariado: el cliente obtiene un
token de mensajería cuando el usuario acepta notificaciones y el backend puede
enviar mensajes push. La habilitación depende de permisos del dispositivo y de la
configuración; no se atribuyen finalidades publicitarias por defecto.

**Acción correctiva documental:** antes de publicar versión definitiva, conciliar
esta tabla con variables y despliegues reales, distinguir rutas heredadas de
funciones de Dusema POS y completar los instrumentos/roles de cada proveedor.
No publicar la lista como exhaustiva hasta terminar esa conciliación.

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
4. Confirmar las integraciones condicionales Wompi, Make.com, Maps, Fonts y FCM
   descritas arriba y revisar el CUFE del QR DIAN; no inferir estado activo por
   existencia de código.
