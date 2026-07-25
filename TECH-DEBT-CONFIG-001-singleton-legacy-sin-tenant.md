# TECH-DEBT-CONFIG-001 — `configuracion/general` sin vínculo de tenant

> **Estado:** deuda registrada, no resuelta. **Bloquea:** el soporte de una segunda Empresa.
> **No bloquea:** el backfill de `empresaId` de MT-U3 ni el despliegue de Firestore Rules.
> **Unidad responsable de resolverla:** MT-U6→U8 B1 (`MT-U6-U8-B1-configuracion-empresarial.md`).
> **Detectada:** 2026-07-25, durante la verificación del tenant fundacional previa al backfill de MT-U3.
> **Decisión explícita:** NO se amplía el alcance de MT-U3 para incluir esta colección.

---

## 1. Hallazgo

La configuración de negocio del POS vive en un **documento singleton de id fijo**,
`configuracion/general`, que **no tiene campo `empresaId`** y por tanto no está
referenciado por ningún tenant.

Evidencia recogida sobre producción (`micafe-pos`, 2026-07-25):

```
configuracion            1 doc    conEmpresaId=0    docId="general"
configuraciones          0 docs   (colección vacía)
```

Contiene la identidad fiscal y de marca del negocio:

```
consecutivo_actual, direccion_tienda, email, mensaje_ticket, nit_tienda,
nombre_tienda, prefijo_factura, regimenTributario, resolucion_dian,
responsable_iva, telefono, tipo_contribuyente
```

`configuracion` está **deliberadamente** en `GLOBALES_CONOCIDAS`
(`scripts/mt-u3-colecciones-oficiales.ts:66-73`), conforme a
`MT-U3-helper-tenant-diseno.md` §7.2: MT-U3 no le añade `empresaId` por diseño.
Esta deuda **no es un defecto de MT-U3** — es alcance que corresponde a otra unidad.

## 2. Por qué no rompe nada hoy

Existe exactamente una Empresa (`1ae0rD9H8t3ZFSBKrrHR`, `esFundacional: true`),
así que un singleton global y un documento por tenant son indistinguibles en la
práctica. El sistema funciona.

El riesgo se materializa **en el instante en que exista una segunda Empresa**: a
partir de ahí, `configuracion/general` sería configuración compartida entre
tenants — nombre comercial, NIT, resolución DIAN y mensaje de ticket de una
Empresa visibles y aplicables a otra. Es una fuga de frontera de tenant en datos
fiscales, no un problema estético.

## 3. Estado real de la migración

La solución **ya está diseñada y parcialmente construida**. Lo que falta es
ejecutar la migración de datos para el tenant fundacional.

| Pieza | Estado |
|---|---|
| Contrato destino `configuraciones/{empresaId}` | ✅ Especificado en `MT-U6-U8-B1-configuracion-empresarial.md` §2.1: *"única autoridad de configuración editable después del cutover"*, un documento por Empresa con clave lógica `empresaId` |
| Callables B1 de escritura | ✅ Implementados (`functions/src/configuracion/service.ts`) |
| Escrituras al singleton legacy | ✅ Ya desactivadas — `lib/configuracion-service.ts:90` lanza *"B7 Cutover: Las escrituras a configuracion/general están desactivadas"* |
| Analizador de paridad legacy→B1 | ✅ Construido (`lib/configuracion/legado-paridad.ts`, `scripts/analizar-configuracion-legacy.ts`, solo dry-run) |
| **Migración de datos ejecutada** | ❌ **No** — `configuraciones` está vacía |

Es decir: el sistema está en un **cutover a medias**. El legacy es de solo lectura
y el modelo nuevo es la autoridad, pero el dato nunca se movió.

## 4. Qué dice el analizador de paridad

Ejecutado en dry-run sobre producción el 2026-07-25:

```
bloqueaReadinessFiscal: true
causasReadinessFiscal: CONFLICTOS_LEGACY, DOMICILIO_FISCAL_INCOMPLETO,
                       IDENTIDAD_FISCAL_INCOMPLETA, MODULOS_SIN_CONFIGURAR
```

Clasificación de los campos legacy:

| Clasificación | Campos | Destino |
|---|---|---|
| `CONFIGURACION_B1` (5) | `direccion_tienda`, `email`, `mensaje_ticket`, `nombre_tienda`, `regimenTributario` | `configuraciones/{empresaId}` |
| `RESERVADO_B2` (6) | `consecutivo_actual`, `prefijo_factura`, `resolucion_dian`, `resolucionVigencia`, `rangoInicio`, `rangoFin` | Autoridad de numeración fiscal (B2 / ADR-SAAS-008), **no** Configuración |
| `CONFLICTO` (4) | `nit_tienda`, `responsable_iva`, `telefono`, `tipo_contribuyente` | Requieren decisión humana |
| `IGNORADO` (6) | `baseCajaSugerida`, `ciudad`, `logoUrl`, `modulos_habilitados`, `razonSocial`, `umbralAlertaFaltante` | Ausentes en el legacy |

Acciones que el propio analizador exige antes de migrar:

1. Completar o verificar NIT y dígito de verificación.
2. No inferir régimen tributario desde la clasificación fiscal legacy.
3. Normalizar teléfono a formato E.164 antes del backfill.

## 5. Propuesta de migración

**Ubicación:** unidad MT-U6→U8 B1, que ya es dueña del contrato. No requiere ADR
nuevo: `configuraciones/{empresaId}` como autoridad única ya es una decisión
aceptada (B1 §2.1), no se está proponiendo nada que la contradiga.

**Precondición:** los 4 campos en `CONFLICTO` exigen resolución humana antes de
cualquier escritura. El analizador se niega a inferirlos, y con razón: `nit_tienda`
y `tipo_contribuyente` determinan obligaciones fiscales reales. Esto **no es
automatizable** y es el verdadero bloqueante.

**Pasos propuestos:**

1. **Resolver los 4 conflictos** con el responsable del negocio: NIT + dígito de
   verificación, `responsable_iva`, `tipo_contribuyente`, y teléfono en E.164.
   Registrar las decisiones por escrito — alimentan el snapshot fiscal.
2. **Ejecutar el analizador** de nuevo hasta `bloqueaReadinessFiscal: false`.
3. **Crear `configuraciones/{empresaId}`** mediante los callables B1 ya existentes
   (no con escritura directa: los callables aplican validación, revisión e
   idempotencia). Solo los 5 campos `CONFIGURACION_B1`.
4. **Dejar los 6 campos `RESERVADO_B2`** en la autoridad de numeración fiscal, sin
   copiarlos a Configuración — B1 §2.3 lo prohíbe explícitamente.
5. **Conservar `configuracion/general` como archivo histórico de solo lectura.**
   Las escrituras ya están desactivadas; **no borrarlo** hasta verificar que
   ningún consumidor lo lee (`components/pos/historial.tsx` aún lo referencia
   para la identidad del ticket).
6. **Migrar los consumidores de lectura** restantes al modelo B1.

**Gate de cierre:** ningún camino de lectura o escritura de configuración
resuelve por id fijo `general`; toda configuración se resuelve por `empresaId`.
Ese es el criterio que debe cumplirse **antes** de dar de alta una segunda Empresa.

## 6. Intervención relacionada, ya ejecutada (no confundir)

El mismo día en que se detectó esta deuda se ejecutó un backfill **distinto y
sin relación con `configuracion/general`**, sobre el documento de la empresa
fundacional:

| | |
|---|---|
| Script | `scripts/backfill-empresa-fundacional-contrato.ts` |
| Ejecutado | **2026-07-25**, producción (`micafe-pos`) |
| Documento | `empresas/1ae0rD9H8t3ZFSBKrrHR` |
| Campos escritos | `actualizadaEn = creadaEn`, `revision = 1`, `schemaVersion = 1` |
| Estado | ✅ Completado y verificado. **No es una migración pendiente.** |

Reparó un dato histórico: la empresa fundacional se creó con el contrato de
MT-U1 y le faltaban tres campos que exige el contrato actual. Es idempotente y
reejecutarlo es un no-op verificado. **No** resuelve nada de esta deuda ni forma
parte del flujo operativo normal — se documenta aquí solo para que nadie lo
confunda con trabajo pendiente al leer este documento.

## 7. Lo que este documento NO hace

- No modifica `scripts/mt-u3-colecciones-oficiales.ts` ni el alcance de MT-U3.
- No ejecuta ninguna migración ni escribe en Firestore.
- No redefine el contrato de `configuraciones/{empresaId}`, ya fijado en B1.
- No resuelve los 4 conflictos de datos: requieren decisión del negocio.
