# Smoke autenticado de aceptación legal — staging — 2026-11-27

## Resultado

**PASS técnico acotado** en `micafe-pos-staging`. Se usó un usuario Auth
sintético temporal, dos documentos `empresas` sintéticos y una membresía
sintética `admin`. No se usó la cuenta ni la sesión de Diana; no se enviaron
correos, no se aceptaron documentos y no se consultó información de clientes.

| Comprobación | Resultado |
| --- | --- |
| ID token temporal con claims del tenant A | Verificado por Firebase Admin |
| `consultarEstadoLegalTenant` autenticada para A | HTTP 200; devolvió A y estado `PREPARACION` |
| Lectura Firestore del tenant propio A con Firebase ID token | HTTP 200 |
| Lectura del tenant sintético B con el token de A | HTTP 403 denegado por Rules |
| Intento de pasar `empresaId` B a la callable | HTTP 400, `INVALID_ARGUMENT` |
| Intento de aceptación sintética del bundle actual | HTTP 400, `FAILED_PRECONDITION`; cero recibos creados |
| Limpieza de usuario, membresía y ambos tenants | Verificada: no quedaron documentos ni usuario |
| Render autenticado de `/backoffice/privacidad` en staging, observado en Edge | PASS de solo lectura; badge `Operador autorizado` y formulario visibles; sin enviar el formulario ni consultar detalle de casos |

El estado `PREPARACION` es el esperado: los documentos legales siguen como
borradores y el flujo no habilitó aceptación real. La llamada de aceptación
incluyó flags y referencias con formato válido; el servidor la rechazó por
bundle no publicable antes de crear el recibo.

## Procedimiento y límites

El fixture se creó en el proyecto de staging, autenticó una identidad temporal,
ejercitó la callable y Firestore Rules con un Firebase ID token, y limpió los
recursos en un bloque `finally`. La limpieza volvió a consultar Auth y Firestore
para verificar que la identidad, membresía y documentos ya no existían. El
correo usó un dominio reservado para ejemplos; no se configuró ni ejecutó envío.

Dos intentos iniciales con la variante de custom token terminaron localmente en
`auth/invalid-credential` antes de invocar la callable; su limpieza también se
verificó. Se cambió a una identidad temporal con contraseña aleatoria en memoria
y el mismo smoke terminó en PASS. La contraseña y el ID token no se guardaron ni
se imprimieron. En la prueba de barrera de aceptación, el primer intento del
arnés llamó por error al endpoint de aceptación durante el preflight de estado;
respondió `INVALID_ARGUMENT`, sin crear recibo, y la limpieza pasó. Se corrigió
el arnés y la repetición alcanzó `FAILED_PRECONDITION`, cero recibos y cleanup
verificado.

El smoke server-side prueba autenticación y aislamiento de lectura de estado
legal en staging. La observación adicional confirma que una sesión autorizada
puede cargar la pantalla de reclamos; no valida acciones desde UI ni el ciclo
completo del reclamo. No hubo clics de envío, lectura de detalle ni exposición
de expediente. Ninguno de los dos resultados prueba aceptación contractual
exitosa, exportación/supresión, entrega externa, cuentas reales ni producción.
La auditoría sigue `NO APROBADO PARA MERGE` mientras falten aprobación/factualidad
documental y gates reales de exportación, supresión y contacto.

## Fuentes técnicas oficiales

- [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth), intercambio temporal email/password por ID token.
- [Cloud Firestore REST API](https://firebase.google.com/docs/firestore/use-rest-api), Firebase ID tokens se autorizan mediante Firestore Security Rules.

## Actualización posterior — recorrido visual sintético — 2026-11-27T23:32Z

El límite descrito arriba corresponde al smoke server-side/lectura observado en
el corte inicial. Después se ejecutó el flujo completo de Backoffice en staging
con Playwright y datos sintéticos: login, formulario, rechazo de tenant cruzado,
registro, consulta, constancia, cierre, control de operador sin facultad y
limpieza verificada (**2/2 PASS**). Evidencia reproducible y alcance en
[smoke visual autenticado de staging](SMOKE-VISUAL-PRIVACIDAD-STAGING-2026-11-27.md).
No se usó la cuenta de Diana ni se tocaron producción, documentos aceptados,
exportaciones o supresiones reales.
