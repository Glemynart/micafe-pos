# Revisión documental v0.9 — 2026-11-28

**Goal:** `G-SAAS-02 → M2 → E2.2`  
**Bundle:** `dusema-pos-2026-11-v0.9` — `PREPARACION`  
**Estado:** cuatro documentos `BORRADOR`; no vigentes ni exigibles.

## Cambio

La v0.8 identificaba a Sebastián Agudelo Muñoz como prestador y contacto, pero
el anexo no mostraba su domicilio registrado ni los canales de contacto del
prestador. Se añadieron al apartado de partes del anexo los datos suministrados
por el responsable desde el RUT. No se modificó el alcance del tratamiento ni se
añadieron compromisos de conservación, seguridad o supresión.

Para preservar la inmutabilidad del texto v0.8 ya servido en staging, se creó un
nuevo bundle v0.9. Los otros tres documentos solo recibieron el rótulo de versión
0.9; sus términos sustantivos permanecen iguales. La versión anterior y sus
assets permanecen intactos.

## SHA-256 UTF-8/LF

| Documento | SHA-256 |
|---|---|
| Términos | `7af90c5fc6c1bf2c4e06a5cedd1fe427bf698995bfa1b5a31bfcd1a9c25a2b7a` |
| Política de tratamiento | `440fdaa02e6b3c687e7f8cc35862269ebe7e8af45ed263121e7edf2daae8e554` |
| Aviso de autorización | `eb3fa4a8dddecc1fea7ee6817e96093828f31bd04bd920389336009982fe32a3` |
| Anexo por tenant | `aaeff070aa6b11a714281d9fc94b5e64af34ea2403efae42bae0cb2dbb76bcbc` |

## Estado y validación

- Los cuatro documentos siguen en `BORRADOR` y el bundle permanece en
  `PREPARACION`; la callable de aceptación debe seguir rechazándolos.
- `npm run test:legal-bundle` debe confirmar fuente, asset, hash y preservación
  de v0.8/v0.6 antes de integrar este cambio.
- Esta corrección factual no constituye aprobación jurídica ni despliegue.
  Primero requiere CI del SHA candidato; cualquier verificación posterior se
  limitará a staging hasta que se cierren los gates de publicación.
