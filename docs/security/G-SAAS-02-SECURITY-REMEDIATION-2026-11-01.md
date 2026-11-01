# G-SAAS-02 — Remediación de seguridad acotada, 2026-11-01

**Base revisada:** `main` en `4ed5a45e5be1d81348fbcb23a65665963eae8c3b`  
**Jerarquía:** `G-SAAS-02 → M2 → E2.2`, con impacto en el gate de seguridad `M3 → E3.2`.  
**Estado:** cambios preparados para revisión; no acredita release ni despliegue.

## Hallazgos corregidos

1. `POST /api/notifications/send` autorizaba el envío con `rol` y `empresaId` del ID token, sin comprobar que la membresía canónica siguiera activa. Ahora verifica revocación del token y exige coincidencia de UID, tenant, rol y membresía activa antes de enviar. Conserva los roles que ya admitía (`admin`, `cajero`, `supervisor`).
2. La ruta devolvía el texto de errores internos al solicitante y aceptaba payloads sin límite efectivo de lectura o destinos arbitrarios. La respuesta ahora es genérica; el cuerpo se limita a 4 KiB, título a 120 caracteres, mensaje a 1.000 y destino a rutas internas de `/admin` o `/pos`.
3. Los logs del envío exponían prefijos de tokens FCM y el UID del perfil al purgar tokens. Se retiraron esos valores de los logs.
4. `npm audit` encontraba advisories altos en dependencias de producción y herramientas. Se actualizó `re2js` de 2.8.6 a 2.9.1, junto con parches compatibles de `follow-redirects`, `joi` y `undici`; se actualizó el lockfile de Functions con `firebase-admin` 14.5.0 y el override de `qs` 6.16.1.
5. La lógica del endpoint se separó en un servicio inyectable para probar autorización y validación sin conectar con Firebase ni enviar notificaciones. La ruta conserva el mismo contrato HTTP.

## Evidencia de dependencias

Resultados observados después de actualizar los lockfiles:

| Ámbito | Altas/críticas | Moderadas | Resultado |
|---|---:|---:|---|
| Repositorio completo | 0 | 24 | Quedan findings, principalmente en herramientas de desarrollo y cadenas transitivas. |
| Dependencias de producción del repositorio raíz | 0 | 4 | Persisten avisos de `google-gax` 5 y su cadena `rimraf`/`glob`/`minimatch`. |
| Dependencias de producción de Functions | 0 | 6 | Persisten avisos de `google-gax` 5 y su cadena transitiva; incluye `gaxios`/`gcp-metadata` del paquete API de Firestore. |

No se forzó `google-gax` 6 dentro de consumidores que declaran `google-gax ^5`: sería un salto de versión mayor de la API transitiva sin una comprobación de compatibilidad. Tampoco se aplicó el downgrade mayor que npm propone para `firebase-tools`/ESLint. Estos avisos quedan pendientes de una actualización upstream o de una validación de compatibilidad separada.

## Alcance y límites

- Esta revisión cubrió `npm audit` y el endpoint de envío push, incluida la autorización tenant-aware y el manejo de entrada/logs. No es una certificación integral del repositorio.
- `npm run test:notifications-send`: PASS, 7/7. Cubre Bearer y tamaño de cabecera, verificación de revocación, roles/claims, membresías activas y coincidencia de tenant/UID/rol, respuesta genérica ante fallos, límites del cuerpo declarado y transmitido, validación de campos, rechazo de URL externa y rutas internas admitidas.
- `npx tsc --noEmit`: PASS en el checkout de la rama. La CI completa del PR debe terminar en verde antes de evaluar el merge.
- No se modificaron Firestore Rules, IAM, datos, secretos ni recursos remotos. No se desplegó a staging ni producción.
- Esta corrección endurece el endpoint existente; no amplía las funciones de notificaciones ni cambia su política de producto.
- Para producción todavía se requiere revisar el PR, esperar CI y autorizar el despliegue como corte separado.
