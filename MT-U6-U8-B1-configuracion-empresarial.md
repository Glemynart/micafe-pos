# MT-U6→U8 — B1: Especificación de Configuración Empresarial

## 1. Estado, alcance y jerarquía

**Estado:** especificación técnica de diseño para B1.

Este documento convierte en contrato implementable las decisiones ya aceptadas en:

- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`;
- `ADR-SAAS-004-modelo-empresarial.md`;
- `ADR-SAAS-007-bootstrap-empresarial.md`;
- `MT-U6-U8-B0-contratos-invariantes-dominio.md`.

No redefine autoridades, estados, comandos, eventos, gates ni invariantes. Las palabras **DEBE**, **NO DEBE**, **PUEDE** y **SOLO** tienen sentido normativo.

B1 define el documento objetivo, su semántica, validaciones, comandos y compatibilidad. No define interfaces TypeScript, endpoints, Functions, Rules, índices ni el plan ejecutable de migración.

## 2. Decisiones heredadas que B1 aplica

1. `configuraciones/{empresaId}` es la única autoridad de configuración editable después del cutover.
2. Existe exactamente un documento por Empresa y su clave lógica es `empresaId`.
3. Configuración no contiene resolución, prefijo, rango, vigencia, contador ni Asignación de Numeración.
4. Configuración no contiene lifecycle, Suscripción, membresías, roles ni claims.
5. Puertos, drivers, impresoras físicas, credenciales y secretos de integraciones permanecen fuera del documento empresarial.
6. La revisión inicia en 1 dentro del núcleo de Bootstrap o del backfill certificado.
7. Cada mutación efectiva incrementa exactamente una revisión y nunca altera snapshots existentes.
8. `configuracion/general` no admite dual-write y deja de ser fallback después del cutover.

Trazabilidad principal: **CFG-01** a **CFG-05**, **EMP-01**, **AUTH-05**, **CON-01** a **CON-06**, **BST-02**, **BST-06**, **FIS-05**, **FIS-06** y **FIS-10** de B0.

| Invariante B0 | Materialización en B1 |
|---|---|
| **CFG-01** | Ruta determinista y cardinalidad 1:1; ausencia o duplicación es violación recuperable. |
| **CFG-02** | Esquema cerrado sin numeración, selección, membresía, claims ni suscripción. |
| **CFG-03** | Revisión inicial 1 y aumento exacto por mutación efectiva con `expectedRevision`. |
| **CFG-04** | Frontera explícita entre defaults empresariales y puertos/dispositivos Electron locales. |
| **CFG-05** | Aplicación solo futura; Snapshot y reimpresión histórica no leen la revisión vigente. |

## 3. Modelo físico conceptual

### 3.1. Ruta, identidad y cardinalidad

| Propiedad | Contrato |
|---|---|
| Ruta | `configuraciones/{empresaId}` |
| Cardinalidad | Exactamente 1:1 con una Empresa confirmada |
| ID lógico y físico | `empresaId`; no existe un `configuracionId` independiente |
| Propietario tenant | La Empresa identificada por el mismo `empresaId` |
| Creación ordinaria | Solo dentro del commit de Bootstrap |
| Creación legacy | Solo mediante backfill certificado |
| Eliminación | No es una operación funcional independiente; acompaña las políticas de conservación de Empresa |
| Tamaño | Documento acotado; no admite listas sin límite ni blobs |

La coincidencia entre ID del documento, `empresaId` interno y Empresa asociada DEBE validarse. Una configuración huérfana, duplicada o bajo otro ID es inválida.

### 3.2. Metadatos raíz

| Campo | Tipo conceptual | Obligación | Regla |
|---|---|---|---|
| `empresaId` | ID opaco | Siempre | Inmutable e igual al ID del documento. |
| `schemaVersion` | Entero positivo | Siempre | Inicia en `1`; distingue la forma persistida, no las ediciones de negocio. |
| `revision` | Entero positivo | Siempre | Inicia en `1`; monotónica, sin saltos por una mutación individual. |
| `identidadFiscal` | Mapa cerrado | Siempre | Puede estar incompleto fiscalmente, pero debe ser estructuralmente válido. |
| `localizacion` | Mapa cerrado | Siempre | Contiene país espejo, moneda, idioma, zona horaria y domicilio. |
| `impuestos` | Mapa cerrado | Siempre | Políticas tributarias generales; no contiene numeración. |
| `branding` | Mapa cerrado | Siempre | Identidad visual empresarial de las superficies tenant; no contiene reglas de UI. |
| `ticket` | Mapa cerrado | Siempre | Contenido y presentación documental del comprobante. |
| `impresion` | Mapa cerrado | Siempre | Defaults empresariales de salida, no hardware. |
| `pos` | Mapa cerrado | Siempre | Políticas funcionales del punto de venta. |
| `caja` | Mapa cerrado | Siempre | Políticas de apertura, turno y alertas. |
| `modulos` | Mapa cerrado | Siempre | Capacidades tenant habilitadas dentro de las permitidas por el Plan. |
| `kds` | Mapa cerrado | Siempre | Políticas sincronizadas del flujo de cocina. |
| `autenticacionOperativa` | Mapa cerrado | Siempre | Política efectiva compatible con MT-U5A/U5B; nunca secretos. |
| `preferencias` | Mapa cerrado | Siempre | Convenciones generales de presentación y operación no cubiertas por otra sección. |
| `creadaEn` | Timestamp servidor UTC | Siempre | Inmutable. |
| `actualizadaEn` | Timestamp servidor UTC | Siempre | Coincide con la última revisión. |
| `ultimaMutacion` | Mapa de auditoría resumida | Siempre | Actor, origen, comando y correlación; no reemplaza auditoría ni eventos. |

Todos los mapas de sección son obligatorios desde revisión 1. Los campos opcionales ausentes NO se representan mediante cadenas vacías. Las listas existen aunque estén vacías y se reemplazan como unidad en una mutación.

### 3.3. Metadatos de última mutación

| Campo | Tipo conceptual | Regla |
|---|---|---|
| `actorTipo` | `USER`, `SYSTEM` o `PLATFORM` | Origen de autoridad. |
| `actorId` | ID opaco | UID o identificador de proceso; nunca email. |
| `origen` | Enum estable | `BOOTSTRAP`, `BACKFILL`, `ADMIN`, `ONBOARDING`, `PLATFORM` o `RECOVERY`. |
| `commandId` | ID único | Identifica la intención confirmada. |
| `correlationId` | ID único | Agrupa el flujo mayor. |
| `motivo` | Texto acotado opcional | Obligatorio para cambios fiscales sensibles y recuperación. |

La clave de idempotencia completa y el historial de comandos pueden vivir en infraestructura de aplicación; `ultimaMutacion` solo facilita diagnóstico del agregado.

## 4. Organización interna y pertenencia de campos

### 4.1. Identidad fiscal

| Campo | Tipo conceptual | Requerimiento | Pertenencia y regla |
|---|---|---|---|
| `nombreComercial` | Texto 1–120 | Operativo | Identifica el negocio ante clientes; se usa en ticket y Bootstrap. |
| `razonSocial` | Texto 1–160 | Fiscal | Nombre legal del emisor. |
| `tipoPersona` | `NATURAL` o `JURIDICA` | Fiscal por país | Determina validaciones legales, no permisos. |
| `tipoDocumento` | Código por país | Fiscal | En Colombia, `NIT`. |
| `numeroDocumento` | Texto normalizado | Fiscal | Sin formato visual; no se usa como ID del tenant. |
| `digitoVerificacion` | Un dígito opcional por esquema; obligatorio para NIT colombiano | Fiscal CO | Se valida contra el número normalizado. |
| `regimenTributario` | Enum fiscal versionado | Fiscal | Fuente de la política tributaria empresarial; valores iniciales compatibles con ADR-TRIB-001. |
| `responsabilidadesFiscales` | Lista única de códigos | Fiscal cuando aplique | Códigos legales, sin rótulos libres duplicados. |
| `actividadEconomicaPrincipal` | Código CIIU | Opcional | Dato legal del emisor, no categoría de productos. |
| `contacto.email` | Email normalizado | Opcional | Contacto público de la empresa, no identidad Auth. |
| `contacto.telefono` | Teléfono normalizado | Opcional | Contacto público del emisor. |

`tipo_contribuyente` y `responsable_iva` legacy no sobreviven como autoridades paralelas. Se traducen al `regimenTributario` canónico durante adaptación/backfill o se reportan como conflicto.

### 4.2. Localización

| Campo | Tipo conceptual | Requerimiento | Pertenencia y regla |
|---|---|---|---|
| `paisFiscal` | ISO 3166-1 alfa-2 | Siempre | Espejo inmutable de `Empresa.paisFiscal`; no puede cambiarse aisladamente. |
| `moneda` | ISO 4217 | Siempre | Moneda de operación y snapshots futuros. |
| `idioma` | BCP 47 | Siempre | Idioma empresarial por defecto. |
| `zonaHoraria` | Identificador IANA | Siempre | Calendario y presentación; no sustituye timestamps UTC. |
| `direccion.linea1` | Texto 1–160 | Fiscal | Domicilio principal del emisor. |
| `direccion.linea2` | Texto 1–160 | Opcional | Complemento de dirección. |
| `direccion.departamentoCodigo` | Código por país | Fiscal cuando aplique | Código canónico, no nombre libre como autoridad. |
| `direccion.departamentoNombre` | Texto | Opcional | Proyección legible del código. |
| `direccion.municipioCodigo` | Código por país | Fiscal cuando aplique | Código canónico para integración fiscal. |
| `direccion.municipioNombre` | Texto | Fiscal | Nombre legible congelable en Snapshot. |
| `direccion.codigoPostal` | Texto normalizado | Opcional por país | Se valida con el perfil nacional. |

País, moneda, idioma y zona horaria pertenecen juntos porque determinan interpretación regional. El domicilio vive aquí y no en Ticket: Ticket decide si mostrarlo, no cuál es el domicilio vigente.

### 4.3. Impuestos

| Campo | Tipo conceptual | Default inicial | Regla |
|---|---|---|---|
| `preciosIncluyenImpuestos` | Booleano | `true` | Compatible con el modelo tributario vigente. |
| `impuestoTipoPredeterminado` | Enum tributario | `inc_8` para CO | Se aplica solo cuando el producto no aporta política propia. |
| `politicaRedondeo` | Enum versionado | `POR_LINEA_ENTERA` | Debe coincidir con el motor tributario soportado. |

Las tarifas efectivas y su vigencia pertenecen al catálogo tributario versionado, y cada venta congela tarifa, base e impuesto por línea. Configuración no duplica ese catálogo ni permite tasas libres no soportadas.

### 4.4. Branding y apariencia empresarial

Se adopta una sección nueva denominada `branding`. El término coincide con el documento maestro y ADR-SAAS-004, que ya distinguen “branding” de Ticket. No se amplía `ticket` porque un comprobante tiene obligaciones documentales e históricas distintas de la apariencia de la aplicación. Tampoco se amplía `preferencias`: Branding es una identidad empresarial compartida, mientras que las preferencias personales, accesibilidad y capacidades del dispositivo pertenecen al usuario o al equipo.

**Propósito.** Describir la identidad visual configurable de una Empresa para superficies que ya han resuelto inequívocamente su tenant.

**Responsabilidad.** Proporcionar valores semánticos y referencias de assets que el Design System interpretará. Branding decide la intención visual empresarial; nunca la estructura concreta de la interfaz.

**Límites.** Es una sección del mismo agregado Configuración, comparte su `empresaId`, revisión, comandos, auditoría y lifecycle. No tiene ID, revisión, comandos, eventos ni autoridad independientes.

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `modelVersion` | Entero positivo | `1` | Versiona la forma interna de Branding sin sustituir `schemaVersion`. |
| `nombreVisible` | Texto 1–120 opcional | Ausente | Alias visual solo para UI tenant; si falta se proyecta `identidadFiscal.nombreComercial`. Nunca reemplaza la identidad legal o fiscal. |
| `assets.logoPrincipal` | Referencia de asset opcional | Ausente | Logo general para superficies tenant. |
| `assets.logoModoOscuro` | Referencia de asset opcional | Ausente | Alternativa para fondos oscuros; si falta se usa el principal solo cuando conserva legibilidad. |
| `assets.favicon` | Referencia de asset opcional | Ausente | Identidad de pestaña o superficie tenant que admita favicon dinámico. |
| `assets.iconoAplicacion` | Referencia de asset opcional | Ausente | Icono empresarial para superficies instalables o accesos tenant compatibles. |
| `modoVisual` | `LIGHT`, `DARK` o `SYSTEM` | `SYSTEM` | Default empresarial; no anula necesidades de accesibilidad ni una preferencia personal futura expresamente permitida. |
| `paletas.light` | Mapa parcial de tokens semánticos | Vacío | Overrides para modo claro; los ausentes usan el Design System neutral. |
| `paletas.dark` | Mapa parcial de tokens semánticos | Vacío | Overrides para modo oscuro; los ausentes usan el Design System neutral. |

`modelVersion`, `assets`, `modoVisual`, `paletas.light` y `paletas.dark` están siempre presentes. Las cuatro referencias de asset, `nombreVisible` y cada override de token son opcionales. La ausencia se expresa omitiendo la hoja opcional, no mediante URL, nombre o color vacío.

Una referencia de asset contiene conceptualmente una ubicación segura, una versión de contenido para invalidación de caché y metadatos mínimos de tipo. No contiene el binario, base64, credenciales, tokens de acceso, reglas de recorte ni tamaños de renderizado. Cambiar el contenido exige cambiar su versión o referencia y produce una nueva revisión de Configuración.

Tokens permitidos en la primera versión:

| Token | Responsabilidad semántica |
|---|---|
| `primary`, `onPrimary` | Acción/identidad principal y contenido legible sobre ella. |
| `secondary`, `onSecondary` | Jerarquía visual secundaria y su contenido. |
| `accent`, `onAccent` | Énfasis complementario y su contenido. |
| `surface`, `onSurface` | Superficies elevadas o contenidas y contenido sobre ellas. |
| `background`, `onBackground` | Fondo base de la aplicación y contenido principal. |
| `success`, `onSuccess` | Estado positivo y contenido asociado. |
| `warning`, `onWarning` | Advertencia y contenido asociado. |
| `danger`, `onDanger` | Error, riesgo o acción destructiva y contenido asociado. |
| `info`, `onInfo` | Información neutral destacada y contenido asociado. |

Cada valor es un color canónico validable, no una clase ni una instrucción CSS. Los tokens `on*` expresan contraste de contenido, no nombres de componentes. La paleta es parcial: el resolver del Design System completa los tokens ausentes con su tema SaaS neutral y nunca con valores propios de Café Atrato.

Sí pertenece a Branding:

- nombre visual no fiscal de la empresa;
- logos e iconos empresariales;
- modo visual empresarial por defecto;
- paleta parcial basada en tokens semánticos;
- preferencias generales de apariencia que no invadan accesibilidad personal.

No pertenece a Branding:

- clases Tailwind, CSS, estilos inline o variables específicas de un framework;
- componentes React, nombres de componentes, props o variantes;
- layout, orden de navegación, grid, responsive o breakpoints;
- tamaños de botones, tipografía de un componente o coordenadas de assets;
- permisos, módulos, comportamiento POS, reglas KDS o lógica de negocio;
- lifecycle, Suscripción, membresías, claims o autenticación;
- datos fiscales, Ticket, impresión documental, Numeración o Snapshot;
- puertos, pantallas, resolución física o preferencias personales de accesibilidad.

### 4.5. Ticket

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `logoDocumentoUrl` | URL segura | Ausente | Asset documental explícito e independiente de Branding; nunca URL con credenciales. |
| `mensajePie` | Texto 0–300 | Mensaje neutro | Contenido comercial, sin sustituir textos fiscales obligatorios. |
| `mostrarLogoDocumento` | Booleano | `true` si existe asset documental | Control de contenido del comprobante. |
| `mostrarRazonSocial` | Booleano | `true` | No puede ocultar información legal exigida por el tipo documental. |
| `mostrarDireccion` | Booleano | `true` | Preferencia sujeta a mínimos legales. |
| `mostrarTelefono` | Booleano | `true` | Preferencia de contenido. |
| `mostrarDesgloseImpuestos` | Booleano | `true` | No puede contradecir el documento fiscal aplicable. |

Ticket contiene qué se muestra en el comprobante. Nunca consulta `branding.assets`: compartir visualmente un logo exige configurar de forma explícita el asset documental y congelarlo cuando el contrato fiscal lo requiera. No contiene resolución, prefijo, número, rango ni valores reconstruibles de una venta histórica.

### 4.6. Impresión

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `formatoPapel` | `MM_58`, `MM_80` o `CARTA` | `MM_80` | Default empresarial que un equipo compatible puede aplicar. |
| `copiasVenta` | Entero 1–3 | `1` | Número sugerido de copias. |
| `copiasCierre` | Entero 0–3 | `1` | Default para cierres. |
| `autoImprimirVenta` | Booleano | `false` | Política empresarial, condicionada por capacidad local. |
| `autoAbrirCajon` | Booleano | `false` | Intención funcional; el dispositivo decide si puede ejecutarla. |

Nombre de impresora, puerto, IP, driver, ancho real soportado, conexión USB/Bluetooth y selección física son configuración local y NO se sincronizan aquí.

### 4.7. POS

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `metodosPagoHabilitados` | Lista única y ordenada | `efectivo`, `transferencia`, `cuenta_cobro`, `mixto` | Solo IDs del catálogo soportado y permitido por Plan. |
| `metodoPagoPredeterminado` | ID de método | `efectivo` | Debe pertenecer a la lista habilitada. |
| `permitirPagoMixto` | Booleano | `true` | Si es `true`, `mixto` debe estar habilitado. |
| `permitirVentaSinExistencias` | Booleano | `false` | Política operativa; no modifica inventario histórico. |
| `requerirClienteEnCuentaCobro` | Booleano | `true` | No puede relajarse si el flujo de cartera exige identidad del cliente. |

POS contiene comportamiento de venta. No contiene cuentas bancarias, secretos de proveedor ni detalles de una transacción.

### 4.8. Caja

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `baseAperturaSugerida` | Dinero entero no negativo | `200000` COP para plantilla CO | Sugerencia editable; cada turno congela su valor real. |
| `umbralAlertaFaltante` | Dinero entero no negativo | `20000` COP para plantilla CO | Umbral de alerta, no corrección automática. |
| `rolesConTurnoObligatorio` | Lista única de roles tenant | `cajero` | Debe usar el catálogo canónico de roles. |
| `permitirRelevo` | Booleano | `true` | Habilita el flujo, sin sustituir permisos. |

Los importes usan la moneda de Localización y unidad mínima entera; no se persisten floats.

### 4.9. Módulos

| Campo | Tipo conceptual | Regla |
|---|---|---|
| `habilitados` | Lista única y ordenada de IDs | Intersección entre catálogo soportado, capacidades del Plan y elección tenant. |

Catálogo inicial observado: `sell`, `salon`, `kitchen`, `inventory`, `recipes`, `purchases`, `reports`, `shifts`, `waste`, `permissions`, `settings`, `cuentas_cobro`, `clientes`, `consignaciones`, `alquiler_dashboard`, `gastos`, `historial`, `reservas` y `finanzas`.

`settings` debe permanecer disponible para owner/admin durante estados interactivos. Las dependencias entre módulos se validan mediante un catálogo único: por ejemplo, habilitar una extensión que requiera `sell` no puede dejar su dependencia deshabilitada. El consumidor no añade módulos silenciosamente.

### 4.10. KDS

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `ordenComandas` | `ANTIGUEDAD_ASC` | `ANTIGUEDAD_ASC` | Orden empresarial del flujo. |
| `minutosAlerta` | Entero 1–240 | `10` | Debe ser menor que `minutosCritico`. |
| `minutosCritico` | Entero 2–480 | `20` | Umbral crítico sincronizado. |
| `agruparPorPedido` | Booleano | `true` | Presentación lógica, no preferencia física de pantalla. |

La habilitación de KDS se decide por `modulos.habilitados` mediante `kitchen`; no se duplica un booleano `kds.habilitado`.

### 4.11. Autenticación operativa

| Campo | Tipo conceptual | Valor inicial | Editabilidad B1 |
|---|---|---|---|
| `metodoPrincipal` | `CODIGO_PIN` | `CODIGO_PIN` | No editable por tenant. |
| `longitudPin` | Entero | `6` | No editable por tenant; coincide con MT-U5A. |
| `maxFallosConsecutivos` | Entero | `5` | Solo política de plataforma; no puede debilitar el mínimo de seguridad. |
| `bloqueoMinutos` | Entero | `15` | Solo política de plataforma; no puede debilitar el mínimo de seguridad. |
| `exigirCambioCredencialTemporal` | Booleano | `true` | No puede desactivarse mientras DIRECTA dependa de ella. |

La sección describe política efectiva, pero nunca guarda PIN, hash, pepper, token, código de usuario, email, sesión ni credencial. Membresía continúa siendo autoridad de rol y estado.

### 4.12. Preferencias

| Campo | Tipo conceptual | Default | Regla |
|---|---|---|---|
| `formatoFecha` | Enum compatible con locale | `DD/MM/YYYY` para `es-CO` | Solo presentación. |
| `formatoHora` | `H12` o `H24` | `H12` | Solo presentación. |
| `primerDiaSemana` | `DOMINGO` o `LUNES` | `LUNES` | Calendarios empresariales. |
| `mostrarCentavos` | Booleano | `false` para COP | No modifica precisión almacenada. |

Preferencias no contiene tema ni accesibilidad personal. El default visual empresarial vive en Branding; una preferencia personal o necesidad de accesibilidad pertenece al usuario o dispositivo y no se sobrescribe con la marca.

## 5. Validez, completitud y defaults

### 5.1. Tres evaluaciones distintas

| Evaluación | Significado | Resultado ante fallo |
|---|---|---|
| Validez estructural | Documento legible, esquema soportado, secciones/tipos/rangos coherentes | Configuración inválida; no se usa `DEFAULT_CONFIG` silencioso. |
| Validez visual | Submodelo Branding, tokens y referencias utilizables | Se rechaza la escritura; ante fallo externo de asset o submodelo visual recuperable se usa presentación SaaS neutral y se reporta diagnóstico, sin cambiar gates. |
| Completitud operativa | Tiene nombre comercial, localización base, módulos y políticas necesarias para la capacidad | Readiness operativa falsa para la capacidad afectada. |
| Completitud fiscal | Identidad legal, domicilio, país, moneda y políticas fiscales completas y soportadas | Readiness fiscal falsa; se bloquea emisión, no administración. |

Una Configuración puede ser estructuralmente válida e incompleta fiscalmente. No se persiste un booleano autoritativo `completa` o `ready`; los gates se derivan.

### 5.2. Plantilla de revisión 1

El servidor materializa todos los mapas y defaults a partir de una plantilla versionada por país. Para la plantilla inicial `CO`:

- `paisFiscal=CO`, `moneda=COP`, `idioma=es-CO`, `zonaHoraria=America/Bogota`;
- modelo tributario de precios incluidos, redondeo por línea entera y default `inc_8`;
- Branding neutral: sin nombre visual alternativo, sin assets empresariales, `modoVisual=SYSTEM` y paletas parciales vacías;
- defaults de Ticket, Impresión, Caja, KDS, autenticación y preferencias definidos en §4;
- `nombreComercial` proviene de la intención de Bootstrap;
- campos legales desconocidos se omiten; nunca se inventan NIT, razón social, domicilio, email o teléfono.

Los datos de ejemplo actuales (`900.123.456-7`, direcciones o contactos ficticios) NO son defaults válidos para una empresa real.

La plantilla de Configuración materializa `branding` junto con los demás mapas. Esto no añade entradas, pasos, estados ni efectos externos al Bootstrap: `InicializarConfiguracionEmpresa` ya es responsable de crear la forma completa de revisión 1. Café Atrato obtiene su identidad visual solo mediante backfill o actualización explícita; sus nombres, assets y colores nunca forman parte de la plantilla SaaS.

### 5.3. Reglas generales

- Textos se recortan, normalizan en Unicode y rechazan caracteres de control.
- Cadenas vacías se convierten en ausencia cuando el campo es opcional y se rechazan cuando es obligatorio.
- Listas no admiten duplicados, valores desconocidos ni más elementos que el catálogo acotado.
- URLs deben usar `https` o un esquema de almacenamiento expresamente permitido; no contienen tokens en query.
- Referencias de asset deben declarar una versión de contenido y un tipo admitido; se rechazan `data:`, contenido ejecutable y ubicaciones con secretos.
- Paletas solo admiten tokens semánticos del catálogo y valores de color canónicos; se rechazan clases, nombres CSS, funciones, variables y fragmentos de estilos.
- Pares de token/fondo deben superar los mínimos de contraste definidos por accesibilidad; un override inválido se rechaza completo.
- Emails se normalizan en minúscula y se validan sintácticamente.
- Teléfonos se almacenan en formato internacional cuando sea posible.
- Códigos ISO, fiscales, de módulo y enums se almacenan en su forma canónica.
- Campos desconocidos se rechazan; no se conservan mediante merge ciego.
- El documento completo resultante se valida en cada actualización, incluso si cambia una sola hoja.

### 5.4. Validación por país

Las reglas nacionales se resuelven mediante un perfil versionado. El perfil define tipos documentales, formato y dígito de verificación, moneda admisible, códigos territoriales, regímenes e información fiscal requerida.

Perfil inicial Colombia:

- `paisFiscal` debe ser `CO` y coincidir con Empresa;
- moneda fiscal `COP`, idioma inicial `es-CO` y zona IANA válida;
- el emisor fiscal usa `NIT` normalizado a dígitos y dígito de verificación comprobable;
- códigos DANE de departamento/municipio deben tener forma y relación válidas cuando se informen;
- CIIU, responsabilidades y régimen deben pertenecer a catálogos admitidos;
- `regimenTributario` inicial admite `no_responsable`, `responsable_inc` y `responsable_iva`, respetando qué valores están operativamente habilitados por el motor vigente.

Un país sin perfil puede conservar una configuración estructural mínima para onboarding, pero tiene readiness fiscal falsa con causa `PAIS_FISCAL_NO_SOPORTADO`. B1 no declara soporte fiscal multi-país.

### 5.5. Consistencia cruzada

1. `localizacion.paisFiscal == Empresa.paisFiscal`.
2. Moneda, locale y zona horaria deben ser admisibles para el perfil nacional.
3. Método de pago predeterminado pertenece a métodos habilitados.
4. `permitirPagoMixto` y el método `mixto` deben concordar.
5. Módulos habilitados son subconjunto del Plan y respetan dependencias.
6. Si `kitchen` no está habilitado, KDS se conserva como política inactiva y no habilita capacidad.
7. `minutosAlerta < minutosCritico`.
8. Roles de Caja pertenecen al catálogo tenant; no incluyen `superadmin` ni roles locales de Electron.
9. Políticas de Ticket no pueden ocultar información fiscal obligatoria.
10. `branding.nombreVisible` no cambia ni sustituye `identidadFiscal.nombreComercial`.
11. Cada paleta es parcial, usa solo tokens registrados y mantiene contraste válido entre token y su par `on*`.
12. Si falta `logoModoOscuro`, el logo principal solo puede reutilizarse cuando el consumidor comprueba legibilidad; en caso contrario usa el asset neutral del SaaS.
13. Ningún asset de Branding se usa implícitamente como `ticket.logoDocumentoUrl`.
14. `schemaVersion` y `branding.modelVersion` deben tener lectores y validadores soportados.

## 6. Revisiones, concurrencia y auditoría

### 6.1. Incremento de revisión

- Creación: `revision=1`.
- Mutación efectiva: `revisionNueva=revisionActual+1`.
- Reintento idempotente confirmado: devuelve la revisión ya producida.
- Comando válido sin cambio semántico: devuelve la revisión actual, no escribe, no actualiza `actualizadaEn` y no emite evento nuevo.
- Cambio de `schemaVersion`: solo mediante proceso de evolución compatible; no reinicia revisión.

### 6.2. Control optimista

Todo comando sobre una Configuración existente exige `expectedRevision`. La operación lee la revisión actual dentro de su frontera atómica, aplica la intención sobre ese estado, valida el documento completo y confirma solo si coincide.

Una revisión obsoleta produce `CONFIG_REVISION_CONFLICT` con la revisión actual, sin devolver datos sensibles. El cliente debe recargar y presentar una resolución explícita; no existe merge automático ni last-write-wins.

### 6.3. Atomicidad

Cada comando de B1 modifica un único agregado Configuración y registra su hecho confirmado en la misma frontera durable definida para eventos/auditoría por la implementación. Si una política depende de Empresa o Plan, esos documentos se leen y validan contra su versión vigente; no se copian como nueva autoridad.

### 6.4. Auditoría

Debe poder determinarse:

- quién y desde qué origen ordenó el cambio;
- comando, idempotencia, correlación y motivo;
- revisión anterior y nueva;
- secciones y rutas de campo afectadas;
- si el cambio impacta futuros snapshots fiscales;
- instante servidor y resultado.

La auditoría no almacena secretos ni necesita duplicar el documento completo. Para restaurar valores anteriores se usa una nueva mutación auditada, nunca se decrementa `revision`.

## 7. Contrato común de comandos

Todos los comandos heredan de B0: `commandId`, clave de idempotencia, fingerprint, actor, origen, `empresaId`, correlación/causación y `expectedRevision` cuando el agregado ya existe.

Las actualizaciones expresan una lista acotada de operaciones sobre rutas hoja canónicas:

- `SET`: establece un valor validado;
- `REMOVE`: elimina un campo opcional.

No se permite reemplazar el documento raíz, editar metadatos, crear rutas desconocidas ni hacer merge ciego. Las listas se reemplazan completas.

Errores comunes:

| Código conceptual | Significado |
|---|---|
| `CONFIG_NOT_FOUND` | Falta el agregado exigido. |
| `CONFIG_ALREADY_EXISTS` | Inicialización contra un documento existente incompatible. |
| `CONFIG_REVISION_CONFLICT` | `expectedRevision` obsoleta. |
| `CONFIG_SCHEMA_UNSUPPORTED` | No existe lector/validador seguro. |
| `CONFIG_INVALID` | Resultado estructural o internamente inconsistente. |
| `CONFIG_FIELD_FORBIDDEN` | Ruta no editable por ese comando/actor. |
| `EMPRESA_NOT_FOUND` | No existe la Empresa asociada. |
| `EMPRESA_NOT_WRITABLE` | Lifecycle no permite la mutación. |
| `TENANT_MISMATCH` | Actor, claim, documento o Empresa no coinciden. |
| `FORBIDDEN` | Actor sin membresía/permiso requerido. |
| `COUNTRY_MISMATCH` | País configurado no coincide con Empresa. |
| `COUNTRY_PROFILE_UNSUPPORTED` | Se intenta habilitar una capacidad fiscal no soportada. |
| `FISCAL_IDENTITY_LOCKED` | El cambio implicaría otra entidad legal después de emisión. |
| `PLAN_CAPABILITY_VIOLATION` | Módulo o método fuera del Plan. |
| `IDEMPOTENCY_CONFLICT` | Misma clave con fingerprint distinto. |
| `BRANDING_INVALID` | Forma, modo o token visual inválido. |
| `BRANDING_ASSET_INVALID` | Referencia, tipo u origen de asset no permitido. |
| `BRANDING_CONTRAST_INVALID` | La combinación semántica no alcanza contraste mínimo. |

### 7.1. `InicializarConfiguracionEmpresa`

**Entradas específicas:** `empresaId`, `paisFiscal`, `nombreComercial`, versión de plantilla, origen `BOOTSTRAP|BACKFILL` y datos iniciales opcionales permitidos.

**Precondiciones:**

- Empresa reservada/existente dentro del mismo Bootstrap o identificada por backfill;
- documento ausente, o reintento idempotente contra exactamente el resultado ya creado;
- país coincide con Empresa;
- actor es proceso backend autorizado.

**Efectos:** materializa todos los mapas, aplica plantilla servidor, valida y crea revisión 1 con timestamps servidor.

**Postcondiciones:** existe una sola Configuración estructuralmente válida; forma parte del núcleo atómico; emite `ConfiguracionEmpresaInicializada` después del commit.

**Errores adicionales:** `CONFIG_ALREADY_EXISTS`, `INVALID_TEMPLATE_VERSION`, `BOOTSTRAP_CONTEXT_REQUIRED`.

### 7.2. `ActualizarConfiguracionEmpresa`

**Entradas específicas:** `expectedRevision`, operaciones sobre una o más secciones, motivo cuando alguna ruta sea sensible.

**Precondiciones:** Empresa `trial` o `activa`, owner/admin con permiso; cada ruta es editable por el actor; Plan y país continúan coherentes.

**Efectos:** aplica todas las operaciones como una intención indivisible, ejecuta las mismas reglas especializadas de §7.3–§7.5, valida el documento completo y, si cambió, incrementa una sola revisión.

Las rutas de `branding` se actualizan exclusivamente mediante este comando. No se añade `ActualizarBranding` porque B0 ya fijó el catálogo de comandos y el cambio pertenece al agregado Configuración.

**Postcondiciones:** ninguna sección queda parcialmente aplicada; se emite como máximo un `ConfiguracionEmpresaActualizada`.

**Errores adicionales:** cualquiera de los comunes o especializados. Este comando NO puede usarse para eludir restricciones de comandos estrechos.

### 7.3. `ActualizarParametrosFiscales`

**Entradas específicas:** operaciones limitadas a `identidadFiscal`, `localizacion` e `impuestos`; `expectedRevision`; motivo obligatorio; indicador de que el actor reconoce impacto futuro.

**Precondiciones:** autorización administrativa, lifecycle escribible, perfil nacional disponible para los campos afectados y evaluación de existencia de emisiones fiscales.

**Efectos:** cambia solo parámetros futuros. Tras la primera emisión:

- país, tipo y número de documento no pueden cambiar;
- una corrección que represente otra entidad legal se rechaza;
- razón social, domicilio, contacto, régimen y responsabilidades pueden cambiar si el perfil lo permite, quedando auditados y aplicando desde el commit.

**Postcondiciones:** snapshots anteriores permanecen intactos; la siguiente emisión captura la nueva revisión; readiness fiscal se reevalúa, no se escribe como autoridad.

**Errores adicionales:** `FISCAL_IDENTITY_LOCKED`, `FISCAL_PROFILE_VALIDATION_FAILED`, `FISCAL_ACK_REQUIRED`.

### 7.4. `ActualizarPreferenciasImpresion`

**Entradas específicas:** operaciones limitadas a `impresion` y `expectedRevision`.

**Precondiciones:** owner/admin autorizado y lifecycle escribible.

**Efectos:** actualiza defaults empresariales. Rechaza nombres de impresora, puertos, IP, drivers, credenciales o capacidades físicas.

**Postcondiciones:** nuevos trabajos pueden usar los defaults; trabajos y snapshots históricos no cambian.

**Errores adicionales:** `LOCAL_DEVICE_FIELD_FORBIDDEN`, `PRINT_PROFILE_INVALID`.

### 7.5. `ActualizarPoliticasOperativas`

**Entradas específicas:** operaciones limitadas a `pos`, `caja`, `modulos`, `kds` y campos expresamente editables de `autenticacionOperativa`; `expectedRevision`.

**Precondiciones:** owner/admin autorizado, lifecycle escribible, Plan aplicable y catálogos vigentes. Campos de seguridad reservados requieren actor de plataforma.

**Efectos:** valida dependencias de módulos, métodos de pago, roles, KDS y pisos de seguridad. No modifica Plan, membresías, credenciales ni sesiones.

**Postcondiciones:** la política efectiva es coherente; readiness operativa se reevalúa; deshabilitar un módulo impide nuevas operaciones pero no borra sus datos.

**Errores adicionales:** `PLAN_CAPABILITY_VIOLATION`, `MODULE_DEPENDENCY_VIOLATION`, `PAYMENT_POLICY_INVALID`, `SECURITY_POLICY_WEAKENING`.

## 8. Eventos

No se define transporte, bus, outbox ni colección de eventos.

### 8.1. Envelope heredado

Ambos eventos conservan el envelope B0: `eventId`, tipo y versión, agregado `CONFIGURACION`, `empresaId`, revisión resultante, timestamp servidor, actor/origen, correlación y causación.

### 8.2. `ConfiguracionEmpresaInicializada`

Payload conceptual:

| Campo | Significado |
|---|---|
| `schemaVersion` | Esquema materializado. |
| `revision` | Siempre `1`. |
| `origenInicializacion` | `BOOTSTRAP` o `BACKFILL`. |
| `paisFiscal` | Perfil usado, sin duplicar identidad sensible completa. |
| `templateVersion` | Versión de defaults aplicada. |
| `seccionesPresentes` | Confirmación de forma completa. |

Significa que la Configuración canónica existe; no significa readiness fiscal.

### 8.3. `ConfiguracionEmpresaActualizada`

Payload conceptual:

| Campo | Significado |
|---|---|
| `revisionAnterior` | Revisión comprobada. |
| `revisionNueva` | Revisión confirmada. |
| `comandoOrigen` | Uno de los cuatro comandos de actualización. |
| `seccionesAfectadas` | Lista única de secciones. |
| `rutasAfectadas` | Rutas hoja, sin valores sensibles. |
| `impactoFiscalFuturo` | `NINGUNO` o `SNAPSHOTS_FUTUROS`. |
| `motivo` | Requerido cuando corresponda, acotado. |

No se emite para no-op ni para un reintento idempotente ya confirmado.

Una actualización limitada a `branding` siempre declara `impactoFiscalFuturo=NINGUNO`. No crea un evento nuevo: utiliza `ConfiguracionEmpresaActualizada` con `seccionesAfectadas=[branding]`.

## 9. Consumo actual de `configuracion/general`

Inventario realizado sobre el código actual. “Directo” significa lectura/escritura de la ruta; “indirecto” significa consumo mediante `lib/configuracion-service.ts` o un adaptador.

### 9.1. Acceso y edición

| Consumidor actual | Datos | Cambio requerido | Impacto |
|---|---|---|---|
| `lib/configuracion-service.ts:72` | Documento completo, defaults y suscripción realtime | Resolver `empresaId`, leer `configuraciones/{empresaId}`, validar esquema y exponer modelo canónico; eliminar default ficticio silencioso | Alto: punto de convergencia de clientes web. |
| `lib/configuracion-service.ts:89` | Merge directo de cualquier campo | Sustituir escritura directa por comandos con allowlist, idempotencia y `expectedRevision` | Alto: cambia contrato de edición y conflictos. |
| `components/pos/settings-module.tsx:42` | Identidad, fiscalidad, resolución, ticket y caja | Separar formulario por secciones; mover resolución/contador a B2; enviar revisión esperada | Alto: hoy mezcla autoridades y sobrescribe el objeto completo. |
| `firestore.rules:216` | Permisos de la colección global | La ruta legacy queda read-only/denegada según fase; la colección tenant aplica aislamiento/lifecycle definido en B4 | Alto en seguridad; no se modifica en B1 diseño. |
| `firestore-rules/global-platform.test.ts:22` | Fixtures y expectativas sobre ruta global | Sustituir por fixtures tenant y pruebas negativas cross-tenant/lifecycle | Medio; contrato de certificación. |

### 9.2. Branding y superficies visuales actuales

El código actual mezcla dos planos: un Design System basado en tokens y múltiples superficies con marca Café Atrato codificada directamente. B1-IMP debe conservar el primero y desacoplar el segundo.

| Consumidor actual | Dependencia observada | Cambio requerido | Impacto |
|---|---|---|---|
| `styles/globals.css:13` y `app/globals.css:7` | Tokens visuales estáticos y sistema de marca Café Atrato | Mantener un tema base neutral y resolver sobre él los overrides semánticos de `branding.paletas` | Alto y transversal. |
| `components/theme-provider.tsx:9`, `app/layout.tsx:47` y `components/ui/sonner.tsx:3` | Modo visual global fijo/por `next-themes` | Aplicar `branding.modoVisual` solo después de resolver tenant, preservando preferencias personales y accesibilidad | Alto en inicialización visual. |
| `app/layout.tsx:20` y layouts de POS/admin/reservas | Títulos, descripciones e iconos hardcoded | Superficies tenant resueltas proyectan nombre/assets; rutas globales o pre-tenant usan marca neutral del SaaS | Alto en metadata y ausencia de fugas entre tenants. |
| `components/pos/sidebar.tsx:86`, `components/pos/login-screen.tsx:76` y `components/pwa/admin-header.tsx:31` | Nombre Café Atrato embebido | Consumir `branding.nombreVisible` con fallback al nombre comercial solo cuando el tenant es inequívoco | Medio/alto. |
| `app/page.tsx`, `app/reservar`, `app/terminos` y componentes públicos de Café Atrato | Contenido, assets y colores de un cliente concreto | Clasificar cada ruta como global SaaS o tenant-scoped antes de consumir Branding; una ruta sin tenant nunca elige una empresa por defecto | Alto, pero su rediseño concreto queda fuera de B1. |

Las clases existentes como `bg-primary` o `text-accent` son consumidores del Design System, no datos que deban persistirse. B1-IMP resolverá los tokens en una frontera común; no reescribirá cada Configuración con clases ni permitirá que una Empresa introduzca CSS.

### 9.3. POS, módulos y caja

| Consumidor actual | Datos | Cambio requerido | Impacto |
|---|---|---|---|
| `contexts/modulos-context.tsx:18` | `modulos_habilitados` | Leer `modulos.habilitados`; no añadir `reservas` silenciosamente; validar Plan/dependencias | Alto: navegación y capacidades visibles. |
| `components/pos/sell-module.tsx:231` | `regimenTributario` y configuración completa para ticket | Leer régimen canónico; ticket de emisión usa revisión/snapshot; identidad vigente solo para checkout previo a confirmación | Alto: cálculo tributario y ticket. |
| `components/pos/shifts-module.tsx:71` | Base sugerida y umbral | Leer `caja.baseAperturaSugerida` y `caja.umbralAlertaFaltante` | Bajo/medio. |
| `components/pos/global-close-shift.tsx:30` | Umbral de faltante | Leer `caja.umbralAlertaFaltante` | Bajo. |
| `components/pos/turno-gate.tsx:58` | Base sugerida | Leer `caja.baseAperturaSugerida`; política de roles desde `caja.rolesConTurnoObligatorio` | Medio. |

### 9.4. Venta, contador y Snapshot

| Consumidor actual | Datos | Cambio requerido | Impacto |
|---|---|---|---|
| `lib/ventas-service.ts:180` | Lee e incrementa `consecutivo_actual` en transacción | Eliminar toda escritura a Configuración; B2 resuelve Asignación/Numeración y confirma venta+Snapshot | Crítico fiscal. |
| `lib/reservas-service.ts:382` | Incrementa contador al convertir reserva en venta | Mismo flujo fiscal autoritativo de B2; no contador propio ni fallback | Crítico fiscal. |
| `app/api/webhooks/wompi/route.ts:187` | Incrementa contador al confirmar pago | Delegar confirmación a la frontera fiscal idempotente; webhook no selecciona número | Crítico fiscal y de concurrencia. |
| `lib/configuracion-service.ts:94` | Expone un incremento transaccional del contador; no se hallaron consumidores actuales | Retirar la operación al cortar B2 para impedir una vía alternativa de emisión | Alto por superficie fiscal latente. |
| `lib/tickets/adapters/checkout-adapter.ts:120` | Identidad empresarial vigente | Adaptar campos canónicos para el ticket de la operación; la venta confirmada debe llevar Snapshot | Alto. |
| `components/pos/historial.tsx:81` | Config actual para reimpresión y resolución DIAN | Reimpresión debe dejar de suscribirse a Configuración y usar `venta.snapshotFiscal` | Crítico histórico. |
| `lib/reimpresion/venta-ticket-adapter.ts:64` | Prefijo, resolución, rango, vigencia e identidad actuales | Leer exclusivamente Snapshot para hechos fiscales; adaptador legacy solo para ventas históricas sin snapshot | Crítico histórico. |

### 9.5. Scripts y catálogo técnico

| Consumidor actual | Datos | Cambio requerido | Impacto |
|---|---|---|---|
| `scripts/migrate-mt-u1-fundacional.ts:111` | `nombre_tienda` para nombrar Empresa fundacional | Mantenerlo como lector histórico congelado o sustituirlo en una versión futura; no convertirlo en escritor | Bajo en runtime, relevante para repetibilidad. |
| `scripts/mt-u3-colecciones-oficiales.ts:72` | Declara `configuracion` como colección oficial | Actualizar el catálogo solo en la fase de cutover/certificación | Medio operativo. |

### 9.6. Configuración local Electron: frontera adyacente

`components/pos/configuracion.tsx`, `components/pos/vender.tsx` y `src/database.js` usan la API/tabla SQLite local, no `configuracion/general`. No son consumidores del singleton Firestore y B1 no los migra.

Sin embargo, duplican identidad, fiscalidad, numeración, impresión y secretos de Factus. Se aplican estas fronteras:

- puertos, impresora elegida y capacidades físicas permanecen locales;
- credenciales Factus permanecen en almacenamiento seguro, nunca en Configuración empresarial;
- identidad y datos fiscales locales no son autoridad SaaS y no habilitan nuevos tenants;
- contador SQLite no converge con Numeración antes de MT-U12/B7 certificado;
- Electron no puede usarse como fallback de la configuración SaaS.

## 10. Matriz legacy → modelo objetivo

| Campo legacy | Destino | Tratamiento |
|---|---|---|
| `nombre_tienda` | `identidadFiscal.nombreComercial` | Normalizar texto. |
| `razonSocial` | `identidadFiscal.razonSocial` | Omitir si vacío. |
| `nit_tienda` | `identidadFiscal.numeroDocumento` + `digitoVerificacion` | Parsear y validar; conflicto si no es inequívoco. |
| `direccion_tienda` | `localizacion.direccion.linea1` | No inferir códigos territoriales. |
| `ciudad` | `localizacion.direccion.municipioNombre` | Requiere enriquecimiento separado para código. |
| `telefono` | `identidadFiscal.contacto.telefono` | Normalizar. |
| `email` | `identidadFiscal.contacto.email` | Normalizar; no es Auth. |
| `logoUrl` | Clasificación entre `branding.assets.logoPrincipal` y `ticket.logoDocumentoUrl` | El campo legacy es ambiguo: se determina por uso probado; no se copia automáticamente a ambos destinos. |
| `regimenTributario` | `identidadFiscal.regimenTributario` | Fuente legacy preferida si es canónica. |
| `tipo_contribuyente` | Candidato de adaptación | No persiste; ayuda a detectar/mapear régimen. |
| `responsable_iva` | Candidato de adaptación vestigial | No persiste; contradicción genera incidencia. |
| `mensaje_ticket` | `ticket.mensajePie` | Normalizar longitud. |
| `modulos_habilitados` | `modulos.habilitados` | Intersectar catálogo y Plan; reportar desconocidos. |
| `baseCajaSugerida` | `caja.baseAperturaSugerida` | Validar entero no negativo. |
| `umbralAlertaFaltante` | `caja.umbralAlertaFaltante` | Validar entero no negativo. |
| `prefijo_factura` | Numeración B2 | Prohibido en Configuración. |
| `consecutivo_actual` | Numeración B2 | Prohibido en Configuración; reconciliación fiscal obligatoria. |
| `resolucion_dian` | Numeración B2 | Prohibido en Configuración. |
| `rangoInicio`, `rangoFin` | Numeración B2 | Parseo fiscal, no copia textual a B1. |
| `resolucionVigencia` | Numeración B2 | Interpretación fiscal, no preferencia. |

## 11. Compatibilidad durante la transición

### 11.1. Principios

1. En cada instante existe una sola autoridad de lectura y escritura para cada dato.
2. No hay dual-write, fallback por petición ni mezcla de campos entre documentos.
3. Una Configuración tenant inválida después del cutover falla de forma explícita; no cae a defaults ni al singleton.
4. El adaptador puede cambiar forma para consumidores legacy, pero no inventar autoridad.
5. El contador y la resolución solo abandonan el singleton cuando B2 está listo para asumirlos.

### 11.2. Fases de comportamiento

| Fase | Lectura | Escritura | Compatibilidad |
|---|---|---|---|
| Legado vigente | Singleton es autoridad existente | Solo singleton | B1 observa, no altera. |
| Preparación/paridad | Runtime sigue leyendo singleton; documento tenant puede leerse solo para comparar | Solo autoridad legacy; B1 no dual-escribe | Adaptador de backfill clasifica y reporta diferencias. |
| Cutover único | Runtime resuelve empresa y lee documento tenant; fiscalidad resuelve Numeración/Snapshot | Solo comandos tenant y frontera fiscal B2 | Se despliega el conjunto de consumidores coordinadamente. |
| Retención | Solo documento tenant/Snapshot/Numeración | Singleton bloqueado para escritura | Singleton queda evidencia temporal de rollback, no fallback. |
| Retiro | Singleton inaccesible y posteriormente eliminable conforme al plan B7 | Solo modelo objetivo | Tests y catálogo dejan de reconocer la ruta. |

El rollback no puede consistir en leer unas peticiones del singleton y otras del documento tenant. Solo es admisible un cambio coordinado de fase antes de producir divergencia o una recuperación hacia adelante con reconciliación explícita.

### 11.3. Adaptación temporal

Mientras existan componentes que esperan nombres legacy, una capa de adaptación de lectura PUEDE proyectar:

- identidad, localización, Branding, ticket, módulos y caja desde la Configuración tenant;
- datos fiscales históricos desde `snapshotFiscal`;
- datos de numeración vigente desde B2 solo para una operación fiscal concreta.

La proyección NO expone `consecutivo_actual`, NO acepta escrituras con nombres legacy y NO vuelve a unir fiscalidad y Configuración como agregado.

### 11.4. Compatibilidad y aislamiento de Branding

- **Bootstrap:** no cambia su contrato, secuencia ni atomicidad. La plantilla interna de Configuración crea un mapa `branding` neutral; no recibe assets, tokens ni decisiones visuales adicionales.
- **Configuración existente:** como B1 aún no está implementado, `branding` forma parte de `schemaVersion=1`. El backfill de la empresa fundacional lo completa de manera explícita; no hay migración de código en esta fase.
- **Consumidores:** hasta resolver tenant usan el Design System neutral. Después consumen una proyección validada de Branding; una Configuración ausente o inválida vuelve al tema neutral de plataforma únicamente para presentación, nunca como autoridad de negocio.
- **Multiempresa:** cada cambio valida `empresaId`; caches, metadata y assets se particionan por tenant y revisión. Nunca se conserva el último tema de otra Empresa como fallback.
- **Personalización parcial:** tokens y assets ausentes heredan el Design System neutral sin materializar valores de Café Atrato.
- **Snapshots fiscales:** Branding no se copia, referencia ni reconstruye dentro de `snapshotFiscal`. Nombre legal, nombre comercial fiscal y logo documental siguen sus contratos propios.

Branding no participa en readiness fiscal, operativa o comercial. Un error visual no habilita ni bloquea ventas, Numeración, lifecycle, Suscripción, membresías o claims; el consumidor presenta el tema neutral y reporta el error de configuración visual.

### 11.5. Evolución compatible

La forma mantiene puntos de extensión controlados para soportar en el futuro múltiples temas, personalización parcial, nuevos tokens y assets adicionales, sin diseñar todavía esas funcionalidades:

- `branding.modelVersion` permite lectores compatibles y evolución del submodelo;
- las paletas parciales permiten añadir nuevos tokens semánticos mediante una versión soportada;
- el mapa `assets` puede admitir nuevas claves semánticas en una versión futura;
- el perfil único actual puede convertirse posteriormente en el perfil predeterminado de un catálogo de temas sin cambiar la autoridad, ruta ni revisión de Configuración;
- assets y tokens pueden ampliarse sin introducir CSS, componentes o agregados nuevos.

Los lectores deben ignorar de forma segura solo extensiones que su versión declare compatibles. Una versión desconocida completa no se interpreta parcialmente ni aplica valores inseguros.

## 12. Casos límite

### 12.1. Empresa recién creada

Bootstrap crea revisión 1 con todas las secciones y defaults servidor. El nombre comercial y localización base permiten onboarding; NIT, razón social o domicilio pueden faltar. Bootstrap puede completar aunque readiness fiscal sea falsa.

### 12.2. Empresa sin Configuración

Es una violación **EMP-01/CFG-01**, no un estado funcional. Administración muestra error recuperable; escrituras operativas y fiscales fallan. Solo reconciliación de Bootstrap o backfill autorizado puede crear la revisión 1 faltante. Nunca se crea desde el cliente ni se usa `DEFAULT_CONFIG` en memoria como si fuera autoridad.

### 12.3. Configuración inválida o esquema desconocido

El lector devuelve error tipado y no entrega un objeto parcial. La empresa puede conservar acceso administrativo compatible con lifecycle para diagnóstico, pero no obtiene readiness operativa. Un esquema más nuevo no se degrada descartando campos.

### 12.4. Configuración incompleta

Puede editarse durante `trial/activa`. Los gates reportan causas concretas por capacidad. La ausencia fiscal bloquea emisión, no necesariamente configuración, catálogo u onboarding.

### 12.5. Cambio fiscal

El comando valida si existen emisiones. Cambios permitidos aplican desde el commit y generan revisión/evento con impacto fiscal futuro. NIT/país que representen otra entidad se rechazan después de emitir. Ventas previas conservan Snapshot y reimpresión idénticos.

### 12.6. Actualización concurrente

Dos administradores parten de la misma revisión. Solo el primer commit válido incrementa. El segundo recibe conflicto, recarga y decide de forma explícita si reaplica su intención. No se combinan automáticamente secciones aunque parezcan distintas.

### 12.7. Reintento después de timeout

La misma idempotencia y fingerprint devuelve la revisión ya confirmada. Una clave igual con otros cambios se rechaza. El cliente no puede deducir éxito y repetir con otra clave sin consultar el resultado.

### 12.8. Restauración empresarial

Restaurar una Empresa archivada no reinicia ni recrea Configuración. Se conserva el documento y su revisión. Si se desea recuperar valores anteriores, se emite una nueva actualización con `origen=RECOVERY`, motivo, revisión esperada y nueva revisión; no se borra historia ni se alteran snapshots.

### 12.9. Empresa suspendida o cancelada

En `suspendida`, owner/admin puede leer Configuración pero no modificarla. En `cancelada`, no hay lectura interactiva ordinaria; una exportación backend puede incluirla. Archivo y eliminación siguen la política de lifecycle.

## 13. Riesgos y controles de diseño

| Riesgo | Consecuencia | Control exigido |
|---|---|---|
| Backfill con NIT/régimen ambiguo | Identidad fiscal incorrecta | Reportar conflicto; no inferir silenciosamente. |
| Defaults ficticios | Empresa aparentemente ready con datos falsos | Defaults solo de política; datos legales quedan ausentes. |
| Merge parcial desde cliente | Campos desconocidos o pérdida de secciones | Comandos allowlist + validación del resultado completo. |
| Edición concurrente | Pérdida de cambios | `expectedRevision`, conflicto y resolución explícita. |
| Doble autoridad durante transición | Divergencia entre singleton y tenant | Cutover coordinado, cero dual-write y cero fallback. |
| Contador aún mezclado | Duplicados/saltos fiscales | No cortar hasta que B2 sustituya los tres escritores directos. |
| Reimpresión con config vigente | Evidencia histórica falsa | Snapshot obligatorio y adaptador histórico. |
| Módulo habilitado fuera del Plan | Capacidad no contratada o rota | Intersección y dependencias validadas en comando/backend. |
| Política de auth debilitada | Fuerza bruta o bypass de U5A | Campos reservados y pisos de plataforma. |
| Configuración local Electron confundida con SaaS | Fuga de secretos o datos divergentes | Frontera local explícita; sin fallback ni autoridad multiempresa. |
| Documento creciente | Límite Firestore y lecturas costosas | Mapas cerrados, listas por catálogo y assets externos. |
| Cambio de país/entidad tras emitir | Ruptura fiscal | Bloqueo de identidad y nueva empresa/procedimiento jurisdiccional. |
| Valores de Café Atrato usados como default | Nuevos tenants heredan identidad ajena | Plantilla neutral y personalización fundacional explícita. |
| Caché visual compartida entre tenants | Fuga de marca y assets | Claves por `empresaId`, revisión, modo y versión de asset. |
| Asset malicioso o con secreto | XSS, seguimiento o exposición | Orígenes/tipos permitidos, sin contenido ejecutable, `data:` ni tokens. |
| Paleta sin contraste | Interfaz inaccesible | Validación de pares semánticos y fallback neutral. |
| Branding aplicado antes de resolver tenant | Marca incorrecta o fuga multiempresa | Presentación SaaS neutral en rutas globales/pre-tenant. |
| Branding acoplado a Ticket | Reimpresión o documento fiscal cambiante | Assets documentales separados; Snapshot nunca consulta Branding. |

## 14. Criterios de aceptación para B1-IMP

La implementación posterior no necesita nuevas decisiones arquitectónicas si puede demostrar:

1. Ruta, cardinalidad, metadatos y doce secciones conforme a esta especificación.
2. Revisión 1 creada atómicamente por Bootstrap/backfill y ninguna creación directa de cliente.
3. Validación estructural completa, perfiles nacionales y causas de readiness derivadas.
4. Cinco comandos con allowlists, idempotencia, revisión esperada y errores definidos.
5. Dos eventos con payload conceptual y semántica exacta.
6. Ningún contador, resolución, asignación, lifecycle, membresía, claim, secreto o hardware dentro de Configuración.
7. Inventario de consumidores cubierto, incluidos los tres escritores fiscales y la reimpresión.
8. Cero dual-write y ausencia de fallback al singleton después del cutover.
9. Snapshots anteriores inmutables ante cualquier revisión nueva.
10. Pruebas de conflicto, tenant mismatch, documento faltante/incompleto, país no soportado, cambio fiscal bloqueado y restauración.
11. Branding neutral por defecto, personalización parcial por tokens semánticos, assets versionados y cero valores heredados de Café Atrato.
12. Branding sin comando/evento/autoridad nuevos y sin efecto sobre gates, Snapshot, Numeración, lifecycle, Suscripción o membresías.

Las decisiones restantes son de implementación: nombres de módulos internos, funciones concretas, validadores, endpoints, Rules, tests y secuencia ejecutable de migración. Deben materializar este contrato sin cambiarlo.

## 15. Referencias

- `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`
- `ADR-SAAS-004-modelo-empresarial.md`
- `ADR-SAAS-007-bootstrap-empresarial.md`
- `MT-U6-U8-B0-contratos-invariantes-dominio.md`
- `ADR-TRIB-001` y `ADR-MOD-001`, únicamente para la filosofía de snapshot ya heredada por ADR-SAAS-004
