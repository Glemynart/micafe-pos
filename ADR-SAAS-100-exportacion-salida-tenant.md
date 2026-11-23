# ADR-SAAS-100 — Entrega de datos de salida por tenant

## Estado y alcance

**Aceptado para implementación controlada**, 2026-11-23.
`G-SAAS-02 → M2 → E2.2`. Tras recibir el cierre de comprobaciones, el responsable
ordenó expresamente «ok resuelve eso», incluyendo proveedores, exportación y
procedimiento de supresión. Se adopta la alternativa A de este diseño para
implementar y validar localmente. Esa instrucción de ejecución sustituye la
aprobación anterior condicionada a que todo estuviera ya listo; no declara que
esa condición se haya satisfecho. No acepta ADR-SAAS-099 ni certifica legalidad.
Las ejecuciones con datos reales y cualquier eliminación remota requieren su
corte operativo. No se autoriza extraer datos de Diana durante la preparación.

## Problema y decisión recomendada

El CSV financiero no cubre el tenant completo. La lista MT-U3 tiene 25 colecciones
y precede a presentaciones, crédito, agenda y FIFO Nevera; no reutilizarla como
certificado de completitud. Los abonos son subcolecciones de venta, y parte del
dominio vive bajo `empresas/{empresaId}`. Un dump global expondría otros negocios.

Alternativa A, recomendada: herramienta local de operador, lectura remota acotada,
entrega saneada por esquema y bundle verificable. Sin endpoint público ni bucket
nuevo. Primera implementación y pruebas solo con datos sintéticos/Emulator.

Alternativa B: servicio asíncrono de autoservicio, con jobs y descargas firmadas.
Mejor escalabilidad, pero agrega persistencia remota, lifecycle y superficie de
exposición innecesarios para el primer corte.

Alternativa C: export administrado global o CSV actual. Rechazada como entrega
completa: respectivamente mezcla tenants o pierde información y relaciones.

## Autoridad propuesta

Solicitud verificable del representante, proyecto y tenant expresamente indicados,
operador SaaS activo con `CONSERVACION_GOBERNAR` revalidado y permiso IAM de lectura
ya existente. No inferir autorización de ser usuario cloud ni de soporte de solo
diagnóstico. La nueva operación de salida se autoriza de forma explícita por
contrato/solicitud; no reinterpretar una autorización de soporte anterior.

Sin crear nuevas facultades, claims, IAM ni cambiar lifecycle comercial. Los
comandos de ejecución remota y la entrega real requieren autorización operativa
del corte. La pertenencia de cada registro se verifica en backend/herramienta,
no por IDs suministrados sin comprobar ni por frontend.

## Cobertura por adaptadores versionados

| Grupo | Fuentes comprobadas en código | Selección/entrega propuesta |
|---|---|---|
| Catálogo/inventario | `productos`, `categorias`, `presentaciones_producto`, `movimientos_inventario`, `espacios` | Filtro `empresaId`, IDs y catálogo Bodega/Nevera; cantidades/costos exactos sin recalcular. |
| Operación/finanzas | 25 colecciones de MT-U3, incluidas ventas, compras, clientes, proveedores fuera de esa lista, cuentas y transacciones | Clasificar cada adaptador; no exportar íntegramente `auditoria_logs` sin allowlist de campos. |
| Crédito | `ventas/{id}/abonos_bodega`, `compromisos_pago_bodega` | Solo bajo ventas ya verificadas; comprobar también `empresaId` del hijo. |
| Nevera | `capas_fifo_nevera`, `cuentas_control_nevera`, `cuentas_control_nevera_movimientos` | Validar tenant por campo y/o ID canónico, con esquema explícito; preservar capas y saldos. |
| Pedidos Bodega | `empresas/{id}/solicitudes_venta_bodega`, `agenda_pedidos_bodega`, `reservas_stock_bodega`, `secuencias_documentales` | Subcolecciones acotadas a raíz verificada. |
| Ofertas/eventos | `ofertas_bodega`, `eventos_operativos` | Filtro tenant y proyección comercial; revisar datos técnicos antes de entregar. |
| Empresa/configuración | `empresas/{id}`, `configuraciones/{id}` y configuración histórica cuando proceda | Proyección de campos propios, sin secretos ni referencias de soporte privadas. |
| Identidades | `usuarios`, `membresias` | Solo datos operativos mínimos vinculados al tenant; excluir credenciales, Auth export y claves. No entregar identidad global de otros tenants. |
| Contrato | Suscripción/relación aplicable y evidencia propia | Proyección de condiciones del negocio; excluir catálogo global, notas internas de plataforma y datos ajenos. |
| Archivos | Prefijo Storage `tenants/{empresaId}/...` | Generación exacta, tamaño, tipo y hash; no URLs con tokens ni objetos de otros prefijos. |

Esta matriz es alcance inicial, no una implementación ni inventario completo de
datos reales. Enumerar colecciones/subcolecciones mediante metadatos no concede
acceso genérico a sus documentos. Colección desconocida: detener certificación
de completitud, clasificarla y actualizar adaptador; no copiar por defecto.
Colección sin datos: incluirla en manifiesto como vacía verificada, no omitirla.
Legacy sin tenant inequívoco: bloquear su inclusión y documentar divergencia.

## Consistencia y límites

Leer Firestore con un mismo `readTime` explícito en todas las consultas y páginas,
orden estable por nombre de documento. Documentación oficial permite lectura
histórica dentro de la última hora incluso sin PITR; no confundir estas lecturas
con el export administrado de Firestore. Primer corte por REST tipado o cliente
que demuestre soporte a ese `readTime`; no simularlo con reloj local y lecturas
sueltas. Límite de ejecución propuesto: 45 minutos y presupuesto de bytes/docs
configurable. Si expira ventana o falta capacidad, abortar con estado incompleto,
sin mezclar lecturas actuales ni habilitar PITR por conveniencia.

Storage no comparte snapshot atómico con Firestore. Leer metadatos y descargar
por generación exacta, con precondiciones. Faltante o cambio: declarar incidencia
y no certificar bundle completo; el manifiesto distingue snapshot Firestore de
archivos versionados. Si el caso requiere punto único entre servicios, requiere
ventana operativa o diseño adicional autorizado.

Revalidar autoridad antes de iniciar, por lote y antes de marcar completado;
revocación aborta y bloquea entrega. Las lecturas no ejecutan ventas, ofertas,
Bootstrap, Trial, modificaciones de datos o restauraciones.

## Formato y protección

JSONL tipado para datos completos por esquema; CSV de vistas útiles, con escape
de fórmulas. Preservar precisión de COP/enteros, timestamps UTC, referencias y
distinción nulo/ausente. Nombres de archivo controlados, no derivados directamente
de texto del cliente; rechazar traversal, symlinks/reparse points y sobrescritura.

Allowlist de campos por versión; no basta borrar claves llamadas `password`.
Campo o schema desconocido impide certificar ese adaptador. Excluir secretos,
tokens, hash de PIN, enlaces privados de descarga, operador SaaS y notas internas.
Conservar en campos comerciales legítimos los datos propios necesarios; no borrar
nombres por coincidir con una palabra en una denylist.

Manifiesto con versión de herramienta/esquemas, SHA, proyecto, tenant, referencia
de solicitud no sensible, actor, `readTime`, inicio/fin, fuentes, conteos, hashes,
omisiones y nivel de consistencia. Hash no prueba por sí solo autoría; proteger
entrega y conservar recibo de custodia con acceso restringido.

Salida temporal local fuera del repositorio y carpetas sincronizadas, con acceso
restringido comprobado y disco/canal protegido. No declarar cifrado por permisos
ACL ni incluir claves en archivos. Si no puede acreditarse protección, no ejecutar
con datos reales. Entregar por canal autenticado previamente validado; no Gmail
con adjuntos masivos, URL pública o GitHub Actions artifact abierto al cliente.

## Pruebas y gates

1. Fixture sintético de dos tenants con ventas/abonos/FIFO, archivos y trampas de
   secretos; igualdad de conteos e integridad de referencias del tenant objetivo.
2. Denegación anónimo, operador sin facultad, solicitud no verificada, revocación,
   tenant falso y documentos/hijos cruzados. Ninguna escritura remota.
3. Paginación sin duplicados, schema desconocido, legacy ambiguo, errores de red,
   expiración de readTime y archivos cambiados. Fallos producen bundle incompleto.
4. Hashes reproducibles, fechas/enteros, CSV seguro y protección de rutas/localidad.
5. Verificar soporte real del SDK/API con Emulator y, si no reproduce historial,
   ensayo aislado específico autorizado; no afirmar que Emulator demuestra una
   característica que no implemente.
6. Solo tras PASS, fijar presupuesto, solicitud/canal y autorizar ejecución real.
   El objetivo de diez días de entrega no se ofrece como capacidad existente antes.

## Retención y recuperación

Propuesta: paquete temporal por hasta siete días tras entrega confirmada, sujeto
a petición/contrato y plazos legales; recibo mínimo por política de evidencia
aprobada. No automatizar borrado sin validar rutas y autorización. No dejar una
copia indefinida en Downloads, Codex, Git, logs o correo.

Ante fallo, preservar fuente remota intacta y evidencia técnica mínima sin payload,
marcar incompleto y restringir acceso. Reintento dentro de la misma ventana o nuevo
bundle con nuevo `readTime`, nunca combinar partes de snapshots distintos como
una entrega consistente. Revertir herramienta no implica borrar datos fuente.

## Referencias

- [Operación propuesta](docs/legal/OPERACION-Y-CONSERVACION.md).
- [Firestore RunQuery y readTime](https://docs.cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1#runqueryrequest).
- [Lecturas históricas](https://docs.cloud.google.com/firestore/native/docs/pitr).
- ADR-SAAS-028/029/031 y ADR-SAAS-099 Propuesto.
