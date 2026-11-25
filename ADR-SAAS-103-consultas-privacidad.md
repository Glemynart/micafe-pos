# ADR-SAAS-103 — Consultas de privacidad en Backoffice

Estado: **Aceptado para implementación y pruebas**, por la directiva de misión
que solicita expresamente tramitar consultas desde Backoffice y delega las
decisiones técnicas. No autoriza asignar facultades a personas ni activar el
flujo en producción sin verificar el corte, ni constituye aprobación jurídica.

## Decisión

Complementar ADR-SAAS-102 con un expediente separado para consultas de acceso,
sin crear ni retirar la leyenda de reclamo. Usar `privacidad_consultas` sin acceso
directo de cliente; la callable `tramitarConsultaPrivacidadSaas` exige token no
revocado, operador activo y la nueva facultad explícita
`PRIVACIDAD_CONSULTAS_TRAMITAR` en cada transacción. No añadirla a facultades por
defecto ni concederla a operadores que solo poseen facultad de reclamos. Cada
expediente queda asignado al operador que lo registra; las verificaciones de
identidad, representación e instrucción se documentan por referencias, sin
copiar documentos identificatorios a Firestore.

Registrar recepción y verificación, calcular diez días hábiles, permitir una
prórroga comunicada de hasta cinco días hábiles, y conservar referencia del
aviso y de la respuesta. La respuesta comunicada cierra el expediente; reintentos
idénticos son idempotentes y los conflictos se rechazan. La información entregada
al titular permanece en un canal restringido externo, no en el expediente ni en
la exportación comercial ordinaria. La función no envía correo ni verifica por sí
misma los soportes; esas actuaciones deben comprobarse y documentarse por el
operador. Se admite registrar la recepción pendiente de verificación y completar
la identidad después usando el mismo consecutivo, conservando el plazo original.
La reasignación y consultas ajenas a un tenant no se ofrecen automáticamente:
requieren procedimiento documentado y alcance adicional.

## Gates

Pruebas negativas de token, facultad, operador ajeno, entradas, concurrencia,
reintentos, plazos y Rules; ensayo sintético de interfaz en staging; inventario
y corte dirigido de la callable, Rules y el mecanismo de gobierno de facultades.
Antes de conceder la nueva facultad a una persona se debe verificar su identidad
y alcance. Sin estas pruebas no declarar el servicio operativo. No entregar
datos reales ni publicar documentos definitivos por implementar esta decisión.
