# Preflight de consultas en staging — 24 de noviembre de 2026

Proyecto objetivo: `micafe-pos-staging`, región `us-central1`. Esta preparación
no autoriza conceder facultades en producción ni registrar casos reales.

## Inventario previo de solo lectura

- `consultarContextoPlataforma`: ACTIVE, GEN_2. El código devuelve las facultades
  del registro del operador y su versión; no se ha atribuido un SHA al servicio
  mediante esta consulta.
- `cambiarFacultadesOperadorSaas`: ACTIVE, GEN_2, Node.js 22, codebase `saas-auth`;
  actualización observada 2026-11-24 18:06:18 UTC. El código fuente valida las
  facultades mediante el catálogo compartido y la actualización conserva el
  conjunto elegido, incrementa versión y revoca sesiones. La revisión remota
  observada precede a la facultad `PRIVACIDAD_CONSULTAS_TRAMITAR`.
- `tramitarReclamoPrivacidadSaas`: ACTIVE, GEN_2, codebase `saas-legal`; no
  se observó `tramitarConsultaPrivacidadSaas` en el inventario previo.
- Cloud Run `micafe-pos` sirve la revisión `micafe-pos-build-2026-11-24-001`
  con 100 % del tráfico de staging. La observación de tráfico no prueba por sí
  sola el SHA de la imagen.

## Secuencia y criterios

1. Usar un candidato limpio cuyo SHA exacto tenga CI en verde. Revalidar proyecto,
   inventario y configuración remota justo antes del corte; preservar la revisión
   anterior y el inventario como evidencia. No aplicar un deploy de todo un
   codebase que borre funciones que deben seguir disponibles.
2. Publicar y comparar Rules de staging; comprobar que el expediente privado no
   admite lectura o escritura directa de clientes. Este paso no modifica Rules
   productivas.
3. Actualizar de forma dirigida el gobierno de facultades `saas-auth` y desplegar
   las funciones legales necesarias sin borrar las existentes. Confirmar runtime,
   cuenta de servicio, URI, disponibilidad, inventario y rechazo anónimo. El
   deploy dirigido no concede la facultad a ningún operador.
4. Con la identidad gobernante autorizada y una identidad de pruebas distinta,
   conceder solo la facultad nueva mediante el flujo oficial de Backoffice,
   preservando las facultades ya existentes y verificando versión de autorización.
   La asignación requiere cumplir los controles aplicables al cambio de acceso.
5. Publicar el frontend del candidato en staging. Probar recepción ficticia,
   verificación, prórroga y respuesta; comprobar plazo original, facultad ausente,
   operador distinto y aislamiento. No usar datos personales reales ni aceptar
   documentos borradores como contrato.
6. Contrastar rollout, revisión, procedencia y health checks. Registrar resultados
   y recuperación observada; si hay fallas, mantener la habilitación real pendiente.

La CI y las pruebas de Emulator no sustituyen esta secuencia ni una aprobación
jurídica. Cualquier operación productiva exige su propio preflight y compatibilidad.
