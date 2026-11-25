# Preflight de consultas en staging — 24–25 de noviembre de 2026

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

## Revalidación de solo lectura — 25 de noviembre de 2026

- App Hosting staging usa `micafe-pos-build-2026-11-25-001`, con 100 % del tráfico.
  El recurso `Rollout` exacto está `SUCCEEDED`; el `Build` está `READY` y su
  `source.codebase.commit` es `6e63c172d4cba7cc68c6f756148c84a79589e44e`. Esto
  prueba el release de staging observado, no el HEAD actual de #706.
- En producción el backend sigue en `build-2026-11-24-002`, `READY`, 100 % del
  tráfico, con origen `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`. No se
  publicó el candidato de #706.
- El inventario de Functions confirma en staging activas
  `cambiarFacultadesOperadorSaas`, `tramitarConsultaPrivacidadSaas` y
  `tramitarReclamoPrivacidadSaas`, Node.js 22. La función de consultas devuelve
  denegación para la identidad de prueba que se presentó; no se le otorgó la
  facultad. En producción no están desplegadas las dos Functions de privacidad.
- El smoke positivo de la bandeja sigue pendiente. La pantalla de consultas
  puede abrirse, pero una sesión autenticada sin
  `PRIVACIDAD_CONSULTAS_TRAMITAR` ve el mensaje de acceso denegado; abrir una ruta
  no demuestra que el usuario tenga permiso para operar expedientes.
- El flujo oficial de gobierno está en `/backoffice/operadores`. La interfaz pide
  el UID global que ya exista en Firebase Auth. Para un operador existente, el
  botón `Facultades` y `Guardar facultades` reemplazan el conjunto completo; se
  deben conservar `PLATAFORMA_CONSULTAR` y las facultades previas, agregando solo
  `PRIVACIDAD_CONSULTAS_TRAMITAR`. El actor debe ser una identidad distinta del
  objetivo y tener `OPERADORES_GOBERNAR`. Al guardar se incrementa la versión de
  autorización y se revocan los tokens de la cuenta objetivo, que debe iniciar
  sesión otra vez. Si la cuenta todavía no es operadora, primero se incorpora su
  UID por el mismo flujo; la pantalla no busca por correo ni crea credenciales.
- #706 sigue abierto y en borrador. Su HEAD es
  `f26f8b6c1fc29a37cddddfa9365f7c15dfee0a01`; el CI `45562213980` terminó
  `SUCCESS` para ese SHA. `main` sigue en `aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
  El CI verde no sustituye el smoke autenticado, la lectura de Rules ni los demás
  gates y no autoriza por sí mismo a publicar producción.

No se ha concedido ningún permiso ni se han registrado, consultado o modificado
expedientes reales. El smoke debe usar un caso ficticio y registrar solo el
resultado, sin datos personales ni referencias sensibles.

## Revalidación del candidato y cobertura — 25 de noviembre de 2026, 08:16 UTC

- PR #706 conserva HEAD `aa26c0074f010bea84f8b98125b44153149a68c2`, base
  `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`, y continúa `OPEN`/`DRAFT`.
  El run `45570973981` del SHA exacto terminó `SUCCESS` a las 08:16:09 UTC,
  incluidas las pruebas de Functions, Rules, E2E P0-01 y la certificación E4.1.
  El éxito de CI no satisface los gates externos de publicación ni equivale a
  aprobación para merge.
- Preflight de producción `METADATA_ONLY` a las 07:58:33 UTC: inventario de 48
  raíces; todas clasificadas `ADAPTER_DEFINED` o `EXCLUDED_INTERNAL`, con
  `rootAdaptersComplete=true`. No leyó payloads, campos, documentos ni archivos;
  `productionExportCertified` sigue `false`.
- Revalidación HTTP del 25 de noviembre: las cuatro rutas de staging responden
  `200` y muestran los documentos como borrador/no exigibles. En producción,
  `/terminos` sigue sirviendo el título histórico “Términos y Privacidad - Café
  Atrato” y `/privacidad`, `/aviso-autorizacion` y `/anexo-tratamiento` responden
  `404`; el conjunto de documentos v0.2 no está publicado allí.
- No se concedió ninguna facultad a operadores y no se ejecutó el smoke positivo.
  Para concederla se requiere un operador gobernante distinto del UID objetivo;
  no se pudo verificar la sesión integrada activa desde esta revisión. La lectura
  autorizada del Ruleset, la verificación de datos y proveedores, la prueba externa
  del correo, la certificación de salida/supresión y los gates de release siguen
  abiertos.
